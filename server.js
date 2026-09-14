const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const store = require('./lib/store');
const log = require('./lib/logger');

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
};

function sendRaw(res, buf, contentType, req, status = 200, extraHeaders = {}) {
  const ae = (req && req.headers && req.headers['accept-encoding']) || '';
  if (buf.length > 1024 && /\bgzip\b/.test(ae)) {
    res.writeHead(status, { 'Content-Type': contentType, 'Content-Encoding': 'gzip', ...extraHeaders });
    return res.end(zlib.gzipSync(buf));
  }
  res.writeHead(status, { 'Content-Type': contentType, ...extraHeaders });
  return res.end(buf);
}

function sendJson(res, obj, status = 200, req = null) {
  sendRaw(res, Buffer.from(JSON.stringify(obj)), 'application/json; charset=utf-8', req, status);
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
    return sendJson(res, { symbols: store.getSymbols(), marketOpen: store.isMarketOpen() });
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
    return sendJson(res, { quotes: arr, marketOpen: store.isMarketOpen(), lastPoll: store.lastPoll }, 200, req);
  }

  if (url.pathname === '/api/indices') {
    const all = await store.getIndices();
    return sendJson(res, { MBI10: all.MBI10 || null });
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
    return sendJson(res, { symbol: sym, rows }, 200, req);
  }

  const q = url.pathname.match(/^\/api\/quote\/([^/]+)$/);
  if (q) {
    const sym = decodeURIComponent(q[1]);
    // Special case: MBI10 index — return from indices store instead of quotes
    if (sym === 'MBI10') {
      const indices = await store.getIndices();
      const idx = indices.MBI10;
      if (idx) {
        return sendJson(res, {
          symbol: 'MBI10',
          name: 'MBI10 Index',
          lastPrice: idx.value,
          changePct: idx.changePct,
          dailyChange: null,
          avgPrice: null,
          minPrice: null,
          maxPrice: null,
          volume: null,
          value: null,
          trades: null,
          week52Max: null,
          week52Min: null,
        });
      }
    }
    const quotes = await store.getQuotes();
    return sendJson(res, quotes[sym] || { symbol: sym, error: 'no data' });
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
