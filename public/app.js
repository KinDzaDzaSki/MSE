const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let quotesCache = [];
let sparkCache = {};
let historyCache = {};    // symbol -> {rows, range}
let ratingsCache = {};    // symbol -> {score, maxScore, pct}
let headerSortCol = 'value';
let headerSortDir = 'desc';

// ---- i18n ----
const I18N = {
  en: {
      market_open: '<span class="material-symbols-outlined icon-fill" style="font-size:14px;color:var(--md-sys-color-positive)">signal_cellular_alt</span> Market Open',
      market_closed: '<span class="material-symbols-outlined" style="font-size:14px">block</span> Market Closed',
      market_closed_at: '<span class="material-symbols-outlined" style="font-size:14px">block</span> Market Closed · {time}',
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
      range_1m: '1M',
      range_3m: '3M',
      range_6m: '6M',
      range_1y: '1Y',
      range_all: 'All',
      range_52w: '52w Position',
      as_of: 'As of',
      eod_note: 'end-of-day data (latest trading session)',
      failed: 'Failed to load data.',
      source: 'Data scraped from mse.mk — free public end-of-day data — for educational use.',
      lang_btn: 'МК',
      tab_chart: 'Chart',
      tab_fin_data: 'Financial Data',
      tab_ratios: 'Financial Ratios',
      fin_no_data: 'No financial data available.',
      fin_no_ratios: 'No financial ratios available.',
      fin_note_000: '* data in 000 MKD',
      tab_analysis: 'Analysis',
      analysis_rating: 'Rating',
      analysis_technical: 'Technical Analysis',
      analysis_fundamental: 'Fundamental Analysis',
      analysis_verdict: 'Analyst Verdict',
      analysis_buy: 'BUY',
      analysis_hold: 'HOLD',
      analysis_sell: 'SELL',
      analysis_confidence: 'Confidence',
      analysis_sma50: '50-day SMA',
      analysis_sma200: '200-day SMA',
      analysis_rsi: 'RSI (14)',
      analysis_52w: '52-Week Position',
      analysis_momentum: 'Momentum',
      analysis_volume_trend: 'Volume Trend',
      analysis_pe: 'P/E Valuation',
      analysis_eps_growth: 'EPS Growth',
      analysis_revenue_growth: 'Revenue Growth',
      analysis_roe: 'ROE Trend',
      analysis_div_yield: 'Dividend Yield',
      analysis_volatility: 'Volatility',
      analysis_strength: 'Strength',
      analysis_weakness: 'Weakness',
      analysis_neutral: 'Neutral',
      analysis_overbought: 'Overbought territory',
      analysis_oversold: 'Oversold territory',
      analysis_uptrend: 'Uptrend',
      analysis_downtrend: 'Downtrend',
      analysis_signals: 'Signals',
      analysis_positive: 'Positive',
      analysis_negative: 'Negative',
      // Tooltip explanations (EN)
      tt_sma50: 'The 50-day simple moving average. Price above it = short-term uptrend. Below = short-term downtrend.',
      tt_sma200: 'The 200-day simple moving average. Price above it = long-term uptrend. Below = long-term downtrend.',
      tt_rsi: 'Relative Strength Index (14 periods). Above 70 = overbought (may fall). Below 30 = oversold (may rise). 30–70 = neutral.',
      tt_52w: 'Where the current price sits in the 52-week range. Below 25% = near yearly low. Above 75% = near yearly high.',
      tt_momentum: 'Price change over the last 20 trading days. Positive = buying pressure. Negative = selling pressure.',
      tt_volume: 'Recent avg volume vs long-term avg. Rising volume confirms trends. Falling volume signals weakening interest.',
      tt_pe: 'Price-to-Earnings ratio. Lower P/E may indicate undervaluation; higher P/E may indicate overvaluation. Context-dependent by sector.',
      tt_eps: 'Year-over-year change in Earnings Per Share. Rising EPS = improving profitability. Falling EPS = declining earnings.',
      tt_revenue: 'Year-over-year change in total revenue. Growing revenue = business expansion. Shrinking revenue = warning sign.',
      tt_roe: 'Return on Equity. Measures how effectively the company generates profit from shareholder capital. Improving = better efficiency.',
      tt_div: 'Annual dividend per share ÷ stock price. Higher yield = more income, but can also signal a falling stock price.',
      analysis_methodology: 'Methodology & Limitations',
      analysis_methodology_lines: [
        '❌ Not based on any specific financial expert or framework — no Graham, Buffett, Lynch, Dalio, or any investment bank methodology',
        '❌ Not a DCF model — no discounted cash flow, no terminal value, no WACC',
        '❌ Not sector-aware — a P/E of 20 might be cheap for pharma but expensive for a bank; this system treats them the same',
        '❌ No risk adjustment — no beta, no Sharpe ratio, no volatility weighting',
        '❌ No comparative analysis — doesn\'t compare against sector peers or the broader market (MBI10)',
      ],
    },
    mk: {
      market_open: '<span class="material-symbols-outlined icon-fill" style="font-size:14px;color:var(--md-sys-color-positive)">signal_cellular_alt</span> Пазарот е отворен',
      market_closed: '<span class="material-symbols-outlined" style="font-size:14px">block</span> Пазарот е затворен',
      market_closed_at: '<span class="material-symbols-outlined" style="font-size:14px">block</span> Пазарот е затворен · {time}',
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
      range_1m: '1М',
      range_3m: '3М',
      range_6m: '6М',
      range_1y: '1Г',
      range_all: 'Сите',
      range_52w: '52н Позиција',
      as_of: 'За',
      eod_note: 'податоци на крај на ден (последната трговска сесија)',
      failed: 'Не успеа вчитувањето на податоците.',
      source: 'Податоци преземени од mse.mk — бесплатни јавни податоци — за едукативна намена.',
      lang_btn: 'EN',
      tab_chart: 'Графикон',
      tab_fin_data: 'Податоци',
      tab_ratios: 'Показатели',
      fin_no_data: 'Нема финансиски податоци.',
      fin_no_ratios: 'Нема финансиски показатели.',
      fin_note_000: '* податоците се во 000 денари',
      tab_analysis: 'Анализа',
      analysis_rating: 'Рејтинг',
      analysis_technical: 'Техничка анализа',
      analysis_fundamental: 'Фундаментална анализа',
      analysis_verdict: 'Аналитички преглед',
      analysis_buy: 'КУПИ',
      analysis_hold: 'ДРЖИ',
      analysis_sell: 'ПРОДАЈ',
      analysis_confidence: 'Сигурност',
      analysis_sma50: '50-дневен ПП',
      analysis_sma200: '200-дневен ПП',
      analysis_rsi: 'RSI (14)',
      analysis_52w: '52-неделна позиција',
      analysis_momentum: 'Моментум',
      analysis_volume_trend: 'Тренд на волумен',
      analysis_pe: 'P/E Вреднување',
      analysis_eps_growth: 'Раст на EPS',
      analysis_revenue_growth: 'Раст на приход',
      analysis_roe: 'Тренд на ROE',
      analysis_div_yield: 'Дивидентен принос',
      analysis_volatility: 'Волатилност',
      analysis_strength: 'Предност',
      analysis_weakness: 'Слабост',
      analysis_neutral: 'Неутрално',
      analysis_overbought: 'Прекупена територија',
      analysis_oversold: 'Препродадена територија',
      analysis_uptrend: 'Растечки тренд',
      analysis_downtrend: 'Паѓачки тренд',
      analysis_signals: 'Сигнали',
      analysis_positive: 'Позитивни',
      analysis_negative: 'Негативни',
      tt_sma50: '50-дневен прост просек. Цената над него = краткорочен растечки тренд. Подолу = краткорочен пад.',
      tt_sma200: '200-дневен прост просек. Цената над него = долгорочен растечки тренд. Подолу = долгорочен пад.',
      tt_rsi: 'Индекс на релативна сила (14 периоди). Над 70 = прекупено (може да падне). Под 30 = препродадено (може да порасне). 30–70 = неутрално.',
      tt_52w: 'Каде стои цената во 52-неделниот опсег. Под 25% = близу годишно дно. Над 75% = близу годишен врв.',
      tt_momentum: 'Промена на цената во последните 20 дена. Позитивен = притисок за купување. Негативен = притисок за продавање.',
      tt_volume: 'Неодамнешен просечен волумен наспроти долгорочен. Раст на волумен ги потврдува трендовите. Пад сигнализира слабеење.',
      tt_pe: 'Однос цена/заработка. Понизок P/E = можна потценетост. Повисок = можна преценетост. Зависи од секторот.',
      tt_eps: 'Годишна промена на заработка по акција. Раст = подобрување на профитабилноста. Пад = намалување на заработката.',
      tt_revenue: 'Годишна промена на вкупниот приход. Раст = проширување на бизнисот. Пад = знак за предупредување.',
      tt_roe: 'Поврат на капиталот. Мери колку ефикасно компанијата генерира профит од капиталот. Подобрување = подобра ефикасност.',
      tt_div: 'Годишна дивиденда по акција ÷ цена на акција. Повисок принос = повеќе приход, но може да значи и пад на цената.',
      analysis_methodology: 'Методологија и ограничувања',
      analysis_methodology_lines: [
        '❌ Не се заснова на ниту еден специфичен финансиски експерт или рамка — без Graham, Buffett, Lynch, Dalio или методологија на инвестициска банка',
        '❌ Не е DCF модел — без дисконтирани парични текови, без терминална вредност, без WACC',
        '❌ Не е секторски свесен — P/E од 20 може да биде евтино за фармација, но скапо за банка; овој систем ги третира исто',
        '❌ Без прилагодување за ризик — без бета, без Sharpe ratio, без пондерирање на волатилност',
        '❌ Без компаративна анализа — не споредува со секторски колеги или поширокиот пазар (MBI10)',
      ],
    },
};

let lang = localStorage.getItem('mse_lang') || 'en';
function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }

// EN → MK translation map for financial data / ratios labels
const FIN_LABELS_MK = {
  'Total Revenue from operation Activities': 'Вкупен приход од редовни активности',
  'Operating profit': 'Оперативна добивка',
  'Net profit': 'Добивка по оданочување',
  'Equity': 'Главнина',
  'Total liabilities': 'Вкупно обврски',
  'Total assets': 'Вкупно средства',
  'Market capitalization': 'Пазарна капитализација',
  'Return on sales': 'Оперативна добивка/Приход од продажба (ROS)',
  'Net earnings per share (EPS)': 'Нето добивка по акција (EPS)',
  'Return on assets': 'Поврат на вкупните средства (ROA)',
  'Return on equity': 'Поврат на капиталот (ROE)',
  'Price to earnings': 'Коефициент цена/ добивка по акција',
  'Book value per share': 'Книговодствена вредност по акција',
  'Price to Book Value': 'Коефициент цена/книговодствена вредност по акција',
  'Dividend Per Share': 'Дивиденда по акција',
  'Dividend yield': 'Дивиденден принос',
};
function tl(label) {
  // Translate a financial label; pass-through if EN or unknown
  if (lang === 'mk' && FIN_LABELS_MK[label]) return FIN_LABELS_MK[label];
  return label;
}

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
  $('.foot').innerHTML = `<a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> · ${t('source')}`;
  $$('.side-title')[0].textContent = t('gainers');
  $$('.side-title')[1].textContent = t('losers');
  $$('.side-title')[2].textContent = t('active');
  // Financial tab labels
  const tabBtns = $$('.fin-tab');
  if (tabBtns.length >= 4) {
    tabBtns[0].textContent = t('tab_chart');
    tabBtns[1].textContent = t('tab_fin_data');
    tabBtns[2].textContent = t('tab_ratios');
    tabBtns[3].textContent = t('tab_analysis');
  }
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

// ---- batch history loader (replaces N individual sparkline API calls) ----
function redrawSparklines() {
  // Gather all canvases that need a sparkline drawn
  const all = [];
  $$('canvas[data-spark]').forEach(cv => {
    const sym = cv.dataset.spark;
    if (sym && !sparkCache[sym] && historyCache[sym]) {
      const quote = quotesCache.find(r => r.symbol === sym);
      if (quote) all.push({ cv, sym, side: false, quote });
    }
  });
  $$('canvas[data-spark-side]').forEach(cv => {
    const sym = cv.dataset.sparkSide;
    if (sym && !sparkCache['s_' + sym] && historyCache[sym]) {
      const quote = quotesCache.find(r => r.symbol === sym);
      if (quote) all.push({ cv, sym, side: true, quote });
    }
  });
  // Draw in batches of 20 per animation frame to avoid a multi-second
  // main-thread freeze (Chart.js init ~15ms per instance × 140+ rows).
  if (!all.length) return;
  let i = 0;
  function nextBatch() {
    const end = Math.min(i + 20, all.length);
    for (; i < end; i++) {
      const { cv, sym, side, quote } = all[i];
      if (side) drawSparkSide(cv, sym, quote.changePct);
      else drawSpark(cv, sym, quote.changePct);
    }
    if (i < all.length) requestAnimationFrame(nextBatch);
  }
  requestAnimationFrame(nextBatch);
}

async function loadSparkHistory() {
  // Cover every visible row (all quotes, not just first 55) so sparklines
  // can be drawn for the full list, not just the top of the page.
  const needed = new Set();
  for (const r of quotesCache) {
    if (!historyCache[r.symbol]) needed.add(r.symbol);
  }
  if (!needed.size) { redrawSparklines(); return; }
  try {
    // Split into chunks of 30 to avoid URL-length / server limits on the
    // batch endpoint.
    const syms = [...needed];
    const CHUNK = 30;
    for (let i = 0; i < syms.length; i += CHUNK) {
      const slice = syms.slice(i, i + CHUNK);
      const d = await fetch(`/api/history?symbols=${slice.join(',')}&range=1Y`).then((r) => r.json());
      for (const [sym, rows] of Object.entries(d.queries || {})) {
        historyCache[sym] = { rows, range: '1Y' };
      }
    }
    redrawSparklines(); // re-draw empty canvases now that cache is populated
  } catch (e) { /* fallback: per-symbol fetch on draw */ }
}

// ---- MBI10 chip ----
async function loadMBI() {
  try {
    const d = await fetch('/api/indices').then((r) => r.json());
    const idx = d.MBI10;
    if (!idx) return;
    const chg = idx.changePct ?? 0;
    $('#mbiChip').innerHTML = `MBI10 <span class="mbi-val">${fmt(idx.value)}</span> <span class="mbi-chg ${pctClass(chg)}">${pctStr(chg)}</span>`;
  } catch (e) {}
}

// Tracks the latest known market state so the UI knows whether it makes
// sense to refetch on the next poll. Updated from each loadQuotes() response.
let marketIsOpen = true;

// 1Y sparkline history refreshes at most once per hour while the market is
// open. Daily bars don't change meaningfully in 30s — and definitely don't
// change at all while the market is closed. The 30s quote poll still
// updates prices on the table without re-fetching history.
const HISTORY_REFRESH_MS = 60 * 60 * 1000; // 1 hour
let lastHistoryFetch = 0;
if (typeof window !== 'undefined') { window.__lastHistoryFetch = () => lastHistoryFetch; window.__setLastHistoryFetch = (t) => { lastHistoryFetch = t; }; }

// ---- MAIN TABLE ----
async function loadQuotes() {
  try {
  const d = await fetch('/api/quotes').then((r) => r.json());
  marketIsOpen = !!d.marketOpen;
  const hasData = quotesCache && quotesCache.length > 0;

  // Market closed AND we already have data: don't blow away the table
  // (which would destroy sparklines) or re-fetch spark history. Just
  // refresh the "as of" timestamp so the user knows how stale the data is.
  if (!marketIsOpen && hasData) {
    if (d.lastPoll) {
      const timeStr = new Date(d.lastPoll).toLocaleTimeString(lang === 'mk' ? 'mk-MK' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      const st = $('#marketStatus');
      st.innerHTML = t('market_closed_at').replace('{time}', timeStr);
      st.className = 'market-status closed';
      $('#lastPoll').textContent = `${t('updated')} ${new Date(d.lastPoll).toLocaleTimeString()}`;
    }
    return;
  }

  // Market open (or first load with no data yet): do the full refresh.
  quotesCache = d.quotes || [];
  if (marketIsOpen) {
    const ms = t('market_open');
    const st = $('#marketStatus');
    st.innerHTML = ms;
    st.className = 'market-status open';
  } else {
    const st = $('#marketStatus');
    if (d.lastPoll) {
      const timeStr = new Date(d.lastPoll).toLocaleTimeString(lang === 'mk' ? 'mk-MK' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      st.innerHTML = t('market_closed_at').replace('{time}', timeStr);
    } else {
      st.innerHTML = t('market_closed');
    }
    st.className = 'market-status closed';
  }
  if (d.lastPoll) {
    $('#lastPoll').textContent = `${t('updated')} ${new Date(d.lastPoll).toLocaleTimeString()}`;
  }
  renderTable();
  renderSidebar();
  // Sparkline history refreshes at most once per hour. Always load so the
  // user sees sparklines regardless of market state — historical data is
  // available even when the market is closed (it's just not changing).
  const now = Date.now();
  if ((now - lastHistoryFetch) >= HISTORY_REFRESH_MS) {
    lastHistoryFetch = now;
    loadSparkHistory();
  }
  } catch (e) {
    console.error('loadQuotes failed:', e);
    const body = $('#quotesBody');
    if (body) body.innerHTML = `<tr><td colspan="9" class="muted" style="padding:20px;text-align:center">Failed to load data: ${e.message}</td></tr>`;
  }
}

// Schedule the next poll only if the market is currently open; otherwise
// wait until the next regular interval to re-check. This avoids 30s of
// pointless work between market close and the next open.
function scheduleNextPoll() {
  const interval = marketIsOpen ? 30000 : 60000; // slower checks while closed
  setTimeout(async () => {
    await loadQuotes();
    scheduleNextPoll();
  }, interval);
}

function getFilteredQuotes() {
  const q = $('#search').value.trim().toLowerCase();
  return quotesCache.filter(
    (r) => !q || r.symbol.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q)
  );
}

// Rating from backend (single source of truth). Falls back to quick calc if not yet loaded.
function getRating(sym) {
  const cached = ratingsCache[sym];
  if (cached) {
    if (cached.pct >= 65) return { label: t('analysis_buy'), cls: 'badge-buy', val: cached.score };
    if (cached.pct >= 40) return { label: t('analysis_hold'), cls: 'badge-hold', val: cached.score };
    return { label: t('analysis_sell'), cls: 'badge-sell', val: cached.score };
  }
  // Fallback: quick rating from quote data
  const q = quotesCache.find(r => r.symbol === sym);
  if (!q) return { label: '—', cls: '', val: 0 };
  let score = 0;
  if (q.peRatio != null && q.peRatio > 0) {
    if (q.peRatio < 12) score += 2;
    else if (q.peRatio < 20) score += 1;
    else if (q.peRatio > 30) score -= 1;
  }
  if (q.dailyChange != null) {
    if (q.dailyChange > 0) score += 1;
    else if (q.lastPrice != null && q.lastPrice > 0 && q.dailyChange < -q.lastPrice * 0.02) score -= 1;
  }
  if (q.week52Chg != null) {
    if (q.week52Chg > 10) score += 1;
    else if (q.week52Chg < -10) score -= 1;
  }
  if (q.week52Max != null && q.week52Min != null && q.lastPrice != null && q.week52Max > q.week52Min) {
    const pos = (q.lastPrice - q.week52Min) / (q.week52Max - q.week52Min);
    if (pos < 0.3) score += 1;
    else if (pos > 0.85) score -= 1;
  }
  if (score >= 3) return { label: t('analysis_buy'), cls: 'badge-buy', val: score };
  if (score >= 0) return { label: t('analysis_hold'), cls: 'badge-hold', val: score };
  return { label: t('analysis_sell'), cls: 'badge-sell', val: score };
}

async function loadRatings() {
  try {
    const d = await fetch('/api/ratings').then(r => r.json());
    ratingsCache = d.ratings || {};
  } catch (e) { /* ratings will fall back to local calc */ }
}

function renderTable() {
  try {
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
  if (!body) { console.error('quotesBody not found'); return; }
  body.innerHTML = '';
  // Wipe sparkCache — previous Chart.js instances are bound to the now-removed
  // canvases. Without this, redrawSparklines sees truthy cache entries and
  // skips drawing the freshly-created empty canvases.
  sparkCache = {};
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
    if (cv && !sparkCache[r.symbol] && historyCache[r.symbol]) {
      drawSpark(cv, r.symbol, r.changePct);
    }
  }
  // Deferred draw for remaining rows (beyond 40) — avoids 100+ Chart.js
  // inits blocking the main thread on a single frame.
  if (rows.length > 40) setTimeout(redrawSparklines, 0);
  } catch (e) {
    console.error('renderTable failed:', e);
    const body = $('#quotesBody');
    if (body) body.innerHTML = `<tr><td colspan="9" class="muted" style="padding:20px;text-align:center">Render failed: ${e.message}</td></tr>`;
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

async function drawSpark(canvas, symbol, chgPct) {
  try {
    const cached = historyCache[symbol];
    let d;
    if (cached && cached.range === '1Y') {
      d = { rows: cached.rows };
    } else {
      d = await fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json());
    }
    // API returns rows newest-first; sort ascending so the chart reads
    // left=old, right=new like every other time series on screen.
    const rows = (d.rows || []).filter((x) => x.last != null)
      .slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const data = rows.map((x) => x.last);
    // Color follows daily change (the "is today up or down" question),
    // not the year-long drift. The line shape shows the drift, the
    // color shows today's direction — those are two different signals.
    const color = (chgPct != null && chgPct >= 0) ? '#16c784' : '#ea3943';
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
  // Sidebar canvases are also destroyed and recreated — wipe those cache entries.
  for (const r of items) delete sparkCache['s_' + r.symbol];
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
    const cached = historyCache[symbol];
    let d;
    if (cached && cached.range === '1Y') {
      d = { rows: cached.rows };
    } else {
      d = await fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json());
    }
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

  // Reset tab panels
  const tabBar = $('#finTabBar');
  const chartSection = $('#chartSection');
  const finDataContent = $('#finDataContent');
  const finRatiosContent = $('#finRatiosContent');
  const analysisContent = $('#analysisContent');
  chartSection.innerHTML = '';
  finDataContent.innerHTML = '';
  finRatiosContent.innerHTML = '';
  analysisContent.innerHTML = '';

  try {
    const [q, hAll, fin, mbi10h] = await Promise.all([
      fetch(`/api/quote/${symbol}`).then((r) => r.json()),
      fetch(`/api/history/${symbol}?range=ALL`).then((r) => r.json()),
      fetch(`/api/financials/${symbol}`).then((r) => r.json()),
      fetch('/api/history/MBI10?range=1Y').then((r) => r.json()),
    ]);
    // Cache full history once per modal open; range buttons slice client-side.
    const fullHistory = (hAll.rows || []).filter((x) => x.last != null).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const chg = q.changePct ?? 0;
    const chgAbs = q.dailyChange ?? 0;
    const isIndex =
      symbol === 'MBI10' ||
      q.name === 'MBI10 Index' ||
      (q.trades == null && q.volume == null && q.value == null && q.week52Max == null);

    // Render header + stats into companyContent (no chart section)
    content.innerHTML = `
      <div class="company-head">
        <h2>${symbol}</h2>
        <span class="${pctClass(chg)}">
          <span class="material-symbols-outlined icon-fill" style="font-size:20px;vertical-align:middle">${chg >= 0 ? 'trending_up' : 'trending_down'}</span>
          ${chgStr(chgAbs)} (${pctStr(chg)})</span>
      </div>
      <div class="company-sub">${q.name || ''} ${q.isin ? '· ISIN ' + q.isin : ''}</div>
      <div class="as-of" id="asOf"></div>
      ${isIndex ? '' : (() => {
        const lo = q.minPrice, hi = q.maxPrice, lo52 = q.week52Min, hi52 = q.week52Max;
        const pos = (cur, a, b) => (cur != null && a != null && b != null && b > a) ? Math.max(0, Math.min(100, ((cur - a) / (b - a)) * 100)) : null;
        const dayPct = pos(q.lastPrice, lo, hi);
        const yrPct = pos(q.lastPrice, lo52, hi52);
        const bar = (pct, lo2, hi2) => {
          if (pct == null) return '';
          return `<div class="stat-bar" aria-hidden="true"><div class="stat-bar-fill" style="left:${pct.toFixed(1)}%"></div>` +
            (lo2 != null ? `<div class="stat-bar-end stat-bar-low">${fmt(lo2, 0)}</div>` : '') +
            (hi2 != null ? `<div class="stat-bar-end stat-bar-high">${fmt(hi2, 0)}</div>` : '') +
            `</div>`;
        };
        return `
      <div class="stat-grid stat-grid-primary">
        <div class="stat">
          <div class="k">${t('last_price')}</div>
          <div class="v">${fmt(q.lastPrice)}</div>
          <div class="u">MKD</div>
        </div>
        <div class="stat">
          <div class="k">${t('avg_price')}</div>
          <div class="v">${fmt(q.avgPrice)}</div>
          <div class="u">MKD</div>
        </div>
        <div class="stat stat-with-bar">
          <div class="k">${t('day_range')}</div>
          <div class="v">${fmt(lo, 0)} – ${fmt(hi, 0)}</div>
          ${bar(dayPct)}
        </div>
        <div class="stat stat-with-bar">
          <div class="k">${t('range_52w')}</div>
          <div class="v">${yrPct == null ? '—' : yrPct.toFixed(0) + '%'}</div>
          ${bar(yrPct, lo52, hi52)}
        </div>
      </div>
      <div class="stat-grid stat-grid-secondary">
        <div class="stat"><div class="k">${t('volume')}</div><div class="v-sm">${fmtInt(q.volume)}</div></div>
        <div class="stat"><div class="k">${t('turnover_l')}</div><div class="v-sm">${fmtInt(q.value)}<span class="u-sm"> MKD</span></div></div>
        <div class="stat"><div class="k">${t('trades')}</div><div class="v-sm">${fmtInt(q.trades)}</div></div>
        <div class="stat"><div class="k">P/E</div><div class="v-sm">${q.peRatio != null ? fmt(q.peRatio) : '—'}</div></div>
      </div>`;
      })()}`;

    // Show tab bar (always visible now)
    tabBar.classList.remove('hidden');

    // Render chart into chartSection
    chartSection.innerHTML = `
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

    // Render financial tables
    const hasFinData = fin.financialData && fin.financialData.rows && fin.financialData.rows.length > 0;
    const hasRatios = fin.financialRatios && fin.financialRatios.rows && fin.financialRatios.rows.length > 0;

    if (hasFinData) {
      finDataContent.innerHTML = buildFinTable(fin.financialData, false);
    } else {
      finDataContent.innerHTML = `<div class="muted" style="padding:20px;text-align:center">${t('fin_no_data')}</div>`;
    }
    if (hasRatios) {
      finRatiosContent.innerHTML = buildFinTable(fin.financialRatios, true);
    } else {
      finRatiosContent.innerHTML = `<div class="muted" style="padding:20px;text-align:center">${t('fin_no_ratios')}</div>`;
    }

    // Render analysis (always available, no extra data needed)
    const mbi10Rows = (mbi10h.rows || []).filter((x) => x.last != null).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const analysis = buildAnalysisData(q, fullHistory, fin, mbi10Rows);
    // Override rating label with backend rating (single source of truth)
    const backendRating = getRating(symbol);
    if (backendRating && backendRating.label !== '—') {
      analysis.rating = backendRating.label;
      const clsMap = { 'badge-buy': 'up', 'badge-hold': 'neutral', 'badge-sell': 'down' };
      analysis.ratingClass = clsMap[backendRating.cls] || 'neutral';
      analysis.pct = ratingsCache[symbol] ? ratingsCache[symbol].pct : analysis.pct;
    }
    analysisContent.innerHTML = buildAnalysisHTML(analysis);

    // Hide tabs with no data
    const tabs = $$('.fin-tab');
    tabs[0].classList.remove('hidden'); // Chart always visible
    tabs[1].classList.toggle('hidden', !hasFinData);
    tabs[2].classList.toggle('hidden', !hasRatios);
    tabs[3].classList.remove('hidden'); // Analysis always visible

    // Activate Chart tab by default
    tabs.forEach(t => t.classList.remove('active'));
    tabs[0].classList.add('active');
    $$('.fin-tab-panel').forEach(p => p.classList.add('hidden'));
    $('#finTabChart').classList.remove('hidden');

    // ---- Chart logic (unchanged) ----
    let chart, candleSeries, volSeries, priceLine;
    let onResize = null;
    const draw = (range) => {
      let rows = fullHistory;
      if (range === '1M') rows = rows.slice(-22);
      else if (range === '3M') rows = rows.slice(-66);
      else if (range === '6M') rows = rows.slice(-132);
      else if (range === '1Y') rows = rows.slice(-252);
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
          layout: { background: { color: 'transparent' }, textColor: '#a0a8b5', fontSize: 11 },
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
      if (candleData.length) {
        $('#asOf').textContent = `${t('as_of')} ${fmtDate(candleData[candleData.length - 1].time * 1000)} · ${t('eod_note')}`;
      }
    };
    draw('1Y');
    $$('#rangeBtns button').forEach((b) =>
      b.addEventListener('click', () => {
        $$('#rangeBtns button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(b.dataset.r);
      })
    );
    onResize = () => { if (chart) chart.applyOptions({ width: $('#companyChart').clientWidth }); };
    window.addEventListener('resize', onResize);
    setTimeout(onResize, 0);
    modal._chart = chart;
    modal._resizeHandler = onResize;
  } catch (e) {
    content.innerHTML = `<div class="down">${t('failed')}</div>`;
  }
}

function buildFinTable(data, isRatios) {
  const years = data.years || [];
  const rows = data.rows || [];
  if (!rows.length) return '';
  // Number format: en uses commas, mk uses periods as thousands separator
  const fmtNum = (v) => lang === 'mk' ? v.replace(/,/g, '.') : v;
  let html = '<table class="fin-table">';
  html += '<thead><tr><th></th>';
  for (const y of years) html += `<th class="num">${y}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    html += `<td class="fin-label">${tl(row[0])}</td>`;
    for (let i = 1; i < row.length; i++) {
      const val = row[i] || '—';
      const isPct = typeof val === 'string' && val.includes('%');
      const isNum = /^[\d.,]+$/.test(val.replace('%', ''));
      const cls = isNum ? 'num' : '';
      html += `<td class="${cls}">${isNum ? fmtNum(val) : val}</td>`;
    }
    // Fill missing cells if years > row values
    for (let i = row.length; i <= years.length; i++) {
      html += '<td class="num">—</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (!isRatios) {
    html += `<div class="fin-note">${t('fin_note_000')}</div>`;
  }
  return html;
}

// ---- ANALYSIS ENGINE ----
// Parses a number string (e.g. "1,254.61", "10.64%") to a float
function pNum(s) {
  if (s == null) return null;
  const clean = String(s).replace(/,/g, '').replace('%', '');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function buildAnalysisData(quote, fullHistory, fin, mbi10Rows) {
  const price = quote.lastPrice;
  const closes = fullHistory.filter(r => r.last != null).map(r => r.last);
  const volumes = fullHistory.filter(r => r.volume != null).map(r => r.volume);
  const n = closes.length;

  const signals = { positive: 0, negative: 0, total: 0 };
  const details = [];

  const addSig = (label, bullish) => {
    signals.total++;
    if (bullish) signals.positive++;
    else signals.negative++;
    return bullish;
  };

  const fd = fin.financialData;
  const fr = fin.financialRatios;

  // ---- MARKET COMPARISON (from quotesCache) ----
  let mktPEs = [], mktROEs = [], mktPBVs = [];
  for (const r of quotesCache) {
    if (r.peRatio != null && r.peRatio > 0) mktPEs.push(r.peRatio);
    // For ROE and PBV we need the ratios data — collect from cached financials if available
  }
  const avgMktPE = mktPEs.length ? mktPEs.reduce((a, b) => a + b, 0) / mktPEs.length : 15;

  // ---- TECHNICAL ----
  // SMA-50 / SMA-200
  let sma50 = null, sma200 = null;
  if (n >= 50) {
    sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    addSig(t('analysis_sma50'), price > sma50);
    details.push({ label: t('analysis_sma50'), val: sma50.toFixed(2), signal: price > sma50 ? t('analysis_uptrend') : t('analysis_downtrend'), up: price > sma50, ttKey: 'tt_sma50' });
  }
  if (n >= 200) {
    sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
    addSig(t('analysis_sma200'), price > sma200);
    details.push({ label: t('analysis_sma200'), val: sma200.toFixed(2), signal: price > sma200 ? t('analysis_uptrend') : t('analysis_downtrend'), up: price > sma200, ttKey: 'tt_sma200' });
  } else if (n >= 100) {
    const sma100 = closes.slice(-100).reduce((a, b) => a + b, 0) / 100;
    addSig(t('analysis_sma200'), price > sma100);
    details.push({ label: t('analysis_sma200'), val: sma100.toFixed(2), signal: price > sma100 ? t('analysis_uptrend') : t('analysis_downtrend'), up: price > sma100, ttKey: 'tt_sma200' });
  }

  // RSI-14
  let rsi = null;
  if (n >= 15) {
    const changes = [];
    for (let i = closes.length - 14; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
    const losses = changes.filter(c => c < 0).reduce((a, b) => a - b, 0) / 14;
    if (losses === 0) rsi = 100;
    else rsi = 100 - (100 / (1 + gains / losses));
    addSig(t('analysis_rsi'), rsi < 70 && rsi > 30);
    const rsiSignal = rsi > 70 ? t('analysis_overbought') : rsi < 30 ? t('analysis_oversold') : t('analysis_neutral');
    details.push({ label: t('analysis_rsi'), val: rsi.toFixed(1), signal: rsiSignal, up: rsi < 70 && rsi > 30, ttKey: 'tt_rsi' });
  }

  // 52-week position
  const hi52 = quote.week52Max, lo52 = quote.week52Min;
  let wkPos = null;
  if (hi52 && lo52 && hi52 > lo52) {
    wkPos = ((price - lo52) / (hi52 - lo52)) * 100;
    addSig(t('analysis_52w'), wkPos >= 25 && wkPos <= 75);
    const wkSignal = wkPos > 75 ? t('analysis_overbought') : wkPos < 25 ? t('analysis_oversold') : t('analysis_neutral');
    details.push({ label: t('analysis_52w'), val: wkPos.toFixed(0) + '%', signal: wkSignal, up: wkPos >= 25 && wkPos <= 75, ttKey: 'tt_52w' });
  }

  // Momentum (last 20 days)
  if (n >= 21) {
    const mom20 = ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
    addSig(t('analysis_momentum'), mom20 > 0);
    details.push({ label: t('analysis_momentum'), val: (mom20 >= 0 ? '+' : '') + mom20.toFixed(1) + '%', signal: mom20 > 0 ? t('analysis_positive') : t('analysis_negative'), up: mom20 > 0, ttKey: 'tt_momentum' });
  }

  // Volume trend
  if (volumes.length >= 100) {
    const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const avgVol100 = volumes.slice(-100).reduce((a, b) => a + b, 0) / 100;
    const volRatio = avgVol20 / avgVol100;
    addSig(t('analysis_volume_trend'), volRatio > 1.2 || (volRatio > 0.8 && quote.dailyChange > 0));
    details.push({ label: t('analysis_volume_trend'), val: (volRatio > 1 ? '+' : '') + ((volRatio - 1) * 100).toFixed(0) + '%', signal: volRatio > 1 ? t('analysis_positive') : t('analysis_negative'), up: volRatio > 1, ttKey: 'tt_volume' });
  }

  // ---- FUNDAMENTAL ----
  // P/E (sector-relative: compare to market average P/E)
  if (quote.peRatio != null && quote.peRatio > 0) {
    const pe = quote.peRatio;
    const belowMkt = pe < avgMktPE;
    addSig('P/E vs Пазар', belowMkt);
    details.push({ label: 'P/E vs Пазар', val: pe.toFixed(1) + ' / ø' + avgMktPE.toFixed(1), signal: belowMkt ? 'Поевтино' : 'Поскапо', up: belowMkt, ttKey: 'tt_pe' });
  }

  // EPS growth
  if (fr && fr.rows) {
    const epsRow = fr.rows.find(r => /eps/i.test(r[0]));
    if (epsRow && epsRow.length >= 4) {
      const eps1 = pNum(epsRow[1]), eps2 = pNum(epsRow[2]);
      if (eps1 != null && eps2 != null && eps2 > 0) {
        const epsGrowth = ((eps1 - eps2) / eps2) * 100;
        addSig(t('analysis_eps_growth'), epsGrowth > 0);
        details.push({ label: t('analysis_eps_growth'), val: (epsGrowth >= 0 ? '+' : '') + epsGrowth.toFixed(1) + '%', signal: epsGrowth > 0 ? t('analysis_positive') : t('analysis_negative'), up: epsGrowth > 0, ttKey: 'tt_eps' });
      }
    }
  }

  // Revenue growth
  if (fd && fd.rows) {
    const revRow = fd.rows.find(r => /revenue/i.test(r[0]));
    if (revRow && revRow.length >= 4) {
      const rev1 = pNum(revRow[1]), rev2 = pNum(revRow[2]), rev3 = pNum(revRow[3]);
      const grow = [];
      if (rev1 != null && rev2 != null && rev2 > 0) grow.push((rev1 - rev2) / rev2);
      if (rev2 != null && rev3 != null && rev3 > 0) grow.push((rev2 - rev3) / rev3);
      if (grow.length) {
        const avgGrowth = (grow.reduce((a, b) => a + b, 0) / grow.length) * 100;
        addSig(t('analysis_revenue_growth'), avgGrowth > 0);
        details.push({ label: t('analysis_revenue_growth'), val: (avgGrowth >= 0 ? '+' : '') + avgGrowth.toFixed(1) + '%', signal: avgGrowth > 0 ? t('analysis_positive') : t('analysis_negative'), up: avgGrowth > 0, ttKey: 'tt_revenue' });
      }
    }
  }

  // ROE vs market (Buffett: ROE > 15%)
  if (fr && fr.rows) {
    const roeRow = fr.rows.find(r => /return on equity/i.test(r[0]));
    if (roeRow && roeRow.length >= 2) {
      const roe = pNum(roeRow[1]);
      if (roe != null) {
        const roeStrong = roe > 15;
        addSig(t('analysis_roe'), roeStrong);
        details.push({ label: t('analysis_roe'), val: roe.toFixed(1) + '%', signal: roeStrong ? '>15% ✅' : '<15%', up: roeStrong, ttKey: 'tt_roe' });
      }
      // ROE trend
      if (roeRow.length >= 4) {
        const roe3 = pNum(roeRow[3]);
        if (roe3 != null && roe != null) {
          const improving = roe >= roe3;
          addSig('ROE Тренд', improving);
          details.push({ label: 'ROE Тренд', val: roe.toFixed(1) + '%', signal: improving ? t('analysis_positive') : t('analysis_negative'), up: improving, ttKey: 'tt_roe' });
        }
      }
    }
  }

  // Dividend yield
  if (fr && fr.rows) {
    const divRow = fr.rows.find(r => /dividend yield/i.test(r[0]));
    if (divRow && divRow.length >= 2) {
      const divY = pNum(divRow[1]);
      if (divY != null) {
        addSig(t('analysis_div_yield'), divY > 1.5);
        details.push({ label: t('analysis_div_yield'), val: divY.toFixed(2) + '%', signal: divY > 1.5 ? t('analysis_positive') : t('analysis_negative'), up: divY > 1.5, ttKey: 'tt_div' });
      }
    }
  }

  // ---- GRAHAM VALUE CRITERIA ----
  // Graham: P/E < 15 AND P/BV < 1.5 (or P/E × P/BV < 22.5)
  if (quote.peRatio != null && quote.peRatio > 0 && fr && fr.rows) {
    const pbvRow = fr.rows.find(r => /price to book/i.test(r[0]));
    if (pbvRow && pbvRow.length >= 2) {
      const pbv = pNum(pbvRow[1]);
      if (pbv != null && pbv > 0) {
        const grahamNum = quote.peRatio * pbv;
        const grahamOk = grahamNum < 22.5;
        addSig('Graham Number', grahamOk);
        details.push({ label: 'Graham Number', val: grahamNum.toFixed(1), signal: grahamOk ? 'P/E×P/BV<22.5' : 'P/E×P/BV>22.5', up: grahamOk, ttKey: 'tt_pe' });
      }
    }
  }

  // Debt-to-equity (financial health)
  if (fd && fd.rows) {
    const liabRow = fd.rows.find(r => /liabilities/i.test(r[0]));
    const eqRow = fd.rows.find(r => r[0].toLowerCase() === 'equity');
    if (liabRow && eqRow && liabRow.length >= 2 && eqRow.length >= 2) {
      const liab = pNum(liabRow[1]), eq = pNum(eqRow[1]);
      if (liab != null && eq != null && eq > 0) {
        const de = liab / eq;
        const deOk = de < 1.5;
        addSig('D/E Ratio', deOk);
        details.push({ label: 'D/E Ratio', val: de.toFixed(2), signal: deOk ? '<1.5 ✅' : '>1.5 ⚠️', up: deOk, ttKey: 'tt_pe' });
      }
    }
  }

  // ---- RISK METRICS (Beta & Volatility vs MBI10) ----
  if (n >= 30 && mbi10Rows && mbi10Rows.length >= 30) {
    // Align dates between stock and MBI10
    const mbi10Map = {};
    for (const r of mbi10Rows) mbi10Map[r.date] = r.last;
    const paired = [];
    for (const r of fullHistory) {
      if (r.last != null && mbi10Map[r.date] != null) {
        paired.push({ stock: r.last, mbi: mbi10Map[r.date], date: r.date });
      }
    }
    if (paired.length >= 30) {
      // Calculate daily returns for both
      const stockRet = [], mbiRet = [];
      for (let i = 1; i < paired.length; i++) {
        stockRet.push((paired[i].stock - paired[i - 1].stock) / paired[i - 1].stock);
        mbiRet.push((paired[i].mbi - paired[i - 1].mbi) / paired[i - 1].mbi);
      }
      // Volatility (annualized std dev of stock returns)
      const meanRet = stockRet.reduce((a, b) => a + b, 0) / stockRet.length;
      const variance = stockRet.reduce((a, b) => a + (b - meanRet) ** 2, 0) / stockRet.length;
      const vol = Math.sqrt(variance * 252) * 100; // annualized %
      const lowVol = vol < 40; // threshold for MSE stocks
      addSig('Volatility (год)', lowVol);
      details.push({ label: 'Volatility (год)', val: vol.toFixed(1) + '%', signal: lowVol ? 'Ниска' : 'Висока', up: lowVol, ttKey: 'tt_rsi' });

      // Beta: cov(stock, mbi) / var(mbi)
      const meanMbi = mbiRet.reduce((a, b) => a + b, 0) / mbiRet.length;
      const cov = stockRet.reduce((a, b, i) => a + (b - meanRet) * (mbiRet[i] - meanMbi), 0) / stockRet.length;
      const mbiVar = mbiRet.reduce((a, b) => a + (b - meanMbi) ** 2, 0) / mbiRet.length;
      const beta = mbiVar > 0 ? cov / mbiVar : 1;
      const betaOk = beta < 1.2; // less volatile than market or inline
      addSig('Beta (vs MBI10)', betaOk);
      details.push({ label: 'Beta (vs MBI10)', val: beta.toFixed(2), signal: beta < 1 ? '<1 (понизок)' : beta < 1.2 ? '~1 (сличен)' : '>1.2 (повисок)', up: betaOk, ttKey: 'tt_rsi' });

      // Sharpe-like ratio: annualized return / annualized volatility
      const annualRet = Math.pow(1 + stockRet.reduce((a, b) => a + b, 0), 252 / stockRet.length) - 1;
      const sharpe = vol > 0 ? (annualRet * 100) / vol : 0;
      const sharpeOk = sharpe > 0.5;
      addSig('Sharpe Ratio', sharpeOk);
      details.push({ label: 'Sharpe Ratio', val: sharpe.toFixed(2), signal: sharpeOk ? '>0.5 ✅' : '<0.5', up: sharpeOk, ttKey: 'tt_rsi' });

      // Performance vs MBI10
      const stockTotalRet = stockRet.reduce((a, b) => a + b, 0);
      const mbiTotalRet = mbiRet.reduce((a, b) => a + b, 0);
      const outperf = stockTotalRet > mbiTotalRet;
      addSig('Perf. vs MBI10', outperf);
      details.push({ label: 'Perf. vs MBI10', val: (stockTotalRet * 100).toFixed(1) + '%', signal: outperf ? 'Над MBI10' : 'Под MBI10', up: outperf, ttKey: 'tt_momentum' });
    }
  }

  // ---- SIMPLIFIED DCF / INTRINSIC VALUE ----
  if (fd && fd.rows && fr && fr.rows) {
    const npRow = fd.rows.find(r => /net profit/i.test(r[0]));
    const sharesRow = fr.rows.find(r => /eps/i.test(r[0])); // we use EPS to derive shares
    const revRow = fd.rows.find(r => /revenue/i.test(r[0]));
    if (npRow && npRow.length >= 4) {
      const np1 = pNum(npRow[1]), np2 = pNum(npRow[2]), np3 = pNum(npRow[3]);
      const profits = [np3, np2, np1].filter(n => n != null && n > 0);
      if (profits.length >= 2) {
        // Growth rate from net profit
        const gr = (profits[profits.length - 1] / profits[0]) ** (1 / (profits.length - 1)) - 1;
        const growthRate = isNaN(gr) || !isFinite(gr) ? 0.05 : Math.max(-0.2, Math.min(0.3, gr));
        // Simplified DCF: PV of 5yr growing FCF + terminal value
        const wacc = 0.10; // 10% discount rate
        const termGrowth = 0.02; // 2% terminal growth
        let pv = 0;
        let fcf = profits[profits.length - 1] * 1000; // scale (data in 000 MKD)
        for (let yr = 1; yr <= 5; yr++) {
          fcf *= (1 + growthRate);
          pv += fcf / Math.pow(1 + wacc, yr);
        }
        const terminal = fcf * (1 + termGrowth) / (wacc - termGrowth);
        pv += terminal / Math.pow(1 + wacc, 5);
        // Intrinsic value per share
        const mcap = quote.marketCap != null ? quote.marketCap * 1000 : (quote.lastPrice * (quote.totalShares || 1));
        const sharesOut = quote.totalShares || 1;
        const intrinsicPerShare = mcap > 0 && sharesOut > 0 ? pv / sharesOut : 0;
        const undervalued = intrinsicPerShare > 0 && price > 0 && price < intrinsicPerShare * 0.85;
        if (intrinsicPerShare > 0 && price > 0) {
          addSig('DCF Intrinsic Value', undervalued);
          details.push({ label: 'DCF Intrinsic Value', val: fmt(intrinsicPerShare) + ' MKD', signal: undervalued ? 'Потценета' : (price < intrinsicPerShare ? 'Блиску' : 'Преценета'), up: undervalued, ttKey: 'tt_pe' });
        }
      }
    }
  }

  // ---- RATING ----
  const score = signals.positive;
  const maxScore = signals.total;
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 50;

  let rating, ratingClass;
  if (pct >= 65) { rating = t('analysis_buy'); ratingClass = 'up'; }
  else if (pct >= 40) { rating = t('analysis_hold'); ratingClass = 'neutral'; }
  else { rating = t('analysis_sell'); ratingClass = 'down'; }

  // ---- ANALYST VERDICT ----
  const strengthPoints = details.filter(d => d.up).length;
  const weakPoints = details.filter(d => !d.up).length;
  let commentary = '';

  if (strengthPoints > weakPoints * 1.5) {
    commentary = lang === 'mk'
      ? `Акцијата покажува силни фундаментални и технички показатели. `
      : `The stock shows strong fundamental and technical indicators. `;
  } else if (strengthPoints >= weakPoints) {
    commentary = lang === 'mk'
      ? `Акцијата покажува мешани сигнали со благ позитивен наклон. `
      : `The stock shows mixed signals with a slight positive bias. `;
  } else {
    commentary = lang === 'mk'
      ? `Акцијата покажува претежно негативни сигнали. `
      : `The stock shows predominantly negative signals. `;
  }

  if (details.length > 0) {
    const strongest = details.filter(d => d.up).slice(0, 3);
    const weakest = details.filter(d => !d.up).slice(0, 3);
    if (lang === 'mk') {
      if (strongest.length) commentary += `Предности: ${strongest.map(d => d.label).join(', ')}. `;
      if (weakest.length) commentary += `Слабости: ${weakest.map(d => d.label).join(', ')}. `;
      commentary += `Рејтингот се заснова на ${maxScore} фактори вклучувајќи технички, фундаментални, компаративни и ризик показатели.`;
    } else {
      if (strongest.length) commentary += `Strengths: ${strongest.map(d => d.label).join(', ')}. `;
      if (weakest.length) commentary += `Weaknesses: ${weakest.map(d => d.label).join(', ')}. `;
      commentary += `Rating based on ${maxScore} factors including technical, fundamental, comparative, and risk metrics.`;
    }
  }

  return { rating, ratingClass, pct, score, maxScore, details, commentary };
}

function buildAnalysisHTML(analysis) {
  if (!analysis || !analysis.details || !analysis.details.length) {
    return '<div class="muted" style="padding:20px;text-align:center">' + t('fin_no_data') + '</div>';
  }
  var rating = analysis.rating, ratingClass = analysis.ratingClass, pct = analysis.pct;
  var score = analysis.score, maxScore = analysis.maxScore, details = analysis.details;
  var commentary = analysis.commentary;

  var strengths = details.filter(function(d) { return d.up; });
  var weaknesses = details.filter(function(d) { return !d.up; });

  var html = '';

  // Rating banner
  html += '<div class="analysis-banner ' + ratingClass + '">';
  html += '<div class="analysis-rating">' + t('analysis_rating') + ': <strong>' + rating + '</strong></div>';
  html += '<div class="analysis-pct">' + pct.toFixed(0) + '% ' + t('analysis_confidence') + '</div>';
  html += '<div class="analysis-bar"><div class="analysis-bar-fill ' + ratingClass + '" style="width:' + pct + '%"></div></div>';
  html += '<div class="analysis-score">' + score + '/' + maxScore + ' ' + t('analysis_signals').toLowerCase() + '</div>';
  html += '</div>';

  // Two-column grid
  html += '<div class="analysis-grid">';

  // Signals detail card
  html += '<div class="analysis-card"><div class="analysis-card-title">' + t('analysis_signals') + '</div><div class="analysis-details">';
  for (var i = 0; i < details.length; i++) {
    var d = details[i];
    html += '<div class="analysis-detail">';
    html += '<span class="analysis-dot ' + (d.up ? 'up' : 'down') + '"></span>';
    html += '<span class="analysis-d-label">' + d.label;
    if (d.ttKey) html += '<span class="analysis-tt" title="' + t(d.ttKey).replace(/"/g, '&quot;') + '">i</span>';
    html += '</span>';
    html += '<span class="analysis-d-val">' + d.val + '</span>';
    html += '<span class="analysis-d-sig ' + (d.up ? 'up' : 'down') + '">' + d.signal + '</span>';
    html += '</div>';
  }
  html += '</div></div>';

  // Summary card
  html += '<div class="analysis-card"><div class="analysis-card-title">' + t('analysis_verdict') + '</div>';
  html += '<div class="analysis-verdict-text">' + commentary + '</div>';
  html += '<div class="analysis-breakdown">';
  html += '<div class="analysis-b-item"><span class="analysis-dot up"></span> ' + t('analysis_strength') + ': <strong>' + strengths.length + '</strong></div>';
  html += '<div class="analysis-b-item"><span class="analysis-dot down"></span> ' + t('analysis_weakness') + ': <strong>' + weaknesses.length + '</strong></div>';
  html += '<div class="analysis-b-item"><span class="analysis-dot" style="background:var(--md-sys-color-on-surface-variant)"></span> ' + t('analysis_neutral') + ': <strong>' + (maxScore - strengths.length - weaknesses.length) + '</strong></div>';
  html += '</div></div>';

  html += '</div>'; // close analysis-grid

  // Disclaimer
  var disc = lang === 'mk'
    ? 'Оваа анализа е генерирана врз основа на историски податоци и фундаментални показатели. Не претставува инвестициски совет.'
    : 'This analysis is generated based on historical data and fundamental indicators. It does not constitute investment advice.';
  html += '<div class="analysis-disclaimer">' + disc + '</div>';

  return html;
}
$('#finTabBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.fin-tab');
  if (!btn || btn.classList.contains('hidden')) return;
  const tab = btn.dataset.tab;
  $$('.fin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.fin-tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = tab === 'chart' ? $('#finTabChart') :
    tab === 'data' ? $('#finTabData') : tab === 'ratios' ? $('#finTabRatios') : $('#finTabAnalysis');
  if (panel) panel.classList.remove('hidden');
  // Trigger chart resize when switching back to chart tab
  if (tab === 'chart') {
    const mc = $('#companyModal');
    if (mc._chart) {
      setTimeout(() => mc._chart.applyOptions({ width: $('#companyChart').clientWidth }), 0);
    }
  }
});

// ---- WIRE UP ----
$('#search').addEventListener('input', () => { renderTable(); });
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const rows = getFilteredQuotes();
    if (rows.length) {
      const first = $$('tbody tr')[0];
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
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
function closeModal() {
  const modal = $('#companyModal');
  modal.classList.add('hidden');
  // Cleanup: remove any chart stored on the modal element
  if (modal._chart) {
    if (modal._resizeHandler) window.removeEventListener('resize', modal._resizeHandler);
    try { modal._chart.remove(); } catch (_) {}
    modal._chart = null;
    modal._resizeHandler = null;
  }
}
$('#modalClose').addEventListener('click', closeModal);
$('#companyModal').addEventListener('click', (e) => {
  if (e.target.id === 'companyModal') closeModal();
});
$('#langToggle').addEventListener('click', () => {
  lang = lang === 'en' ? 'mk' : 'en';
  localStorage.setItem('mse_lang', lang);
  applyStaticI18n();
});

// ---- THEME TOGGLE ----
const THEME_KEY = 'mse_theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const icon = $('#themeIcon');
  icon.textContent = theme === 'light' ? 'light_mode' : 'dark_mode';
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
$('#themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

(async function init() {
  applyStaticI18n();
  await loadMBI();
  await Promise.all([loadQuotes(), loadRatings()]);
  // Market-aware scheduler: polls fast when open, slow when closed, no
  // table re-render or sparkline rebuild when there's nothing new to show.
  scheduleNextPoll();
  scheduleNextMBIPoll();
  // MBI10 chip click opens company modal with index chart
  $('#mbiChip').addEventListener('click', () => {
    openCompany('MBI10');
  });
})();

// Dedicated scheduler for the MBI10 chip — slower cadence is fine since
// the chip is just a price+change indicator on the navbar.
function scheduleNextMBIPoll() {
  setTimeout(async () => {
    await loadMBI();
    scheduleNextMBIPoll();
  }, 60000);
}

// Expose internals on window for test harnesses / debugging.
// These are no-ops in production since nothing reads them.
if (typeof window !== 'undefined') {
  window.__loadQuotes = loadQuotes;
  window.__loadSparkHistory = loadSparkHistory;
  window.__marketIsOpen = () => marketIsOpen;
}
