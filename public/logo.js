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

  // icon(symbol, name, site, size) -> span.co-logo markup
  function icon(symbol, name, site, size) {
    const sym = String(symbol || '');
    const px = size || 22;
    const host = hostOf(site);
    if (!host) {
      return '<span class="co-logo co-logo-plain" aria-hidden="true">'
        + '<span class="co-logo-mono" style="' + monoStyle(sym, name, px) + '">' + esc(monogram(sym, name)) + '</span>'
        + '</span>';
    }
    const src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
    return '<span class="co-logo" aria-hidden="true">'
      + '<img src="' + src + '" width="' + px + '" height="' + px + '" alt="" loading="lazy" referrerpolicy="no-referrer"'
      + " onerror=\"this.style.display='none';this.nextElementSibling.style.display='inline-flex'\">"
      + '<span class="co-logo-mono" style="' + monoStyle(sym, name, px, true) + '">' + esc(monogram(sym, name)) + '</span>'
      + '</span>';
  }

  return { icon, monogram, monogramColor, hostOf, COLORS };
});
