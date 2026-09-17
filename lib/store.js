const { fetchSymbolList, fetchHistory, fetchQuote, fetchIndex, fetchIndexHistory, changeFromHistory, week52ChangeFromHistory, isEquity, fetchFinancialData, sortByDate, parseMDY } = require('./scraper');
const db = require('./db');
const log = require('./logger');
const { maybeRefreshFX } = require('./fx');
const companies = require('./companies');
const faviconsLib = require('./favicons');
const { nowSkopje, isMarketOpen, isPollingWindow } = require('./market');

function fmtDate(d) {
  // UTC getters: the Date is Date.UTC-built Skopje wall-clock (see nowSkopje).
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

let state = {
  symbols: [],
  lastPoll: null,
  polling: false,
  // spark series: { asOf, series: { SYM: [closes...] } } — full-resolution 1Y
  // closes, rebuilt at the end of every poll and persisted so clients draw
  // sparklines from /api/sparks without touching the history table.
  sparks: { asOf: null, series: {} },
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
  // Sparkline series (full-resolution 1Y closes) are persisted so a cold
  // serverless start can serve them without reading the whole history table.
  try {
    const sparks = await db.getMeta('sparks', null);
    if (sparks && sparks.series && typeof sparks.series === 'object') {
      state.sparks = sparks;
      log.info(`spark series loaded: ${Object.keys(sparks.series).length} symbols`);
    }
  } catch (e) {
    log.warn(`spark series load failed: ${e.message}`);
  }
  return state.symbols;
}

// Downsample is deliberately NOT used: sparklines render the full series.
// Symbol -> closes (1Y, full resolution, chronological) is what /api/sparks
// serves; no dates are sent because the sparkline only needs the shape.
function getSpark(symbol) {
  const s = state.sparks && state.sparks.series;
  return (s && s[symbol]) || null;
}
function getSparks() {
  return state.sparks || { asOf: null, series: {} };
}

// Build the full spark series from stored history — pure DB reads, no MSE
// requests. Used on boot when the cached series are missing (fresh deploy, new
// feature), so the dashboard gets instant sparklines even while closed.
async function rebuildSparksFromDb() {
  const syms = getSymbols();
  const series = {};
  const BATCH = 20;
  for (let i = 0; i < syms.length; i += BATCH) {
    const slice = syms.slice(i, i + BATCH);
    await Promise.all(slice.map(async (sym) => {
      try {
        const vals = closesOf(await db.getHistory(sym));
        if (vals.length > 1) series[sym] = vals;
      } catch (e) { /* skip symbol */ }
    }));
  }
  const n = Object.keys(series).length;
  if (n) {
    state.sparks = { asOf: state.lastPoll || Date.now(), series };
    await db.setMeta('sparks', state.sparks);
    log.info(`spark series rebuilt from DB: ${n} symbols (full resolution)`);
  }
  return n;
}

// Chronological closes from stored history rows.
function closesOf(rows) {
  return (rows || [])
    .filter((r) => r.last != null)
    .slice()
    .sort((a, b) => parseMDY(a.date) - parseMDY(b.date))
    .map((r) => +Number(r.last).toFixed(2));
}

function getSymbols() {
  return state.symbols;
}

// ---- Liquidity (data-driven, recalculated every poll) ----
// A symbol is "liquid" when it is an equity AND traded regularly
// (>= LIQUID_DAYS90 sessions with volume in the last 90 days) AND with
// meaningful size (avg turnover over its last 20 active sessions
// >= LIQUID_MIN_TURNOVER MKD). Block-trade ghosts (huge 1y turnover, few
// sessions) fail the regularity test.
const LIQUID_DAYS90 = 5;
const LIQUID_MIN_TURNOVER = 300000;

function computeLiquidity(hist) {
  const cutoff = nowSkopje().getTime() - 90 * 24 * 60 * 60 * 1000;
  const active = [];
  let activeDays90 = 0;
  for (const r of hist || []) {
    if (!(r.volume > 0)) continue;
    const t = parseMDY(r.date);
    if (t == null) continue;
    active.push({ t, to: r.turnoverTotal || r.turnoverBest || 0 });
    if (t >= cutoff) activeDays90++;
  }
  active.sort((a, b) => a.t - b.t);
  const last20 = active.slice(-20);
  const avg20 = last20.length ? last20.reduce((s, r) => s + r.to, 0) / last20.length : 0;
  return { activeDays90, avg20, lifetimeActive: active.length };
}

async function pollQuotes() {
  if (state.polling) return;
  state.polling = true;
  const t0 = Date.now();
  try {
    const syms = state.symbols;
    const prev = await db.getAllQuotes();

    // ---- Pass 1: liquidity metrics for every symbol (DB reads only) ----
    const metrics = {};
    const MBATCH = 20;
    for (let i = 0; i < syms.length; i += MBATCH) {
      const batch = syms.slice(i, i + MBATCH);
      await Promise.all(batch.map(async (sym) => {
        try {
          const hist = await getHistory(sym);
          metrics[sym] = { hist, ...computeLiquidity(hist) };
        } catch (e) {
          metrics[sym] = { hist: [], activeDays90: 0, avg20: 0, lifetimeActive: 0 };
        }
      }));
    }

    // ---- Group by issuer name (from previous quotes), pick primary series ----
    // Primary = most lifetime active trading days; tie -> shorter symbol.
    // Secondary series share the aggregated quote page, so they are never
    // fetched — their quote is derived from the primary below.
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const groups = {}; // normalizedName -> [syms]
    const nameOf = {};
    for (const sym of syms) {
      const nm = norm((prev[sym] && prev[sym].name) || sym);
      nameOf[sym] = (prev[sym] && prev[sym].name) || sym;
      (groups[nm] = groups[nm] || []).push(sym);
    }
    const primaryOf = {};
    for (const nm of Object.keys(groups)) {
      const members = groups[nm].slice().sort((a, b) => {
        const d = (metrics[b].lifetimeActive || 0) - (metrics[a].lifetimeActive || 0);
        return d !== 0 ? d : a.length - b.length;
      });
      for (const m of members) primaryOf[m] = members[0];
    }
    const primaries = [...new Set(Object.values(primaryOf))];

    // ---- Pass 2: fetch quotes for primaries only ----
    const results = {};
    const activeSet = [];
    let ok = 0;
    const BATCH = 10;
    for (let i = 0; i < primaries.length; i += BATCH) {
      const batch = primaries.slice(i, i + BATCH);
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
        const { hist } = metrics[sym];
        const chg = changeFromHistory(hist);
        const chg52 = week52ChangeFromHistory(hist);
        const valid = hist.filter((r) => r.last != null);
        const dailyChange = valid.length >= 2
          ? +(valid[valid.length - 1].last - valid[valid.length - 2].last).toFixed(2)
          : null;
        const hasTraded = hist.some((r) => r.volume && r.volume > 0);
        const isActive = isEquity(q.segment, q.name, sym) || hasTraded;
        const equity = isEquity(q.segment, q.name, sym);
        const m = metrics[sym];
        const liq = equity && m.activeDays90 >= LIQUID_DAYS90 && m.avg20 >= LIQUID_MIN_TURNOVER;
        const quote = { ...q, changePct: chg, dailyChange, week52Chg: chg52, ts: Date.now(), liq, primary: true };
        const seriesList = Object.keys(primaryOf).filter((s) => primaryOf[s] === sym && s !== sym);
        if (seriesList.length) quote.seriesList = seriesList;
        return { sym, quote, isActive };
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

    // ---- Pass 3: secondary series derive from their primary ----
    let secCount = 0;
    for (const sym of syms) {
      const pSym = primaryOf[sym];
      if (pSym === sym) continue;
      const src = results[pSym];
      if (!src) continue; // primary failed this poll — secondary drops too
      const { hist } = metrics[sym];
      const chg = changeFromHistory(hist);
      const chg52 = week52ChangeFromHistory(hist);
      const valid = hist.filter((r) => r.last != null);
      const dailyChange = valid.length >= 2
        ? +(valid[valid.length - 1].last - valid[valid.length - 2].last).toFixed(2)
        : null;
      const hasTraded = hist.some((r) => r.volume && r.volume > 0);
      results[sym] = { ...src, symbol: sym, changePct: chg, dailyChange, week52Chg: chg52, ts: Date.now(), liq: false, primary: false, seriesOf: pSym };
      delete results[sym].seriesList;
      secCount++;
      if (isEquity(src.segment, nameOf[sym], sym) || hasTraded) activeSet.push(sym);
    }

    if (Object.keys(results).length) {
      // Carry the company website (favicon logo) onto every quote so both the
      // client and the SSR pages get it from the single /api/quotes payload.
      // `fav` = "has an official site" -> the client runs the icon chain
      // (self-hosted favicon if we crawled one, else Google in-browser, else
      // monogram). Symbols without a site render the monogram immediately.
      // `favv` = the favicon's fetched_at — used as a cache-busting version in
      // the /api/favicon URL, so a re-crawl propagates immediately instead of
      // waiting out the browser's 24h favicon cache.
      const [companies, favicons] = await Promise.all([db.getAllCompanies(), db.getAllFavicons()]);
      for (const [sym, q] of Object.entries(results)) {
        const site = companies[sym] && companies[sym].website;
        if (site) q.site = site;
        q.fav = !!site;
        q.favv = favicons[sym] ? favicons[sym].fetchedAt || 0 : 0;
      }
      const merged = { ...prev, ...results };
      await db.upsertQuotes(merged);
    }
    state.symbols = activeSet;
    await db.setMeta('active', activeSet);
    await db.setMeta('symbols', activeSet);
    state.lastPoll = Date.now();
    // Sparkline series: the 1Y history is already loaded in `metrics`, so build
    // the FULL-resolution closes here (one pass per poll) instead of making
    // every client fetch history. Persisted so cold starts serve it instantly.
    try {
      const series = {};
      for (const sym of Object.keys(results)) {
        const vals = closesOf((metrics[sym] && metrics[sym].hist) || []);
        if (vals.length > 1) series[sym] = vals;
      }
      state.sparks = { asOf: state.lastPoll, series };
      await db.setMeta('sparks', state.sparks);
    } catch (e) {
      log.warn(`spark build failed: ${e.message}`);
    }
    const liquidCount = Object.values(results).filter((q) => q.liq).length;
    log.info(`poll ${ok}/${primaries.length} primaries (+${secCount} series) in ${Date.now() - t0}ms; ${activeSet.length} active, ${liquidCount} liquid; sparks ${Object.keys(state.sparks.series).length}`);
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
  const sorted = sortByDate(all);
  all.length = 0;
  all.push(...sorted);
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
  const thisYear = nowSkopje().getUTCFullYear();
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
  // Both published MSE indices: MBI10 (blue chip) + OMB (bond index).
  for (const code of ['MBI10', 'OMB']) {
    try {
      const idx = await fetchIndex(code);
      if (idx.value == null) continue;
      // Non-padded M/D/YYYY — MUST match MSE's scraped date format exactly,
      // otherwise the daily append duplicates the scraped row for the same
      // session (the (symbol, date) key is text).
      const now = nowSkopje();
      const date = `${now.getUTCMonth() + 1}/${now.getUTCDate()}/${now.getUTCFullYear()}`;
      // changePct from the index's own history (last close vs the previous
      // session's close). The MSE page's "% "" cell is intermittently empty,
      // so the scraped value is only a fallback.
      let changePct = idx.changePct;
      try {
        const rows = (await getHistory(code)).filter((r) => r.last != null && r.date !== date);
        const prev = rows.length ? rows[rows.length - 1].last : null;
        if (prev) changePct = +(((idx.value - prev) / prev) * 100).toFixed(2);
      } catch (e) { /* keep scraped fallback */ }
      await db.upsertIndex(code, { ...idx, changePct, ts: Date.now() });
      await db.upsertHistoryRows(code, [{ date, last: idx.value, max: idx.value, min: idx.value }]);
      log.info(`poll index ${code}=${idx.value} (${changePct != null ? changePct + '%' : '—'})`);
    } catch (e) {
      log.error(`poll index ${code} error: ${e.message}`);
    }
  }
}

// Long scrapes run as background jobs so HTTP requests (which platforms
// cap at ~15s) return immediately. Jobs live in memory; progress is
// polled via getJob(id).
const jobs = new Map();
let jobSeq = 0;
function startBackfillAllJob() {
  const id = `bf${Date.now().toString(36)}${++jobSeq}`;
  const job = { id, status: 'running', done: 0, total: 0, error: null, startedAt: Date.now() };
  jobs.set(id, job);
  (async () => {
    try {
      const syms = getSymbols();
      job.total = syms.length;
      for (const s of syms) {
        await backfillHistory(s, 365);
        job.done++;
      }
      await backfillIndexHistory('MBI10');
      await backfillIndexHistory('OMB');
      job.status = 'done';
      log.info(`backfill-all job ${id} complete (${job.done} symbols)`);
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      log.error(`backfill-all job ${id} error: ${e.message}`);
    }
  })();
  return job;
}
function getJob(id) {
  return jobs.get(id) || null;
}

// ---- Financials warm-up (dividends view data) ----
// Weekly boot re-run (Q1-r2): the meta timestamp gates the trigger, and the
// 24h TTL inside getFinancials skips anything scraped recently, so re-runs
// are cheap and self-healing.
const FINANCIALS_BACKFILL_INTERVAL = 7 * 24 * 60 * 60 * 1000;

function startFinancialsBackfillJob() {
  const id = `fin${Date.now().toString(36)}${++jobSeq}`;
  const job = { id, status: 'running', done: 0, total: 0, error: null, startedAt: Date.now() };
  jobs.set(id, job);
  (async () => {
    try {
      const syms = getSymbols();
      job.total = syms.length;
      for (const s of syms) {
        try {
          await getFinancials(s);
        } catch (e) {
          log.error(`financials warm ${s} error: ${e.message}`);
        }
        job.done++;
      }
      job.status = 'done';
      log.info(`financials backfill job ${id} complete (${job.done}/${job.total})`);
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      log.error(`financials backfill job ${id} error: ${e.message}`);
    }
  })();
  return job;
}

// Called once per boot from startScheduler. Returns a job when one started.
async function maybeBackfillFinancials() {
  try {
    const last = await db.getMeta('financials_backfilled_at', 0);
    const ts = typeof last === 'number' ? last : parseInt(last, 10) || 0;
    if (Date.now() - ts < FINANCIALS_BACKFILL_INTERVAL) return null;
    log.info('financials backfill due (weekly) — starting warm-up job');
    await db.setMeta('financials_backfilled_at', Date.now());
    return startFinancialsBackfillJob();
  } catch (e) {
    log.error(`maybeBackfillFinancials error: ${e.message}`);
    return null;
  }
}

// ---- Companies (official website -> favicon logo) ----
// Same shape as the financials warm-up: a tracked job, gated by a meta
// timestamp. MSE profile pages change rarely, so a monthly re-run is plenty.
const COMPANIES_BACKFILL_INTERVAL = 30 * 24 * 60 * 60 * 1000;

// Copy `companies.website` onto already-stored quotes so the logos show up
// immediately after a scrape instead of waiting for the next market-hours poll.
async function attachCompanySites() {
  const [quotes, companies] = await Promise.all([db.getAllQuotes(), db.getAllCompanies()]);
  const patch = {};
  for (const [sym, q] of Object.entries(quotes)) {
    const site = companies[sym] && companies[sym].website;
    if (site && q.site !== site) patch[sym] = { ...q, site };
    else if (!site && q.site) { const { site: _drop, ...rest } = q; patch[sym] = rest; }
  }
  const n = Object.keys(patch).length;
  if (n) await db.upsertQuotes(patch);
  return n;
}

function startCompaniesBackfillJob({ force = false } = {}) {
  const id = `co${Date.now().toString(36)}${++jobSeq}`;
  const job = { id, status: 'running', done: 0, total: 0, error: null, startedAt: Date.now() };
  jobs.set(id, job);
  (async () => {
    try {
      const syms = getSymbols();
      job.total = syms.length;
      const res = await companies.scrapeCompanies(syms, {
        force,
        onProgress: () => { job.done++; },
      });
      job.updated = res.updated;
      job.skipped = res.skipped;
      job.failed = res.failed;
      job.sitesPatched = await attachCompanySites();
      job.status = 'done';
      log.info(`companies backfill job ${id} complete (${res.updated} updated, ${job.sitesPatched} quotes patched)`);
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      log.error(`companies backfill job ${id} error: ${e.message}`);
    }
  })();
  return job;
}

// Called once per boot. Runs when the table is empty (first install) or the
// monthly gate has elapsed.
async function maybeBackfillCompanies() {
  try {
    const last = await db.getMeta('companies_backfilled_at', 0);
    const ts = typeof last === 'number' ? last : parseInt(last, 10) || 0;
    const known = Object.keys(await db.getAllCompanies()).length;
    const empty = known < Math.max(5, Math.floor(getSymbols().length * 0.3));
    if (!empty && Date.now() - ts < COMPANIES_BACKFILL_INTERVAL) return null;
    log.info(`companies backfill due (${empty ? 'few rows cached' : 'monthly'}) — starting job`);
    await db.setMeta('companies_backfilled_at', Date.now());
    return startCompaniesBackfillJob({ force: empty && ts === 0 });
  } catch (e) {
    log.error(`maybeBackfillCompanies error: ${e.message}`);
    return null;
  }
}

// ---- Favicons (self-hosted company logos) ----
// Crawls each issuer's official site for its real <link rel=icon> or favicon.ico
// and stores the bytes. Runs on boot until we have favicons for most symbols
// that have a website; each result is persisted as it is fetched, so a job that
// gets killed (serverless) simply resumes on the next cold start.

// Copy the `fav` flag and the favicon version (`favv` = fetched_at) onto stored
// quotes: `fav` = the issuer has an official website (so the client attempts
// the icon chain), `favv` cache-busts the /api/favicon URL. Keeps quotes
// consistent even if they were written before these fields existed.
async function patchQuoteFavs() {
  const [quotes, favs, companies] = await Promise.all([db.getAllQuotes(), db.getAllFavicons(), db.getAllCompanies()]);
  const patch = {};
  for (const [sym, q] of Object.entries(quotes)) {
    const has = !!(companies[sym] && companies[sym].website);
    const favv = favs[sym] ? favs[sym].fetchedAt || 0 : 0;
    if (!!q.fav !== has || (q.favv || 0) !== favv) patch[sym] = { ...q, fav: has, favv };
  }
  const n = Object.keys(patch).length;
  if (n) await db.upsertQuotes(patch);
  return n;
}

async function startFaviconBackfillJob({ force = false } = {}) {
  const id = `fv${Date.now().toString(36)}${++jobSeq}`;
  const job = { id, status: 'running', done: 0, total: 0, error: null, startedAt: Date.now() };
  jobs.set(id, job);
  (async () => {
    try {
      const syms = getSymbols();
      job.total = syms.length;
      const res = await faviconsLib.scrapeFavicons(syms, { onProgress: () => { job.done++; } });
      job.ok = res.ok; job.none = res.none; job.failed = res.failed;
      job.quotesPatched = await patchQuoteFavs();
      job.status = 'done';
      log.info(`favicon backfill job ${id} complete (${res.ok} ok, ${res.none} none, ${res.failed} failed)`);
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      log.error(`favicon backfill job ${id} error: ${e.message}`);
    }
  })();
  return job;
}

async function maybeBackfillFavicons({ force = false } = {}) {
  try {
    const known = Object.keys(await db.getAllFavicons()).length;
    const withSite = Object.values(await db.getAllCompanies()).filter((c) => c.website).length;
    const target = Math.max(5, Math.floor(withSite * 0.6));
    if (!force && known >= target) return null;
    log.info(`favicon backfill due (${known}/${withSite} sites cached) — starting job`);
    return startFaviconBackfillJob({ force });
  } catch (e) {
    log.error(`maybeBackfillFavicons error: ${e.message}`);
    return null;
  }
}

// Dividend rows from cached financialRatios — zero extra scraping.
// Payers only (Q6); latest-yield desc; consistent = DPS in all year columns.
async function computeDividends() {
  const [quotes, fins] = [await db.getAllQuotes(), await db.getAllFinancials()];
  const out = [];
  for (const [sym, fin] of Object.entries(fins)) {
    const q = quotes[sym];
    if (q && q.primary === false) continue; // secondary series mirror the primary
    const fr = fin && fin.data && fin.data.financialRatios;
    if (!fr || !fr.rows || !fr.years) continue;
    const years = fr.years;
    const parse = (v) => {
      if (v == null) return null;
      const n = parseFloat(String(v).replace(/,/g, '').replace('%', '').trim());
      return isNaN(n) ? null : n;
    };
    const row = (re) => fr.rows.find((r) => re.test(r[0] || ''));
    const dpsRow = row(/dividend per share/i);
    if (!dpsRow) continue;
    const dps = years.map((_, i) => parse(dpsRow[i + 1]));
    if (!dps.some((v) => v != null && v > 0)) continue; // payers only
    const yldRow = row(/dividend yield/i);
    const epsRow = row(/earnings per share/i);
    const yld = yldRow ? years.map((_, i) => parse(yldRow[i + 1])) : years.map(() => null);
    const eps = epsRow ? years.map((_, i) => parse(epsRow[i + 1])) : years.map(() => null);
    const payout = dps.map((d, i) => (d != null && eps[i] != null && eps[i] > 0) ? +((d / eps[i]) * 100).toFixed(1) : null);
    out.push({
      symbol: sym,
      name: q ? q.name : sym,
      lastPrice: q ? q.lastPrice : null,
      liq: q ? !!q.liq : false,
      // logo fields — same as the quotes table so the dividends rows render
      // the company favicon instead of a monogram
      site: q ? q.site : undefined,
      fav: q ? !!q.fav : false,
      years,
      dps,
      yield: yld,
      payout,
      consistent: dps.every((v) => v != null && v > 0),
    });
  }
  out.sort((a, b) => {
    const ya = a.yield[0] == null ? -1 : a.yield[0];
    const yb = b.yield[0] == null ? -1 : b.yield[0];
    return yb - ya;
  });
  return out;
}

async function getQuotes() {
  return db.getAllQuotes();
}
// symbol -> { name, website, source } (empty object before the first scrape).
async function getCompanies() {
  return db.getAllCompanies();
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
    // Boot poll policy: MSE publishes end-of-day data and its pages don't change
    // after the session, so we only scrape on boot when it can actually return
    // something new — inside the polling window, or on a fresh install with no
    // stored quotes. Outside those windows the stored snapshot is already final.
    try {
      const haveQuotes = Object.keys(await db.getAllQuotes()).length > 0;
      if (!haveQuotes) {
        log.info('no stored quotes yet — bootstrap poll');
        await withTimeout(pollQuotes(), 180000, 'initial poll');
      } else if (isPollingWindow()) {
        log.info('boot poll (inside the trading window)');
        await withTimeout(pollQuotes(), 180000, 'initial poll');
      } else {
        log.info('boot poll skipped — market closed and stored data is final');
      }
    } catch (e) {
      log.error(`scheduler initial poll error: ${e.message}`);
    }
    try {
      if (isPollingWindow() || !(await db.getAllIndices()).MBI10) await pollIndices();
    } catch (e) {
      log.error(`scheduler initial index error: ${e.message}`);
    }
    // Spark series missing (new deploy / first boot)? Rebuild from stored
    // history — DB only, so it never pings MSE outside trading hours.
    try {
      if (Object.keys(state.sparks.series).length < Math.max(5, Math.floor(getSymbols().length * 0.5))) {
        await rebuildSparksFromDb();
      }
    } catch (e) {
      log.warn(`spark rebuild error: ${e.message}`);
    }
    // One-time backfill on first install: uses a DB flag so partial history
    // from a pre-empted container doesn't skip the full backfill.
    // Backfill fetches historical data which is safe to run anytime.
    try {
      const syms = getSymbols();
      const alreadyBackfilled = await db.getMeta('backfilled', null);
      if (syms.length && alreadyBackfilled === null) {
        log.info('first run — backfilling history for all symbols...');
        await withTimeout((async () => {
          for (let i = 0; i < syms.length; i++) {
            await backfillHistory(syms[i], 365);
          }
          // Also backfill index history (MBI10 + OMB)
          await backfillIndexHistory('MBI10');
          await backfillIndexHistory('OMB');
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

    // Weekly financials warm-up (dividends view) — fire-and-forget job.
    await maybeBackfillFinancials();
    // Monthly companies warm-up (favicon logos from official websites).
    await maybeBackfillCompanies();
    // Favicon crawl (self-hosted logos) — runs until most sites are covered.
    await maybeBackfillFavicons();
  })();
  setInterval(async () => {
    // FX check runs on every tick regardless of market hours (daily guard
    // inside decides whether a fetch is actually due).
    await maybeRefreshFX();
    if (isPollingWindow()) {
      await pollQuotes();
      await pollIndices();
    }
  }, pollIntervalMs);
  // Prime the FX cache at boot so the chip has data on first paint.
  maybeRefreshFX();
  log.info(`scheduler initial poll done; live polling every ${pollIntervalMs / 1000}s while the session runs (until 14:30 for the EOD publication lag)`);
}

// Fetch and cache financial data for a symbol. Cached for 24h.
async function getFinancials(symbol) {
  const cached = await db.getFinancials(symbol);
  const TTL = 24 * 60 * 60 * 1000; // 24 hours
  if (cached && (Date.now() - cached.fetchedAt) < TTL) {
    return cached.data;
  }
  try {
    const data = await fetchFinancialData(symbol);
    await db.setFinancials(symbol, data);
    return data;
  } catch (e) {
    log.error(`getFinancials ${symbol} error: ${e.message}`);
    // Return stale cache if scrape fails
    if (cached) return cached.data;
    return { financialData: null, financialRatios: null };
  }
}

// Compute a BUY/HOLD/SELL rating for each active symbol, using the same
// logic the frontend analysis tab uses. Returns { symbol -> { rating, score, maxScore } }.
async function computeRatings() {
  const quotes = await db.getAllQuotes();
  const activeSet = new Set(state.symbols);
  // Compute market median P/E for relative comparison
  const allPEs = Object.values(quotes).filter(q => activeSet.has(q.symbol) && q.peRatio != null && q.peRatio > 0).map(q => q.peRatio).sort((a,b) => a-b);
  const medianPE = allPEs.length ? allPEs[Math.floor(allPEs.length / 2)] : 15;

  const out = {};
  for (const [sym, q] of Object.entries(quotes)) {
    if (!activeSet.has(sym)) continue;
    let score = 0, maxScore = 0;
    const price = q.lastPrice;
    // 1. P/E vs market median
    if (q.peRatio != null && q.peRatio > 0) {
      maxScore++;
      if (q.peRatio < medianPE) score++;  // below market average
      else if (q.peRatio > medianPE * 2) score--;  // very expensive
    }
    // 2. Daily change
    if (q.dailyChange != null && q.lastPrice != null && q.lastPrice > 0) {
      maxScore++;
      const chgPct = q.dailyChange / q.lastPrice * 100;
      if (chgPct > 0) score++;
      else if (chgPct < -1) score--;
    }
    // 3. 52-week change
    if (q.week52Chg != null) {
      maxScore++;
      if (q.week52Chg > 0) score++;
      else if (q.week52Chg < -15) score--;
    }
    // 4. 52-week position (value zone)
    if (q.week52Max && q.week52Min && q.week52Max > q.week52Min && price) {
      maxScore++;
      const pos = (price - q.week52Min) / (q.week52Max - q.week52Min);
      if (pos < 0.75) score++;     // not near peak
      else score--;                 // near peak
    }
    // 5. Volume activity
    if (q.volume != null && price) {
      maxScore++;
      if (q.volume > 100) score++;
      else if (q.volume < 5) score--;
    }
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 50;
    out[sym] = { score, maxScore, pct: Math.max(0, Math.min(100, pct)) };
  }
  return out;
}

module.exports = {
  markReady,
  init,
  getSymbols,
  getQuotes,
  getCompanies,
  getSpark,
  getSparks,
  rebuildSparksFromDb,
  getHistory,
  getFinancials,
  getIndices,
  pollQuotes,
  pollIndices,
  backfillHistory,
  backfillIndexHistory,
  startBackfillAllJob,
  startFinancialsBackfillJob,
  startCompaniesBackfillJob,
  maybeBackfillCompanies,
  attachCompanySites,
  startFaviconBackfillJob,
  maybeBackfillFavicons,
  patchQuoteFavs,
  computeDividends,
  getJob,
  startScheduler,
  isMarketOpen,
  computeRatings,
};

// lastPoll is a getter over internal state so server.js can
// read it without direct access to the module's internal state.
Object.defineProperty(module.exports, 'lastPoll', {
  get() { return state.lastPoll; },
  enumerable: true,
});
