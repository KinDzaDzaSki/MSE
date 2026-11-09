#!/usr/bin/env node
/**
 * Smoke test for mseberza.info — HTTP surface, then the data contracts the UI
 * actually reads (shapes taken from the live API, not guessed).
 *
 *   node scripts/smoke.js                                # the live origin
 *   node scripts/smoke.js --base http://127.0.0.1:3101   # local preview
 *
 * No dependencies, no browser. Exit code 1 if a check fails, so it can gate a
 * deploy. It cannot see CSS — the layout half is a browser pass.
 *
 * Three outcomes, so a not-yet-deployed commit does not read as a broken site:
 *   PASS / FAIL   true of the base URL right now
 *   SKIP          needs the repo's version to be live (says which)
 *   note:         an observation that is not a regression (MBI10 depth)
 */
const { readFileSync } = require('fs');
const { join } = require('path');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BASE = argOf('base', 'https://mseberza.info').replace(/\/$/, '');
const IS_PREVIEW = /127\.0\.0\.1|localhost/.test(BASE);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

let failed = 0, passed = 0, skipped = 0, servedVersion = null;

const pass = (n, d, ms) => { passed++; console.log(`PASS  ${n}${ms != null ? ` (${ms} ms)` : ''}${d ? '  — ' + d : ''}`); };
const fail = (n, d, ms) => { failed++; console.log(`FAIL  ${n}${ms != null ? ` (${ms} ms)` : ''}${d ? '  — ' + d : ''}`); };
const skip = (n, why) => { skipped++; console.log(`SKIP  ${n}  — ${why}`); };
const note = (m) => console.log(`      note: ${m}`);
const check = (n, ok, d, ms) => (ok ? pass(n, d, ms) : fail(n, d, ms));

async function get(path, { ua = UA, timeout = 20000 } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, { headers: { 'user-agent': ua, accept: '*/*' }, signal: ctrl.signal });
    const body = await res.text();
    return { res, body, ms: Date.now() - started };
  } catch (e) {
    return { res: { status: 0, headers: new Headers() }, body: '', ms: Date.now() - started, error: e.message };
  } finally { clearTimeout(timer); }
}

function parse(body, path) {
  try { return JSON.parse(body); }
  catch { throw new Error(`${path}: not JSON (${body.slice(0, 100).replace(/\s+/g, ' ')})`); }
}

// ---- shell ----------------------------------------------------------------
async function shell() {
  const { res, body, ms, error } = await get('/');
  if (error) return fail('GET /', error, ms);
  const hasTable = /<table[^>]*class="[^"]*quotes/.test(body);
  const ssrRows = (body.match(/<tr[^>]*data-sym=/g) || []).length;
  check('GET / 200 + quotes table', res.status === 200 && hasTable, `${res.status}, ${body.length} bytes, ${ssrRows} SSR rows`, ms);

  const title = (body.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  check('GET / title', title.length > 10, title);
  const busters = (body.match(/(?:styles\.css|app\.js)\?v=[\d.]+/g) || []).join(' ');
  check('GET / cache-busters', /styles\.css\?v=/.test(busters) && /app\.js\?v=/.test(busters), busters);
  const canonical = /<link[^>]+rel="canonical"/i.test(body);
  const desc = /<meta[^>]+name="description"[^>]+content="[^"]{40,}"/i.test(body);
  check('GET / SEO head', canonical && desc, `canonical ${canonical ? 'ok' : 'MISSING'}, description ${desc ? 'ok' : 'MISSING'}`);

  const bits = { sideRail: body.includes('id="sideRail"'), topnav: body.includes('class="topnav"'), watchCard: body.includes('id="watchCard"') };
  const missing = Object.keys(bits).filter((k) => !bits[k]);
  if (!missing.length) pass('GET / carries the current shell', 'sideRail + topnav + watchCard');
  else if (!IS_PREVIEW && servedVersion && servedVersion !== PKG.version)
    skip('GET / carries the current shell', `site serves v${servedVersion}, repo is v${PKG.version}; missing ${missing.join(', ')}`);
  else fail('GET / carries the current shell', 'missing ' + missing.join(', '));
}

async function version() {
  const { res, body, ms, error } = await get('/api/version');
  if (error) return fail('GET /api/version', error, ms);
  let v;
  try { v = parse(body, '/api/version').version; } catch (e) { return fail('GET /api/version', e.message, ms); }
  servedVersion = v;
  const same = v === PKG.version;
  check('GET /api/version', res.status === 200 && !!v,
    `served ${v}, repo ${PKG.version}${same ? ' ✓' : IS_PREVIEW ? ' (preview serves the repo)' : ' — deploy pending'}`, ms);
}

// ---- data contracts -------------------------------------------------------
async function quotes() {
  const { res, body, ms, error } = await get('/api/quotes');
  if (error) return fail('GET /api/quotes', error, ms);
  let q;
  try { q = parse(body, '/api/quotes'); } catch (e) { return fail('GET /api/quotes', e.message, ms); }
  const list = q.quotes || [];
  const broken = list.filter((r) => !r.symbol || !r.name);
  const primary = list.filter((r) => r.primary !== false);
  const noPrice = primary.filter((r) => r.lastPrice == null);
  const pct = primary.length ? Math.round((noPrice.length / primary.length) * 100) : 0;
  check('GET /api/quotes', res.status === 200 && list.length > 30 && broken.length === 0,
    `${list.length} symbols, ${primary.length} primary, ${broken.length} without symbol/name, marketOpen ${q.marketOpen}`, ms);
  if (pct >= 25) note(`${noPrice.length}/${primary.length} primary symbols (${pct}%) carry no lastPrice — those rows are dashes in «Сите»`);
}

async function indices() {
  const { res, body, ms } = await get('/api/indices');
  let d;
  try { d = parse(body, '/api/indices'); } catch (e) { return fail('GET /api/indices', e.message, ms); }
  const codes = Object.keys(d);
  const m = d.MBI10;
  check('GET /api/indices', res.status === 200 && codes.length >= 2 && m && typeof m.value === 'number',
    `${codes.join(' + ')} · MBI10 ${m ? m.value : '—'} (${m ? m.changePct : '—'}%)`, ms);
}

async function movers() {
  const { res, body, ms } = await get('/api/movers');
  let d;
  try { d = parse(body, '/api/movers'); } catch (e) { return fail('GET /api/movers', e.message, ms); }
  const w = d.winners || [], l = d.losers || [], t = d.mostTraded || [];
  const shaped = [...w, ...l, ...t].every((r) => r.symbol && typeof r.changePct === 'number' && typeof r.avgPrice === 'number');
  const valued = t.every((r) => typeof r.value === 'number');
  check('GET /api/movers', res.status === 200 && w.length > 0 && l.length > 0 && t.length > 0 && shaped && valued,
    `winners ${w.length}, losers ${l.length}, mostTraded ${t.length}${valued ? '' : ' — a traded row has no turnover'}`, ms);
}

async function sparks() {
  const { res, body, ms } = await get('/api/sparks');
  let d;
  try { d = parse(body, '/api/sparks'); } catch (e) { return fail('GET /api/sparks', e.message, ms); }
  const s = d.series || d.sparks || d;
  const keys = Object.keys(s);
  const lens = keys.map((k) => (Array.isArray(s[k]) ? s[k].length : 0)).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const max = lens.length ? lens[lens.length - 1] : 0;
  const detail = `${keys.length} symbols, median ${median} pts, max ${max}`;
  if (IS_PREVIEW) return skip('GET /api/sparks 52-week window', `proxied to the live origin (${detail}); the window is server-side in lib/store.js`);
  check('GET /api/sparks 52-week window', keys.length > 50 && max > 0 && max <= 60,
    detail + (max > 60 ? ' — the lifetime series is being served' : ''), ms);
}

async function history(symbol, range, minRows) {
  const path = `/api/history/${symbol}?range=${range}`;
  const { res, body, ms } = await get(path);
  let d;
  try { d = parse(body, path); } catch (e) { return fail(`GET ${path}`, e.message, ms); }
  const r = d.rows || [];
  const first = r.length ? r[0].date : '—';
  const last = r.length ? r[r.length - 1].date : '—';
  check(`GET ${path}`, res.status === 200 && r.length >= minRows, `${r.length} rows, ${first} → ${last}`, ms);
  const badBar = r.filter((x) => !(x.last > 0)).length;
  if (badBar) note(`${path}: ${badBar} bar(s) with a non-positive close`);
  return { rows: r.length, first, last };
}

async function indexDepth() {
  const path = '/api/history/MBI10?range=ALL';
  const { res, body, ms } = await get(path);
  let d;
  try { d = parse(body, path); } catch (e) { return fail(`GET ${path}`, e.message, ms); }
  const r = d.rows || [];
  check(`GET ${path}`, res.status === 200 && r.length > 5,
    `${r.length} rows, ${r.length ? r[0].date : '—'} → ${r.length ? r[r.length - 1].date : '—'}`, ms);
  const m = r.length && String(r[0].date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && Number(m[3]) >= 2025) note(`MBI10 stops at ${r[0].date} — the index backfill asks for the current + previous year only, not the 2001 floor the symbols get`);
}

async function miscApi() {
  for (const [path, probe] of [
    ['/health', (d) => d.ok === true],
    ['/api/symbols', (d) => Array.isArray(d.symbols) && d.symbols.length > 50],
    ['/api/market', (d) => typeof d.open === 'boolean' && !!d.hours],
    ['/api/fx', (d) => typeof d.eur === 'number' && typeof d.usd === 'number'],
    ['/api/dividends', (d) => Array.isArray(d) || Array.isArray(d.dividends)],
    ['/api/ratings', (d) => d && typeof d === 'object'],
  ]) {
    const { res, body, ms } = await get(path);
    let d;
    try { d = parse(body, path); } catch (e) { fail(`GET ${path}`, e.message, ms); continue; }
    check(`GET ${path}`, res.status === 200 && probe(d), JSON.stringify(d).slice(0, 100), ms);
  }
}

// ---- crawl surface --------------------------------------------------------
async function crawl() {
  const bot = await get('/sitemap.xml', { ua: BOT });
  const ctype = bot.res.headers.get('content-type') || '';
  const locs = (bot.body.match(/<loc>/g) || []).length;
  const edge = bot.res.headers.get('x-vercel-cache') || bot.res.headers.get('cf-cache-status') || '—';
  check('GET /sitemap.xml as Googlebot', bot.res.status === 200 && /xml/.test(ctype) && locs > 20,
    `${bot.res.status} ${ctype}, ${locs} <loc>, edge ${edge}`, bot.ms);

  const urls = [...bot.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const url of urls.filter((u) => /\/s\/[A-Z0-9.]+$/.test(u)).slice(0, 3)) {
    const p = url.replace(/^https?:\/\/[^/]+/, '');
    const r = await get(p);
    check(`sitemap URL resolves ${p}`, r.res.status === 200 && r.body.length > 2000, `${r.res.status}, ${r.body.length} bytes`, r.ms);
  }

  const robots = await get('/robots.txt');
  const hasSitemap = /^sitemap:\s*https?:\/\/\S+/im.test(robots.body);
  const blocksApi = /^disallow:\s*\/api\//im.test(robots.body);
  check('GET /robots.txt', robots.res.status === 200 && hasSitemap && blocksApi,
    `${hasSitemap ? 'Sitemap line' : 'NO Sitemap line'}, ${blocksApi ? 'blocks /api/' : 'does not block /api/'}`, robots.ms);
}

async function pages() {
  for (const [path, needle] of [
    ['/prasanja', 'Прашања'], ['/za-nas', null], ['/metodologija', null], ['/izvor-na-podatoci', null],
    ['/kursna-lista', null], ['/sitemap', null], ['/widgets.html', null], ['/s/KMB', 'Komercijalna'],
  ]) {
    const { res, body, ms } = await get(path);
    if (res.status === 404 && IS_PREVIEW) { skip(`GET ${path}`, 'the preview proxies pages to the live origin'); continue; }
    const h1 = /<h1[\s>]/i.test(body);
    const canonical = /rel="canonical"/i.test(body);
    const hit = needle ? body.includes(needle) : true;
    check(`GET ${path}`, res.status === 200 && h1 && canonical && hit,
      res.status !== 200 ? `status ${res.status}` :
        `${body.length} bytes${h1 ? '' : ', no h1'}${canonical ? '' : ', no canonical'}${hit ? '' : ', missing "' + needle + '"'}`, ms);
  }
}

async function assets() {
  for (const [path, kind] of [
    ['/styles.css', 'css'], ['/app.js', 'js'], ['/widget.js', 'js'], ['/logo.js', 'js'],
    ['/manifest.webmanifest', 'json'], ['/sw.js', 'js'], ['/favicon.svg', 'svg'],
    ['/favicon-32.png', 'png'], ['/apple-touch-icon-180.png', 'png'], ['/icon-512.png', 'png'],
  ]) {
    const r = await get(path);
    let extra = '';
    if (kind === 'json') { try { extra = ' name=' + JSON.parse(r.body).name; } catch { extra = ' (unparsable JSON)'; } }
    if (path === '/sw.js') { const m = r.body.match(/CACHE_VERSION\s*=\s*'([^']+)'/); extra = m ? ' ' + m[1] : ' NO CACHE_VERSION'; }
    check(`GET ${path}`, r.res.status === 200 && r.body.length > 40, `${r.res.status}, ${r.body.length} bytes${extra}`, r.ms);
  }
  const fav = await fetch(BASE + '/api/favicon/KMB', { headers: { 'user-agent': UA }, redirect: 'manual' }).catch(() => null);
  if (!fav) return fail('GET /api/favicon/KMB', 'request failed');
  check('GET /api/favicon/KMB', [200, 301, 302].includes(fav.status), `${fav.status} ${fav.headers.get('content-type') || ''}`);
}

async function negatives() {
  const r = await get('/definitely-not-a-page-xyz');
  check('unknown path → 404', r.res.status === 404, `status ${r.res.status}`, r.ms);
  const api = await get('/api/nope');
  check('unknown /api path 4xx not 5xx', api.res.status >= 400 && api.res.status < 500, `status ${api.res.status}`, api.ms);

  const head = await fetch(BASE + '/', { method: 'HEAD', headers: { 'user-agent': UA } }).catch(() => null);
  if (!head) return fail('HEAD /', 'request failed');
  const h = head.headers;
  check('HEAD / headers', head.status === 200 && /html/.test(h.get('content-type') || ''),
    `${h.get('content-type')}, cache ${h.get('cache-control') || '—'}, edge ${h.get('x-vercel-cache') || '—'}`);
}

// ---- run ------------------------------------------------------------------
(async () => {
  console.log(`smoke: ${BASE}${IS_PREVIEW ? '  (preview: /api is proxied to the live origin)' : ''}`);
  console.log(`repo version ${PKG.version}\n`);
  const t0 = Date.now();
  const steps = [version, shell, quotes, indices, movers, sparks,
    () => history('KMB', '1Y', 20), () => history('KMB', 'ALL', 60), indexDepth,
    miscApi, crawl, pages, assets, negatives];
  for (const step of steps) {
    try { await step(); } catch (e) { fail('check threw', e.message); }
  }
  console.log(`\n${passed}/${passed + failed + skipped} passed · ${failed} failed · ${skipped} skipped · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(failed ? 1 : 0);
})();
