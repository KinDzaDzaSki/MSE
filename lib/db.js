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
  const r = await query('SELECT symbol, data FROM quotes');
  const out = {};
  for (const row of r.rows) out[row.symbol] = row.data;
  return out;
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
}

async function deleteQuote(symbol) {
  if (USE_MEMORY) { mem.quotes.delete(symbol); return; }
  await query('DELETE FROM quotes WHERE symbol = $1', [symbol]);
}

// ---- history ----
async function getHistory(symbol) {
  let rows;
  if (USE_MEMORY) {
    const m = mem.history.get(symbol);
    rows = m ? [...m.values()] : [];
  } else {
    const r = await query('SELECT data FROM history WHERE symbol = $1', [symbol]);
    rows = r.rows.map((x) => x.data);
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
}

// ---- indices ----
async function getAllIndices() {
  if (USE_MEMORY) return Object.fromEntries(mem.indices);
  const r = await query('SELECT code, data FROM indices');
  const out = {};
  for (const row of r.rows) out[row.code] = row.data;
  return out;
}
async function upsertIndex(code, data) {
  if (USE_MEMORY) { mem.indices.set(code, data); return; }
  await query(
    `INSERT INTO indices (code, data, updated_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [code, JSON.stringify(data), data.ts || Date.now()]
  );
}

// ---- financials ----
async function getFinancials(symbol) {
  if (USE_MEMORY) return mem.financials.get(symbol) || null;
  const r = await query('SELECT data, fetched_at FROM financials WHERE symbol = $1', [symbol]);
  return r.rows.length ? { data: r.rows[0].data, fetchedAt: r.rows[0].fetched_at } : null;
}
async function setFinancials(symbol, data) {
  const now = Date.now();
  if (USE_MEMORY) { mem.financials.set(symbol, { data, fetchedAt: now }); return; }
  await query(
    `INSERT INTO financials (symbol, data, fetched_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (symbol) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at`,
    [symbol, JSON.stringify(data), now]
  );
}
async function getAllFinancials() {
  if (USE_MEMORY) return Object.fromEntries(mem.financials);
  const r = await query('SELECT symbol, data, fetched_at FROM financials');
  const out = {};
  for (const row of r.rows) out[row.symbol] = { data: row.data, fetchedAt: row.fetched_at };
  return out;
}

// ---- companies (website for favicon logos) ----
async function getAllCompanies() {
  if (USE_MEMORY) return Object.fromEntries(mem.companies);
  const r = await query('SELECT symbol, name, website, source, fetched_at FROM companies');
  const out = {};
  for (const row of r.rows) {
    out[row.symbol] = { name: row.name, website: row.website, source: row.source, fetchedAt: row.fetched_at };
  }
  return out;
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
};
