/* eslint-disable no-console */
/**
 * Local preview server — no database required.
 *
 * Serves the local `public/` directory so you can preview UNCOMMITTED changes
 * (the builder, the embeds, styles) exactly as they'd ship, and proxies every
 * request that isn't a local static file (e.g. `/api/quotes`, `/api/movers`,
 * `/api/indices`) to the live origin, so the widgets render with REAL data.
 *
 * Usage:
 *   npm run preview
 *   # then open http://localhost:8090/widgets.html
 *   #          http://localhost:8090/embed/watchlist.html?preset=movers
 *   #          http://localhost:8090/embed/ticker.html?symbols=KMB,ALK&logos=1
 *
 * Env:
 *   PREVIEW_PORT    (default 8090)
 *   PREVIEW_ORIGIN  (default https://mseberza.info)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PREVIEW_PORT) || 8090;
const ORIGIN = process.env.PREVIEW_ORIGIN || 'https://mseberza.info';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Resolve a URL pathname to a local file inside PUBLIC_DIR (or null if it
// doesn't exist, or would escape PUBLIC_DIR).
function localFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    return null;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return null; // path traversal guard
  try {
    if (fs.statSync(file).isFile()) return file;
  } catch (e) { /* not a local file */ }
  return null;
}

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store', // always show the freshest local file
  });
  fs.createReadStream(file).pipe(res);
}

// Proxy anything not served locally (the /api/* endpoints) to the live origin.
// Read-only: never forward writes, so a preview can't mutate production data
// (e.g. /api/push/subscribe).
function proxy(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('preview proxy is read-only (GET/HEAD only)');
  }
  const target = new URL(ORIGIN);
  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding']; // keep responses simple to pass through
  const proxied = https.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 443,
    method: req.method,
    path: url.pathname + url.search,
    headers,
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, {
      ...upstream.headers,
      'Cache-Control': 'no-store',
    });
    upstream.pipe(res);
  });
  proxied.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('preview proxy error: ' + e.message);
  });
  req.pipe(proxied);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = (req.method === 'GET' || req.method === 'HEAD') ? localFile(url.pathname) : null;
  if (file) return serveFile(res, file);
  return proxy(req, res, url);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Preview → http://localhost:${PORT}/`);
  console.log(`  builder:  http://localhost:${PORT}/widgets.html`);
  console.log(`  watchlist http://localhost:${PORT}/embed/watchlist.html?preset=movers`);
  console.log(`  ticker:   http://localhost:${PORT}/embed/ticker.html?symbols=KMB,ALK&logos=1&speed=fast`);
  console.log(`Local public/ files are served as-is; everything else proxies to ${ORIGIN}`);
});
