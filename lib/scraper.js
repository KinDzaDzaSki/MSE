const https = require('https');
const http = require('http');
const zlib = require('zlib');

const BASE = 'https://www.mse.mk';

function fetchText(url, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; MSEClone/1.0)',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      ...(options.headers || {}),
    };
    const reqOpts = { method: options.method || 'GET', headers, timeout: 20000 };
    const req = lib.request(url, reqOpts, (res) => {
      const encoding = res.headers['content-encoding'];
      const stream = (encoding === 'gzip' || encoding === 'deflate')
        ? res.pipe(zlib.createUnzip())
        : res;
      let data = '';
      stream.setEncoding('utf8');
      stream.on('data', (c) => (data += c));
      stream.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (maxRedirects <= 0) {
            return reject(new Error(`too many redirects for ${url}`));
          }
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchText(next, { ...options, maxRedirects: maxRedirects - 1 }));
        }
        resolve(data);
      });
      stream.on('error', (e) => reject(new Error(`stream error: ${e.message}`)));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (options.body) req.write(options.body);
    req.end();
  });
}

function postForm(url, form) {
  const body = Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return fetchText(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

// Build the full issuer symbol list: dropdown on history page (most symbols)
// plus the headline tickers shown on the homepage (some are missing from the dropdown).
async function fetchSymbolList() {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    s = (s || '').trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  const html = await fetchText(`${BASE}/en/stats/symbolhistory/ALK`);
  const re = /<option\s+value="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) add(m[1]);
  try {
    const home = await fetchText(`${BASE}/en`);
    for (const mm of home.matchAll(/\/en\/symbol\/([A-Z0-9]+)/g)) add(mm[1]);
  } catch (e) {}
  return out;
}

// Parse the results table on the symbolhistory page
function parseHistoryTable(html) {
  const rows = [];
  const tbodyIdx = html.indexOf('<tbody');
  if (tbodyIdx < 0) return rows;
  const endIdx = html.indexOf('</tbody>', tbodyIdx);
  const tbody = html.substring(tbodyIdx, endIdx < 0 ? undefined : endIdx);
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(tbody))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
    );
    if (cells.length < 9) continue;
    const num = (s) => {
      const n = parseFloat(String(s).replace(/,/g, ''));
      return isNaN(n) ? null : n;
    };
    rows.push({
      date: cells[0],
      last: num(cells[1]),
      max: num(cells[2]),
      min: num(cells[3]),
      avg: num(cells[4]),
      chg: num(cells[5]),
      volume: num(cells[6]),
      turnoverBest: num(cells[7]),
      turnoverTotal: num(cells[8]),
    });
  }
  return rows;
}

async function fetchHistory(symbol, fromDate, toDate) {
  const url = `${BASE}/en/stats/symbolhistory/${encodeURIComponent(symbol)}`;
  const html = await postForm(url, { FromDate: fromDate, ToDate: toDate });
  return parseHistoryTable(html);
}

// Parse a symbol overview page into a quote object.
// Price/volume data is rendered in `.col-md-5` (label) / `.col-md-7` (value) rows.
function parseSymbolPage(html, symbol) {
  const grab = (label) => {
    const re = new RegExp(
      `${label}\\s*:?\\s*<\\/div>\\s*<div class="col-md-7[^"]*">([\\s\\S]*?)<\\/div>`,
      'i'
    );
    const m = html.match(re);
    return m ? m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim() : null;
  };
  const num = (s) => {
    if (!s) return null;
    const n = parseFloat(String(s).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };
  const issuerName = (() => {
    const t = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (t) {
      const parts = t[1].split(' - ');
      if (parts.length > 1) return parts.slice(1).join(' - ').replace(/&#39;/g, "'").trim();
    }
    return symbol;
  })();
  const isin = (() => {
    const m = html.match(/ISIN:\s*<\/div>\s*<div class="col-md-7[^"]*">([A-Z0-9]+)/i) ||
      html.match(/ISIN:\s*([A-Z0-9]+)/i);
    return m ? m[1].trim() : null;
  })();

  const avgPrice = grab('Avg Price');
  const maxPrice = grab('Max Price');
  const minPrice = grab('Min Price');
  const volume = grab('Volume');
  const value = grab('Value');
  const trades = grab('Trades');
  const seg = grab('Market segment');
  const lastTrade = grab('Last trade');
  const lastPrice = lastTrade ? num(lastTrade) : null;

  // 52 week high/low appear in a second "Max Price:" / "Min Price:" block
  const wk = html.match(/Last 52 weeks[\s\S]*?Max Price:\s*<\/div>\s*<div class="col-md-7[^"]*">([\s\S]*?)<\/div>[\s\S]*?Min Price:\s*<\/div>\s*<div class="col-md-7[^"]*">([\s\S]*?)<\/div>/i);

  // P/E ratio — first value in the "Price to earnings" row
  const peMatch = html.match(/Price to earnings[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
  const peRatio = peMatch ? num(peMatch[1]) : null;

  // Market capitalization — first value (most recent year), in 000 MKD
  const mcapMatch = html.match(/Market capitalization[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
  const marketCap = mcapMatch ? num(mcapMatch[1]) : null;

  // Total shares
  const sharesMatch = grab('Total shares');
  const totalShares = sharesMatch ? num(sharesMatch) : null;

  return {
    symbol,
    name: issuerName,
    isin,
    segment: seg ? seg.replace(/Exchange Listing/i, '').trim() : null,
    lastTrade: lastTrade || null,
    lastPrice: lastPrice || num(avgPrice),
    avgPrice: num(avgPrice),
    maxPrice: num(maxPrice),
    minPrice: num(minPrice),
    volume: num(volume),
    value: num(value),
    trades: num(trades),
    week52Max: wk ? num(wk[1]) : null,
    week52Min: wk ? num(wk[2]) : null,
    peRatio,
    marketCap,
    totalShares,
  };
}

async function fetchQuote(symbol) {
  const html = await fetchText(`${BASE}/en/symbol/${encodeURIComponent(symbol)}`);
  return parseSymbolPage(html, symbol);
}

// Derive daily % change from two most-recent historical rows (fallback-safe).
function changeFromHistory(rows) {
  const valid = (rows || []).filter((r) => r.last != null);
  if (valid.length < 2) return null;
  const today = valid[valid.length - 1].last;
  const prev = valid[valid.length - 2].last;
  if (!prev) return null;
  return +(((today - prev) / prev) * 100).toFixed(2);
}

// MSE history dates are M/D/YYYY without zero-padding ("9/4/2026").
// Lexical comparison breaks across months/years ("9/9/2025" > "9/7/2026"
// as strings), so always parse before comparing or sorting.
function parseMDY(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim());
  if (!m) return null;
  const t = new Date(+m[3], +m[1] - 1, +m[2]).getTime();
  return isNaN(t) ? null : t;
}

// Chronological ascending sort. Rows with unparsable dates sink to the front
// (treated as oldest) instead of breaking the comparator.
function sortByDate(rows) {
  return (rows || []).slice().sort((a, b) => (parseMDY(a.date) ?? 0) - (parseMDY(b.date) ?? 0));
}

// 52-week % change: latest close vs the close ~252 trading days earlier
// (falls back to the oldest available row when history is shorter).
function week52ChangeFromHistory(rows) {
  const valid = (rows || []).filter((r) => r.last != null);
  if (valid.length < 2) return null;
  const TRADE_DAYS_52W = 252;
  const today = valid[valid.length - 1].last;
  const ref = valid.length > TRADE_DAYS_52W
    ? valid[valid.length - 1 - TRADE_DAYS_52W].last
    : valid[0].last;
  if (!ref) return null;
  return +(((today - ref) / ref) * 100).toFixed(2);
}

// Parse index values page (MBI10/OMB)
function parseIndex(html, code) {
  const num = (s) => {
    if (!s) return null;
    const n = parseFloat(String(s).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };
  let value = null;
  let pct = null;
  // Value row
  const valRe = /<td[^>]*>\s*Value\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
  const mv = html.match(valRe);
  if (mv) value = num(mv[1]);
  // Change % row
  const chgRe = /<td[^>]*>\s*Change %\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
  const mc = html.match(chgRe);
  if (mc) pct = num(mc[1]);
  // Fallback: header like "9,366.94 0.63%" (anchor text)
  if (value === null || pct === null) {
    const href = html.match(new RegExp(`${code}\\s*([\\d.,]+)\\s*([-\\d.,]+)\\s*%`, 'i'));
    if (href) {
      if (value === null) value = num(href[1]);
      if (pct === null) pct = num(href[2]);
    }
  }
  return { code, value, changePct: pct };
}

async function fetchIndex(code) {
  const html = await fetchText(`${BASE}/en/indicies/${code}/values`);
  return parseIndex(html, code);
}

// Fetch historical daily values for an index, one year at a time.
// MSE serves index history via a POST endpoint that returns an HTML table fragment.
async function fetchIndexHistory(code, year) {
  const url = `${BASE}/en/indicies/${encodeURIComponent(code)}/year/${year}`;
  const html = await fetchText(url, {
    method: 'POST',
    body: '',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const rows = [];
  const rowRe = /<tr>\s*<td[^>]*>([\d/]+)<\/td>\s*<td[^>]*>([\d.,]+)<\/td>\s*<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const val = parseFloat(String(m[2]).replace(/,/g, ''));
    if (!isNaN(val)) {
      rows.push({ date: m[1], last: val, max: val, min: val });
    }
  }
  return rows;
}

// An issuer is an actively-traded *company* (equity) when its segment is an
// ordinary/priority share line. Bonds, investment/pension funds, and other
// non-operating-company instruments are excluded.
const FUND_SYMBOLS = new Set(['VFPF','VFPP','OPFO']);
function isEquity(segment, name, symbol) {
  if (!segment) return false;
  if (/bond/i.test(segment)) return false;
  if (!/share/i.test(segment)) return false;
  if (FUND_SYMBOLS.has(symbol)) return false;
  // Also filter by name patterns for pension/fund keywords
  const n = (name || '').toLowerCase();
  if (/penziono|penzisko|fond\b|investment fund/i.test(n)) return false;
  return true;
}

// Parse the two financial tables from the issuer page HTML.
// Returns { financialData: { years: [...], rows: [[label, val, val, ...], ...] } | null,
//           financialRatios: { years: [...], rows: [...] } | null }
function parseFinancialTables(html) {
  const out = { financialData: null, financialRatios: null };
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = tableRe.exec(html))) {
    const tbody = m[1];
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rm;
    while ((rm = rowRe.exec(tbody))) {
      const cells = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cm;
      while ((cm = cellRe.exec(rm[1]))) {
        cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length < 2) continue;
    // Check for year header
    const h0 = (rows[0][0] || '').toLowerCase();
    if (h0 !== 'year' && h0 !== 'година') continue;
    const years = rows[0].slice(1);
    const dataRows = rows.slice(1);
    // Distinguish financial data table (starts with revenue/profit) from ratios
    const firstLabel = dataRows[0][0].toLowerCase();
    if (firstLabel.includes('total revenue') || firstLabel.includes('operating profit') || firstLabel.includes('net profit') || firstLabel.includes('equity')) {
      out.financialData = { years, rows: dataRows };
    } else if (firstLabel.includes('return on sales') || firstLabel.includes('eps') || firstLabel.includes('earnings per share')) {
      out.financialRatios = { years, rows: dataRows };
    }
  }
  return out;
}

// Fetch issuer page for a symbol and parse financial tables.
async function fetchFinancialData(symbol) {
  const html = await fetchText(`${BASE}/en/symbol/${encodeURIComponent(symbol)}`);
  return parseFinancialTables(html);
}

// ---- Official homepage "top movers" panels ----
// The MSE homepage carries two panels we mirror on the dashboard:
//   myTab3  → Добитници (id=tableWinners) / Губитници (id=tableLosers)
//   myTab   → Најтргувани (id=topSymbolValueTopSymbols)
// Each row is [symbol link, price, % change, (+ Промет во БЕСТ for most-traded)].
// An empty panel renders no <table> at all ("Нема добитници").
// Numbers use MK formatting: "22.653,66" (thousand dot, decimal comma),
// "−1,09" (unicode minus) — all handled by numMK.
// Parse an MSE figure in MK homepage format — unambiguous there:
// dots are thousand separators, the comma is always the decimal point
// ("22.653,66", "10.214.474", "-1,09", "129.480"). Handles unicode minus.
function numMK(s) {
  if (s == null) return null;
  let str = String(s).trim()
    .replace(/[−–]/g, '-')     // unicode/wide minus
    .replace(/\./g, '')        // thousand separators
    .replace(/,/g, '.')        // decimal comma
    .replace(/[^0-9.\-]/g, ''); // strip % and anything else
  if (!str || str === '-' || str === '.') return null;
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseMoverTable(html, startAnchor, endAnchor) {
  const start = html.indexOf(`id="${startAnchor}"`);
  if (start < 0) return [];
  const endIdx = endAnchor ? html.indexOf(`id="${endAnchor}"`, start) : -1;
  const region = html.substring(start, endIdx < 0 ? undefined : endIdx);
  const table = region.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!table) return []; // empty panel (e.g. "Нема добитници") → no table
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm;
  while ((rm = rowRe.exec(table[1]))) {
    const symMatch = /\/en\/symbol\/([A-Z0-9]+)/i.exec(rm[1]) || /\/mk\/symbol\/([A-Z0-9]+)/i.exec(rm[1]);
    if (!symMatch) continue; // header / "no data" row
    const cells = [...rm[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map((c) => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim());
    rows.push({
      symbol: symMatch[1],
      avgPrice: numMK(cells[1]),
      changePct: numMK(cells[2]),
      value: cells[3] != null ? numMK(cells[3]) : null,
    });
  }
  return rows;
}

async function fetchMovers() {
  // MK homepage: number format is unambiguous (dot = thousands, comma = decimal)
  // and the panels are identical to what the dashboard mirrors. Fail-open to
  // empty panels if the anchors ever move.
  const html = await fetchText(`${BASE}/mk`);
  // Panel date, e.g. "21.9.2026" (shown next to the panels on MSE).
  const dateMatch = html.match(/top-winners-date">\s*<strong>\s*([\d.]{6,10})\s*<\/strong>/i);
  return {
    asOf: dateMatch ? dateMatch[1] : null,
    winners: parseMoverTable(html, 'tableWinners', 'tableLosersDisplay'),
    losers: parseMoverTable(html, 'tableLosers', 'tableValueDisplay'),
    mostTraded: parseMoverTable(html, 'topSymbolValueTopSymbols', 'marketdata'),
  };
}

module.exports = {
  BASE,
  fetchText,
  parseMDY,
  sortByDate,
  fetchSymbolList,
  fetchHistory,
  fetchQuote,
  fetchIndex,
  fetchIndexHistory,
  changeFromHistory,
  week52ChangeFromHistory,
  isEquity,
  parseFinancialTables,
  fetchFinancialData,
  fetchMovers,
  numMK,
};
