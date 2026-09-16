const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const store = require('./lib/store');
const log = require('./lib/logger');
const { getFX } = require('./lib/fx');
const PKG = require('./package.json');

// Shared secret for expensive/admin endpoints (backfill, refresh, logs).
// Unset = open (local dev). Set ADMIN_TOKEN in production and pass it as
// ?token= or the x-admin-token header.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function isAdmin(url, req) {
  if (!ADMIN_TOKEN) return true;
  return url.searchParams.get('token') === ADMIN_TOKEN ||
    req.headers['x-admin-token'] === ADMIN_TOKEN;
}
function needAdmin(url, req, res) {
  if (isAdmin(url, req)) return true;
  sendJson(res, { error: 'forbidden' }, 403);
  return false;
}

const PORT = process.env.PORT || 8080;
log.info(`config PORT env="${process.env.PORT}" listening on=${PORT}`);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// ---- SEO / SSR helpers ----
const SITE_URL = (process.env.SITE_URL || 'https://mseberza.info').replace(/\/$/, '');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtN(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pctCls(v) { return v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''; }
function pctStr(v) { return v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + fmtN(v) + '%'; }

// Minimal crawlable MK shell shared by the SSR pages.
function pageShell({ title, description, canonical, h1, bodyHtml, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="mk" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
<link rel="stylesheet" href="/widget.css" />
<meta property="og:site_name" content="MSE Berza" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${SITE_URL}/favicon-192.png" />
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
  body { overflow: auto; }
  .seo-top { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; padding: 12px 20px; border-bottom: 1px solid var(--md-sys-color-outline); }
  .seo-top a { color: inherit; text-decoration: none; display: flex; gap: 8px; align-items: center; }
  .seo-wrap { max-width: 880px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  h1 { font-size: 26px; line-height: 1.25; }
  h2 { font-size: 15px; margin-top: 6px; color: var(--md-sys-color-on-surface); }
  p, li { font-size: 14px; line-height: 1.7; color: var(--md-sys-color-on-surface); }
  a { color: var(--md-sys-color-primary); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; }
  td.num, th.num { text-align: right; font-feature-settings: 'tnum' 1; }
  .up { color: var(--md-sys-color-positive); }
  .down { color: var(--md-sys-color-negative); }
  .cta { display: inline-block; margin-top: 4px; padding: 10px 16px; border-radius: 8px; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font-weight: 700; text-decoration: none; font-size: 13px; width: max-content; }
  footer { text-align: center; font-size: 11px; color: var(--md-sys-color-on-surface-variant); padding: 14px; }
  footer a { color: var(--md-sys-color-primary); text-decoration: none; }
</style>
</head>
<body>
<header class="seo-top"><a href="/"><img src="/logo.png" height="26" alt="MSE Berza — Македонска берза во живо" /></a></header>
<main class="seo-wrap">
<h1>${esc(h1)}</h1>
${bodyHtml}
</main>
<footer><a href="${SITE_URL}/">MSE Berza Info</a> · <a href="/za-nas">За нас</a> · <a href="/izvor-na-podatoci">Извор на податоци</a> · <a href="/metodologija">Методологија</a> · <a href="/widgets.html">Виџети за твој сајт</a> · Податоци: <a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> · Не е инвестициски совет. · v${esc(PKG.version)}</footer>
</body>
</html>`;
}

// First-paint rows for the dashboard (same markup the client re-renders).
function ssrQuoteRows(quotes, n) {
  const rows = quotes
    .filter((q) => q.primary !== false && q.liq === true)
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, n);
  return rows.map((r) => {
    let range = '—';
    const lo = r.week52Min, hi = r.week52Max, cur = r.lastPrice;
    if (lo != null && hi != null && cur != null) {
      const pct = hi === lo ? 50 : Math.max(0, Math.min(100, ((cur - lo) / (hi - lo)) * 100));
      range = `<div class="wk-range-bar"><div class="wk-range-fill" style="left:0;width:${pct}%;background:${cur >= lo ? 'var(--green)' : 'var(--red)'};opacity:0.25"></div><div class="wk-range-pointer" style="left:calc(${pct}% - 1.5px)"></div></div><div class="wk-range-labels"><span>${fmtN(lo, 0)}</span><span>${fmtN(hi, 0)}</span></div>`;
    }
    return `<tr data-sym="${esc(r.symbol)}"><td class="sym"><button type="button" class="star-btn" data-star="${esc(r.symbol)}" title="Додај во листата"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20">star</span></button><span class="sym-text">${esc(r.symbol)}</span></td><td class="comp">${esc(r.name || '')}</td><td class="spark"><canvas data-spark="${esc(r.symbol)}"></canvas></td><td class="num">${fmtN(r.lastPrice)}</td><td class="num ${pctCls(r.changePct)}">${pctStr(r.changePct)}</td><td class="num">${fmtN(r.volume, 0)}</td><td class="num ${pctCls(r.week52Chg)}">${pctStr(r.week52Chg)}</td><td class="wk-range">${range}</td></tr>`;
  }).join('\n');
}

function sendRaw(res, buf, contentType, req, status = 200, extraHeaders = {}) {
  const ae = (req && req.headers && req.headers['accept-encoding']) || '';
  if (buf.length > 1024 && /\bgzip\b/.test(ae)) {
    res.writeHead(status, { 'Content-Type': contentType, 'Content-Encoding': 'gzip', ...extraHeaders });
    return res.end(zlib.gzipSync(buf));
  }
  res.writeHead(status, { 'Content-Type': contentType, ...extraHeaders });
  return res.end(buf);
}

function sendJson(res, obj, status = 200, req = null, sMaxAge = 0) {
  // sMaxAge > 0 → cacheable at the CDN edge (Cloudflare) for that many
  // seconds, while the browser keeps revalidating. Public read APIs only.
  const headers = sMaxAge
    ? { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=300` }
    : {};
  sendRaw(res, Buffer.from(JSON.stringify(obj)), 'application/json; charset=utf-8', req, status, headers);
}

function sendFile(res, file, req = null) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(file);
    // CSS/JS: short cache so CDN picks up new versions quickly.
    // HTML: no-cache so the latest version (with cache-busting ?v=) always loads.
    const cacheHeaders = {};
    if (ext === '.css' || ext === '.js') {
      cacheHeaders['Cache-Control'] = 'public, max-age=300';
    } else if (ext === '.html') {
      cacheHeaders['Cache-Control'] = 'no-cache';
    }
    sendRaw(res, data, MIME[ext] || 'application/octet-stream', req, 200, cacheHeaders);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (url.pathname === '/api/symbols') {
    return sendJson(res, { symbols: store.getSymbols(), marketOpen: store.isMarketOpen() }, 200, req, 300);
  }

  if (url.pathname === '/api/quotes') {
    const quotes = await store.getQuotes();
    let arr = Object.values(quotes);
    // Restrict to actively-traded companies unless ?all=1 is requested.
    if (url.searchParams.get('all') !== '1') {
      const active = new Set(store.getSymbols());
      arr = arr.filter((q) => active.has(q.symbol));
    }
    arr.sort((a, b) => (b.value || 0) - (a.value || 0));
    return sendJson(res, { quotes: arr, marketOpen: store.isMarketOpen(), lastPoll: store.lastPoll }, 200, req, 60);
  }

  if (url.pathname === '/api/indices') {
    const all = await store.getIndices();
    return sendJson(res, { MBI10: all.MBI10 || null, OMB: all.OMB || null }, 200, req, 60);
  }

  const m = url.pathname.match(/^\/api\/history\/([^/]+)$/);
  if (m) {
    const sym = decodeURIComponent(m[1]);
    let rows = await store.getHistory(sym);
    const range = url.searchParams.get('range');
    if (range === '1M') rows = rows.slice(-22);
    else if (range === '3M') rows = rows.slice(-66);
    else if (range === '6M') rows = rows.slice(-132);
    else if (range === '1Y') rows = rows.slice(-252);
    return sendJson(res, { symbol: sym, rows }, 200, req, 60);
  }

  const q = url.pathname.match(/^\/api\/quote\/([^/]+)$/);
  if (q) {
    const sym = decodeURIComponent(q[1]);
    // Special case: indices (MBI10 / OMB) — served from the indices store.
    if (sym === 'MBI10' || sym === 'OMB') {
      const indices = await store.getIndices();
      const idx = indices[sym];
      if (idx) {
        // Absolute daily change from the index's own history (last vs previous
        // close) — the MSE index page only exposes the % change sometimes.
        let dailyChange = null;
        try {
          const rows = (await store.getHistory(sym)).filter((r) => r.last != null);
          if (rows.length >= 2) {
            dailyChange = +(rows[rows.length - 1].last - rows[rows.length - 2].last).toFixed(2);
          }
        } catch (e) { /* keep null — head falls back to 0 */ }
        return sendJson(res, {
          symbol: sym,
          name: sym === 'OMB' ? 'OMB Index' : 'MBI10 Index',
          lastPrice: idx.value,
          changePct: idx.changePct,
          dailyChange,
          avgPrice: null,
          minPrice: null,
          maxPrice: null,
          volume: null,
          value: null,
          trades: null,
          week52Max: null,
          week52Min: null,
        }, 200, req, 60);
      }
    }
    const quotes = await store.getQuotes();
    return sendJson(res, quotes[sym] || { symbol: sym, error: 'no data' }, 200, req, 60);
  }

  const bf = url.pathname.match(/^\/api\/backfill\/([^/]+)$/);
  if (bf) {
    if (!needAdmin(url, req, res)) return;
    const sym = decodeURIComponent(bf[1]);
    const days = parseInt(url.searchParams.get('days') || '365', 10);
    const rows = await store.backfillHistory(sym, days);
    return sendJson(res, { symbol: sym, count: rows.length });
  }

  const bfIdx = url.pathname.match(/^\/api\/backfill-index\/([^/]+)$/);
  if (bfIdx) {
    if (!needAdmin(url, req, res)) return;
    const code = decodeURIComponent(bfIdx[1]);
    const rows = await store.backfillIndexHistory(code);
    return sendJson(res, { code, count: rows.length });
  }

  const bfAll = url.pathname.match(/^\/api\/backfill-all$/);
  if (bfAll) {
    if (!needAdmin(url, req, res)) return;
    // Runs in the background (full scrape takes minutes — far beyond any
    // platform's request cap). Poll /api/job/{id} for progress.
    const job = store.startBackfillAllJob();
    return sendJson(res, { ok: true, job: job.id, total: job.total });
  }

  const jm = url.pathname.match(/^\/api\/job\/([^/]+)$/);
  if (jm) {
    if (!needAdmin(url, req, res)) return;
    const job = store.getJob(decodeURIComponent(jm[1]));
    if (!job) return sendJson(res, { error: 'unknown job' }, 404);
    return sendJson(res, job);
  }

  if (url.pathname === '/api/dividends') {
    const dividends = await store.computeDividends();
    return sendJson(res, { dividends, count: dividends.length }, 200, req, 300);
  }

  if (url.pathname === '/api/fx') {
    // NBRM daily middle rates (EUR/USD), refreshed once per day server-side.
    const fx = await getFX();
    return sendJson(res, fx, 200, req, 3600);
  }

  if (url.pathname === '/api/version') {
    return sendJson(res, { version: PKG.version }, 200, req, 3600);
  }

  const bfFin = url.pathname.match(/^\/api\/backfill-financials$/);
  if (bfFin) {
    if (!needAdmin(url, req, res)) return;
    // Warm-up job: scrapes financial tables for all symbols (24h TTL skips
    // fresh ones). Poll /api/job/{id} for progress.
    const job = store.startFinancialsBackfillJob();
    return sendJson(res, { ok: true, job: job.id, total: job.total });
  }

  if (url.pathname === '/api/history') {
    // Batch history: /api/history?symbols=ALK,ADIN,GRNT&range=1Y
    const syms = (url.searchParams.get('symbols') || '').split(',').filter(Boolean);
    const range = url.searchParams.get('range') || '1Y';
    const pairs = await Promise.all(syms.map(async (sym) => [sym, await store.getHistory(sym)]));
    const queries = {};
    for (const [sym, allRows] of pairs) {
      let rows = allRows;
      if (range === '1M') rows = rows.slice(-22);
      else if (range === '3M') rows = rows.slice(-66);
      else if (range === '6M') rows = rows.slice(-132);
      else if (range === '1Y') rows = rows.slice(-252);
      queries[sym] = rows;
    }
    return sendJson(res, { queries }, 200, req);
  }

  if (url.pathname === '/api/refresh') {
    if (!needAdmin(url, req, res)) return;
    // Fire-and-forget: a full poll takes ~60s+, beyond request caps.
    store.pollQuotes()
      .then(() => store.pollIndices())
      .catch((e) => log.error(`manual refresh error: ${e.message}`));
    return sendJson(res, { ok: true, started: true, lastPoll: store.lastPoll });
  }

  if (url.pathname === '/api/logs') {
    if (!needAdmin(url, req, res)) return;
    const n = Math.min(parseInt(url.searchParams.get('n') || '50', 10) || 50, 500);
    return sendJson(res, { lines: log.getRecent(n) });
  }

  if (url.pathname === '/api/ratings') {
    const ratings = await store.computeRatings();
    return sendJson(res, { ratings });
  }

  const fin = url.pathname.match(/^\/api\/financials\/([^/]+)$/);
  if (fin) {
    const sym = decodeURIComponent(fin[1]);
    const data = await store.getFinancials(sym);
    return sendJson(res, { symbol: sym, ...data });
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'unknown api' }));
}

// ---- SSR pages (crawlable, no JS required) ----
let HOME_HTML = null;
try {
  HOME_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
} catch (e) {
  log.error(`index.html read failed: ${e.message}`);
}

async function sendHome(req, res) {
  let html = HOME_HTML;
  if (html) {
    try {
      const quotes = Object.values(await store.getQuotes());
      const rows = ssrQuoteRows(quotes, 13);
      if (rows) html = html.replace('<tbody id="quotesBody"></tbody>', `<tbody id="quotesBody">\n${rows}\n</tbody>`);
    } catch (e) { /* serve the shell */ }
  }
  if (!html) return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), req);
  return sendRaw(res, Buffer.from(html), 'text/html; charset=utf-8', req, 200, { 'Cache-Control': 'no-cache' });
}

async function renderSymbolPage(sym) {
  const quotes = await store.getQuotes();
  let q = quotes[sym];
  if (!q && (sym === 'MBI10' || sym === 'OMB')) {
    const idx = (await store.getIndices())[sym];
    if (idx) q = { symbol: sym, name: (sym === 'OMB' ? 'OMB Index' : 'MBI10 Index'), lastPrice: idx.value, changePct: idx.changePct, segment: 'Индекс' };
  }
  if (!q || !q.symbol || q.error) return null;
  const rows = (await store.getHistory(sym)).filter((r) => r.last != null);
  const year = rows.slice(-252);
  const closes = year.map((r) => r.last);
  const first = closes.length ? closes[0] : null;
  const last = closes.length ? closes[closes.length - 1] : null;
  const yrHi = closes.length ? Math.max(...closes) : null;
  const yrLo = closes.length ? Math.min(...closes) : null;
  const yrChg = first ? +(((last - first) / first) * 100).toFixed(2) : null;
  const yrAvg = closes.length ? closes.reduce((a, b) => a + b, 0) / closes.length : null;
  const name = q.name || sym;

  const stat = (k, v, cls = '') => `<tr><th>${esc(k)}</th><td class="num ${cls}">${v}</td></tr>`;
  const bodyHtml = `
<p>${esc(name)} (${esc(sym)}) — последна цена <strong>${fmtN(q.lastPrice)} MKD</strong>,
промена <span class="${pctCls(q.changePct)}">${pctStr(q.changePct)}</span>.
Податоците се од Македонската берза (mse.mk), ажурирани на крај на трговска сесија.</p>
<h2>Клучни показатели</h2>
<table>
<tbody>
${stat('Последна цена', fmtN(q.lastPrice) + ' MKD')}
${stat('Дневна промена', pctStr(q.changePct), pctCls(q.changePct))}
${q.dailyChange != null ? stat('Промена (апс.)', (q.dailyChange >= 0 ? '+' : '') + fmtN(q.dailyChange) + ' MKD', pctCls(q.changePct)) : ''}
${q.week52Min != null ? stat('52-неделен опсег', fmtN(q.week52Min, 0) + ' – ' + fmtN(q.week52Max, 0)) : ''}
${q.week52Chg != null ? stat('52-неделна промена', pctStr(q.week52Chg), pctCls(q.week52Chg)) : ''}
${q.volume != null ? stat('Волумен', fmtN(q.volume, 0)) : ''}
${q.value != null ? stat('Промет', fmtN(q.value, 0) + ' MKD') : ''}
${q.trades != null ? stat('Трансакции', fmtN(q.trades, 0)) : ''}
${q.peRatio != null ? stat('P/E', fmtN(q.peRatio)) : ''}
${q.marketCap != null ? stat('Пазарна капитализација (000 MKD)', fmtN(q.marketCap, 0)) : ''}
${q.segment ? stat('Сегмент', esc(q.segment)) : ''}
${q.isin ? stat('ISIN', esc(q.isin)) : ''}
</tbody>
</table>
${closes.length > 1 ? `
<h2>Измината година (${esc(sym)})</h2>
<table>
<tbody>
${stat('Прво затворање', fmtN(first) + ' MKD')}
${stat('Последно затворање', fmtN(last) + ' MKD')}
${stat('Промена за периодот', pctStr(yrChg), pctCls(yrChg))}
${stat('Највисоко', fmtN(yrHi, 0) + ' MKD')}
${stat('Најниско', fmtN(yrLo, 0) + ' MKD')}
${stat('Просек', fmtN(yrAvg) + ' MKD')}
${stat('Број на сесии', fmtN(year.length, 0))}
</tbody>
</table>` : ''}
<a class="cta" href="/">Целосен график и дивиденди на MSE Berza →</a>
<p><a href="/">Сите котации</a> · <a href="/widgets.html">Виџети за твојот сајт</a> · <a href="/metodologija">Методологија</a></p>`;

  return pageShell({
    title: `${name} (${sym}) — цена, промена, 52 недели | MSE Berza`,
    description: `${name} (${sym}) на Македонската берза: последна цена ${fmtN(q.lastPrice)} MKD, промена ${pctStr(q.changePct)}, 52-неделен опсег, волумен и промет.`,
    canonical: `${SITE_URL}/s/${encodeURIComponent(sym)}`,
    h1: `${name} (${sym}) — цена и податоци од Македонската берза`,
    bodyHtml,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Corporation',
      name,
      tickerSymbol: sym,
      isin: q.isin || undefined,
      url: `${SITE_URL}/s/${encodeURIComponent(sym)}`,
    },
  });
}

const TRUST_PAGES = {
  '/za-nas': {
    title: 'За нас | MSE Berza',
    h1: 'За MSE Berza',
    description: 'MSE Berza — независен преглед на податоците од Македонската берза (mse.mk) со котации, графици и дивиденди.',
    body: [
      'MSE Berza е независна, некомерцијална алатка што ги прикажува јавно достапните податоци од Македонската берза (mse.mk) на едно место: котации на сите активни компании, историски движења, дивиденди и основни показатели.',
      'Целта е едноставна: податоците што берзата ги објавува на крајот на секоја трговска сесија да бидат читливи и лесни за споредба — без регистрација и без наплата.',
      'MSE Berza не е поврзана со Македонската берза, Комисијата за хартии од вредност или било кој брокер.',
    ],
  },
  '/izvor-na-podatoci': {
    title: 'Извор на податоци | MSE Berza',
    h1: 'Извор на податоци',
    description: 'Како MSE Berza ги собира податоците: јавните страници на mse.mk, еднаш дневно по затворање на сесијата.',
    body: [
      'Сите податоци се преземаат од јавно достапните страници на Македонската берза (mse.mk): листа на симболи, страници на издавачи, историски податоци и индексни вредности.',
      'Македонската берза објавува податоци еднаш дневно, по затворање на трговската сесија (работни денови 09:00–14:30). Затоа и MSE Berza се ажурира со истото темпо — ова не е берзански feed во реално време.',
      'Податоците се прикажуваат какви што се објавени, без корекции. За официјални и правно обврзувачки податоци, секогаш користете mse.mk.',
    ],
  },
  '/metodologija': {
    title: 'Методологија | MSE Berza',
    h1: 'Методологија',
    description: 'Како се пресметуваат ликвидните компании, дивидендниот принос и показателите прикажани на MSE Berza.',
    body: [
      '<strong>Ликвидни компании:</strong> компанија е означена како ликвидна ако тргувала најмалку 5 пати во последните 90 дена и има просечен дневен промет од најмалку 300.000 денари. Ова ги отстранува хартиите што технички се котираат, но практично не се тргуваат.',
      '<strong>Дивиденди:</strong> дивидендата по акција и дивидендниот принос се преземаат од табелите со финансиски показатели објавени од издавачот. Исплатата (payout) се пресметува како однос на дивиденда по акција и заработка по акција.',
      '<strong>Графици:</strong> линијата е обоена по дневен правец — зелено кога цената затворила над претходното затворање, црвено кога под него. Сивите столпчиња претставуваат волумен.',
      '<strong>Ограничувања:</strong> ова се едноставни, јавно достапни показатели. Не е финансиски совет, не е препорака за купување или продавање и не е замена за анализа на лиценциран брокер.',
    ],
  },
};

function renderTrustPage(pathname) {
  const p = TRUST_PAGES[pathname];
  if (!p) return null;
  return pageShell({
    title: p.title,
    description: p.description,
    canonical: `${SITE_URL}${pathname}`,
    h1: p.h1,
    bodyHtml: p.body.map((t) => `<p>${t}</p>`).join('\n'),
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Health check — respond immediately for platform probes
  if (url.pathname === '/health' || url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ready: !!store.lastPoll }));
  }
  if (url.pathname.startsWith('/api/')) {
    try {
      return await handleApi(req, res, url);
    } catch (e) {
      log.error(`api handler: ${e.message}`);
      return sendJson(res, { error: e.message }, 500);
    }
  }

  // ---- SEO / SSR routes ----
  if (url.pathname === '/sitemap.xml') {
    try {
      const quotes = Object.values(await store.getQuotes());
      const prim = quotes.filter((q) => q.primary !== false).map((q) => q.symbol).sort();
      const urls = ['/', '/widgets.html', '/za-nas', '/izvor-na-podatoci', '/metodologija', ...prim.map((s) => `/s/${s}`)];
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')
        + '\n</urlset>';
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' });
      return res.end(xml);
    } catch (e) {
      log.error(`sitemap: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('error');
    }
  }

  const sm = url.pathname.match(/^\/s\/([A-Za-z0-9]+)$/);
  if (sm) {
    try {
      const html = await renderSymbolPage(sm[1].toUpperCase());
      if (html) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=300' });
        return res.end(html);
      }
    } catch (e) {
      log.error(`/s/${sm[1]}: ${e.message}`);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — непознат симбол');
  }

  if (TRUST_PAGES[url.pathname]) {
    const html = renderTrustPage(url.pathname);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' });
    return res.end(html);
  }

  if (url.pathname === '/') {
    return sendHome(req, res);
  }

  // static files
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  sendFile(res, filePath, req);
});

// Graceful shutdown — close server + DB pool so in-flight writes finish
// before the platform kills the container.
function shutdown(signal) {
  log.info(`${signal} received — draining connections`);
  server.close(() => {
    log.info('HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s if server won't drain
  setTimeout(() => {
    log.warn('forced exit after drain timeout');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function main() {
  // Mark healthy immediately so platform health probes pass (critical for
  // Cloud Run / suga.app — they kill containers that don't show ready in time).
  store.markReady();
  // Start listening immediately — init runs async in the background.
  server.listen(PORT, '0.0.0.0', () => {
    log.info(`MSE Clone dashboard listening on 0.0.0.0:${PORT}`);
  });
  // Warm up in background — don't block server requests.
  store.init()
    .then(() => store.startScheduler({ pollIntervalMs: 60000 }))
    .catch((e) => log.error(`store init error (dashboard still serving health): ${e.message}`));
}

// Global crash handlers — don't let unhandled errors kill the process silently.
process.on('uncaughtException', (e) => log.error(`uncaughtException: ${e.message}`));
process.on('unhandledRejection', (e) => log.error(`unhandledRejection: ${e && e.message}`));

main().catch((e) => {
  log.error(`FATAL: ${e.message}`);
  process.exit(1);
});
