// Macro series from MakStat (Државен завод за статистика) — the four that make
// the exchange data mean something: inflation, real GDP, industrial output and
// the average net wage.
//
// Everything is normalised to one shape: a list of { p, v } periods, where `p`
// is 'YYYYMmm' for months and 'YYYYTq' for quarters, and `v` is already the
// number a person wants to read — inflation in % (not an index of 103.33),
// GDP growth in %, the wage in денари.
//
// The fetched set is cached in the `meta` row 'macro' (see db.js). There is no
// live polling: the office publishes once a month and the cron picks it up.

const db = require('./db');
const log = require('./logger');
const makstat = require('./makstat');

const SPECS = {
  cpi: {
    label: 'Инфлација',
    sub: 'Трошоци на животот, годишна промена',
    table: 'Ceni/IndeksTrosZivot/TrosociZivot/121_CeniTr_Mk_IndTroZi_ecoicop_ml.px',
    time: 'Месец',
    pins: [
      { code: 'Базен период', match: /истиот месец претходната година/ },
      { code: 'Главни COICOP групи', match: /^0 Вкупно/ },
    ],
    unit: '%',
    freq: 'M',
    decimals: 2,
    convert: (rows) => rows.map((r) => ({ p: r.p, v: round(r.v - 100, 2) })),
  },
  gdp: {
    label: 'БДП',
    sub: 'Реален раст, волуменски индекс',
    table: 'BDP/BDPTrimesecni/TrimesecniBDPsporedESS2010/125_NacSmA_Mk_01ProKv_ml.px',
    time: 'Тримесечје',
    pins: [
      { code: 'Сектор', match: /^Бруто-домашен производ/ },
      { code: 'Мерки', match: /^волуменски индекси/ },
    ],
    unit: '%',
    freq: 'Q',
    decimals: 1,
    convert: (rows) => rows.map((r) => ({ p: r.p, v: round(r.v - 100, 1) })),
  },
  ipi: {
    label: 'Индустриско производство',
    sub: 'Годишна промена на индексот',
    table: 'Industrija/Bazna2021/125_Ind_MK_indProizvBaza2021_ml.px',
    time: 'Месец',
    pins: [{ code: 'Индустриско производство според НКД Рев.2', match: /^Вкупно/ }],
    unit: '%',
    freq: 'M',
    decimals: 1,
    // The table is an index (2021 = 100), so year-on-year is computed here.
    convert: (rows) => {
      const byPeriod = new Map(rows.map((r) => [r.p, r.v]));
      const out = [];
      for (const r of rows) {
        const [y, m] = r.p.split('M');
        const prev = byPeriod.get(`${Number(y) - 1}M${m}`);
        if (prev) out.push({ p: r.p, v: round(((r.v / prev) - 1) * 100, 1) });
      }
      return out;
    },
  },
  wage: {
    label: 'Просечна нето-плата',
    sub: 'По вработен, месечно',
    table: 'PazarNaTrud/Plati/MesecnaBrutoNeto/175_PazTrud_Mk_neto_ml.px',
    time: 'Месец',
    pins: [{ code: 'Сектори', match: /^Вкупно просечна/ }],
    unit: 'MKD',
    freq: 'M',
    decimals: 0,
    convert: (rows) => rows,
  },
};

const KEEP_POINTS = 150; // 12½ years of months, 37 of quarters — plenty for a page

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// 'YYYYMmm' / 'YYYYTq' → a sortable number, for sparkline x only.
function periodIndex(p) {
  const m = /^(\d{4})M(\d{2})$/.exec(p);
  if (m) return Number(m[1]) * 12 + (Number(m[2]) - 1);
  const q = /^(\d{4})T(\d)$/.exec(p);
  if (q) return Number(q[1]) * 12 + (Number(q[2]) - 1) * 3;
  return 0;
}

function latestStats(rows, decimals) {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2] || null;
  return {
    p: last.p,
    v: last.v,
    decimals,
    chg: prev ? round(last.v - prev.v, decimals) : null,
    chgPct: prev && prev.v ? round(((last.v / prev.v) - 1) * 100, 1) : null,
    previous: prev ? { p: prev.p, v: prev.v } : null,
  };
}

async function refreshMacro() {
  const out = { updatedAt: Date.now(), source: 'Државен завод за статистика (MakStat)', series: {}, errors: [] };
  for (const [key, spec] of Object.entries(SPECS)) {
    try {
      const raw = await makstat.series(spec.table, spec.pins, spec.time);
      const rows = spec.convert(raw).slice(-KEEP_POINTS);
      if (!rows.length) throw new Error('no usable rows');
      out.series[key] = {
        key,
        label: spec.label,
        sub: spec.sub,
        unit: spec.unit,
        freq: spec.freq,
        decimals: spec.decimals,
        rows,
        latest: latestStats(rows, spec.decimals),
      };
      log.info(`macro ${key}: ${rows.length} periods, last ${rows[rows.length - 1].p}`);
    } catch (e) {
      out.errors.push(`${key}: ${e.message}`);
      log.warn(`macro ${key} failed: ${e.message}`);
    }
    await makstat.sleep(1500); // the API's rate limit is unforgiving
  }
  if (Object.keys(out.series).length) await db.setMeta('macro', out);
  return out;
}

async function getMacro() {
  return db.getMeta('macro', null);
}

// CPI price level from the year-on-year series. A yoy series carries no
// month-on-month detail, so the exact construction is
//   level[p] = level[same month last year] × (1 + yoy[p]/100)
// and the first published period is the anchor at 100. Levels are only
// comparable inside the published window (2015 →), which is all deflation
// needs — an older row simply has no CPI and stays nominal.
function cpiLevels(cpiRows) {
  const levels = new Map();
  const rows = cpiRows || [];
  for (const r of rows) {
    const [y, m] = String(r.p).split('M');
    const prev = levels.get(`${Number(y) - 1}M${m}`);
    levels.set(r.p, prev == null ? 100 : prev * (1 + r.v / 100));
  }
  const base = rows.length ? levels.get(rows[0].p) || 100 : 100;
  for (const [k, v] of levels) levels.set(k, (v / base) * 100);
  return levels;
}

module.exports = { refreshMacro, getMacro, cpiLevels, SPECS, periodIndex, round };
