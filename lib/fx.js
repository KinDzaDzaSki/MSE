// NBRM daily FX middle rates (EUR/USD) via the National Bank's own JSON
// web-service — the same endpoint their Knockout page calls. No HTML parsing.
//
// Verified live 2026-09-16:
//   POST https://www.nbrm.mk/services/ExchangeRates.asmx/GetEXRates
//   {"startDate":"16.09.2026","endDate":"16.09.2026","isStateAuth":"false","excelFormat":false}
//   → { d: [{ Date: "2026-09-16T00:00:00+02:00",
//             ExchangeRates: [{ Oznaka: "EUR", Sreden: "61.495", Nomin: "1" }, ...] }] }
const NBRM_URL = 'https://www.nbrm.mk/services/ExchangeRates.asmx/GetEXRates';

const db = require('./db');
const log = require('./logger');

function ddmmyyyy(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Skopje calendar date as YYYY-MM-DD (cache key + tooltip source).
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Skopje', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Fetch the latest available rate list (7-day window = weekend/holiday safe).
async function fetchFX() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const res = await fetch(NBRM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'Mozilla/5.0 (compatible; MSEClone/1.0)',
    },
    body: JSON.stringify({
      startDate: ddmmyyyy(start),
      endDate: ddmmyyyy(end),
      isStateAuth: 'false',
      excelFormat: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`NBRM HTTP ${res.status}`);
  const json = await res.json();
  const lists = ((json && json.d) || []).filter(
    (l) => Array.isArray(l.ExchangeRates) && l.ExchangeRates.length
  );
  if (!lists.length) throw new Error('NBRM returned no rate lists');
  const latest = lists[lists.length - 1];
  const find = (code) => latest.ExchangeRates.find((r) => r.Oznaka === code);
  const eur = find('EUR');
  const usd = find('USD');
  if (!eur || !usd) throw new Error('EUR/USD missing from NBRM list');
  const rate = (r) => parseFloat(r.Sreden) / (parseFloat(r.Nomin) || 1);
  return {
    eur: +rate(eur).toFixed(4),
    usd: +rate(usd).toFixed(4),
    date: String(latest.Date || '').slice(0, 10), // ISO date of the list
  };
}

// Daily guard: refresh when the cached list is older than today AND the last
// attempt is older than 6h (avoids hammering on weekends when NBRM publishes
// nothing new). No hardcoded fallback — only real NBRM values are served;
// before the first successful fetch the chip shows dashes.
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

async function maybeRefreshFX() {
  try {
    const [listDate, checkedAt] = await Promise.all([
      db.getMeta('fx_date', null),
      db.getMeta('fx_checked_at', 0),
    ]);
    const checked = typeof checkedAt === 'number' ? checkedAt : 0;
    if (listDate === todayKey()) return; // today's list already cached
    if (Date.now() - checked < CHECK_INTERVAL) return; // tried recently
    await db.setMeta('fx_checked_at', Date.now());
    log.info('fetching NBRM FX rates...');
    const fx = await fetchFX();
    await db.setMeta('fx_eur', fx.eur);
    await db.setMeta('fx_usd', fx.usd);
    await db.setMeta('fx_date', fx.date || todayKey());
    log.info(`FX ready: EUR ${fx.eur} USD ${fx.usd} (${fx.date})`);
  } catch (e) {
    log.warn(`FX refresh failed (serving last cached): ${e.message}`);
  }
}

async function getFX() {
  const [eur, usd, date] = await Promise.all([
    db.getMeta('fx_eur', null),
    db.getMeta('fx_usd', null),
    db.getMeta('fx_date', null),
  ]);
  return { eur, usd, date };
}

module.exports = { fetchFX, maybeRefreshFX, getFX };
