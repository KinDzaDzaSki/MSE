/* MSE Berza — company logo markup (favicon + monogram fallback).
 *
 * Shared by the browser (window.CoLogo, loaded before widget.js/app.js) and by
 * the Node server (require('../public/logo.js')) so SSR rows and client-rendered
 * rows produce byte-identical markup.
 *
 * Source of truth for the `site` value is the MSE issuer profile scrape
 * (lib/companies.js) carried on each quote as `quote.site`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CoLogo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Deterministic palette — same symbol always gets the same colour.
  const COLORS = ['#4D8AF0', '#7A5CFA', '#0FA76C', '#E0A800', '#E0653F', '#12A5B8', '#C2479B', '#5B7C99'];

  function hostOf(site) {
    if (!site) return null;
    try {
      return new URL(site).host.replace(/^www\./i, '').toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function monogram(symbol, name) {
    const src = String(name || symbol || '?').trim();
    const words = src.split(/\s+/).filter(Boolean);
    const two = words.length > 1 ? (words[0][0] || '') + (words[1][0] || '') : src.slice(0, 2);
    return two.toUpperCase();
  }

  function monogramColor(symbol) {
    const s = String(symbol || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return COLORS[h % COLORS.length];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function monoStyle(sym, name, size, hidden) {
    return 'background:' + monogramColor(sym)
      + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.46) + 'px'
      + (hidden ? ';display:none' : '');
  }

  // icon(symbol, name, site, size, fav, favv) -> span.co-logo markup
  // `fav` (boolean) means a self-hosted favicon exists at /api/favicon/{SYM}.
  // `favv` is the favicon's fetched_at timestamp used as a cache-busting
  // version, so a re-crawl propagates immediately instead of waiting out the
  // browser's 24h favicon cache. The <img> falls back to Google's favicon
  // cache in the browser (host is passed for that), then to the monogram —
  // with a watchdog so a hanging third-party request can never leave a blank
  // tile (see __coLogoStep).
  function icon(symbol, name, site, size, fav, favv) {
    const sym = String(symbol || '');
    const px = size || 22;
    if (!fav) {
      return '<span class="co-logo co-logo-plain" aria-hidden="true">'
        + '<span class="co-logo-mono" style="' + monoStyle(sym, name, px) + '">' + esc(monogram(sym, name)) + '</span>'
        + '</span>';
    }
    const host = hostOf(site) || '';
    const v = Number(favv || 0);
    const src = '/api/favicon/' + encodeURIComponent(sym) + (v ? '?v=' + v : '');
    return '<span class="co-logo" aria-hidden="true">'
      + '<img src="' + src + '" width="' + px + '" height="' + px + '" alt="" loading="lazy"'
      + ' onerror="__coLogoStep(this,\'' + host + '\')">'
      + '<span class="co-logo-mono" style="' + monoStyle(sym, name, px, true) + '">' + esc(monogram(sym, name)) + '</span>'
      + '</span>';
  }

  // Browser-side favicon fallback chain with a watchdog.
// step 0: self-hosted /api/favicon/{SYM} errored -> try Google's cache (host).
// step 1: Google errored OR didn't load within 3.5s -> reveal the monogram.
// The watchdog guarantees no third-party request can leave a blank tile.
if (typeof window !== 'undefined') {
  window.__coLogoStep = function (img, host) {
    const step = img.dataset.step || '0';
    const reveal = () => {
      img.style.display = 'none';
      const mono = img.nextElementSibling;
      if (mono) mono.style.display = 'inline-flex';
    };
    if (step === '0') {
      img.dataset.step = '1';
      if (host) {
        img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
        // Only give up once the fallback has actually FAILED (complete with no
        // pixels) or after a hard 8s cap — a slow-but-loading icon must win.
        const check = (n) => setTimeout(() => {
          if (img.naturalWidth > 0) return;
          if (img.complete || n <= 1) reveal();
          else check(n - 1);
        }, 4000);
        check(2); // 4s + 4s
        return;
      }
    }
    reveal();
  };
}

return { icon, monogram, monogramColor, hostOf, COLORS };
});
