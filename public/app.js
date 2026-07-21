const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let quotesCache = [];
let sparkCache = {};
let headerSortCol = 'value';
let headerSortDir = 'desc';

// ---- i18n ----
const I18N = {
  en: {
    market_open: '🟢 Market Open',
    market_closed: '⚪ Market Closed',
    search: 'Search ticker or company…',
    sort_volume: 'Volume',
    sort_change: 'Change %',
    sort_price: 'Price',
    sort_52w: '52 Wk Change',
    sort_symbol: 'Ticker',
    updated: 'Updated',
    th_symbol: 'Symbol',
    th_name: 'Name',
    th_price: 'Price',
    th_change: 'Change',
    th_change_pct: 'Change %',
    th_volume: 'Volume',
    th_52w_chg: '52 Wk Change %',
    th_52w_range: '52 Wk Range',
    gainers: 'Top gainers',
    losers: 'Top losers',
    active: 'Most active',
    loading: 'Loading…',
    last_price: 'Last Price',
    avg_price: 'Avg Price',
    day_range: 'Day Range',
    turnover_l: 'Turnover',
    trades: 'Trades',
    wk_high: '52w High',
    wk_low: '52w Low',
    range_1m: '1M',
    range_3m: '3M',
    range_6m: '6M',
    range_1y: '1Y',
    range_all: 'All',
    as_of: 'As of',
    eod_note: 'end-of-day data (latest trading session)',
    failed: 'Failed to load data.',
    source: 'Data scraped from mse.mk — free public end-of-day data — for educational use.',
    lang_btn: 'МК',
  },
  mk: {
    market_open: '🟢 Пазарот е отворен',
    market_closed: '⚪ Пазарот е затворен',
    search: 'Пребарај тикер или компанија…',
    sort_volume: 'Волумен',
    sort_change: 'Промена %',
    sort_price: 'Цена',
    sort_52w: '52 н Промена',
    sort_symbol: 'Тикер',
    updated: 'Ажурирано',
    th_symbol: 'Тикер',
    th_name: 'Компанија',
    th_price: 'Цена',
    th_change: 'Промена',
    th_change_pct: 'Промена %',
    th_volume: 'Волумен',
    th_52w_chg: '52 н Промена %',
    th_52w_range: '52 н Опсег',
    gainers: 'Најголеми добитници',
    losers: 'Најголеми губитници',
    active: 'Најтргувани',
    loading: 'Вчитување…',
    last_price: 'Последна цена',
    avg_price: 'Просечна цена',
    day_range: 'Дневен опсег',
    turnover_l: 'Промет',
    trades: 'Трансакции',
    wk_high: '52н Макс',
    wk_low: '52н Мин',
    range_1m: '1М',
    range_3m: '3М',
    range_6m: '6М',
    range_1y: '1Г',
    range_all: 'Сите',
    as_of: 'За',
    eod_note: 'податоци на крај на ден (последна трговска сесија)',
    failed: 'Не успеа вчитувањето на податоците.',
    source: 'Податоци преземени од mse.mk — бесплатни јавни податоци — за едукативна намена.',
    lang_btn: 'EN',
  },
};

let lang = localStorage.getItem('mse_lang') || 'en';
function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }

function applyStaticI18n() {
  const h = $('thead tr');
  $$('th', h)[0].textContent = t('th_symbol');
  $$('th', h)[1].textContent = t('th_name');
  $$('th', h)[3].textContent = t('th_price');
  $$('th', h)[4].textContent = t('th_change');
  $$('th', h)[5].textContent = t('th_change_pct');
  $$('th', h)[6].textContent = t('th_volume');
  $$('th', h)[7].textContent = t('th_52w_chg');
  $$('th', h)[8].textContent = t('th_52w_range');
  $('#search').placeholder = t('search');
  const sb = $('#sortBy');
  sb.options[0].textContent = t('sort_volume');
  sb.options[1].textContent = t('sort_change');
  sb.options[2].textContent = t('sort_price');
  sb.options[3].textContent = t('sort_52w');
  sb.options[4].textContent = t('sort_symbol');
  $('#langToggle').textContent = t('lang_btn');
  $('.foot').innerHTML = `<a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> · ${t('source')}`;
  $$('.side-title')[0].textContent = t('gainers');
  $$('.side-title')[1].textContent = t('losers');
  $$('.side-title')[2].textContent = t('active');
}

function fmt(n, dec = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtInt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US');
}
function pctClass(v) {
  if (v === null || v === undefined) return '';
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}
function pctStr(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + fmt(v) + '%';
}
function chgStr(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + fmt(v);
}
function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(lang === 'mk' ? 'mk-MK' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- MBI10 chip ----
async function loadMBI() {
  try {
    const d = await fetch('/api/indices').then((r) => r.json());
    const idx = d.MBI10;
    if (!idx) return;
    const chg = idx.changePct ?? 0;
    $('#mbiChip').innerHTML = `<a href="#" class="mbi-link" id="mbiLink">MBI10 <span class="mbi-val">${fmt(idx.value)}</span> <span class="mbi-chg ${pctClass(chg)}">${pctStr(chg)}</span></a>`;
  } catch (e) {}
}

// ---- MAIN TABLE ----
async function loadQuotes() {
  const d = await fetch('/api/quotes').then((r) => r.json());
  quotesCache = d.quotes || [];
  const ms = d.marketOpen ? t('market_open') : t('market_closed');
  const st = $('#marketStatus');
  st.textContent = ms;
  st.className = 'market-status ' + (d.marketOpen ? 'open' : 'closed');
  if (d.lastPoll) {
    $('#lastPoll').textContent = `${t('updated')} ${new Date(d.lastPoll).toLocaleTimeString()}`;
  }
  renderTable();
  renderSidebar();
}

function getFilteredQuotes() {
  const q = $('#search').value.trim().toLowerCase();
  return quotesCache.filter(
    (r) => !q || r.symbol.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q)
  );
}

function renderTable() {
  const rows = getFilteredQuotes().sort((a, b) => {
    const dir = headerSortDir;
    let cmp;
    if (headerSortCol === 'symbol') {
      cmp = a.symbol.localeCompare(b.symbol);
    } else if (headerSortCol === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '');
    } else if (headerSortCol === 'week52Min') {
      const span = (r) => ((r.week52Max || 0) - (r.week52Min || 0));
      cmp = span(a) - span(b);
    } else {
      cmp = (a[headerSortCol] || 0) - (b[headerSortCol] || 0);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  const body = $('#quotesBody');
  body.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.dataset.sym = r.symbol;
    const range = buildRangeBar(r);
    tr.innerHTML = `
      <td class="sym">${r.symbol}</td>
      <td class="comp">${r.name || ''}</td>
      <td class="spark"><canvas data-spark="${r.symbol}"></canvas></td>
      <td class="num">${fmt(r.lastPrice)}</td>
      <td class="num ${pctClass(r.dailyChange)}">${chgStr(r.dailyChange)}</td>
      <td class="num ${pctClass(r.changePct)}">${pctStr(r.changePct)}</td>
      <td class="num">${fmtInt(r.volume)}</td>
      <td class="num ${pctClass(r.week52Chg)}">${pctStr(r.week52Chg)}</td>
      <td class="wk-range">${range}</td>`;
    body.appendChild(tr);
  }
  for (const r of rows.slice(0, 40)) {
    const cv = $(`canvas[data-spark="${r.symbol}"]`);
    if (cv && !sparkCache[r.symbol]) drawSpark(cv, r.symbol);
  }
}

function buildRangeBar(r) {
  if (r.week52Min == null || r.week52Max == null || r.lastPrice == null) return '—';
  const lo = r.week52Min, hi = r.week52Max, cur = r.lastPrice;
  const pct = hi === lo ? 50 : Math.max(0, Math.min(100, ((cur - lo) / (hi - lo)) * 100));
  return `<div class="wk-range-bar">
      <div class="wk-range-fill" style="left:0;width:${pct}%;background:${cur >= lo ? 'var(--green)' : 'var(--red)'};opacity:0.25"></div>
      <div class="wk-range-pointer" style="left:calc(${pct}% - 1.5px)"></div>
    </div>
    <div class="wk-range-labels"><span>${fmt(lo, 0)}</span><span>${fmt(hi, 0)}</span></div>`;
}

async function drawSpark(canvas, symbol) {
  try {
    const d = await fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json());
    const rows = (d.rows || []).filter((x) => x.last != null);
    const data = rows.map((x) => x.last);
    const last = data[data.length - 1] || 0;
    const first = data[0] || last;
    const color = last >= first ? '#16c784' : '#ea3943';
    sparkCache[symbol] = new Chart(canvas, {
      type: 'line',
      data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 1.5, pointRadius: 0 }] },
      options: {
        responsive: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { tension: 0.3 } },
      },
    });
  } catch (e) {}
}

// ---- SIDEBAR ----
function renderSidebar() {
  renderSidePanel('gainersItems',
    quotesCache.filter((r) => r.changePct != null && r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct).slice(0, 5));
  renderSidePanel('losersItems',
    quotesCache.filter((r) => r.changePct != null && r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct).slice(0, 5));
  renderSidePanel('activeItems',
    quotesCache.filter((r) => (r.value || 0) > 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5));
}

function renderSidePanel(containerId, items) {
  const el = $(`#${containerId}`);
  el.innerHTML = '';
  for (const r of items) {
    const div = document.createElement('div');
    div.className = 'side-item';
    div.dataset.sym = r.symbol;
    div.innerHTML = `
      <div class="si-left">
        <div class="si-sym">${r.symbol}</div>
        <div class="si-name">${r.name || ''}</div>
      </div>
      <div class="si-spark"><canvas data-spark-side="${r.symbol}"></canvas></div>
      <div class="si-right">
        <div class="si-price">${fmt(r.lastPrice)}</div>
        <div class="si-chg ${pctClass(r.changePct)}">${chgStr(r.dailyChange)} (${pctStr(r.changePct)})</div>
      </div>`;
    el.appendChild(div);
  }
  for (const r of items) {
    const cv = $(`canvas[data-spark-side="${r.symbol}"]`);
    if (cv && !sparkCache['s_' + r.symbol]) drawSparkSide(cv, r.symbol, r.changePct);
  }
}

async function drawSparkSide(canvas, symbol, chgPct) {
  try {
    const d = await fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json());
    const rows = (d.rows || []).filter((x) => x.last != null);
    const data = rows.map((x) => x.last);
    const color = (chgPct != null && chgPct >= 0) ? '#16c784' : '#ea3943';
    sparkCache['s_' + symbol] = new Chart(canvas, {
      type: 'line',
      data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 1.5, pointRadius: 0 }] },
      options: {
        responsive: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { tension: 0.3 } },
      },
    });
  } catch (e) {}
}

// ---- COMPANY MODAL ----
async function openCompany(symbol) {
  const modal = $('#companyModal');
  const content = $('#companyContent');
  modal.classList.remove('hidden');
  content.innerHTML = `<div class="muted">${t('loading')}</div>`;
  try {
    const [q, h] = await Promise.all([
      fetch(`/api/quote/${symbol}`).then((r) => r.json()),
      fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json()),
    ]);
    const chg = q.changePct ?? 0;
    const chgAbs = q.dailyChange ?? 0;
    content.innerHTML = `
      <div class="company-head">
        <h2>${symbol}</h2>
        <span class="${pctClass(chg)}">${chg >= 0 ? '▲' : '▼'} ${chgStr(chgAbs)} (${pctStr(chg)})</span>
      </div>
      <div class="company-sub">${q.name || ''} ${q.isin ? '· ISIN ' + q.isin : ''}</div>
      <div class="as-of" id="asOf"></div>
      <div class="stat-grid">
        <div class="stat"><div class="k">${t('last_price')}</div><div class="v">${fmt(q.lastPrice)} MKD</div></div>
        <div class="stat"><div class="k">${t('avg_price')}</div><div class="v">${fmt(q.avgPrice)}</div></div>
        <div class="stat"><div class="k">${t('day_range')}</div><div class="v">${fmt(q.minPrice)} – ${fmt(q.maxPrice)}</div></div>
        <div class="stat"><div class="k">${t('volume')}</div><div class="v">${fmtInt(q.volume)}</div></div>
        <div class="stat"><div class="k">${t('turnover_l')}</div><div class="v">${fmtInt(q.value)} MKD</div></div>
        <div class="stat"><div class="k">${t('trades')}</div><div class="v">${fmtInt(q.trades)}</div></div>
        <div class="stat"><div class="k">${t('wk_high')}</div><div class="v">${fmt(q.week52Max)}</div></div>
        <div class="stat"><div class="k">${t('wk_low')}</div><div class="v">${fmt(q.week52Min)}</div></div>
      </div>
      <div class="chart-head">
        <div class="chart-price" id="chartPrice"></div>
        <div class="chart-chg" id="chartChg"></div>
        <div class="chart-period" id="chartPeriod"></div>
      </div>
      <div class="range-btns" id="rangeBtns">
        <button data-r="1M">${t('range_1m')}</button>
        <button data-r="3M">${t('range_3m')}</button>
        <button data-r="6M">${t('range_6m')}</button>
        <button class="active" data-r="1Y">${t('range_1y')}</button>
        <button data-r="ALL">${t('range_all')}</button>
      </div>
      <div class="chart-box" id="companyChart"></div>`;
    let chart, candleSeries, volSeries, priceLine, resizeObs, asOfSet = false;
    const draw = async (range) => {
      const hh = await fetch(`/api/history/${symbol}?range=${range}`).then((r) => r.json());
      const rows = (hh.rows || []).filter((x) => x.last != null).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      // Normalize history prices to match the live quote's current close (MSE history/quote
      // endpoints occasionally use different price scales for the same symbol).
      const histLast = rows.length ? rows[rows.length - 1].last : null;
      const factor = (histLast && q.lastPrice && histLast !== q.lastPrice) ? q.lastPrice / histLast : 1;
      const candleData = [];
      const volData = [];
      for (let i = 0; i < rows.length; i++) {
        const x = rows[i];
        const ts = Math.floor(new Date(x.date).getTime() / 1000);
        const close = (x.last != null ? x.last : 0) * factor;
        const open = (i === 0 ? close : (rows[i - 1].last != null ? rows[i - 1].last : 0) * factor);
        const high = (x.max != null ? x.max : x.last) * factor;
        const low = (x.min != null ? x.min : x.last) * factor;
        candleData.push({ time: ts, open, high, low, close });
        volData.push({ time: ts, value: x.volume || 0, color: close >= open ? 'rgba(22,199,132,0.5)' : 'rgba(234,57,67,0.5)' });
      }
      if (!chart) {
        chart = LightweightCharts.createChart($('#companyChart'), {
          width: $('#companyChart').clientWidth || 760,
          layout: { background: { color: 'transparent' }, textColor: '#8b94a7', fontSize: 11 },
          grid: { vertLines: { color: '#2a3140' }, horzLines: { color: '#2a3140' } },
          rightPriceScale: { borderColor: '#2a3140' },
          timeScale: { borderColor: '#2a3140', timeVisible: false, secondsVisible: false },
          crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#5b6478', width: 1, style: 2, labelBackgroundColor: '#f5a623' }, horzLine: { color: '#5b6478', width: 1, style: 2, labelBackgroundColor: '#f5a623' } },
          localization: { priceFormatter: (p) => fmt(p) },
          height: 360,
        });
        candleSeries = chart.addCandlestickSeries({
          upColor: '#16c784', downColor: '#ea3943', borderUpColor: '#16c784', borderDownColor: '#ea3943',
          wickUpColor: '#16c784', wickDownColor: '#ea3943', priceLineVisible: false,
        });
        volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
        volSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });
      }
      candleSeries.setData(candleData);
      volSeries.setData(volData);
      chart.timeScale().fitContent();
      if (priceLine) candleSeries.removePriceLine(priceLine);
      const lastClose = candleData.length ? candleData[candleData.length - 1].close : null;
      if (lastClose != null) {
        priceLine = candleSeries.createPriceLine({
          price: lastClose, color: '#f5a623', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true, title: '',
        });
      }
      const firstClose = candleData.length ? candleData[0].close : null;
      const chgPct = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : 0;
      $('#chartPrice').textContent = lastClose != null ? fmt(lastClose) + ' MKD' : '—';
      const chgEl = $('#chartChg');
      chgEl.textContent = `${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%`;
      chgEl.className = 'chart-chg ' + (chgPct >= 0 ? 'up' : 'down');
      const rangeLabel = { '1M': 'past month', '3M': 'past 3 months', '6M': 'past 6 months', '1Y': 'past year', 'ALL': 'all time' }[range] || range;
      $('#chartPeriod').textContent = `${rangeLabel} · ${candleData.length ? fmtDate(candleData[0].time * 1000) + ' – ' + fmtDate(candleData[candleData.length - 1].time * 1000) : ''}`;
      if (!asOfSet && candleData.length) {
        $('#asOf').textContent = `${t('as_of')} ${fmtDate(candleData[candleData.length - 1].time * 1000)} · ${t('eod_note')}`;
        asOfSet = true;
      }
    };
    await draw('1Y');
    $$('#rangeBtns button').forEach((b) =>
      b.addEventListener('click', async () => {
        $$('#rangeBtns button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        await draw(b.dataset.r);
      })
    );
    const onResize = () => { if (chart) chart.applyOptions({ width: $('#companyChart').clientWidth }); };
    window.addEventListener('resize', onResize);
    setTimeout(onResize, 0);
    const mc = $('#companyModal');
    mc.addEventListener('click', (e) => { if (e.target.id === 'companyModal' && chart) { chart.remove(); chart = null; } }, { once: true });
  } catch (e) {
    content.innerHTML = `<div class="down">${t('failed')}</div>`;
  }
}

// ---- WIRE UP ----
$('#search').addEventListener('input', () => { renderTable(); });
$('#sortBy').addEventListener('change', (e) => {
  headerSortCol = e.target.value;
  headerSortDir = 'desc';
  syncHeaderIndicators();
  renderTable();
});
$$('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (headerSortCol === col) {
      headerSortDir = headerSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      headerSortCol = col;
      headerSortDir = 'desc';
    }
    $('#sortBy').value = col;
    syncHeaderIndicators();
    renderTable();
  });
});
function syncHeaderIndicators() {
  $$('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted-asc', th.dataset.sort === headerSortCol && headerSortDir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.sort === headerSortCol && headerSortDir === 'desc');
  });
}
document.addEventListener('click', (e) => {
  const item = e.target.closest('[data-sym]');
  if (item) openCompany(item.dataset.sym);
});
$('#modalClose').addEventListener('click', () => $('#companyModal').classList.add('hidden'));
$('#companyModal').addEventListener('click', (e) => {
  if (e.target.id === 'companyModal') $('#companyModal').classList.add('hidden');
});
$('#langToggle').addEventListener('click', () => {
  lang = lang === 'en' ? 'mk' : 'en';
  localStorage.setItem('mse_lang', lang);
  applyStaticI18n();
});

$('#backfillBtn').addEventListener('click', async () => {
  const btn = $('#backfillBtn');
  btn.disabled = true;
  btn.textContent = 'Backfilling…';
  try {
    const r = await fetch('/api/backfill-all');
    const d = await r.json();
    btn.textContent = d.ok ? `Done (${d.symbolsDone} symbols)` : `Error: ${d.error}`;
  } catch (e) {
    btn.textContent = `Error: ${e.message}`;
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Backfill History'; }, 5000);
});

(async function init() {
  applyStaticI18n();
  await loadMBI();
  await loadQuotes();
  setInterval(loadQuotes, 30000);
  setInterval(loadMBI, 60000);
  // MBI10 chip click opens company modal with index chart
  $('#mbiChip').addEventListener('click', (e) => {
    e.preventDefault();
    openCompany('MBI10');
  });
})();
