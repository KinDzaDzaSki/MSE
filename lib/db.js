const { Pool } = require('pg');
const log = require('./logger');
const { sortByDate } = require('./scraper');

// When DATABASE_URL is not set (local dev without Postgres), fall back to an
// in-memory store so the app still runs. Production always sets DATABASE_URL.
const USE_MEMORY = !process.env.DATABASE_URL;
if (USE_MEMORY) {
  log.info('DATABASE_URL not set — using in-memory store (data not persisted)');
}

const mem = {
  meta: new Map(),
  quotes: new Map(),
  history: new Map(), // symbol -> Map(date -> row)
  indices: new Map(),
  financials: new Map(), // symbol -> { data, fetched_at }
  companies: new Map(), // symbol -> { name, website, source }
  favicons: new Map(), // symbol -> { data, type }
  movers: null, // { winners, losers, mostTraded } from the official MSE homepage
  pushSubs: new Map(), // endpoint -> subscription
};

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Cannot connect to PostgreSQL.');
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      // Serverless (Vercel) runs many short-lived instances; each one must hold
      // as few connections as possible. The transaction pooler (port 6543)
      // multiplexes them, but a per-instance pool > 1 still multiplies across
      // instances and trips Supabase's "max clients reached" limit.
      max: process.env.VERCEL ? 1 : 5,
      idleTimeoutMillis: 30000,
      // Fail fast instead of queueing forever when the pooler is saturated.
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (e) => log.error(`pool error: ${e.message}`));
  }
  return pool;
}

async function query(text, params = []) {
  const p = getPool();
  const res = await p.query(text, params);
  return res;
}

// ---- In-process read cache (egress control) ----
// Full-table reads on every request/poll were the main Supabase egress
// driver. Entries are short-TTL and every write busts the affected key,
// so readers see fresh data right after a poll writes.
const cache = new Map(); // key -> { v, exp }
async function cached(key, ttlMs, fn) {
  if (USE_MEMORY) return fn();
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  const v = await fn();
  cache.set(key, { v, exp: Date.now() + ttlMs });
  return v;
}
function bust(...keys) {
  for (const k of keys) cache.delete(k);
}

// Create tables if they do not exist. Safe to call on every boot.
async function migrate() {
  if (USE_MEMORY) return; // in-memory store needs no schema
  await query(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS quotes (
      symbol TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS history (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      data JSONB NOT NULL,
      PRIMARY KEY (symbol, date)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS indices (
      code TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS financials (
      symbol TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      fetched_at BIGINT NOT NULL
    );
  `);
  // Company profile bits that don't come from the quote pages — currently just
  // the official website (used for favicon logos). One row per symbol.
  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      website TEXT,
      source TEXT,
      fetched_at BIGINT NOT NULL
    );
  `);
  // Favicon image bytes fetched from each company's official site. Served from
  // our own /api/favicon/{SYM} so we never depend on a third-party favicon
  // service (Google's S2 hangs for several MK domains).
  await query(`
    CREATE TABLE IF NOT EXISTS favicons (
      symbol TEXT PRIMARY KEY,
      data BYTEA NOT NULL,
      content_type TEXT NOT NULL,
      fetched_at BIGINT NOT NULL
    );
  `);
  // Official MSE homepage movers panels (Добитници/Губитници/Најтргувани),
  // scraped during the trading session. Single row (id=1).
  await query(`
    CREATE TABLE IF NOT EXISTS movers (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      fetched_at BIGINT NOT NULL
    );
  `);
  // Web-push subscriptions for the daily movers / watchlist notifications.
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      keys JSONB NOT NULL,
      lang TEXT NOT NULL DEFAULT 'mk',
      watchlist JSONB NOT NULL DEFAULT '[]',
      created_at BIGINT NOT NULL,
      last_notified_day TEXT
    );
  `);
  log.info('schema ready');
}

// ---- meta (single-row key/value store for the active symbol list) ----
async function getMeta(key, def = null) {
  if (USE_MEMORY) return mem.meta.has(key) ? mem.meta.get(key) : def;
  const r = await query('SELECT value FROM meta WHERE key = $1', [key]);
  return r.rows.length ? r.rows[0].value : def;
}
async function setMeta(key, value) {
  if (USE_MEMORY) { mem.meta.set(key, value); return; }
  await query(
    `INSERT INTO meta (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

// ---- quotes ----
async function getAllQuotes() {
  if (USE_MEMORY) return Object.fromEntries(mem.quotes);
  return cached('quotes', 5000, async () => {
    const r = await query('SELECT symbol, data FROM quotes');
    const out = {};
    for (const row of r.rows) out[row.symbol] = row.data;
    return out;
  });
}
async function upsertQuotes(map) {
  if (USE_MEMORY) {
    for (const [symbol, data] of Object.entries(map)) mem.quotes.set(symbol, data);
    return;
  }
  // map: { symbol: dataObj } — multi-row INSERTs in chunks of 100.
  const entries = Object.entries(map);
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const placeholders = [];
    const params = [];
    batch.forEach(([symbol, data], n) => {
      const base = n * 3;
      placeholders.push(`($${base + 1}, $${base + 2}::jsonb, $${base + 3})`);
      params.push(symbol, JSON.stringify(data), data.ts || Date.now());
    });
    await query(
      `INSERT INTO quotes (symbol, data, updated_at) VALUES ${placeholders.join(', ')}
       ON CONFLICT (symbol) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      params
    );
  }
  bust('quotes');
}

async function deleteQuote(symbol) {
  if (USE_MEMORY) { mem.quotes.delete(symbol); return; }
  await query('DELETE FROM quotes WHERE symbol = $1', [symbol]);
  bust('quotes');
}

// ---- history ----
// MSE history is end-of-day data: within a session it never changes, so a
// 10-minute TTL collapses the per-poll full-history reads (139 symbols every
// 60s) into a handful of reads per hour. Writes (backfills, index appends)
// bust the key immediately.
async function getHistory(symbol) {
  let rows;
  if (USE_MEMORY) {
    const m = mem.history.get(symbol);
    rows = m ? [...m.values()] : [];
  } else {
    rows = await cached(`hist:${symbol}`, 10 * 60 * 1000, async () => {
      const r = await query('SELECT data FROM history WHERE symbol = $1', [symbol]);
      return r.rows.map((x) => x.data);
    });
  }
  // Sort in JS: MSE dates are M/D/YYYY ("9/4/2026"), which does NOT sort
  // correctly as strings across months/years. sortByDate parses them.
  return sortByDate(rows);
}
async function upsertHistoryRows(symbol, rows) {
  if (!rows.length) return;
  if (USE_MEMORY) {
    if (!mem.history.has(symbol)) mem.history.set(symbol, new Map());
    const m = mem.history.get(symbol);
    for (const row of rows) m.set(row.date, row);
    return;
  }
  // Multi-row INSERTs in chunks of 500 (one round-trip per chunk).
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const placeholders = [];
    const params = [];
    batch.forEach((row, n) => {
      const base = n * 3;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}::jsonb)`);
      params.push(symbol, row.date, JSON.stringify(row));
    });
    await query(
      `INSERT INTO history (symbol, date, data) VALUES ${placeholders.join(', ')}
       ON CONFLICT (symbol, date) DO UPDATE SET data = EXCLUDED.data`,
      params
    );
  }
  bust(`hist:${symbol}`);
}

// ---- indices ----
async function getAllIndices() {
  if (USE_MEMORY) return Object.fromEntries(mem.indices);
  return cached('indices', 5000, async () => {
    const r = await query('SELECT code, data FROM indices');
    const out = {};
    for (const row of r.rows) out[row.code] = row.data;
    return out;
  });
}
async function upsertIndex(code, data) {
  if (USE_MEMORY) { mem.indices.set(code, data); return; }
  await query(
    `INSERT INTO indices (code, data, updated_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [code, JSON.stringify(data), data.ts || Date.now()]
  );
  bust('indices');
}

// ---- financials ----
async function getFinancials(symbol) {
  if (USE_MEMORY) return mem.financials.get(symbol) || null;
  return cached(`fin:${symbol}`, 60 * 1000, async () => {
    const r = await query('SELECT data, fetched_at FROM financials WHERE symbol = $1', [symbol]);
    return r.rows.length ? { data: r.rows[0].data, fetchedAt: r.rows[0].fetched_at } : null;
  });
}
async function setFinancials(symbol, data) {
  const now = Date.now();
  if (USE_MEMORY) { mem.financials.set(symbol, { data, fetchedAt: now }); return; }
  await query(
    `INSERT INTO financials (symbol, data, fetched_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (symbol) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at`,
    [symbol, JSON.stringify(data), now]
  );
  bust(`fin:${symbol}`, 'fins');
}
async function getAllFinancials() {
  if (USE_MEMORY) return Object.fromEntries(mem.financials);
  return cached('fins', 60 * 1000, async () => {
    const r = await query('SELECT symbol, data, fetched_at FROM financials');
    const out = {};
    for (const row of r.rows) out[row.symbol] = { data: row.data, fetchedAt: row.fetched_at };
    return out;
  });
}

// ---- companies (website for favicon logos) ----
async function getAllCompanies() {
  if (USE_MEMORY) return Object.fromEntries(mem.companies);
  return cached('companies', 60 * 1000, async () => {
    const r = await query('SELECT symbol, name, website, source, fetched_at FROM companies');
    const out = {};
    for (const row of r.rows) {
      out[row.symbol] = { name: row.name, website: row.website, source: row.source, fetchedAt: row.fetched_at };
    }
    return out;
  });
}
async function upsertCompanies(map) {
  const now = Date.now();
  const entries = Object.entries(map);
  if (USE_MEMORY) {
    for (const [symbol, v] of entries) mem.companies.set(symbol, { ...v, fetchedAt: now });
    return;
  }
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const placeholders = [];
    const params = [];
    batch.forEach(([symbol, v], n) => {
      const b = n * 5;
      placeholders.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
      params.push(symbol, v.name || null, v.website || null, v.source || null, now);
    });
    await query(
      `INSERT INTO companies (symbol, name, website, source, fetched_at) VALUES ${placeholders.join(', ')}
       ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, website = EXCLUDED.website,
         source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at`,
      params
    );
  }
  bust('companies');
}

// ---- favicons (self-hosted company logos) ----
async function getFavicon(symbol) {
  if (USE_MEMORY) return mem.favicons.get(symbol) || null;
  // Bytes are immutable (URL is ?v={favv}-busted), so a long TTL is safe;
  // writes still bust the key immediately after a re-crawl.
  return cached(`fav:${symbol}`, 10 * 60 * 1000, async () => {
    const r = await query('SELECT data, content_type FROM favicons WHERE symbol = $1', [symbol]);
    return r.rows.length ? { data: r.rows[0].data, type: r.rows[0].content_type } : null;
  });
}
// Versions only (symbol -> fetchedAt). The poller stamps `favv` onto quotes
// every cycle but never needs the image bytes — reading the BYTEA column for
// that was the heaviest repeated DB read. Bytes are only served by the
// per-symbol /api/favicon endpoint.
async function getFaviconVersions() {
  if (USE_MEMORY) {
    const out = {};
    for (const [sym, v] of mem.favicons) out[sym] = { fetchedAt: v.fetchedAt || 0 };
    return out;
  }
  return cached('favversions', 10 * 60 * 1000, async () => {
    const r = await query('SELECT symbol, fetched_at FROM favicons');
    const out = {};
    for (const row of r.rows) out[row.symbol] = { fetchedAt: Number(row.fetched_at) };
    return out;
  });
}
async function upsertFavicons(map) {
  const now = Date.now();
  const entries = Object.entries(map);
  if (USE_MEMORY) {
    for (const [symbol, v] of entries) mem.favicons.set(symbol, { ...v, fetchedAt: now });
    return;
  }
  for (const [symbol, v] of entries) {
    await query(
      `INSERT INTO favicons (symbol, data, content_type, fetched_at) VALUES ($1, $2::bytea, $3, $4)
       ON CONFLICT (symbol) DO UPDATE SET data = EXCLUDED.data, content_type = EXCLUDED.content_type, fetched_at = EXCLUDED.fetched_at`,
      [symbol, v.data, v.type, now]
    );
  }
  bust('favversions');
}
async function deleteFavicon(symbol) {
  if (USE_MEMORY) { mem.favicons.delete(symbol); return; }
  await query('DELETE FROM favicons WHERE symbol = $1', [symbol]);
  bust('favversions', `fav:${symbol}`);
}

// ---- movers (official MSE homepage panels) ----
// Returns { data, fetchedAt } (or null when nothing is stored) so callers can
// both serve the payload and judge how stale it is.
async function getMovers() {
  if (USE_MEMORY) return mem.movers ? { data: mem.movers.data, fetchedAt: mem.movers.fetchedAt } : null;
  return cached('movers', 60 * 1000, async () => {
    const r = await query('SELECT data, fetched_at FROM movers WHERE id = 1');
    return r.rows.length ? { data: r.rows[0].data, fetchedAt: r.rows[0].fetched_at } : null;
  });
}
async function setMovers(data) {
  const now = Date.now();
  if (USE_MEMORY) { mem.movers = { data, fetchedAt: now }; return; }
  await query(
    `INSERT INTO movers (id, data, fetched_at) VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at`,
    [JSON.stringify(data), now]
  );
  bust('movers');
}

// ---- push subscriptions (daily movers / watchlist notifications) ----
async function getPushSubscriptions() {
  if (USE_MEMORY) return Array.from(mem.pushSubs.values());
  const r = await query('SELECT endpoint, keys, lang, watchlist, last_notified_day FROM push_subscriptions');
  return r.rows.map((row) => ({
    endpoint: row.endpoint,
    keys: row.keys,
    lang: row.lang,
    watchlist: row.watchlist || [],
    lastNotifiedDay: row.last_notified_day,
  }));
}
async function upsertPushSubscription({ endpoint, keys, lang, watchlist }) {
  const now = Date.now();
  if (USE_MEMORY) {
    const prev = mem.pushSubs.get(endpoint);
    mem.pushSubs.set(endpoint, {
      endpoint, keys, lang: lang || 'mk', watchlist: watchlist || [],
      createdAt: prev ? prev.createdAt : now,
      lastNotifiedDay: prev ? prev.lastNotifiedDay : null,
    });
    return;
  }
  await query(
    `INSERT INTO push_subscriptions (endpoint, keys, lang, watchlist, created_at)
     VALUES ($1, $2::jsonb, $3, $4::jsonb, $5)
     ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys, lang = EXCLUDED.lang, watchlist = EXCLUDED.watchlist`,
    [endpoint, JSON.stringify(keys), lang || 'mk', JSON.stringify(watchlist || []), now]
  );
}
async function deletePushSubscription(endpoint) {
  if (USE_MEMORY) { mem.pushSubs.delete(endpoint); return; }
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}
async function markPushNotified(endpoint, day) {
  if (USE_MEMORY) {
    const s = mem.pushSubs.get(endpoint);
    if (s) s.lastNotifiedDay = day;
    return;
  }
  await query('UPDATE push_subscriptions SET last_notified_day = $2 WHERE endpoint = $1', [endpoint, day]);
}

module.exports = {
  query,
  migrate,
  getMeta,
  setMeta,
  getAllQuotes,
  upsertQuotes,
  deleteQuote,
  getHistory,
  upsertHistoryRows,
  getAllIndices,
  upsertIndex,
  getFinancials,
  setFinancials,
  getAllFinancials,
  getAllCompanies,
  upsertCompanies,
  getFavicon,
  getFaviconVersions,
  upsertFavicons,
  deleteFavicon,
  getMovers,
  setMovers,
  getPushSubscriptions,
  upsertPushSubscription,
  deletePushSubscription,
  markPushNotified,
};
