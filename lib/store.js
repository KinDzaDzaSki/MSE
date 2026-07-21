const { fetchSymbolList, fetchHistory, fetchQuote, fetchIndex, changeFromHistory, week52ChangeFromHistory, isEquity } = require('./scraper');
const db = require('./db');

// Skopje time helpers (CET/CEST, UTC+1/+2). Market open Mon-Fri 09:00-14:30.
function nowSkopje() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Skopje',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return new Date(`${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`);
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
  lastPoll: null,
  polling: false,
};

async function init() {
  await db.migrate();
  // Prefer the persisted active company list; otherwise fall back to the raw
  // full list (bonds included) which the first poll will narrow down.
  let active = await db.getMeta('active', null);
  let all = await db.getMeta('symbols', null);
  if (Array.isArray(active) && active.length) {
    state.symbols = active;
  } else if (Array.isArray(all) && all.length) {
    state.symbols = all;
  } else {
    console.log('[store] fetching symbol list...');
    state.symbols = await fetchSymbolList();
    await db.setMeta('symbols', state.symbols);
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
    const syms = state.symbols;
    // Fetch in parallel batches of 10 to reduce total poll time
    const BATCH = 10;
    for (let i = 0; i < syms.length; i += BATCH) {
      const batch = syms.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map(async (sym) => {
        let q = null;
        for (let attempt = 0; attempt < 3 && !q; attempt++) {
          try {
            q = await fetchQuote(sym);
          } catch (e) {
            if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
          }
        }
        if (!q) return null;
        const hist = await getHistory(sym);
        const chg = changeFromHistory(hist);
        const chg52 = week52ChangeFromHistory(hist);
        const valid = hist.filter((r) => r.last != null);
        const dailyChange = valid.length >= 2
          ? +(valid[valid.length - 1].last - valid[valid.length - 2].last).toFixed(2)
          : null;
        const hasTraded = hist.some((r) => r.volume && r.volume > 0);
        const isActive = isEquity(q.segment, q.name, sym) || hasTraded;
        return { sym, quote: { ...q, changePct: chg, dailyChange, week52Chg: chg52, ts: Date.now() }, isActive };
      }));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          results[r.value.sym] = r.value.quote;
          ok++;
          if (r.value.isActive) activeSet.push(r.value.sym);
        }
      }
      await new Promise((r) => setTimeout(r, 40)); // be polite between batches
    }
    if (Object.keys(results).length) {
      const prev = await db.getAllQuotes();
      const merged = { ...prev, ...results };
      await db.upsertQuotes(merged);
    }
    state.symbols = activeSet;
    await db.setMeta('active', activeSet);
    await db.setMeta('symbols', activeSet);
    state.lastPoll = Date.now();
    console.log(`[poll] ${ok}/${state.symbols.length} quotes updated; ${activeSet.length} active companies in ${Date.now() - t0}ms`);
  } finally {
    state.polling = false;
  }
}

// Historical backfill for a symbol: fetch up to ~1yr windows and append.
async function backfillHistory(symbol, days = 365) {
  const existing = await getHistory(symbol);
  const haveDates = new Set(existing.map((r) => r.date));
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
  const fresh = [];
  for (const [f, t] of windows) {
    try {
      const rows = await fetchHistory(symbol, fmtDate(f), fmtDate(t));
      for (const r of rows) {
        if (!haveDates.has(r.date)) {
          all.push(r);
          fresh.push(r);
          haveDates.add(r.date);
        }
      }
    } catch (e) {
      console.error(`[backfill] ${symbol} window error`, e.message);
    }
  }
  all.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (fresh.length) await db.upsertHistoryRows(symbol, fresh);
  console.log(`[backfill] ${symbol}: ${all.length} rows (${fresh.length} new)`);
  return all;
}

async function getHistory(symbol) {
  return db.getHistory(symbol);
}

async function pollIndices() {
  try {
    const mbi = await fetchIndex('MBI10');
    await db.upsertIndex('MBI10', { ...mbi, ts: Date.now() });
    console.log(`[poll] index MBI10=${mbi.value}`);
  } catch (e) {
    console.error('[poll] index error', e.message);
  }
}

async function getQuotes() {
  return db.getAllQuotes();
}
async function getIndices() {
  return db.getAllIndices();
}

function startScheduler({ pollIntervalMs = 60000 } = {}) {
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
