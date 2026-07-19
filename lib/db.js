const { Pool } = require('pg');

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
      max: 5,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (e) => console.error('[db] pool error', e.message));
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
  console.log('[db] schema ready');
}

// ---- meta (single-row key/value store for the active symbol list) ----
async function getMeta(key, def = null) {
  const r = await query('SELECT value FROM meta WHERE key = $1', [key]);
  return r.rows.length ? r.rows[0].value : def;
}
async function setMeta(key, value) {
  await query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

// ---- quotes ----
async function getAllQuotes() {
  const r = await query('SELECT symbol, data FROM quotes');
  const out = {};
  for (const row of r.rows) out[row.symbol] = row.data;
  return out;
}
async function upsertQuotes(map) {
  // map: { symbol: dataObj }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const [symbol, data] of Object.entries(map)) {
      await client.query(
        `INSERT INTO quotes (symbol, data, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (symbol) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [symbol, data, data.ts || Date.now()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---- history ----
async function getHistory(symbol) {
  const r = await query(
    'SELECT data FROM history WHERE symbol = $1 ORDER BY data->>\'date\' ASC',
    [symbol]
  );
  return r.rows.map((x) => x.data);
}
async function upsertHistoryRows(symbol, rows) {
  if (!rows.length) return;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO history (symbol, date, data) VALUES ($1, $2, $3)
         ON CONFLICT (symbol, date) DO UPDATE SET data = EXCLUDED.data`,
        [symbol, row.date, row]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---- indices ----
async function getAllIndices() {
  const r = await query('SELECT code, data FROM indices');
  const out = {};
  for (const row of r.rows) out[row.code] = row.data;
  return out;
}
async function upsertIndex(code, data) {
  await query(
    `INSERT INTO indices (code, data, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [code, data, data.ts || Date.now()]
  );
}

module.exports = {
  query,
  migrate,
  getMeta,
  setMeta,
  getAllQuotes,
  upsertQuotes,
  getHistory,
  upsertHistoryRows,
  getAllIndices,
  upsertIndex,
};
