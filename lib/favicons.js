// Self-hosted favicons. We fetch the real icon from each issuer's official site
// (their <link rel="icon"> or /favicon.ico) and store the bytes in the DB, then
// serve them from our own /api/favicon/{SYM}. This avoids depending on Google's
// favicon service, which hangs for several MK domains and leaves blank tiles.

const http = require('http');
const https = require('https');
const { URL } = require('url');
const log = require('./logger');

const MAX_BYTES = 200 * 1024;
const FETCH_TIMEOUT = 8000;

// Download a URL (follows up to 5 redirects). Returns { status, data, type }.
function download(url, depth = 0) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ status: 0, data: null, type: '' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MSEBerza/1.0; favicon crawler)', 'Accept': 'image/*,*/*;q=0.8' }, timeout: FETCH_TIMEOUT }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && depth < 5) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), depth + 1));
      }
      if (code >= 400) { res.resume(); return resolve({ status: code, data: null, type: '' }); }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(); resolve({ status: 0, data: null, type: '' }); }
        else chunks.push(c);
      });
      res.on('end', () => resolve({ status: code, data: Buffer.concat(chunks), type: String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase() }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null, type: '' }); });
    req.on('error', () => resolve({ status: 0, data: null, type: '' }));
  });
}

// Is this blob actually an image? (content-type lies a lot for favicons.)
function looksLikeImage(data, type) {
  if (!data || data.length < 16) return false;
  const b = data;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // GIF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return true; // ICO
  if (b[4] === 0x52 && b[5] === 0x49 && b[6] === 0x46 && b[7] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return true; // WEBP
  if (/^image\/(png|jpe?g|gif|webp|x-icon|vnd\.microsoft\.icon|svg\+xml|avif)$/.test(type)) return true;
  const head = data.slice(0, 512).toString('utf8').trim();
  if (/^<\?xml/.test(head) || /^<svg[\s>]/.test(head) || head.includes('<svg')) return true;
  return false;
}

function pickType(data, type) {
  const b = data;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon';
  if (/^image\/(png|jpe?g|gif|webp|x-icon|vnd\.microsoft\.icon|svg\+xml)$/.test(type)) return type;
  const head = data.slice(0, 512).toString('utf8').trim();
  if (/^<\?xml/.test(head) || /^<svg[\s>]/.test(head)) return 'image/svg+xml';
  return null;
}

const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./i, '').toLowerCase(); } catch (e) { return null; } };

// Extract <link rel="icon" href> candidates from site HTML.
function iconLinks(html, baseUrl) {
  const out = [];
  for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    const tag = m[0];
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    const sizes = (tag.match(/sizes=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    try { out.push({ url: new URL(href, baseUrl).toString(), sizes }); } catch (e) {}
  }
  // Prefer small favicons: a 16-32px icon is plenty for a 22px logo tile. Sort
  // by declared size ascending (0 = unknown, keep at the end so explicit sizes
  // win), then keep document order.
  const sizeOf = (s) => { const m = /^(\d+)x(\d+)$/.exec(s || ''); return m ? parseInt(m[1], 10) : 0; };
  return out.sort((a, b) => {
    const sa = sizeOf(a.sizes) || 999, sb = sizeOf(b.sizes) || 999;
    if (sa !== sb) return sa - sb;
    return 0;
  });
}

// The MSE issuer page itself displays the issuer's official logo (the best,
// most consistent source): <div class="col-md-4 text-center"><img src="/Repository/Logos/Issuer/...">.
// Works for every issuer MSE publishes a logo for — including those with no
// website of their own. Returns { data, type } | null.
async function mseLogoFor(symbol) {
  const { BASE } = require('./scraper');
  const page = await download(`${BASE}/en/symbol/${encodeURIComponent(symbol)}`);
  if (page.status !== 200 || !page.data) return null;
  const html = page.data.toString('utf8');
  const m = html.match(/<div class="col-md-4 text-center">\s*<img[^>]+src="([^"]+)"/i)
    || html.match(/<img[^>]+src="(\/Repository\/Logos\/Issuer\/[^"]+)"/i);
  if (!m || !m[1]) return null;
  let url;
  try { url = new URL(m[1], BASE).toString(); } catch (e) { return null; }
  const r = await download(url);
  if (r.status === 200 && r.data && looksLikeImage(r.data, r.type)) {
    const t = pickType(r.data, r.type);
    if (t && r.data.length <= 64 * 1024) return { data: r.data, type: t };
  }
  return null;
}

// Try to get a real favicon for one official site. Returns { data, type } | null.
async function faviconForSite(site) {
  const host = hostOf(site);
  if (!host) return null;
  const origin = 'https://' + host;

  // 1) explicit <link rel=icon> from the homepage
  const home = await download(site);
  if (home.status === 200 && home.data) {
    const html = home.data.toString('utf8');
    for (const cand of iconLinks(html, site).slice(0, 6)) {
      const r = await download(cand.url);
      if (r.status === 200 && r.data && looksLikeImage(r.data, r.type)) {
        const t = pickType(r.data, r.type);
        // A 60KB+ PNG is a splash image, not a favicon — skip it.
        if (t && r.data.length <= 64 * 1024) return { data: r.data, type: t };
      }
    }
  }

  // 2) /favicon.ico fallback
  const ico = await download(origin + '/favicon.ico');
  if (ico.status === 200 && ico.data && looksLikeImage(ico.data, ico.type)) {
    const t = pickType(ico.data, ico.type);
    if (t) return { data: ico.data, type: t };
  }

  // 3) Google's favicon cache as a last resort — done SERVER-SIDE with our own
  // timeout, so the hanging that plagued the browser (301 loops that never
  // resolve) cannot happen here; a timeout simply counts as "no favicon".
  const g = await download(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
  if (g.status === 200 && g.data && g.data.length > 200 && g.data.length <= 64 * 1024 && looksLikeImage(g.data, g.type)) {
    const t = pickType(g.data, g.type);
    if (t) return { data: g.data, type: t };
  }
  return null;
}

// Scrape favicons for the given symbols. Order: MSE issuer logo (official,
// consistent, covers issuers without a website too) -> the issuer's own site
// favicon. Upserts rows as it goes (serverless-safe: interrupted runs keep
// what they finished). Returns { ok, none, failed }.
async function scrapeFavicons(symbols, { onProgress = null } = {}) {
  const db = require('./db');
  const companies = await db.getAllCompanies();
  const targets = [...new Set((symbols || []).filter(Boolean))];
  let ok = 0, none = 0, failed = 0;
  const BATCH = 5;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (sym) => {
      try {
        // 1) official MSE issuer logo — works even without a website
        let fav = await mseLogoFor(sym);
        // 2) the issuer's own site as a fallback
        if (!fav && companies[sym] && companies[sym].website) {
          fav = await faviconForSite(companies[sym].website);
        }
        if (fav) return { sym, fav };
        none++;
        return null;
      } catch (e) {
        failed++;
        return null;
      }
    }));
    const found = results.filter(Boolean);
    if (found.length) await db.upsertFavicons(Object.fromEntries(found.map(({ sym, fav }) => [sym, fav])));
    ok += found.length;
    if (onProgress) onProgress(batch.length);
  }
  log.info(`favicon scrape: ${ok} ok, ${none} none, ${failed} failed (of ${targets.length})`);
  return { ok, none, failed };
}

module.exports = { faviconForSite, mseLogoFor, scrapeFavicons, looksLikeImage, pickType, hostOf, download };