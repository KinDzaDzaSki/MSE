const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const store = require('./lib/store');
const db = require('./lib/db');
const log = require('./lib/logger');
const { getFX, getFXList } = require('./lib/fx');
const { marketInfo } = require('./lib/market');
const CoLogo = require('./public/logo.js');
const FinView = require('./public/finview.js');
FinView.setLang('mk'); // SSR pages are MK-only, like the rest of the site
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
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
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
// Shared topbar markup — identical to index.html / widgets.html so the header
// is consistent on every page. Chips are filled by widget.js (W.initTopbar).
const TOPBAR_HTML = `<header class="topbar">
  <a class="brand" href="/">
    <div class="brand-icon">
      <span class="material-symbols-outlined icon-fill">monitoring</span>
    </div>
    <div class="brand-text">
      <span class="brand-name">MSE Berza</span>
      <span class="brand-sub">Македонска берза во живо</span>
    </div>
  </a>
  <div class="topbar-right">
    <a class="topbar-link" href="/prasanja">Прашања</a>
    <span class="market-status" id="marketStatus">—</span>
    <span id="mbiChip">MBI10</span>
    <span id="fxChip" title="">€ — · <span class="fx-usd">$ —</span></span>
    <button class="icon-btn" id="themeToggle" title="Toggle theme / Промени тема">
      <span class="material-symbols-outlined" id="themeIcon">dark_mode</span>
    </button>
    <button class="icon-btn" id="langToggle" title="Switch language / Промени јазик">
      <span class="material-symbols-outlined" id="langIcon">translate</span>
    </button>
  </div>
</header>`;

// `h1Html` lets a caller pass pre-built markup (e.g. the company logo before
// the title); when absent `h1` is escaped as plain text.
function pageShell({ title, description, canonical, h1, h1Html, bodyHtml, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="mk" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
<!-- Preconnect for font loading -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<!-- Inter font for UI — same links as the homepage so every page renders the
     topbar and footer in Inter, not the system fallback. -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<!-- Material Symbols variable font (display=block: icon ligature text is hidden
     until the font loads, so late font loading can never reflow the layout) -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
<link rel="stylesheet" href="/styles.css?v=7.9" />
<meta property="og:site_name" content="MSE Berza" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${SITE_URL}/favicon-192.png" />
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
  body { overflow: auto; }
  .seo-wrap { max-width: 880px; width: 100%; margin: 0 auto; padding: 24px 20px 40px; display: flex; flex-direction: column; gap: 14px; flex: 1 1 auto; }
  /* Unprefixed (specificity 0,0,1) on purpose: page-specific class rules
     (e.g. .faq-sec-title, .faq-a p) must be able to override these. */
  h1 { font-size: 28px; line-height: 1.25; }
  h2 { font-size: 16px; margin-top: 6px; color: var(--md-sys-color-on-surface); }
  p, li { font-size: 15px; line-height: 1.75; color: var(--md-sys-color-on-surface); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; }
  td.num, th.num { text-align: right; font-feature-settings: 'tnum' 1; }
  .up { color: var(--md-sys-color-positive); }
  .down { color: var(--md-sys-color-negative); }
  /* Company logo inside the /s/{SYM} SSR heading. */
  .h1-logo { display: inline-flex; vertical-align: -4px; margin-right: 10px; }
  .cta { display: inline-block; margin-top: 4px; padding: 10px 16px; border-radius: 8px; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font-weight: 700; text-decoration: none; font-size: 13px; width: max-content; }
  /* :hover needs stating explicitly: the global a:hover (styles.css) beats
     .cta on specificity and would recolor the button text link-blue — nearly
     identical to the primary bg in both themes, i.e. unreadable. */
  .cta:hover { color: var(--md-sys-color-on-primary); text-decoration: none; }
</style>
</head>
<body>
${TOPBAR_HTML}
<main class="seo-wrap">
<h1>${h1Html || esc(h1)}</h1>
${bodyHtml}
</main>
<footer class="foot"><span class="material-symbols-outlined" style="font-size:14px;margin-right:6px;opacity:0.6">database</span>Податоци преземени од <a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> — бесплатни јавни податоци — за едукативна намена. · <a href="/prasanja">Прашања</a> · <a href="/za-nas">За нас</a> · <a href="/izvor-na-podatoci">Извор на податоци</a> · <a href="/metodologija">Методологија</a> · <a href="/widgets.html">Виџети</a> · <a href="/sitemap">Мапа на сајтот</a> · v${esc(PKG.version)}<button type="button" class="foot-lang" id="langToggleFoot" title="Switch language / Промени јазик" aria-label="Промени јазик / Switch language"><span class="material-symbols-outlined">translate</span></button></footer>
<script src="/widget.js?v=11"></script>
<script>if (window.W && W.initTopbar) W.initTopbar();</script>
<!-- Vercel Web Analytics -->
<script defer src="/_vercel/insights/script.js"></script>
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
    return `<tr data-sym="${esc(r.symbol)}"><td class="sym"><div class="sym-inner"><button type="button" class="star-btn" data-star="${esc(r.symbol)}" title="Додај во листата"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20">star</span></button>${CoLogo.icon(r.symbol, r.name, r.site, 22, r.fav, r.favv)}<span class="sym-text">${esc(r.symbol)}</span></div></td><td class="comp">${esc(r.name || '')}</td><td class="spark"><canvas data-spark="${esc(r.symbol)}"></canvas></td><td class="num">${fmtN(r.lastPrice)}</td><td class="num ${pctCls(r.changePct)}"><span class="chg-pill">${pctStr(r.changePct)}</span></td><td class="num">${fmtN(r.volume, 0)}</td><td class="num ${pctCls(r.week52Chg)}"><span class="chg-pill">${pctStr(r.week52Chg)}</span></td><td class="wk-range">${range}</td></tr>`;
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

// An empty payload means "not ready / no data yet", never "cache this".
// Without this, a request that races the DB init (cold start on serverless)
// returns an empty list that a CDN then pins at the edge for the whole TTL.
function isEmptyPayload(obj) {
  if (obj == null) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj !== 'object') return false;
  if ('eur' in obj || 'usd' in obj) return obj.eur == null && obj.usd == null;
  for (const key of ['quotes', 'symbols', 'dividends', 'list', 'rows']) {
    if (Array.isArray(obj[key])) return obj[key].length === 0;
  }
  return false;
}

function sendJson(res, obj, status = 200, req = null, sMaxAge = 0, maxAge = 0) {
  // sMaxAge > 0 → cacheable at the CDN edge for that many seconds, while the
  // browser keeps revalidating. Public read APIs only — and only when the
  // payload actually has data (see isEmptyPayload). maxAge adds browser cache.
  const empty = isEmptyPayload(obj);
  const cacheable = sMaxAge > 0 && !empty && status < 400;
  const parts = [];
  if (cacheable) {
    if (maxAge > 0) parts.push(`max-age=${maxAge}`);
    parts.push(`s-maxage=${sMaxAge}`, 'stale-while-revalidate=300');
  }
  const headers = cacheable
    ? { 'Cache-Control': 'public, ' + parts.join(', ') }
    : (sMaxAge > 0 || status >= 400 || empty ? { 'Cache-Control': 'no-store' } : {});
  sendRaw(res, Buffer.from(JSON.stringify(obj)), 'application/json; charset=utf-8', req, status, headers);
}

// Read + parse a small JSON request body (POST endpoints).
function readJsonBody(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
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
    if (path.basename(file) === 'sw.js') {
      // Service worker: must revalidate every load or updates never propagate.
      cacheHeaders['Cache-Control'] = 'no-cache';
    } else if (ext === '.css' || ext === '.js') {
      // Versioned via ?v= in the HTML — safe to cache immutably for a year.
      // (Always bump the ?v= query when changing an asset.)
      cacheHeaders['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (ext === '.html') {
      cacheHeaders['Cache-Control'] = 'no-cache';
    } else if (ext === '.webmanifest') {
      cacheHeaders['Cache-Control'] = 'public, max-age=3600';
    }
    sendRaw(res, data, MIME[ext] || 'application/octet-stream', req, 200, cacheHeaders);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (url.pathname === '/api/symbols') {
    // schedulerInfo carries the client refresh contract: pollIntervalMs (tick
    // cadence) and pollActive (data may still change today — session + EOD
    // capture window). Widgets use it to align their refresh with the server.
    const info = store.schedulerInfo();
    return sendJson(res, { symbols: store.getSymbols(), marketOpen: store.isMarketOpen(), pollActive: info.pollActive, pollIntervalMs: info.pollIntervalMs }, 200, req, 300);
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
    return sendJson(res, { quotes: arr, marketOpen: store.isMarketOpen(), pollActive: store.schedulerInfo().pollActive, lastPoll: store.lastPoll }, 200, req, 60);
  }

  if (url.pathname === '/api/sparks') {
    // Full-resolution sparkline series for every active symbol, in one cached
    // response. MSE history is end-of-day only, so this is stable within a
    // session — the client (and the CDN edge) can hold on to it, and the page
    // preloads it in <head> so it is usually already in flight before app.js
    // runs. Shape: { asOf, series: { SYM: [closes...] } } — no dates, because a
    // sparkline only needs the shape.
    const sparks = store.getSparks();
    const series = {};
    for (const sym of store.getSymbols()) {
      const s = sparks.series[sym];
      if (s && s.length > 1) series[sym] = s;
    }
    return sendJson(res, { asOf: sparks.asOf, series }, 200, req, 1800, 300);
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

  if (url.pathname === '/api/push/key') {
    // VAPID public key for the client to subscribe. `enabled` is only true when
    // the server can actually send (web-push installed + both VAPID keys set) —
    // the client hides the bell otherwise. null key → not configured.
    // Short edge TTL so a just-configured key is not served stale.
    return sendJson(res, { key: process.env.VAPID_PUBLIC_KEY || null, enabled: !!store.pushEnabled }, 200, req, 60);
  }

  if (url.pathname === '/api/push/status') {
    // Diagnostics (no PII): is push configured, and how many subscriptions exist?
    let subscriptions = 0;
    try { subscriptions = await store.countPushSubscriptions(); } catch (e) { /* ignore */ }
    return sendJson(res, { enabled: !!store.pushEnabled, subscriptions }, 200, req, 0);
  }

  if (url.pathname === '/api/cron/movers') {
    // Daily job (Vercel Cron, see vercel.json): refresh the official movers and
    // send the day's notification. When CRON_SECRET is set, Vercel sends it as
    // `Authorization: Bearer <secret>` — reject anything else.
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
      return sendJson(res, { error: 'forbidden' }, 403);
    }
    try {
      await store.moversTick();
      return sendJson(res, { ok: true, enabled: !!store.pushEnabled, subscriptions: await store.countPushSubscriptions() }, 200, req, 0);
    } catch (e) {
      return sendJson(res, { error: e.message }, 500);
    }
  }

  if (url.pathname === '/api/push/subscribe' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const sub = body && body.subscription;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        return sendJson(res, { error: 'invalid subscription' }, 400);
      }
      const saved = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        lang: body.lang === 'en' ? 'en' : 'mk',
        watchlist: Array.isArray(body.watchlist)
          ? body.watchlist.filter((s) => typeof s === 'string' && /^[A-Z0-9]+$/.test(s)).slice(0, 100)
          : [],
      };
      await store.savePushSubscription(saved);
      log.info(`push subscribe (${saved.lang}, ${saved.watchlist.length} watchlist) ok=${!!store.pushEnabled}`);
      // Immediate confirmation so the user sees the pipeline works right away
      // (the real daily notification only fires after the session close).
      store.sendTestPush({ endpoint: saved.endpoint, keys: saved.keys }, saved.lang).catch(() => {});
      return sendJson(res, { ok: true, confirmed: true }, 200);
    } catch (e) {
      return sendJson(res, { error: e.message }, 400);
    }
  }

  if (url.pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (body && typeof body.endpoint === 'string') await store.removePushSubscription(body.endpoint);
      return sendJson(res, { ok: true }, 200);
    } catch (e) {
      return sendJson(res, { error: e.message }, 400);
    }
  }

  if (url.pathname === '/api/movers') {
    // Official MSE homepage movers panels (Добитници/Губитници/Најтргувани),
    // scraped by the scheduler. null (no-store) when nothing is stored yet —
    // clients then keep their own computed fallback instead of showing empty
    // cards (a real panel may legitimately be empty, e.g. "Нема добитници").
    const movers = await store.getMovers();
    return sendJson(res, movers, 200, req, movers ? 60 : 0);
  }

  if (url.pathname === '/api/fx') {
    // NBRM daily middle rates (EUR/USD), refreshed once per day server-side.
    const fx = await getFX();
    return sendJson(res, fx, 200, req, 3600);
  }

  if (url.pathname === '/api/fx/list') {
    // Full cached NBRM list (middle rates) — same daily fetch, no extra scrape.
    const data = await getFXList();
    return sendJson(res, data, 200, req, 3600);
  }

  if (url.pathname === '/api/market') {
    // Trading session state + hours + next non-trading day (for the popover).
    return sendJson(res, marketInfo(), 200, req, 300);
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

  if (url.pathname === '/api/backfill-companies') {
    if (!needAdmin(url, req, res)) return;
    // Scrapes each issuer's official website from the MSE symbol page
    // (monthly TTL; ?force=1 re-checks everything). Poll /api/job/{id}.
    const force = url.searchParams.get('force') === '1';
    const job = store.startCompaniesBackfillJob({ force });
    return sendJson(res, { ok: true, job: job.id, total: job.total, force });
  }

  if (url.pathname === '/api/backfill-favicons') {
    if (!needAdmin(url, req, res)) return;
    // Crawls each official site for its real favicon and stores the bytes
    // (self-hosted; ?force=1 re-crawls everything). Poll /api/job/{id}.
    const force = url.searchParams.get('force') === '1';
    const job = await store.startFaviconBackfillJob({ force });
    return sendJson(res, { ok: true, job: job.id, total: job.total, force });
  }

  if (url.pathname === '/api/admin/push-test') {
    // Admin broadcast to every active push subscriber.
    //   (default)        → a "test" notification
    //   ?type=movers      → the current day's movers recap (bypasses the daily dedupe)
    // GET or POST; admin only (?token= or x-admin-token when ADMIN_TOKEN set).
    if (!needAdmin(url, req, res)) return;
    try {
      const result = url.searchParams.get('type') === 'movers'
        ? await store.broadcastMovers()
        : await store.broadcastPush();
      return sendJson(res, { ok: !result.error, ...result }, 200);
    } catch (e) {
      return sendJson(res, { error: e.message }, 500);
    }
  }

  const favRoute = url.pathname.match(/^\/api\/favicon\/([A-Za-z0-9]+)$/);
  if (favRoute) {
    // Self-hosted favicon bytes (PNG/ICO/SVG etc.) stored by the backfill job.
    // Favicons rarely change — long cache; a 404 (no favicon) is not cached so
    // the client's monogram fallback kicks in on the next visit too.
    const fav = await db.getFavicon(decodeURIComponent(favRoute[1]).toUpperCase());
    if (fav && fav.data && fav.data.length) {
      // 30 days: the client URL is version-busted with ?v={favv} (fetched_at),
      // so a re-crawl naturally produces a fresh URL — long max-age is free.
      const headers = { 'Content-Type': fav.type, 'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable' };
      sendRaw(res, Buffer.isBuffer(fav.data) ? fav.data : Buffer.from(fav.data), fav.type, req, 200, headers);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (url.pathname === '/api/companies') {
    // symbol -> { website } map used by the client to render favicon logos.
    const map = await store.getCompanies();
    return sendJson(res, { companies: map, count: Object.keys(map).length }, 200, req, 3600);
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

// ---- FAQ (parsed from the human-written markdown at boot) ----
// Format: "## Section" headings, "**Question?**" lines, following paragraphs
// are the answer. A paragraph is one or more consecutive non-empty lines —
// markdown soft-wraps long text across lines, so joined lines flow as a single
// paragraph instead of one <p> per line (which broke sentences mid-word).
let FAQ_SECTIONS = [];
try {
  const md = fs.readFileSync(path.join(__dirname, 'berza-akcii-prasanja-odgovori.md'), 'utf8');
  let section = null;
  let question = null;
  let paragraphs = [];
  let para = [];
  const flushPara = () => {
    if (question && para.length) paragraphs.push(para.join(' ').trim());
    para = [];
  };
  const flushAnswer = () => {
    flushPara();
    if (question && section && paragraphs.length) {
      section.items.push({ q: question, a: paragraphs.join('\n\n') });
    }
    question = null;
    paragraphs = [];
  };
  const flushSection = () => {
    flushAnswer();
    if (section && section.items.length) FAQ_SECTIONS.push(section);
    section = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushPara(); continue; } // blank line ends the paragraph
    if (line.startsWith('## ')) {
      flushSection();
      section = { title: line.slice(3).trim(), items: [] };
    } else if (line.startsWith('**') && line.endsWith('**')) {
      flushAnswer();
      question = line.slice(2, -2).trim();
    } else if (question) {
      para.push(line);
    }
  }
  flushSection();
  const total = FAQ_SECTIONS.reduce((n, s) => n + s.items.length, 0);
  log.info(`FAQ loaded: ${FAQ_SECTIONS.length} sections, ${total} questions`);
} catch (e) {
  log.error(`FAQ markdown read failed: ${e.message}`);
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
  const name = q.name || sym;
  // Index pages get the chart alone (no stat grids / data / analysis tabs),
  // mirroring the dashboard company modal.
  const isIndex = sym === 'MBI10' || sym === 'OMB' ||
    /индекс|index/i.test(q.segment || '') || /index/i.test(q.name || '');
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const fullHistory = ((await store.getHistory(sym)) || []).filter((r) => r.last != null).sort(byDate);
  let fin = null;
  try { fin = await store.getFinancials(sym); } catch (e) { log.error(`/s/${sym} financials: ${e.message}`); }
  if (!fin) fin = { financialData: null, financialRatios: null };
  let mbi10Rows = [];
  if (!isIndex) {
    try { mbi10Rows = ((await store.getHistory('MBI10')) || []).filter((r) => r.last != null).sort(byDate); }
    catch (e) { /* risk metrics simply stay out of the analysis */ }
  }
  const allQuotes = Object.values(quotes);
  const hasFinData = !!(fin.financialData && fin.financialData.rows && fin.financialData.rows.length);
  const hasRatios = !!(fin.financialRatios && fin.financialRatios.rows && fin.financialRatios.rows.length);

  // Chart header, pre-rendered for the default 1Y range (the inline script
  // refreshes these when the range changes) — same math as the modal.
  const tsOf = (d) => new Date(d).getTime();
  const y1 = fullHistory.slice(-252);
  const y1first = y1.length ? y1[0].last : null;
  const y1last = y1.length ? y1[y1.length - 1].last : null;
  const y1chg = (y1first && y1last) ? ((y1last - y1first) / y1first) * 100 : null;
  const asOf = fullHistory.length
    ? `${FinView.T('as_of')} ${FinView.fmtDate(tsOf(fullHistory[fullHistory.length - 1].date))} · ${FinView.T('eod_note')}` : '';
  const logoHtml = `<span class="h1-logo">${CoLogo.icon(sym, name, q.site, 30, q.fav, q.favv)}</span>`;
  const rangeBtn = (r) => `<button type="button" data-r="${r}"${r === '1Y' ? ' class="active"' : ''}>${FinView.T('range_' + r.toLowerCase())}</button>`;
  const finTab = (tab, label, hidden) => `<button type="button" class="fin-tab${tab === 'chart' ? ' active' : ''}${hidden ? ' hidden' : ''}" data-tab="${tab}">${label}</button>`;
  const emptyNote = (key) => `<div class="muted" style="padding:20px;text-align:center">${FinView.T(key)}</div>`;

  const chartPanel = fullHistory.length > 1 ? `
<div id="finTabChart" class="fin-tab-panel">
  <div class="chart-head">
    <div class="chart-price" id="chartPrice">${y1last != null ? fmtN(y1last) + ' MKD' : '—'}</div>
    <div class="chart-chg ${y1chg == null ? '' : y1chg >= 0 ? 'up' : 'down'}" id="chartChg">${y1chg == null ? '—' : `${y1chg >= 0 ? '+' : ''}${y1chg.toFixed(2)}%`}</div>
    <div class="chart-period" id="chartPeriod">${y1.length ? `${FinView.T('period_1y')} · ${FinView.fmtDate(tsOf(y1[0].date))} – ${FinView.fmtDate(tsOf(y1[y1.length - 1].date))}` : ''}</div>
  </div>
  <div class="range-btns" id="rangeBtns">${rangeBtn('1M')}${rangeBtn('3M')}${rangeBtn('6M')}${rangeBtn('1Y')}${rangeBtn('ALL')}</div>
  <div class="chart-box" id="companyChart"></div>
  <div class="chart-legend-note" id="chartLegend">${FinView.T('chart_legend')}</div>
</div>` : `
<div id="finTabChart" class="fin-tab-panel">
  <div class="muted" style="padding:20px;text-align:center">Нема доволно податоци за график.</div>
</div>`;

  const analysisHtml = isIndex
    ? ''
    : FinView.buildAnalysisHTML(FinView.buildAnalysisData(q, fullHistory, fin, mbi10Rows, allQuotes));

  const bodyHtml = `
<p>${esc(name)} (${esc(sym)}) — последна цена <strong>${fmtN(q.lastPrice)} MKD</strong>,
промена <span class="${pctCls(q.changePct)}">${pctStr(q.changePct)}</span>.
Податоците се од Македонската берза (mse.mk), ажурирани на крај на трговска сесија.</p>
${FinView.companyHead(sym, q, logoHtml, asOf)}
${isIndex ? '' : FinView.statGrids(q)}
${isIndex ? chartPanel : `
<div id="finTabBar" class="fin-tab-bar">
  ${finTab('chart', FinView.T('tab_chart'))}
  ${finTab('data', FinView.T('tab_fin_data'), !hasFinData)}
  ${finTab('ratios', FinView.T('tab_ratios'), !hasRatios)}
  ${finTab('analysis', FinView.T('tab_analysis'))}
</div>
${chartPanel}
<div id="finTabData" class="fin-tab-panel hidden">
  <h2>Финансиски податоци</h2>
  ${hasFinData ? FinView.buildFinTable(fin.financialData, false) : emptyNote('fin_no_data')}
</div>
<div id="finTabRatios" class="fin-tab-panel hidden">
  <h2>Финансиски показатели</h2>
  ${hasRatios ? FinView.buildDividendSummary(fin) + FinView.buildFinTable(fin.financialRatios, true) : emptyNote('fin_no_ratios')}
</div>
<div id="finTabAnalysis" class="fin-tab-panel hidden">
  <h2>Анализа</h2>
  ${analysisHtml}
</div>`}
<script>
(function () {
  var sym = ${JSON.stringify(sym)};
  var bar = document.getElementById('finTabBar');
  var order = ['chart', 'data', 'ratios', 'analysis'];
  var panels = { chart: 'finTabChart', data: 'finTabData', ratios: 'finTabRatios', analysis: 'finTabAnalysis' };
  function activate(name) {
    if (bar) {
      var btns = bar.querySelectorAll('.fin-tab');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === name);
    }
    for (var j = 0; j < order.length; j++) {
      var p = document.getElementById(panels[order[j]]);
      if (p) p.classList.toggle('hidden', order[j] !== name);
    }
    if (name === 'chart') draw(cur);
  }
  if (bar) bar.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.fin-tab') : null;
    if (b && !b.classList.contains('hidden')) activate(b.getAttribute('data-tab'));
  });
  var box = document.getElementById('companyChart');
  var rangeBtns = document.getElementById('rangeBtns');
  var chart = null, cur = '1Y', lwcP = null;
  var MONTHS = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
  var RANGE_L = { '1M': 'изминат месец', '3M': 'изминати 3 месеци', '6M': 'изминати 6 месеци', '1Y': 'измината година', 'ALL': 'сето време' };
  var RANGE_S = { '1M': '1М', '3M': '3М', '6M': '6М', '1Y': '1Г', 'ALL': 'Сите' };
  function fmt2(v) { return v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtD(ts) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Skopje', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(ts));
      var g = function (t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value; return ''; };
      return g('day') + ' ' + MONTHS[Number(g('month')) - 1] + ' ' + g('year');
    } catch (e) { return ''; }
  }
  function setHead(rows, range) {
    var last = rows.length ? rows[rows.length - 1].last : null;
    var first = rows.length ? rows[0].last : null;
    var chg = (last != null && first) ? ((last - first) / first) * 100 : null;
    var el = document.getElementById('chartPrice');
    if (el) el.textContent = last != null ? fmt2(last) + ' MKD' : '—';
    el = document.getElementById('chartChg');
    if (el) {
      el.textContent = chg == null ? '—' : (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
      el.className = 'chart-chg ' + (chg == null ? '' : chg >= 0 ? 'up' : 'down');
    }
    var avg = rows.length ? rows.reduce(function (s, r) { return s + r.last; }, 0) / rows.length : null;
    el = document.getElementById('avgPriceVal');
    if (el) el.textContent = avg != null ? fmt2(avg) : '—';
    el = document.getElementById('avgPriceLabel');
    if (el) el.textContent = 'Просечна цена · ' + (RANGE_S[range] || range);
    el = document.getElementById('chartPeriod');
    if (el) el.textContent = rows.length ? (RANGE_L[range] || range) + ' · ' + fmtD(new Date(rows[0].date).getTime()) + ' – ' + fmtD(new Date(rows[rows.length - 1].date).getTime()) : '';
    el = document.getElementById('asOf');
    if (el && rows.length) el.textContent = 'За ' + fmtD(new Date(rows[rows.length - 1].date).getTime()) + ' · податоци на крај на ден (последната трговска сесија)';
  }
  function loadLWC() {
    if (window.LightweightCharts) return Promise.resolve();
    if (lwcP) return lwcP;
    lwcP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { lwcP = null; rej(new Error('lwc')); };
      document.head.appendChild(s);
    });
    return lwcP;
  }
  function draw(range) {
    cur = range;
    if (rangeBtns) {
      var bs = rangeBtns.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', bs[i].getAttribute('data-r') === range);
    }
    fetch('/api/history/' + encodeURIComponent(sym) + '?range=' + encodeURIComponent(range))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var rows = ((d && d.rows) || []).filter(function (x) { return x.last != null; });
        setHead(rows, range);
        if (!rows.length || !box) return;
        loadLWC().then(function () {
          if (!window.LightweightCharts || !window.W || !W.directionChart) return;
          if (chart) { try { chart.remove(); } catch (e) {} chart = null; }
          box.innerHTML = '';
          chart = W.directionChart(box, rows, { chartType: 'line', showVolume: true, height: 360 });
        }).catch(function () {});
      })
      .catch(function () {});
  }
  if (rangeBtns) rangeBtns.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button[data-r]') : null;
    if (b) draw(b.getAttribute('data-r'));
  });
  if (box) draw('1Y');
})();
</script>`;

  return pageShell({
    title: `${name} (${sym}) — цена, промена, 52 недели | MSE Berza`,
    description: `${name} (${sym}) на Македонската берза: последна цена ${fmtN(q.lastPrice)} MKD, промена ${pctStr(q.changePct)}, 52-неделен опсег, волумен и промет.`,
    canonical: `${SITE_URL}/s/${encodeURIComponent(sym)}`,
    h1: `${name} (${sym}) — цена и податоци од Македонската берза`,
    h1Html: `${logoHtml}${esc(name)} (${esc(sym)}) — цена и податоци од Македонската берза`,
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

// FAQ page — accordion (<details> is crawlable even when closed) + FAQPage
// JSON-LD so Google can show the questions directly in search results.
function renderFaqPage() {
  if (!FAQ_SECTIONS.length) {
    return pageShell({
      title: 'Прашања и одговори | MSE Berza',
      description: 'Најчести прашања за купување акции на Македската берза, дивиденди, данок и брокери.',
      canonical: `${SITE_URL}/prasanja`,
      h1: 'Прашања и одговори',
      bodyHtml: '<p>Содржината наскоро ќе биде достапна.</p>',
    });
  }
  const bodyHtml = FAQ_SECTIONS.map((sec, si) => {
    const items = sec.items.map((it, qi) => `
<details class="faq-item" id="q-${si + 1}-${qi + 1}">
  <summary>${esc(it.q)}</summary>
  <div class="faq-a">${it.a.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div>
</details>`).join('');
    return `<section class="faq-sec" id="sec-${si + 1}"><h2 class="faq-sec-title">${esc(sec.title)}</h2>${items}</section>`;
  }).join('\n');

  const toc = `<nav class="faq-toc" aria-label="Содржина">${FAQ_SECTIONS
    .map((sec, si) => `<a href="#sec-${si + 1}">${esc(sec.title)}</a>`).join('')}</nav>`;
  const intro = '<p class="faq-intro">Кратки и конкретни одговори на најчестите прашања за купување акции на Македонската берза, провизии, дивиденди, данок и брокери. Содржината е за едукација и не е инвестициски совет.</p>';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_SECTIONS.flatMap((sec) => sec.items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a.split('\n\n').join(' ') },
    }))),
  };

  return pageShell({
    title: 'Прашања и одговори за берза и акции | MSE Berza',
    description: 'Како да купиш акција, колку е провизијата, кои фирми даваат дивиденда и како се плаќа данок — одговори на најчестите прашања за Македонската берза.',
    canonical: `${SITE_URL}/prasanja`,
    h1: 'Прашања и одговори',
    bodyHtml: intro + toc + bodyHtml,
    jsonLd,
  });
}

// /kursna-lista — full NBRM middle-rate list for the cached date (SEO: this is
// a high-volume MK search term). Data comes from the daily FX cache.
async function renderFxListPage() {
  const { list, date } = await getFXList();
  const fmtRate = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
  const dateLabel = (() => {
    const parts = String(date || '').split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '—';
  })();
  // Rates are per `unit` of the currency. NBRM currently publishes every
  // currency with unit = 1, so there is no separate "Единица" column — a
  // non-1 unit (if NBRM ever adds one) is shown next to the currency name.
  const rows = list.map((c) => `<tr><td class="fx-cur">${esc(c.name || c.code)} <span class="fx-code">${esc(c.code)}</span>${c.unit && c.unit !== 1 ? ` <span class="fx-unit">за ${fmtN(c.unit, 0)}</span>` : ''}</td><td class="num">${fmtRate(c.mid)}</td></tr>`).join('\n');
  const bodyHtml = list.length
    ? `<p>Среден курс на Народната банка на Република Северна Македонија за <strong>${esc(dateLabel)}</strong>. Извор: <a href="https://www.nbrm.mk/kursna_lista.nspx" target="_blank" rel="noopener">НБРМ</a>.</p>
<table class="fx-table"><thead><tr><th>Валута</th><th class="num">Среден курс (денари)</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>Податоците за курсната листа сè уште не се вчитани.</p>';
  return pageShell({
    title: `Курсна листа на НБРМ за ${esc(dateLabel)} | MSE Berza`,
    description: `Среден курс на еврото, доларот и уште 30 валути според НБРМ за ${dateLabel}.`,
    canonical: `${SITE_URL}/kursna-lista`,
    h1: 'Курсна листа на НБРМ',
    bodyHtml,
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
      'За прашања, предлози или пријавување на грешка во податоците, пишете ни на <a href="mailto:mail@mseberza.info">mail@mseberza.info</a>.',
    ],
  },
  '/izvor-na-podatoci': {
    title: 'Извор на податоци | MSE Berza',
    h1: 'Извор на податоци',
    description: 'Како MSE Berza ги собира податоците: јавните страници на mse.mk, еднаш дневно по затворање на сесијата.',
    body: [
      'Сите податоци се преземаат од јавно достапните страници на Македонската берза (mse.mk): листа на симболи, страници на издавачи, историски податоци и индексни вредности.',
      'Македонската берза објавува податоци еднаш дневно, по затворање на трговската сесија (работни денови, трговска сесија 09:00–14:00). Затоа и MSE Berza се ажурира со истото темпо — ова не е берзански feed во реално време.',
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

// /sitemap — user-friendly HTML sitemap: every canonical, indexable URL,
// grouped (market pages, site info, companies A–Z). Mirrors sitemap.xml;
// embed/API pages and #anchors are intentionally excluded (not canonical).
async function renderSitemapPage() {
  const quotes = Object.values(await store.getQuotes());
  const prim = quotes
    .filter((q) => q.primary !== false)
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  const li = (href, label) => `<li><a href="${href}">${label}</a></li>`;
  const market = [
    li('/', 'Почетна — котации во живо'),
    li('/widgets.html', 'Виџети за твојот сајт'),
    li('/kursna-lista', 'Курсна листа на НБРМ'),
  ].join('\n');
  const info = [
    li('/za-nas', 'За нас'),
    li('/izvor-na-podatoci', 'Извор на податоци'),
    li('/metodologija', 'Методологија'),
    li('/prasanja', 'Прашања и одговори'),
    li('/sitemap', 'Мапа на сајтот'),
  ].join('\n');
  // Companies grouped by ticker first letter (a leading digit → '0–9').
  const groups = new Map();
  for (const q of prim) {
    const ch = String(q.symbol || '').charAt(0).toUpperCase();
    const key = /[0-9]/.test(ch) ? '0–9' : ch;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  const letters = [...groups.keys()]
    .sort((a, b) => (a === '0–9' ? -1 : b === '0–9' ? 1 : a.localeCompare(b)));
  const gid = (L) => (L === '0–9' ? '09' : L);
  const nav = `<nav class="faq-toc" aria-label="Азбучен индекс">${letters.map((L) => `<a href="#grp-${gid(L)}">${esc(L)}</a>`).join('')}</nav>`;
  const sections = letters.map((L) => {
    const items = groups.get(L)
      .map((q) => li(`/s/${encodeURIComponent(q.symbol)}`, `${esc(q.symbol)} — ${esc(q.name || '')}`))
      .join('\n');
    return `<section id="grp-${gid(L)}"><h3 class="sitemap-letter">${esc(L)}</h3><ul class="sitemap-cols">${items}</ul></section>`;
  }).join('\n');
  const bodyHtml = `<p>Преглед на сите страници на MSE Berza: пазарни податоци, информации за сајтот и страници на компаниите по азбучен ред.</p>
<h2>Пазар</h2>
<ul class="sitemap-list">${market}</ul>
<h2>За сајтот</h2>
<ul class="sitemap-list">${info}</ul>
<h2>Компании по азбучен ред</h2>
${nav}
${sections}
<style>
.sitemap-list, .sitemap-cols { list-style: none; margin: 0 0 6px; padding: 0; }
.sitemap-list { display: grid; gap: 0 24px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.sitemap-list li, .sitemap-cols li { line-height: 2; }
.sitemap-letter { font-size: 15px; margin: 14px 0 2px; color: var(--md-sys-color-primary); }
.sitemap-cols { columns: 3; column-gap: 24px; }
.sitemap-cols li { break-inside: avoid; }
/* Keep jumped-to letter sections clear of the sticky topbar. */
[id^="grp-"] { scroll-margin-top: 76px; }
@media (max-width: 599px) { .sitemap-cols { columns: 2; } }
@media (max-width: 399px) { .sitemap-cols { columns: 1; } }
</style>`;
  return pageShell({
    title: 'Мапа на сајтот | MSE Berza',
    description: 'Мапа на сајтот на MSE Berza: котации, курсна листа, виџети, информации и страници на сите компании на Македонската берза.',
    canonical: `${SITE_URL}/sitemap`,
    h1: 'Мапа на сајтот',
    bodyHtml,
  });
}

// ---- Boot readiness --------------------------------------------------------
// store.init() (schema migration + symbol list) must finish before any DB-backed
// response is served. On a serverless cold start the first request can arrive
// within milliseconds of boot; without this gate it hits a missing schema,
// throws, and the catch-all hands back an empty-but-200 payload.
// Memoised: after the first successful init every await is a no-op.
let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = store.init()
      .then(async (syms) => {
        log.info(`store ready: ${Array.isArray(syms) ? syms.length : 0} symbols`);
        // startScheduler is synchronous (it kicks off its own async IIFE), so a
        // throw here must not be mistaken for an init failure.
        try {
          store.startScheduler();
        } catch (e) {
          log.error(`scheduler start error: ${e.message}`);
        }
        // Serverless functions freeze once the response is sent, so the
        // scheduler's background timers can't be relied on for the daily push.
        // Run the (guarded, deduped) movers refresh + notify inside this real
        // request instead — normally a no-op, bounded so it can't stall boot.
        try {
          await Promise.race([
            store.moversTick(),
            new Promise((r) => setTimeout(r, 7000)),
          ]);
        } catch (e) {
          log.warn(`movers tick at boot: ${e.message}`);
        }
        return true;
      })
      .catch((e) => {
        log.error(`store init error: ${e.message}`);
        readyPromise = null; // let the next request retry
        throw e;
      });
  }
  return readyPromise;
}

// Await readiness without blocking forever; replies 503 (uncacheable) on
// failure so the client retries instead of caching an empty page.
async function waitReady(res) {
  try {
    await withTimeoutMs(ensureReady(), 20000, 'store init');
    return true;
  } catch (e) {
    log.error(`not ready: ${e.message}`);
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' });
    res.end(JSON.stringify({ error: 'initializing', detail: e.message }));
    return false;
  }
}

function withTimeoutMs(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Static assets and DB-free endpoints answer instantly on a cold start; every
// other route reads Postgres and therefore waits for the init gate.
const STATIC_ASSET_RE = /\.(css|js|mjs|map|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|json|webmanifest|txt)$/i;
// /sitemap.xml is intentionally NOT gated on store.init: it only needs a plain
// quotes read, and it must answer crawlers even during a cold start or a DB
// hiccup (a 5xx here is what shows up as "Couldn't fetch" in Search Console).
const DB_FREE_PATHS = new Set(['/api/version', '/api/market', '/api/logs', '/api/push/key', '/robots.txt', '/sitemap.xml', '/health', '/healthz']);
function needsDb(pathname) {
  if (DB_FREE_PATHS.has(pathname)) return false;
  return !STATIC_ASSET_RE.test(pathname);
}

// Sitemap XML builder + cache. On a DB failure we serve the last good sitemap
// (or the static pages) with a 200 — a crawler must never see an error here.
function buildSitemapXml(symbols) {
  const urls = ['/', '/widgets.html', '/prasanja', '/kursna-lista', '/za-nas', '/izvor-na-podatoci', '/metodologija', '/sitemap']
    .concat(symbols.map((s) => `/s/${s}`));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')
    + '\n</urlset>';
}
const STATIC_SITEMAP_XML = buildSitemapXml([]);
let sitemapCache = null; // last successfully built full sitemap

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Health check — respond immediately for platform probes
  if (url.pathname === '/health' || url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ready: !!store.lastPoll }));
  }
  if (needsDb(url.pathname) && !(await waitReady(res))) return;
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
    let xml;
    try {
      const quotes = Object.values(await store.getQuotes());
      const prim = quotes.filter((q) => q.primary !== false).map((q) => q.symbol).sort();
      xml = buildSitemapXml(prim);
      sitemapCache = { xml, at: Date.now() };
    } catch (e) {
      log.warn(`sitemap build failed, serving fallback: ${e.message}`);
      xml = (sitemapCache && sitemapCache.xml) || STATIC_SITEMAP_XML;
    }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
    return res.end(xml);
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

  if (url.pathname === '/prasanja') {
    try {
      const html = renderFaqPage();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' });
      return res.end(html);
    } catch (e) {
      log.error(`/prasanja: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('error');
    }
  }

  if (url.pathname === '/kursna-lista') {
    try {
      const html = await renderFxListPage();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' });
      return res.end(html);
    } catch (e) {
      log.error(`/kursna-lista: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('error');
    }
  }

  if (url.pathname === '/sitemap') {
    try {
      const html = await renderSitemapPage();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' });
      return res.end(html);
    } catch (e) {
      log.error(`/sitemap: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('error');
    }
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
  // Start listening immediately — the init gate inside the request handler
  // holds DB-backed routes until store.init() has finished (see ensureReady).
  server.listen(PORT, '0.0.0.0', () => {
    log.info(`MSE Clone dashboard listening on 0.0.0.0:${PORT}`);
  });
  // Kick off init immediately so the gate is already resolved for the first
  // real request; failures are surfaced per-request as 503, not here.
  ensureReady().catch(() => {});
}

// Global crash handlers — don't let unhandled errors kill the process silently.
process.on('uncaughtException', (e) => log.error(`uncaughtException: ${e.message}`));
process.on('unhandledRejection', (e) => log.error(`unhandledRejection: ${e && e.message}`));

main().catch((e) => {
  log.error(`FATAL: ${e.message}`);
  process.exit(1);
});
