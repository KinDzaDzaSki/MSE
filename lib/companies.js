// Company profile extras that the quote pages don't carry — today just the
// official website, used for the favicon logos next to every ticker.
//
// Source: the MSE symbol page (`/en/symbol/{SYM}`) prints the issuer profile
// as Bootstrap rows, including:
//   <div class="col-md-4">Site</div><div class="col-md-8"><a href="http://www.alkaloid.com.mk">
//   <div class="col-md-4">Mail</div><div class="col-md-8">alkaloid@alkaloid.com.mk
// "Site" is the authoritative link; the Mail domain is a good fallback when
// the issuer page has no Site row.

const { fetchText, BASE } = require('./scraper');
const log = require('./logger');

// Infrastructure, asset CDNs and social networks — never the company's site.
const BLOCKED_HOST = /(^|\.)(mse\.mk|seinet\.com\.mk|facebook\.com|fb\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|youtu\.be|instagram\.com|google\.com|googleapis\.com|gstatic\.com|fonts\.googleapis\.com|fontawesome\.com|cdnjs\.cloudflare\.com|cloudflare\.com|unpkg\.com|jquery\.com|bootstrapcdn\.com|jsdelivr\.net|gravatar\.com|schema\.org|w3\.org|apple\.com|wikipedia\.org|microsoft\.com|vimeo\.com|tiktok\.com)$/i;

const PROFILE_DELAY_MS = 150; // polite gap between symbol pages

function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./i, '').toLowerCase();
  } catch (e) {
    return null;
  }
}

// Normalize whatever MSE prints into a bare https origin (+path if present).
function normalizeWebsite(raw) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try {
    const parsed = new URL(u);
    const host = parsed.host.replace(/^www\./i, '').toLowerCase();
    if (!host || !host.includes('.')) return null;
    if (BLOCKED_HOST.test(host)) return null;
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return `https://${host}${path}`;
  } catch (e) {
    return null;
  }
}

// Pull the issuer profile out of a symbol page. Returns { website, mailDomain }.
function parseCompanyProfile(html) {
  const text = String(html || '');
  // "Site" row (EN) / "Веб страна" or "Сајт" (MK) — take the first href after it.
  const siteRow = text.match(/(?:>Site<|>Веб[^<]{0,12}<|>Сајт<|>Web<)[\s\S]{0,220}?href="([^"]+)"/i);
  let website = siteRow ? normalizeWebsite(siteRow[1]) : null;

  // Mail row fallback: the address domain is almost always the company domain.
  let mailDomain = null;
  const mailRow = text.match(/(?:>Mail<|>E-mail<|>Е-?пошта<|>Мејл<)[\s\S]{0,200}?([A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,}))/i);
  if (mailRow) {
    const candidate = normalizeWebsite(mailRow[2]);
    if (candidate) {
      mailDomain = hostOf(candidate);
      if (!website) website = candidate;
    }
  }

  // Last resort: the first external href, but ONLY a plausible company domain.
  // Macedonian issuers virtually all sit on .mk, and requiring that (plus the
  // blocklist above) keeps stray asset/CDN links out of the logo field.
  if (!website) {
    for (const m of text.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const host = hostOf(m[1]);
      if (!host || BLOCKED_HOST.test(host)) continue;
      if (!/\.mk$/i.test(host)) continue;
      const cand = normalizeWebsite(m[1]);
      if (cand) { website = cand; break; }
    }
  }
  return { website, mailDomain };
}

async function fetchCompanyProfile(symbol) {
  const html = await fetchText(`${BASE}/en/symbol/${encodeURIComponent(symbol)}`);
  return parseCompanyProfile(html);
}

// Scrape profiles for the given symbols, skipping fresh rows unless `force`.
// Returns { updated, skipped, failed, results }.
async function scrapeCompanies(symbols, { force = false, maxAgeMs = 30 * 24 * 60 * 60 * 1000, onProgress = null } = {}) {
  const existing = await require('./db').getAllCompanies();
  const results = {};
  let updated = 0, skipped = 0, failed = 0;
  const list = [...new Set((symbols || []).filter(Boolean))];
  for (const sym of list) {
    const prev = existing[sym];
    // fetchedAt comes back from Postgres as a string (BIGINT) — coerce before
    // doing arithmetic, otherwise the TTL check silently never matches.
    const prevAge = prev && prev.fetchedAt != null ? Date.now() - Number(prev.fetchedAt) : Infinity;
    if (!force && prev && prevAge < maxAgeMs) {
      skipped++;
      if (onProgress) onProgress(sym, 'skip');
      continue;
    }
    try {
      const { website } = await fetchCompanyProfile(sym);
      results[sym] = { name: (prev && prev.name) || null, website: website || null, source: website ? 'mse-symbol-page' : 'none' };
      updated++;
      if (onProgress) onProgress(sym, website ? 'ok' : 'none');
    } catch (e) {
      failed++;
      log.warn(`companies ${sym}: ${e.message}`);
      if (onProgress) onProgress(sym, 'fail');
    }
    await new Promise((r) => setTimeout(r, PROFILE_DELAY_MS));
  }
  if (Object.keys(results).length) await require('./db').upsertCompanies(results);
  log.info(`companies scrape: ${updated} updated, ${skipped} fresh, ${failed} failed (of ${list.length})`);
  return { updated, skipped, failed, results };
}

module.exports = { parseCompanyProfile, fetchCompanyProfile, scrapeCompanies, normalizeWebsite, hostOf };
