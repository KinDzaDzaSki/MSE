const { fetchSymbolList, fetchHistory, fetchQuote, fetchIndex, fetchIndexHistory, changeFromHistory, week52ChangeFromHistory, isEquity } = require('./scraper');
const db = require('./db');
const log = require('./logger');

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

// Called immediately on boot so platform health probes see ready=true.
// Actual poll data fills in later in the background.
function markReady() {
  state.lastPoll = Date.now();
}

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
    log.info('fetching symbol list...');
    state.symbols = await fetchSymbolList();
    await db.setMeta('symbols', state.symbols);
    log.info(`got ${state.symbols.length} symbols`);
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
    log.info(`poll ${ok}/${state.symbols.length} quotes updated; ${activeSet.length} active companies in ${Date.now() - t0}ms`);
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
      log.error(`backfill ${symbol} window error: ${e.message}`);
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  if (fresh.length) await db.upsertHistoryRows(symbol, fresh);
  log.info(`backfill ${symbol}: ${all.length} rows (${fresh.length} new)`);
  return all;
}

async function getHistory(symbol) {
  return db.getHistory(symbol);
}

// Backfill historical daily values for an index (e.g. MBI10).
// Fetches the current and previous year, then stores in the history table.
async function backfillIndexHistory(code = 'MBI10') {
  const now = nowSkopje();
  const thisYear = now.getFullYear();
  const years = [thisYear - 1, thisYear];
  const all = [];
  for (const year of years) {
    try {
      const rows = await fetchIndexHistory(code, year);
      all.push(...rows);
    } catch (e) {
      log.error(`backfillIndex ${code} year ${year} error: ${e.message}`);
    }
  }
  if (all.length) {
    const existing = await db.getHistory(code);
    const haveDates = new Set(existing.map((r) => r.date));
    const fresh = all.filter((r) => !haveDates.has(r.date));
    if (fresh.length) await db.upsertHistoryRows(code, fresh);
    log.info(`backfillIndex ${code}: ${all.length} rows (${fresh.length} new)`);
  }
  return all;
}

async function pollIndices() {
  try {
    const mbi = await fetchIndex('MBI10');
    await db.upsertIndex('MBI10', { ...mbi, ts: Date.now() });
    log.info(`poll index MBI10=${mbi.value}`);
  } catch (e) {
    log.error(`poll index error: ${e.message}`);
  }
}

async function getQuotes() {
  return db.getAllQuotes();
}
async function getIndices() {
  return db.getAllIndices();
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function startScheduler({ pollIntervalMs = 60000 } = {}) {
  (async () => {
    try {
      await withTimeout(pollQuotes(), 180000, 'initial poll');
    } catch (e) {
      log.error(`scheduler initial poll error: ${e.message}`);
    }
    try {
      await pollIndices();
    } catch (e) {
      log.error(`scheduler initial index error: ${e.message}`);
    }
    // One-time backfill on first install: uses a DB flag so partial history
    // from a pre-empted container doesn't skip the full backfill.
    try {
      const syms = getSymbols();
      const alreadyBackfilled = await db.getMeta('backfilled', null);
      if (syms.length && alreadyBackfilled === null) {
        log.info('first run — backfilling history for all symbols...');
        await withTimeout((async () => {
          for (let i = 0; i < syms.length; i++) {
            await backfillHistory(syms[i], 365);
          }
          // Also backfill index history (MBI10)
          await backfillIndexHistory('MBI10');
          await db.setMeta('backfilled', '1');
          log.info(`one-time backfill complete (${syms.length} symbols)`);
          // Re-poll so changes get computed from fresh history
          await pollQuotes();
          await pollIndices();
        })(), 600000, 'one-time backfill'); // 10 min timeout
      }
    } catch (e) {
      log.error(`one-time backfill error: ${e.message}`);
    }

    // One-time cleanup: remove stock quotes with no price (lastPrice is null).
    // Runs after the first poll so the quotes table is populated.
    try {
      const cleanupDone = await db.getMeta('cleanup_noprice', null);
      if (cleanupDone === null) {
        log.info('running one-time cleanup of no-price stocks...');
        const all = await db.getAllQuotes();
        const toRemove = Object.entries(all).filter(([, q]) => q.lastPrice == null);
        if (toRemove.length) {
          for (const [sym] of toRemove) {
            await db.deleteQuote(sym);
            log.info(`  removed ${sym} (no price)`);
          }
          // Also clean up the active symbol list
          const active = await db.getMeta('active', []);
          if (Array.isArray(active) && active.length) {
            const removed = new Set(toRemove.map(([s]) => s));
            const filtered = active.filter((s) => !removed.has(s));
            if (filtered.length !== active.length) {
              await db.setMeta('active', filtered);
            }
          }
          log.info(`cleanup removed ${toRemove.length} no-price stocks`);
        } else {
          log.info('cleanup: no no-price stocks found');
        }
        await db.setMeta('cleanup_noprice', '1');
      }
    } catch (e) {
      log.error(`cleanup error: ${e.message}`);
    }
  })();
  setInterval(async () => {
    if (isMarketOpen()) {
      await pollQuotes();
      await pollIndices();
    }
  }, pollIntervalMs);
  log.info(`scheduler initial poll done; live polling every ${pollIntervalMs / 1000}s while market open`);
}

module.exports = {
  markReady,
  init,
  getSymbols,
  getQuotes,
  getHistory,
  getIndices,
  pollQuotes,
  pollIndices,
  backfillHistory,
  backfillIndexHistory,
  startScheduler,
  isMarketOpen,
  todaySkopjeStr,
};

// lastPoll is a getter over internal state so server.js can
// read it without direct access to the module's internal state.
Object.defineProperty(module.exports, 'lastPoll', {
  get() { return state.lastPoll; },
  enumerable: true,
});
