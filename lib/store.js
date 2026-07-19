const fs = require('fs');
const path = require('path');
const { fetchSymbolList, fetchHistory, fetchQuote, fetchIndex, changeFromHistory, week52ChangeFromHistory, isEquity } = require('./scraper');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const INDICES_FILE = path.join(DATA_DIR, 'indices.json');

function ensureDirs() {
  for (const d of [DATA_DIR, HISTORY_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function loadJson(file, def) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
}

function saveJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// Skopje time helpers (CET/CEST, UTC+1/+2). Market open Mon-Fri 09:00-14:30.
function nowSkopje() {
  // compute time in Europe/Skopje via offset using Intl
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Skopje',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  const date = new Date(`${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`);
  return date;
}

function isMarketOpen() {
  const d = nowSkopje();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= 9 * 60 && mins <= 14 * 60 + 30;
}

function fmtDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function todaySkopjeStr() {
  return fmtDate(nowSkopje());
}

let state = {
  symbols: [],
  meta: {},
  lastPoll: null,
  polling: false,
};

async function init() {
  ensureDirs();
  state.meta = loadJson(META_FILE, {});
  // Prefer the persisted active company list; otherwise fall back to the raw
  // full list (bonds included) which the first poll will narrow down.
  state.symbols = state.meta.active || state.meta.symbols || [];
  if (state.symbols.length === 0) {
    console.log('[store] fetching symbol list...');
    state.symbols = await fetchSymbolList();
    state.meta.symbols = state.symbols;
    state.meta.fetchedAt = new Date().toISOString();
    saveJson(META_FILE, state.meta);
    console.log(`[store] got ${state.symbols.length} symbols`);
  }
  return state.symbols;
}

function getSymbols() {
  return state.symbols;
}

async function pollQuotes() {
  if (state.polling) return;
  state.polling = true;
  const t0 = Date.now();
  try {
    const results = {};
    const activeSet = [];
    let ok = 0;
    for (const sym of state.symbols) {
      let q = null;
      for (let attempt = 0; attempt < 3 && !q; attempt++) {
        try {
          q = await fetchQuote(sym);
        } catch (e) {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (!q) continue; // keep previous on persistent failure
      const hist = getHistory(sym);
      const chg = changeFromHistory(hist);
      const chg52 = week52ChangeFromHistory(hist);
      // Daily absolute change in MKD
      const valid = hist.filter((r) => r.last != null);
      const dailyChange = valid.length >= 2
        ? +(valid[valid.length - 1].last - valid[valid.length - 2].last).toFixed(2)
        : null;
      results[sym] = { ...q, changePct: chg, dailyChange, week52Chg: chg52, ts: Date.now() };
      ok++;
      // Keep only actively-traded companies (equity that has traded recently).
      const hasTraded = hist.some((r) => r.volume && r.volume > 0);
      if (isEquity(q.segment, q.name, sym) && hasTraded) activeSet.push(sym);
      await new Promise((r) => setTimeout(r, 40)); // be polite to the source
    }
    const prev = loadJson(QUOTES_FILE, {});
    const merged = { ...prev, ...results };
    saveJson(QUOTES_FILE, merged);
    // Persist the active company list; restrict tracked symbols to it.
    state.meta.active = activeSet;
    state.symbols = activeSet;
    saveJson(META_FILE, state.meta);
    state.lastPoll = Date.now();
    console.log(`[poll] ${ok}/${state.symbols.length} quotes updated; ${activeSet.length} active companies in ${Date.now() - t0}ms`);
  } finally {
    state.polling = false;
  }
}

// Historical backfill for a symbol: fetch up to ~1yr windows and append to file
async function backfillHistory(symbol, days = 365) {
  const file = path.join(HISTORY_DIR, `${symbol}.json`);
  const existing = loadJson(file, []);
  const haveDates = new Set(existing.map((r) => r.date));
  // build date windows of ~330 days (site limits to 1 year)
  const end = nowSkopje();
  let from = new Date(end);
  from.setDate(from.getDate() - days);
  const windows = [];
  let curFrom = new Date(from);
  while (curFrom <= end) {
    const to = new Date(curFrom);
    to.setDate(to.getDate() + 330);
    const realTo = to > end ? end : to;
    windows.push([new Date(curFrom), realTo]);
    curFrom = new Date(to);
    curFrom.setDate(curFrom.getDate() + 1);
  }
  const all = [...existing];
  for (const [f, t] of windows) {
    try {
      const rows = await fetchHistory(symbol, fmtDate(f), fmtDate(t));
      for (const r of rows) {
        if (!haveDates.has(r.date)) {
          all.push(r);
          haveDates.add(r.date);
        }
      }
    } catch (e) {
      console.error(`[backfill] ${symbol} window error`, e.message);
    }
  }
  all.sort((a, b) => new Date(a.date) - new Date(b.date));
  saveJson(file, all);
  console.log(`[backfill] ${symbol}: ${all.length} rows`);
  return all;
}

function getHistory(symbol) {
  return loadJson(path.join(HISTORY_DIR, `${symbol}.json`), []);
}

async function pollIndices() {
  try {
    const mbi = await fetchIndex('MBI10');
    const prev = loadJson(INDICES_FILE, {});
    const merged = { ...prev, MBI10: { ...mbi, ts: Date.now() } };
    saveJson(INDICES_FILE, merged);
    console.log(`[poll] index MBI10=${mbi.value}`);
  } catch (e) {
    console.error('[poll] index error', e.message);
  }
}

function getQuotes() {
  return loadJson(QUOTES_FILE, {});
}
function getIndices() {
  return loadJson(INDICES_FILE, {});
}

function startScheduler({ pollIntervalMs = 60000 } = {}) {
  // Always do an initial refresh so the dashboard has data, then refresh on
  // schedule only while the market is open (live trading hours).
  (async () => {
    await pollQuotes();
    await pollIndices();
  })();
  setInterval(async () => {
    if (isMarketOpen()) {
      await pollQuotes();
      await pollIndices();
    }
  }, pollIntervalMs);
  console.log(`[scheduler] initial poll done; live polling every ${pollIntervalMs / 1000}s while market open`);
}

module.exports = {
  init,
  getSymbols,
  getQuotes,
  getHistory,
  getIndices,
  pollQuotes,
  pollIndices,
  backfillHistory,
  startScheduler,
  isMarketOpen,
  todaySkopjeStr,
};
