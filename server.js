const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const log = require('./lib/logger');

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

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
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
    return sendJson(res, { quotes: arr, marketOpen: store.isMarketOpen(), lastPoll: store.lastPoll });
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
    return sendJson(res, { symbol: sym, rows });
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
    const sym = decodeURIComponent(bf[1]);
    const days = parseInt(url.searchParams.get('days') || '365', 10);
    const rows = await store.backfillHistory(sym, days);
    return sendJson(res, { symbol: sym, count: rows.length });
  }

  const bfIdx = url.pathname.match(/^\/api\/backfill-index\/([^/]+)$/);
  if (bfIdx) {
    const code = decodeURIComponent(bfIdx[1]);
    const rows = await store.backfillIndexHistory(code);
    return sendJson(res, { code, count: rows.length });
  }

  const bfAll = url.pathname.match(/^\/api\/backfill-all$/);
  if (bfAll) {
    const syms = store.getSymbols();
    let done = 0;
    // sequential to be polite to the server
    for (const s of syms) {
      await store.backfillHistory(s, 365);
      done++;
    }
    return sendJson(res, { ok: true, symbolsDone: done, total: syms.length });
  }

  if (url.pathname === '/api/history') {
    // Batch history: /api/history?symbols=ALK,ADIN,GRNT&range=1Y
    const syms = (url.searchParams.get('symbols') || '').split(',').filter(Boolean);
    const range = url.searchParams.get('range') || '1Y';
    const queries = {};
    for (const sym of syms) {
      let rows = await store.getHistory(sym);
      if (range === '1M') rows = rows.slice(-22);
      else if (range === '3M') rows = rows.slice(-66);
      else if (range === '6M') rows = rows.slice(-132);
      else if (range === '1Y') rows = rows.slice(-252);
      queries[sym] = rows;
    }
    return sendJson(res, { queries });
  }

  if (url.pathname === '/api/refresh') {
    await store.pollQuotes();
    await store.pollIndices();
    return sendJson(res, { ok: true, lastPoll: store.lastPoll });
  }

  if (url.pathname === '/api/logs') {
    const n = parseInt(url.searchParams.get('n') || '50', 10);
    return sendJson(res, { lines: log.getRecent(n) });
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
  sendFile(res, filePath);
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
