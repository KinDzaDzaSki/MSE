// MakStat (PX-Web) client — Државен завод за статистика.
//
// The public page (makstat.stat.gov.mk/PXWeb/pxweb/mk/MakStat) is a JS app, so
// scraping it yields nothing. The real interface is the PX-Web API, and its
// base path is **/PXWeb/api/v1** — the documented `/api/v1` root returns 404 on
// this installation. Responses are JSON-stat2.
//
// Two behaviours worth knowing before touching this file:
//   • The server rate-limits hard: roughly five rapid calls earn a bare 429
//     with no Retry-After header. Every call is therefore spaced and backed off
//     here, and production only ever calls this from the weekly cron.
//   • Period labels mix scripts and carry footnotes — '2015М01' uses a Cyrillic
//     М while '2026M10' uses Latin, quarters read '2026Т2 2)'. normalizePeriod()
//     fixes both, otherwise month matching silently misses a decade of data.

const log = require('./logger');

const BASE = process.env.MAKSTAT_BASE || 'https://makstat.stat.gov.mk/PXWeb/api/v1/mk/MakStat';
const UA = 'Mozilla/5.0 (compatible; MSEBerza/1.0; +https://mseberza.info)';
const TIMEOUT_MS = 45000;
const META_TTL_MS = 6 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, body) {
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': UA,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });
      if (res.status === 429 || res.status === 503 || res.status === 502) {
        await sleep(6000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt === 3) break;
      await sleep(3000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error(`makstat: no response — ${url}`);
}

const metaCache = new Map();

async function variables(table, { fresh = false } = {}) {
  const hit = metaCache.get(table);
  if (!fresh && hit && Date.now() - hit.at < META_TTL_MS) return hit.vars;
  const meta = await call(`${BASE}/${table}`);
  const vars = meta.variables || [];
  metaCache.set(table, { at: Date.now(), vars });
  return vars;
}

// Resolve a pinned dimension to the code the API wants. Matching on the human
// label keeps this working when the office renumbers its categories — the codes
// are positional ('1', '2', …) and do change between table revisions.
function resolveValue(varDef, pin) {
  const values = varDef.values || [];
  const texts = varDef.valueTexts || [];
  const asRe = (m) => (m instanceof RegExp ? m : new RegExp(`^${String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  if (pin.value != null) return pin.value;
  const re = asRe(pin.match);
  for (let i = 0; i < values.length; i++) {
    if (re.test(String(texts[i] || '').trim())) return values[i];
  }
  throw new Error(`dimension '${varDef.code}': no value matching ${re}`);
}

function normalizePeriod(p) {
  return String(p)
    .replace(/[Мм]/g, 'M') // Cyrillic М in month labels
    .replace(/[Тт]/g, 'T') // Cyrillic Т in quarter labels
    .replace(/\s*\d+\)\s*$/, '') // revision footnote, e.g. "2026Т2 2)"
    .trim();
}

// One series: `pins` fix every non-time dimension, the time dimension is taken
// whole. Returns [{ p, v }] in chronological order.
async function series(table, pins = [], timeCode) {
  const vars = await variables(table);
  const timeVar = vars.find((v) => v.code === timeCode) || vars.find((v) => v.time);
  if (!timeVar) throw new Error(`table '${table}': no time variable '${timeCode}'`);

  const query = vars.map((v) => {
    if (v.code === timeVar.code) return { code: v.code, selection: { filter: 'all', values: ['*'] } };
    const pin = pins.find((p) => p.code === v.code);
    const value = pin ? resolveValue(v, pin) : (v.values || [])[0];
    return { code: v.code, selection: { filter: 'item', values: [value] } };
  });

  const data = await call(`${BASE}/${table}`, { query, response: { format: 'json-stat2' } });
  const cat = (data.dimension && data.dimension[timeVar.code] && data.dimension[timeVar.code].category) || {};
  const labels = cat.label || {};
  const index = cat.index || {};

  let order;
  if (Array.isArray(index)) order = index.map((id, i) => [id, i]);
  else order = Object.keys(index).map((id) => [id, index[id]]);
  order.sort((a, b) => a[1] - b[1]);

  const raw = data.value;
  const at = (pos) => {
    if (Array.isArray(raw)) return raw[pos];
    if (raw && typeof raw === 'object') return raw[String(pos)];
    return null;
  };

  return order
    .map(([id], pos) => {
      const v = at(pos);
      const label = labels[id] || id;
      return { p: normalizePeriod(label), v: v == null ? null : Number(v) };
    })
    .filter((r) => r.v != null && Number.isFinite(r.v));
}

async function tableMeta(table) {
  return call(`${BASE}/${table}`);
}

module.exports = { series, variables, tableMeta, normalizePeriod, BASE, sleep, log };
