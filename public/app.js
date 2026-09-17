const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Lightweight-charts is loaded on first modal open (only ~10% of visitors
// ever open a company chart) — keeps the initial page ~200KB lighter.
let lwcPromise = null;
function loadLWC() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (lwcPromise) return lwcPromise;
  lwcPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
    s.async = true;
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = () => { lwcPromise = null; reject(new Error('lightweight-charts failed to load')); };
    document.head.appendChild(s);
  });
  return lwcPromise;
}
// Escape scraped strings (company names, labels) before innerHTML injection.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let quotesCache = [];
let sparkCache = {};
let historyCache = {};    // symbol -> {rows, range}
let headerSortCol = 'value';
let headerSortDir = 'desc';

// ---- View: Liquid (default) vs All ----
// Server flags each quote: liq (data-driven liquidity), primary (issuer
// series dedup). Secondary series are hidden in BOTH views; Liquid shows
// only q.liq names. The dashboard always OPENS on Liquid — a previous session's
// toggle is intentionally not restored, so every visit starts on the same view.
let view = 'liquid';
function isPrimary(q) { return q && q.primary !== false; }
function inView(q) { return view === 'all' ? true : q.liq === true; }
function setView(v) {
  view = v;
  localStorage.setItem('mse_view', v);
  const bl = $('#btnLiquid'), ba = $('#btnAll');
  if (bl) bl.classList.toggle('active', v === 'liquid');
  if (ba) ba.classList.toggle('active', v === 'all');
  renderTable();
  if (dividendsCache) renderDivTable();
}

// ---- Watchlist (localStorage, no login) ----
let watchlist = [];
try {
  const parsed = JSON.parse(localStorage.getItem('mse_watchlist') || '[]');
  if (Array.isArray(parsed)) watchlist = parsed.filter((s) => typeof s === 'string');
} catch (_) { watchlist = []; }
function saveWatchlist() { localStorage.setItem('mse_watchlist', JSON.stringify(watchlist)); }
function isWatched(sym) { return watchlist.includes(sym); }
function toggleWatch(sym) {
  const i = watchlist.indexOf(sym);
  if (i >= 0) watchlist.splice(i, 1);
  else watchlist.push(sym);
  saveWatchlist();
  refreshStars();
  renderWatchStrip();
}
// Update every rendered star button (table rows + modal header) in place —
// avoids a full table re-render (and sparkline rebuild) on each toggle.
function refreshStars() {
  $$('[data-star]').forEach((btn) => {
    const on = isWatched(btn.dataset.star);
    btn.classList.toggle('starred', on);
    btn.title = on ? t('watch_remove') : t('watch_add');
    const ic = btn.querySelector('.material-symbols-outlined');
    if (ic) ic.style.fontVariationSettings = on
      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20";
  });
}
function starBtnHTML(sym) {
  const on = isWatched(sym);
  return `<button type="button" class="star-btn${on ? ' starred' : ''}" data-star="${esc(sym)}" title="${esc(on ? t('watch_remove') : t('watch_add'))}"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' ${on ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20">star</span></button>`;
}

// Company logo (favicon + monogram fallback). `site` rides on each quote from
// the companies scrape; `fav` marks symbols with a self-hosted favicon. Rows
// without a favicon render the monogram tile immediately.
function logoHTML(sym, name, site, size = 22, fav = false) {
  if (window.W && W.companyIcon) return W.companyIcon(sym, name, site, size, fav);
  return '';
}

// ---- i18n ----
const I18N = {
  en: {
      market_open: '<span class="material-symbols-outlined icon-fill" style="font-size:14px;color:var(--md-sys-color-on-positive-container)">signal_cellular_alt</span> Market Open',
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
      volume: 'Volume',
      turnover_l: 'Turnover',
      trades: 'Trades',
      period_1m: 'past month',
      period_3m: 'past 3 months',
      period_6m: 'past 6 months',
      period_1y: 'past year',
      period_all: 'all time',
      range_1m: '1M',
      range_3m: '3M',
      range_6m: '6M',
      range_1y: '1Y',
      range_all: 'All',
      range_52w: '52w Position',
      as_of: 'As of',
      eod_note: 'end-of-day data (latest trading session)',
      failed: 'Failed to load data.',
      source: 'Data scraped from <a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> — free public end-of-day data — for educational use.',
      widgets_link: 'Widgets',
      footer_faq: 'FAQ',
      footer_about: 'About',
      footer_source: 'Data source',
      footer_method: 'Methodology',
      footer_disclaimer: 'Not investment advice.',
      lang_btn: 'МК',
      tab_chart: 'Chart',
      tab_fin_data: 'Financial Data',
      tab_ratios: 'Financial Ratios',
      fin_no_data: 'No financial data available.',
      fin_no_ratios: 'No financial ratios available.',
      fin_note_000: '* data in 000 MKD',
      tab_analysis: 'Analysis',
      analysis_pros: 'Pros — why to hold',
      analysis_cons: 'Cons — why to be cautious',
      analysis_watch: 'What to watch next',
      analysis_details: 'Details',
      view_liquid: 'Liquid',
      view_all: 'All',
      note_show_all: 'Show {n} more results from All',
      note_liquid_fallback: 'Data is updating — showing all companies for now',
      includes_series: 'Also includes series:',
      watch_title: 'Watchlist',
      watch_hint: 'Press ★ to add stocks to your watchlist',
      watch_add: 'Add to watchlist',
      watch_remove: 'Remove from watchlist',
      main_tab_quotes: 'Quotes',
      main_tab_dividends: 'Dividends',
      div_th_price: 'Price',
      div_th_dps: 'DPS {y}',
      div_th_yield: 'Yield {y}',
      div_th_trend: 'DPS trend (3y)',
      div_th_payout: 'Payout',
      div_exdate_note: 'Ex-date: follow the issuer announcements on mse.mk. Dividend data comes from the MSE financial ratios tables (latest published years).',
      div_empty: 'No dividend data yet — the financials warm-up job fills this in the background (a few minutes after deploy).',
      div_stale_note: 'Data loads progressively — only companies scraped so far are listed.',
      div_liquid_empty: 'No dividends among liquid companies.',
      div_show_all: 'Show all dividends',
      div_no_results: 'No results.',
      chart_legend: 'Green = closed above yesterday · Red = closed below yesterday',
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
      market_open: '<span class="material-symbols-outlined icon-fill" style="font-size:14px;color:var(--md-sys-color-on-positive-container)">signal_cellular_alt</span> Пазарот е отворен',
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
      volume: 'Волумен',
      turnover_l: 'Промет',
      trades: 'Трансакции',
      period_1m: 'изминат месец',
      period_3m: 'изминати 3 месеци',
      period_6m: 'изминати 6 месеци',
      period_1y: 'измината година',
      period_all: 'сето време',
      range_1m: '1М',
      range_3m: '3М',
      range_6m: '6М',
      range_1y: '1Г',
      range_all: 'Сите',
      range_52w: '52н Позиција',
      as_of: 'За',
      eod_note: 'податоци на крај на ден (последната трговска сесија)',
      failed: 'Не успеа вчитувањето на податоците.',
      source: 'Податоци преземени од <a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> — бесплатни јавни податоци — за едукативна намена.',
      widgets_link: 'Виџети',
      footer_faq: 'Прашања',
      footer_about: 'За нас',
      footer_source: 'Извор на податоци',
      footer_method: 'Методологија',
      footer_disclaimer: 'Не е инвестициски совет.',
      lang_btn: 'EN',
      tab_chart: 'Графикон',
      tab_fin_data: 'Податоци',
      tab_ratios: 'Показатели',
      fin_no_data: 'Нема финансиски податоци.',
      fin_no_ratios: 'Нема финансиски показатели.',
      fin_note_000: '* податоците се во 000 денари',
      tab_analysis: 'Анализа',
      analysis_pros: 'Предности — зошто да држиш',
      analysis_cons: 'Слабости — зошто да внимаваш',
      analysis_watch: 'Што да следиш',
      analysis_details: 'Детали',
      view_liquid: 'Ликвидни',
      view_all: 'Сите',
      note_show_all: 'Прикажи уште {n} резултати од „Сите“',
      note_liquid_fallback: 'Податоците се ажурираат — привремено се прикажани сите компании',
      includes_series: 'Вклучува и сериите:',
      watch_title: 'Листа за гледање',
      watch_hint: 'Притисни ★ за да додадеш акции во листата',
      watch_add: 'Додај во листата за гледање',
      watch_remove: 'Отстрани од листата',
      main_tab_quotes: 'Котации',
      main_tab_dividends: 'Дивиденди',
      div_th_price: 'Цена',
      div_th_dps: 'ДПС {y}',
      div_th_yield: 'Принос {y}',
      div_th_trend: 'ДПС тренд (3 год.)',
      div_th_payout: 'Исплата',
      div_exdate_note: 'Ex-date: следете ги соопштенијата на издавачот на mse.mk. Податоците за дивиденди доаѓаат од табелите со финансиски показатели (последно објавени години).',
      div_empty: 'Сè уште нема податоци за дивиденди — warm-up задачата ги пополнува во позадина (неколку минути по поставување).',
      div_stale_note: 'Податоците се пополнуваат прогресивно — прикажани се само компаниите што се веќе превземени.',
      div_liquid_empty: 'Нема дивиденди кај ликвидните компании.',
      div_show_all: 'Прикажи сите дивиденди',
      div_no_results: 'Нема резултати.',
      chart_legend: 'Зелено = затворено над вчера · Црвено = затворено под вчера',
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

// Default to Macedonian: the brand, the SSR pages and <html lang> are all MK.
// English stays one tap away via the language toggle.
let lang = localStorage.getItem('mse_lang') || 'mk';
const APP_VERSION = '2.6.5';
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
  $$('th', h)[4].textContent = t('th_change_pct');
  $$('th', h)[5].textContent = t('th_volume');
  $$('th', h)[6].textContent = t('th_52w_chg');
  $$('th', h)[7].textContent = t('th_52w_range');
  // index 2 = sparkline column (no label)
  $('#search').placeholder = t('search');
  updateToggleLabels();
  renderWatchStrip();
  $('.foot').innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;margin-right:6px;opacity:0.6">database</span>${t('source')} · <a href="/prasanja">${t('footer_faq')}</a> · <a href="/za-nas">${t('footer_about')}</a> · <a href="/izvor-na-podatoci">${t('footer_source')}</a> · <a href="/metodologija">${t('footer_method')}</a> · <a href="/widgets.html">${t('widgets_link')}</a> · ${t('footer_disclaimer')} · v${APP_VERSION}`;
  // Strip titles: target the [data-i18n] span so the leading icon survives.
  const stripTitles = [t('gainers'), t('losers'), t('active')];
  $$('.side-title [data-i18n]').forEach((el, i) => { if (stripTitles[i]) el.textContent = stripTitles[i]; });
  // Financial tab labels
  const tabBtns = $$('.fin-tab');
  if (tabBtns.length >= 4) {
    tabBtns[0].textContent = t('tab_chart');
    tabBtns[1].textContent = t('tab_fin_data');
    tabBtns[2].textContent = t('tab_ratios');
    tabBtns[3].textContent = t('tab_analysis');
  }
  // Main view tabs
  $$('#mainTabs .main-tab').forEach((b) => {
    b.textContent = b.dataset.mtab === 'quotes' ? t('main_tab_quotes') : t('main_tab_dividends');
  });
  // Dividends view re-renders with current language if data is loaded
  if (dividendsCache) {
    renderDivTable();
  } else {
    const note = $('#divNote');
    if (note) note.textContent = t('div_exdate_note');
  }
  const legend = $('#chartLegend');
  if (legend) legend.textContent = t('chart_legend');
}

// Toggle labels show live counts of the ACTIVE view — quotes companies on
// Котации, dividend payers on Дивиденди.
function updateToggleLabels() {
  const bl = $('#btnLiquid'), ba = $('#btnAll');
  if (!bl || !ba) return;
  let liqCount, allCount;
  if (mainView === 'dividends' && dividendsCache) {
    allCount = dividendsCache.length;
    liqCount = dividendsCache.filter((r) => r.liq === true).length;
  } else {
    const primaries = quotesCache.filter(isPrimary);
    allCount = primaries.length;
    liqCount = primaries.filter((q) => q.liq === true).length;
  }
  bl.textContent = `${t('view_liquid')} (${liqCount})`;
  ba.textContent = `${t('view_all')} (${allCount})`;
  bl.classList.toggle('active', view === 'liquid');
  ba.classList.toggle('active', view === 'all');
}

// Watchlist strip — always visible: label + chips inline on desktop; on
// mobile it collapses to a toggle bar (★ Листа (N) ▾) that expands the chips.
function renderWatchStrip() {
  const chipsEl = $('#watchChips');
  const toggleEl = $('#watchToggle');
  if (!chipsEl || !toggleEl) return;
  toggleEl.textContent = `★ ${t('watch_title')} (${watchlist.length}) ▾`;
  if (!watchlist.length) {
    chipsEl.innerHTML = `<span class="watch-hint">${esc(t('watch_hint'))}</span>`;
    return;
  }
  const chips = watchlist.map((sym) => {
    const q = quotesCache.find((r) => r.symbol === sym);
    if (!q) {
      return `<div class="watch-chip dim" data-sym="${esc(sym)}" title="${esc(sym)}">
        <span class="wc-sym">${esc(sym)}</span><span class="wc-price">—</span>
        <button type="button" class="wc-remove" data-unstar="${esc(sym)}" title="${esc(t('watch_remove'))}">✕</button>
      </div>`;
    }
    return `<div class="watch-chip${q.liq ? '' : ' dim'}" data-sym="${esc(sym)}">
      <span class="wc-sym">${esc(sym)}</span>
      <span class="wc-price">${fmt(q.lastPrice)}</span>
      <span class="wc-chg ${pctClass(q.changePct)}">${pctStr(q.changePct)}</span>
      <button type="button" class="wc-remove" data-unstar="${esc(sym)}" title="${esc(t('watch_remove'))}">✕</button>
    </div>`;
  }).join('');
  chipsEl.innerHTML = chips;
}

// ---- MAIN VIEW SWITCHER: Quotes | Dividends ----
let mainView = 'quotes';
function setMainView(v) {
  mainView = v;
  const qv = $('#quotesView'), dv = $('#dividendsView');
  if (qv) qv.classList.toggle('hidden', v !== 'quotes');
  if (dv) dv.classList.toggle('hidden', v !== 'dividends');
  $$('#mainTabs .main-tab').forEach((b) => b.classList.toggle('active', b.dataset.mtab === v));
  updateToggleLabels();
  if (v === 'dividends' && !dividendsCache) loadDividends();
}

// ---- DIVIDENDS VIEW ----
// Payers only, sorted by latest yield (server-side). Ignores the Liquid
// toggle (Q4-r2). Stars reuse the watchlist (Q3-r2). Headers are clickable
// to sort (asc/desc toggle, same UX as the quotes table); nulls sort last.
let dividendsCache = null;
let divSortCol = 'yield';
let divSortDir = 'desc';

function divSortVal(r, col) {
  switch (col) {
    case 'price': return r.lastPrice;
    case 'dps': return r.dps[0];
    case 'yield': return r.yield[0];
    case 'trend': return r.dps[0]; // trend sorts by the latest DPS
    case 'payout': return r.payout[0];
    default: return r.yield[0];
  }
}

function syncDivHeader() {
  $$('#divHead th').forEach((th) => {
    th.classList.toggle('sorted-asc', th.dataset.divsort === divSortCol && divSortDir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.divsort === divSortCol && divSortDir === 'desc');
  });
}

async function loadDividends() {
  const body = $('#divBody');
  if (!body) return;
  body.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">${t('loading')}</td></tr>`;
  try {
    const d = await fetch('/api/dividends').then((r) => r.json());
    dividendsCache = d.dividends || [];
  } catch (e) {
    dividendsCache = [];
  }
  renderDivTable();
}

function buildDivHead(years) {
  const y0 = years ? years[0] : null;
  const th = (label, cls, col) => `<th class="${cls || ''}"${col ? ` data-divsort="${col}"` : ''}>${esc(label)}${col ? '<span class="material-symbols-outlined sort-icon">arrow_upward</span>' : ''}</th>`;
  $('#divHead').innerHTML = [
    th(t('th_symbol'), '', 'symbol'),
    th(t('th_name'), '', 'name'),
    th(t('div_th_price'), 'num', 'price'),
    th(t('div_th_dps').replace('{y}', y0 || ''), 'num', 'dps'),
    th(t('div_th_yield').replace('{y}', y0 || ''), 'num', 'yield'),
    th(t('div_th_trend'), 'num', 'trend'),
    th(t('div_th_payout'), 'num', 'payout'),
  ].join('');
}

function renderDivTable() {
  const body = $('#divBody');
  if (!body) return;
  const all = dividendsCache || [];
  buildDivHead(all.length ? all[0].years : null);
  syncDivHeader();
  // Shared header filters (same controls as the quotes tab): Liquid/All
  // view first, then search. Payers only comes from the server.
  const query = $('#search').value.trim().toLowerCase();
  const matches = (r) => !query || r.symbol.toLowerCase().includes(query) || (r.name || '').toLowerCase().includes(query);
  let rows = all.filter((r) => (view === 'liquid' ? r.liq === true : true)).filter(matches);
  $('#divNote').textContent = t('div_exdate_note');

  if (!all.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">${esc(t('div_empty'))}</td></tr>`;
    return;
  }
  if (!rows.length) {
    // Distinguish: liquid view empty (offer show-all) vs search no-match.
    const liquidCount = all.filter((r) => r.liq === true).length;
    if (view === 'liquid' && liquidCount === 0) {
      body.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">${esc(t('div_liquid_empty'))} <a href="#" id="divShowAll">${esc(t('div_show_all'))}</a></td></tr>`;
      const link = $('#divShowAll');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); setView('all'); });
    } else {
      body.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">${esc(t('div_no_results'))}</td></tr>`;
    }
    return;
  }
  // Client-side sort; default (yield desc) reproduces the server order.
  rows.sort((a, b) => {
    let cmp;
    if (divSortCol === 'symbol') cmp = a.symbol.localeCompare(b.symbol);
    else if (divSortCol === 'name') cmp = (a.name || '').localeCompare(b.name || '');
    else {
      const va = divSortVal(a, divSortCol), vb = divSortVal(b, divSortCol);
      if (va == null && vb == null) cmp = 0;
      else if (va == null) return 1;  // nulls last regardless of direction
      else if (vb == null) return -1;
      cmp = va - vb;
    }
    return divSortDir === 'asc' ? cmp : -cmp;
  });
  const trendArrow = (dps) => {
    const cur = dps[0], prev = dps[1];
    if (cur == null || prev == null) return '';
    return cur > prev ? ' <span class="up">↑</span>' : cur < prev ? ' <span class="down">↓</span>' : ' <span class="muted">=</span>';
  };
  body.innerHTML = rows.map((r) => {
    const trend = r.dps.map((v) => (v == null ? '—' : fmt(v, 0))).join(' → ') + trendArrow(r.dps);
    const y0 = r.yield[0];
    return `<tr data-sym="${esc(r.symbol)}">
      <td class="sym"><div class="sym-inner">${starBtnHTML(r.symbol)}${logoHTML(r.symbol, r.name, r.site, 22, r.fav)}<span class="sym-text">${esc(r.symbol)}</span></div></td>
      <td class="comp">${esc(r.name || '')}</td>
      <td class="num">${fmt(r.lastPrice)}</td>
      <td class="num">${r.dps[0] != null ? fmt(r.dps[0], 0) : '—'}</td>
      <td class="num ${pctClass(y0)}">${y0 != null ? fmt(y0) + '%' : '—'}</td>
      <td class="num div-trend">${trend}</td>
      <td class="num">${r.payout[0] != null ? fmt(r.payout[0], 0) + '%' : '—'}</td>
    </tr>`;
  }).join('');
  $('#divNote').textContent = rows.length < 10
    ? `${t('div_stale_note')} ${t('div_exdate_note')}`
    : t('div_exdate_note');
  updateToggleLabels();
}

// Modal (Показатели tab): compact dividend summary above the ratios table.
function buildDividendSummary(fin) {
  const fr = fin && fin.financialRatios;
  if (!fr || !fr.rows || !fr.years) return '';
  const parse = (v) => {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/,/g, '').replace('%', '').trim());
    return isNaN(n) ? null : n;
  };
  const row = (re) => fr.rows.find((r) => re.test(r[0] || ''));
  const dpsRow = row(/dividend per share/i);
  if (!dpsRow) return '';
  const years = fr.years;
  const dps = years.map((_, i) => parse(dpsRow[i + 1]));
  if (!dps.some((v) => v != null && v > 0)) return '';
  const yldRow = row(/dividend yield/i);
  const epsRow = row(/earnings per share/i);
  const yld = yldRow ? years.map((_, i) => parse(yldRow[i + 1])) : years.map(() => null);
  const eps = epsRow ? years.map((_, i) => parse(epsRow[i + 1])) : years.map(() => null);
  const pay0 = (dps[0] != null && eps[0] != null && eps[0] > 0) ? +((dps[0] / eps[0]) * 100).toFixed(1) : null;
  const chip = (label, val) => `<div class="div-chip"><span class="k">${esc(label)}</span><span class="v">${val}</span></div>`;
  return `<div class="div-summary">
    ${chip(t('div_th_dps').replace('{y}', years[0]), dps[0] != null ? fmt(dps[0], 0) : '—')}
    ${chip(t('div_th_yield').replace('{y}', years[0]), yld[0] != null ? fmt(yld[0]) + '%' : '—')}
    ${chip(t('div_th_payout'), pay0 != null ? fmt(pay0, 0) + '%' : '—')}
    ${chip(t('div_th_trend'), dps.map((v) => (v == null ? '—' : fmt(v, 0))).join(' → '))}
  </div>`;
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
  if (lang !== 'mk') {
    return d.toLocaleDateString('en-GB', { timeZone: 'Europe/Skopje', day: '2-digit', month: 'short', year: 'numeric' });
  }
  // Deterministic Macedonian months — toLocaleDateString('mk-MK') returns
  // Latin/English month names in some browsers.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Skopje', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  const months = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
  return `${get('day')} ${months[+get('month') - 1]} ${get('year')}`;
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
    // Per-canvas marker, not a per-symbol one: the same symbol can appear in
    // two panels (e.g. a top gainer that is also the most traded).
    if (sym && !cv.dataset.drawn && historyCache[sym]) {
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

// ---- sparkline series -------------------------------------------------------
// Every active symbol's FULL 1Y closes arrive in one cached response from
// /api/sparks, whose request starts in <head> (window.__sparksP) — so by the
// time this runs it is usually already resolved. Nothing is downsampled.
let sparksLoaded = false;
async function loadSparks() {
  if (sparksLoaded) return 0;
  try {
    const p = window.__sparksP || fetch('/api/sparks').then((r) => (r.ok ? r.json() : null));
    const d = await p;
    const series = d && d.series ? d.series : null;
    if (!series) return 0;
    let n = 0;
    for (const [sym, closes] of Object.entries(series)) {
      if (Array.isArray(closes) && closes.length > 1 && !historyCache[sym]) {
        historyCache[sym] = { rows: closes.map((v) => ({ last: v })), range: 'SPARK' };
        n++;
      }
    }
    sparksLoaded = true;
    redrawSparklines();
    return n;
  } catch (e) {
    return 0;
  }
}

async function loadSparkHistory() {
  // Fallback for symbols with no series from /api/sparks (bonds, series with a
  // very short history). Normally this finds nothing left to fetch.
  const needed = new Set();
  for (const r of quotesCache) {
    if (!historyCache[r.symbol]) needed.add(r.symbol);
  }
  if (!needed.size) { redrawSparklines(); return; }
  try {
    // Chunks run in PARALLEL — they used to be sequential, which is what made
    // the fallback path slow.
    const syms = [...needed];
    const CHUNK = 30;
    const chunks = [];
    for (let i = 0; i < syms.length; i += CHUNK) chunks.push(syms.slice(i, i + CHUNK));
    const results = await Promise.all(chunks.map((slice) =>
      fetch(`/api/history?symbols=${slice.join(',')}&range=1Y`).then((r) => r.json()).catch(() => ({}))
    ));
    for (const d of results) {
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

// NBRM daily FX middle rates — refreshed once per day server-side; the chip
// just displays the cached value (ISO date → DD.MM.YYYY in the tooltip).
async function loadFX() {
  try {
    const d = await fetch('/api/fx').then((r) => r.json());
    const el = $('#fxChip');
    if (!el) return;
    if (d.eur == null || d.usd == null) return; // keep "€ — · $ —" placeholder
    el.innerHTML = `€${fmt(d.eur)} <span class="fx-usd">· $${fmt(d.usd)}</span>`;
    if (d.date) {
      const [y, m, day] = String(d.date).split('-');
      el.title = `НБРМ среден курс, ${day}.${m}.${y}`;
    }
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
      // Always display Skopje current time (not the stale lastPoll
      // timestamp — that is hours old once the market has closed and
      // no further polls fire). Data age is shown separately as
      // "Updated {lastPoll}".
      const timeStr = new Date().toLocaleTimeString(lang === 'mk' ? 'mk-MK' : 'en-GB', {
        timeZone: 'Europe/Skopje', hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const st = $('#marketStatus');
      st.innerHTML = t('market_closed_at').replace('{time}', timeStr);
      st.className = 'market-status closed';
      $('#lastPoll').textContent = `${t('updated')} ${new Date(d.lastPoll).toLocaleTimeString(lang === 'mk' ? 'mk-MK' : 'en-GB', { timeZone: 'Europe/Skopje', hour: '2-digit', minute: '2-digit', hour12: true })}`;
    }
    return;
  }

  // Market open (or first load with no data yet): do the full refresh.
  quotesCache = d.quotes || [];
  updateToggleLabels();
  renderWatchStrip();
  if (marketIsOpen) {
    const ms = t('market_open');
    const st = $('#marketStatus');
    st.innerHTML = ms;
    st.className = 'market-status open';
  } else {
    const st = $('#marketStatus');
    const timeStr = new Date().toLocaleTimeString(lang === 'mk' ? 'mk-MK' : 'en-GB', {
      timeZone: 'Europe/Skopje', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    if (d.lastPoll) {
      st.innerHTML = t('market_closed_at').replace('{time}', timeStr);
    } else {
      st.innerHTML = t('market_closed');
    }
    st.className = 'market-status closed';
  }
  if (d.lastPoll) {
    $('#lastPoll').textContent = `${t('updated')} ${new Date(d.lastPoll).toLocaleTimeString(lang === 'mk' ? 'mk-MK' : 'en-GB', { timeZone: 'Europe/Skopje', hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  renderTable();
  renderSidebar();
  // Sparkline history refreshes at most once per hour. Always load so the
  // user sees sparklines regardless of market state — historical data is
  // available even when the market is closed (it's just not changing).
  const now = Date.now();
  if ((now - lastHistoryFetch) >= HISTORY_REFRESH_MS) {
    lastHistoryFetch = now;
    // Series first (one cached request), then the fallback for stragglers.
    loadSparks().then(() => loadSparkHistory());
  }
  } catch (e) {
    console.error('loadQuotes failed:', e);
    const body = $('#quotesBody');
    if (body) body.innerHTML = `<tr><td colspan="8" class="muted" style="padding:20px;text-align:center">Failed to load data: ${esc(e.message)}</td></tr>`;
  }
}

// Schedule the next poll only if the market is currently open; otherwise
// wait until the next regular interval to re-check. This avoids 30s of
// pointless work between market close and the next open.
function scheduleNextPoll() {
  // MSE publishes once per session, so while the market is closed there is
  // nothing new to fetch — check rarely (just enough to pick up the EOD
  // publication or the next session's open), not every minute.
  const interval = marketIsOpen ? 30000 : 5 * 60 * 1000;
  setTimeout(async () => {
    // Hidden tab = nobody watching: skip the fetch, just reschedule.
    if (!document.hidden) await loadQuotes();
    scheduleNextPoll();
  }, interval);
}

function matchesQuery(r, q) {
  return !q || r.symbol.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q);
}

function getFilteredQuotes() {
  const q = $('#search').value.trim().toLowerCase();
  return quotesCache.filter((r) => isPrimary(r) && inView(r) && matchesQuery(r, q));
}

function renderTable() {
  try {
  const query = $('#search').value.trim().toLowerCase();
  const primaries = quotesCache.filter(isPrimary);
  // Stale-data fallback: server flags (liq) arrive after the first poll.
  // If Liquid view would be empty but companies exist, show all and say so.
  const liquidCount = primaries.filter((q) => q.liq === true).length;
  const effectiveView = (view === 'liquid' && liquidCount === 0 && primaries.length > 0) ? 'all' : view;
  let rows = primaries.filter((q) => effectiveView === 'all' ? true : q.liq === true)
    .filter((r) => matchesQuery(r, query));
  updateViewNote(effectiveView, rows.length, primaries, query);
  const rows2 = rows.sort((a, b) => {
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
      <td class="sym"><div class="sym-inner">${starBtnHTML(r.symbol)}${logoHTML(r.symbol, r.name, r.site, 22, r.fav)}<span class="sym-text">${esc(r.symbol)}</span></div></td>
      <td class="comp">${esc(r.name || '')}</td>
      <td class="spark"><canvas data-spark="${esc(r.symbol)}"></canvas></td>
      <td class="num">${fmt(r.lastPrice)}</td>
      <td class="num ${pctClass(r.changePct)}"><span class="chg-pill">${pctStr(r.changePct)}</span></td>
      <td class="num">${fmtInt(r.volume)}</td>
      <td class="num ${pctClass(r.week52Chg)}"><span class="chg-pill">${pctStr(r.week52Chg)}</span></td>
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
  if (rows2.length > 40) setTimeout(redrawSparklines, 0);
  } catch (e) {
    console.error('renderTable failed:', e);
    const body = $('#quotesBody');
    if (body) body.innerHTML = `<tr><td colspan="8" class="muted" style="padding:20px;text-align:center">Render failed: ${esc(e.message)}</td></tr>`;
  }
}

// Note area under the toolbar: stale-data fallback notice, or the
// "show more results from All" link when a search matches outside Liquid.
function updateViewNote(effectiveView, shown, primaries, query) {
  const note = $('#viewNote');
  if (!note) return;
  if (view === 'liquid' && effectiveView === 'all') {
    note.textContent = t('note_liquid_fallback');
    note.classList.remove('hidden');
    return;
  }
  if (view === 'liquid' && query) {
    const extra = primaries.filter((q) => q.liq !== true && matchesQuery(q, query)).length;
    if (extra > 0) {
      note.innerHTML = `<a href="#" id="showAllLink">${esc(t('note_show_all').replace('{n}', extra))}</a>`;
      note.classList.remove('hidden');
      const link = $('#showAllLink');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); setView('all'); });
      return;
    }
  }
  note.classList.add('hidden');
}

function buildRangeBar(r) {
  if (r.week52Min == null || r.week52Max == null || r.lastPrice == null) return '—';
  const lo = r.week52Min, hi = r.week52Max, cur = r.lastPrice;
  const pct = hi === lo ? 50 : Math.max(0, Math.min(100, ((cur - lo) / (hi - lo)) * 100));
  const ariaLabel = `52-week range: ${fmt(lo, 0)} – ${fmt(hi, 0)}`;
  return `<div class="wk-range-bar" role="img" aria-label="${esc(ariaLabel)}" title="${esc(ariaLabel)}">
      <div class="wk-range-fill" style="left:0;width:${pct}%;background:${cur >= lo ? 'var(--green)' : 'var(--red)'};opacity:0.25"></div>
      <div class="wk-range-pointer" style="left:calc(${pct}% - 1.5px)"></div>
    </div>
    <div class="wk-range-labels" aria-hidden="true"><span>${fmt(lo, 0)}</span><span>${fmt(hi, 0)}</span></div>`;
}

// Dependency-free sparkline (Canvas 2D) — replaces Chart.js entirely.
// Same look: 1.5px round-joined line + soft fill, colored by daily direction.
function drawSparkPath(canvas, values, color) {
  if (!canvas || !values || values.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 64, h = canvas.clientHeight || 24;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
  const px = (i) => (i / (values.length - 1)) * (w - 2) + 1;
  const py = (v) => (h - 2) - ((v - min) / span) * (h - 4) + 1;
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineTo(px(values.length - 1), h);
  ctx.lineTo(px(0), h);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();
}

function sparkValues(d) {
  return (d.rows || [])
    .filter((x) => x.last != null)
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((x) => x.last);
}

async function drawSpark(canvas, symbol, chgPct) {
  try {
    const cached = historyCache[symbol];
    const d = (cached && cached.rows && cached.rows.length)
      ? { rows: cached.rows }
      : await fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json());
    // Color follows daily change ("is today up or down"), the shape shows drift.
    const color = (chgPct != null && chgPct >= 0) ? '#16c784' : '#ea3943';
    drawSparkPath(canvas, sparkValues(d), color);
    sparkCache[symbol] = true;
  } catch (e) {}
}

// ---- SIDEBAR ----
// Sidebars are ALWAYS liquid-only (independent of the view toggle): a +20%
// move on two shares is not a "top gainer".
function renderSidebar() {
  const pool = quotesCache.filter((r) => isPrimary(r) && r.liq === true);
  renderSidePanel('gainersItems',
    pool.filter((r) => r.changePct != null && r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct).slice(0, 5));
  renderSidePanel('losersItems',
    pool.filter((r) => r.changePct != null && r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct).slice(0, 5));
  renderSidePanel('activeItems',
    pool.filter((r) => (r.value || 0) > 0)
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
        <div class="si-sym">${logoHTML(r.symbol, r.name, r.site, 22, r.fav)}<span>${esc(r.symbol)}</span></div>
        <div class="si-name">${esc(r.name || '')}</div>
      </div>
      <div class="si-spark"><canvas data-spark-side="${esc(r.symbol)}"></canvas></div>
      <div class="si-right">
        <div class="si-price">${fmt(r.lastPrice)}</div>
        <div class="si-chg ${pctClass(r.changePct)}">${chgStr(r.dailyChange)} (${pctStr(r.changePct)})</div>
      </div>`;
    el.appendChild(div);
  }
  // Draw from THIS panel's canvases only. A document-wide lookup would always
  // find the first panel's canvas, leaving the same symbol blank in the other
  // panel (e.g. ТНБ in both "Најголеми добитници" and "Најтргувани").
  // Uncached symbols are drawn later by redrawSparklines() once the batch
  // history request lands.
  for (const r of items) {
    const cv = el.querySelector(`canvas[data-spark-side="${esc(r.symbol)}"]`);
    if (cv && !cv.dataset.drawn && historyCache[r.symbol]) {
      drawSparkSide(cv, r.symbol, r.changePct);
    }
  }
}

async function drawSparkSide(canvas, symbol, chgPct) {
  try {
    const cached = historyCache[symbol];
    const d = (cached && cached.rows && cached.rows.length)
      ? { rows: cached.rows }
      : await fetch(`/api/history/${symbol}?range=1Y`).then((r) => r.json());
    const color = (chgPct != null && chgPct >= 0) ? '#16c784' : '#ea3943';
    drawSparkPath(canvas, sparkValues(d), color);
    canvas.dataset.drawn = '1';
  } catch (e) {}
}

// ---- COMPANY MODAL ----
async function openCompany(symbol) {
  const modal = $('#companyModal');
  const content = $('#companyContent');
  modal.dataset.company = symbol;
  modal.classList.remove('hidden');
  content.innerHTML = `<div class="muted">${t('loading')}</div>`;

  // Reset tab panels. The bar is hidden up-front: otherwise the previous
  // company's tabs stay on screen while this one's data loads (and an index
  // never shows tabs at all).
  const tabBar = $('#finTabBar');
  const chartSection = $('#chartSection');
  const finDataContent = $('#finDataContent');
  const finRatiosContent = $('#finRatiosContent');
  const analysisContent = $('#analysisContent');
  tabBar.classList.add('hidden');
  $$('.fin-tab-panel').forEach((p) => p.classList.add('hidden'));
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
    // Index detection must NOT guess from missing fields: an illiquid stock can
    // legitimately have null trades/volume/value. Indices are the two known
    // codes plus the segment/name the server stamps on index quotes.
    const isIndex =
      symbol === 'MBI10' ||
      symbol === 'OMB' ||
      /индекс|index/i.test(q.segment || '') ||
      /index/i.test(q.name || '');

    // Render header + stats into companyContent (no chart section)
    content.innerHTML = `
      <div class="company-head">
        <h2>${logoHTML(symbol, q.name, q.site, 30, q.fav)}${esc(symbol)}</h2>
        ${starBtnHTML(symbol)}
        <span class="${pctClass(chg)}">
          <span class="material-symbols-outlined icon-fill" style="font-size:20px;vertical-align:middle">${chg >= 0 ? 'trending_up' : 'trending_down'}</span>
          ${chgStr(chgAbs)} (${pctStr(chg)})</span>
      </div>
      <div class="company-sub">${esc(q.name || '')} ${q.isin ? '· ISIN ' + esc(q.isin) : ''}</div>
      ${q.seriesList && q.seriesList.length ? `<div class="series-note">${esc(t('includes_series'))} ${q.seriesList.map(esc).join(', ')}</div>` : ''}
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
          <div class="k" id="avgPriceLabel">${t('avg_price')}</div>
          <div class="v" id="avgPriceVal">${fmt(q.avgPrice)}</div>
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

    // Tab bar: stocks only. An index has nothing to put in Податоци/Показатели/
    // Анализа, so it gets the chart alone with no tab strip.
    tabBar.classList.toggle('hidden', isIndex);

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
      <div class="chart-box" id="companyChart"></div>
      <div class="chart-legend-note" id="chartLegend"></div>`;
    $('#chartLegend').textContent = t('chart_legend');

    // Render financial tables
    const hasFinData = fin.financialData && fin.financialData.rows && fin.financialData.rows.length > 0;
    const hasRatios = fin.financialRatios && fin.financialRatios.rows && fin.financialRatios.rows.length > 0;

    if (hasFinData) {
      finDataContent.innerHTML = buildFinTable(fin.financialData, false);
    } else {
      finDataContent.innerHTML = `<div class="muted" style="padding:20px;text-align:center">${t('fin_no_data')}</div>`;
    }
    if (hasRatios) {
      finRatiosContent.innerHTML = buildDividendSummary(fin) + buildFinTable(fin.financialRatios, true);
    } else {
      finRatiosContent.innerHTML = `<div class="muted" style="padding:20px;text-align:center">${t('fin_no_ratios')}</div>`;
    }

    // Render analysis (always available, no extra data needed)
    const mbi10Rows = (mbi10h.rows || []).filter((x) => x.last != null).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const analysis = buildAnalysisData(q, fullHistory, fin, mbi10Rows);
    analysisContent.innerHTML = buildAnalysisHTML(analysis);

    // Hide tabs with no data
    const tabs = $$('.fin-tab');
    tabs[0].classList.remove('hidden'); // Chart always visible
    tabs[1].classList.toggle('hidden', !hasFinData);
    tabs[2].classList.toggle('hidden', !hasRatios);
    tabs[3].classList.toggle('hidden', isIndex); // Analysis: stocks only (MBI10 is the market itself)

    // Activate Chart tab by default
    tabs.forEach(t => t.classList.remove('active'));
    tabs[0].classList.add('active');
    $$('.fin-tab-panel').forEach(p => p.classList.add('hidden'));
    $('#finTabChart').classList.remove('hidden');

    // ---- Chart logic: daily-direction line. Every segment is colored by
    // that day's close vs the previous close — green = closed above
    // yesterday, red = below. Same rule as the volume bars, so one legend
    // explains everything. Data is daily EOD bars (one point per session).
    let chart, volSeries, runSeries = [], priceLineHost = null, lastLine;

    // Header + period stats — rendered even when the chart lib is unavailable.
    const renderChartHeader = (range, lineData) => {
      const lastClose = lineData.length ? lineData[lineData.length - 1].value : null;
      const firstClose = lineData.length ? lineData[0].value : null;
      const chgPct = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : 0;
      $('#chartPrice').textContent = lastClose != null ? fmt(lastClose) + ' MKD' : '—';
      const chgEl = $('#chartChg');
      chgEl.textContent = `${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%`;
      chgEl.className = 'chart-chg ' + (chgPct >= 0 ? 'up' : 'down');
      // Avg Price box = mean of the charted closes for the selected period.
      const avgEl = $('#avgPriceVal'), avgLb = $('#avgPriceLabel');
      if (avgEl) {
        const avgPeriod = lineData.length ? lineData.reduce((s, p) => s + p.value, 0) / lineData.length : null;
        avgEl.textContent = avgPeriod != null ? fmt(avgPeriod) : '—';
      }
      if (avgLb) avgLb.textContent = `${t('avg_price')} · ${t('range_' + range.toLowerCase()) || range}`;
      const rangeLabel = { '1M': t('period_1m'), '3M': t('period_3m'), '6M': t('period_6m'), '1Y': t('period_1y'), 'ALL': t('period_all') }[range] || range;
      $('#chartPeriod').textContent = `${rangeLabel} · ${lineData.length ? fmtDate(lineData[0].time * 1000) + ' – ' + fmtDate(lineData[lineData.length - 1].time * 1000) : ''}`;
      if (lineData.length) {
        $('#asOf').textContent = `${t('as_of')} ${fmtDate(lineData[lineData.length - 1].time * 1000)} · ${t('eod_note')}`;
      }
    };

    const draw = (range) => {
      let rows = fullHistory;
      if (range === '1M') rows = rows.slice(-22);
      else if (range === '3M') rows = rows.slice(-66);
      else if (range === '6M') rows = rows.slice(-132);
      else if (range === '1Y') rows = rows.slice(-252);
      const histLast = rows.length ? rows[rows.length - 1].last : null;
      const factor = (histLast && q.lastPrice && histLast !== q.lastPrice) ? q.lastPrice / histLast : 1;

      const lineData = [];
      const volData = [];
      for (let i = 0; i < rows.length; i++) {
        const x = rows[i];
        const ts = Math.floor(new Date(x.date).getTime() / 1000);
        const close = (x.last != null ? x.last : 0) * factor;
        const open = (i === 0 ? close : (rows[i - 1].last != null ? rows[i - 1].last : 0) * factor);
        const prevClose = i > 0 ? rows[i - 1].last : null;
        const ref = prevClose != null ? prevClose * factor : open;
        lineData.push({ time: ts, value: close });
        volData.push({ time: ts, value: x.volume || 0, color: close >= ref ? 'rgba(22,199,132,0.5)' : 'rgba(234,57,67,0.5)' });
      }

      // Group consecutive same-direction segments into runs. Each run becomes
      // its OWN LineSeries — adjacent runs alternate colors, so a series can
      // never cross-connect through an opposite-colored segment. (Whitespace
      // does NOT break LineSeries lines in v4.1, so a two-series split is not
      // an option.)
      const upRuns = [], downRuns = [];
      let curRun = null, curDir = null;
      for (let i = 1; i < lineData.length; i++) {
        const dir = lineData[i].value >= lineData[i - 1].value ? 'up' : 'down';
        if (dir !== curDir) {
          curRun = { dir, pts: [lineData[i - 1], lineData[i]] };
          curDir = dir;
          (dir === 'up' ? upRuns : downRuns).push(curRun);
        } else {
          curRun.pts.push(lineData[i]);
        }
      }

      // Chart library unavailable (CDN blocked / offline) — still show stats.
      if (!window.LightweightCharts) {
        renderChartHeader(range, lineData);
        return;
      }

      if (!chart) {
        chart = LightweightCharts.createChart($('#companyChart'), {
          autoSize: true,
          layout: { background: { color: 'transparent' }, textColor: '#a0a8b5', fontSize: 11 },
          grid: { vertLines: { color: '#2a3140' }, horzLines: { color: '#2a3140' } },
          rightPriceScale: { borderColor: '#2a3140' },
          timeScale: { borderColor: '#2a3140', timeVisible: false, secondsVisible: false },
          crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#5b6478', width: 1, style: 2, labelBackgroundColor: '#f5a623' }, horzLine: { color: '#5b6478', width: 1, style: 2, labelBackgroundColor: '#f5a623' } },
          localization: { priceFormatter: (p) => fmt(p) },
          height: 360,
        });
        volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
        volSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });      }
      // Runs change with the selected range — rebuild the run series each draw.
      for (const s of runSeries) chart.removeSeries(s);
      runSeries.length = 0;
      const mkRun = (run) => {
        const s = chart.addLineSeries({
          color: run.dir === 'up' ? '#16c784' : '#ea3943',
          lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(run.pts);
        runSeries.push(s);
        return s;
      };
      for (const run of upRuns) mkRun(run);
      for (const run of downRuns) mkRun(run);
      // Volume only when the instrument actually trades: an index has no volume,
      // and an all-zero histogram still paints a "0.00" label on its overlay
      // price scale (the stray red 0.00 on the MBI10 chart).
      const hasVolume = rows.some((r) => r.volume != null && r.volume > 0);
      volSeries.setData(hasVolume ? volData : []);
      volSeries.applyOptions({ visible: hasVolume });
      chart.timeScale().fitContent();

      // Red dashed reference at the last close (Yahoo-style "where we ended").
      // Attach it to the LAST run so the label sits at the newest data point.
      if (lastLine && priceLineHost) priceLineHost.removePriceLine(lastLine);
      lastLine = null;
      priceLineHost = runSeries.length ? runSeries[runSeries.length - 1] : null;
      const lastClose = lineData.length ? lineData[lineData.length - 1].value : null;
      if (lastClose != null && priceLineHost) {
        lastLine = priceLineHost.createPriceLine({
          price: lastClose, color: '#ea3943', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true, title: '',
        });
      }

      // Header = performance over the selected period (first close → last).
      renderChartHeader(range, lineData);
    };
    // Chart lib is lazy-loaded on first modal open.
    await loadLWC().catch(() => null);
    draw('1Y');
    $$('#rangeBtns button').forEach((b) =>
      b.addEventListener('click', () => {
        $$('#rangeBtns button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        draw(b.dataset.r);
      })
    );
    modal._chart = chart;
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
  for (const y of years) html += `<th class="num">${esc(y)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    html += `<td class="fin-label">${esc(tl(row[0]))}</td>`;
    for (let i = 1; i < row.length; i++) {
      const val = row[i] || '—';
      const isNum = /^[\d.,]+%?$/.test(String(val).replace(/,/g, '').trim()) && val !== '—';
      html += `<td class="num${isNum ? '' : ' muted'}">${isNum ? esc(fmtNum(val)) : esc(val)}</td>`;
    }
    // Fill missing cells if years > row values
    for (let i = row.length; i <= years.length; i++) {
      html += '<td class="num muted">—</td>';
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

  // ---- SIGNAL COUNTS (pros/cons + details reuse these) ----
  const score = signals.positive;
  const maxScore = signals.total;

  // ---- WHAT TO WATCH (average-investor actionable levels) ----
  const watchItems = [];
  const isBank = /banka|банка|commercial|komercijalna/i.test(quote.name || '') || /bank/i.test(quote.segment || '');
  const sma = sma200 ?? sma50;
  const smaLabel = sma200 != null ? '200-дневен' : sma50 != null ? '50-дневен' : null;
  if (sma != null && price != null && price < sma) {
    watchItems.push(lang === 'mk'
      ? `Враќање над ${fmt(sma)} (${smaLabel} просек) со зголемен волумен би го сменило трендот.`
      : `Break above ${fmt(sma)} (${smaLabel} avg) on rising volume would flip the trend.`);
  } else if (sma != null && price != null && price > sma) {
    watchItems.push(lang === 'mk'
      ? `Држење над ${fmt(sma)} го чува позитивниот тренд — пад под него е сигнал за претпазливост.`
      : `Holding above ${fmt(sma)} keeps the uptrend — a drop below is caution.`);
  }
  if (wkPos != null && wkPos < 25) {
    watchItems.push(lang === 'mk'
      ? `Цена на ${wkPos.toFixed(0)}% од годишниот опсег — близу дно, можен отскок или пробив надолу.`
      : `Price at ${wkPos.toFixed(0)}% of yearly range — near low, bounce or breakdown possible.`);
  } else if (wkPos != null && wkPos > 75) {
    watchItems.push(lang === 'mk'
      ? `Цена на ${wkPos.toFixed(0)}% од годишниот опсег — близу врв, ризик од корекција.`
      : `Price at ${wkPos.toFixed(0)}% of yearly range — near top, pullback risk.`);
  }
  if (rsi != null && rsi < 35) {
    watchItems.push(lang === 'mk'
      ? `RSI ${rsi.toFixed(0)} близу препродадено — следи потенцијален пресврт.`
      : `RSI ${rsi.toFixed(0)} near oversold — watch for reversal.`);
  } else if (rsi != null && rsi > 65) {
    watchItems.push(lang === 'mk'
      ? `RSI ${rsi.toFixed(0)} близу прекупено — можен пад.`
      : `RSI ${rsi.toFixed(0)} near overbought — pullback risk.`);
  }
  if (isBank && watchItems.length < 3) {
    watchItems.push(lang === 'mk'
      ? `За банка, D/E ~7 е нормален — гледај дивиденда и ROE, не само долг.`
      : `For a bank, D/E ~7 is normal — focus on dividend and ROE, not just debt.`);
  }
  if (watchItems.length < 2) {
    watchItems.push(lang === 'mk'
      ? `Следи дали волуменот расте со цената — потврда на трендот.`
      : `Watch if volume rises with price — confirms the trend.`);
  }

  return { score, maxScore, details, watchItems };
}

function buildAnalysisHTML(analysis) {
  if (!analysis || !analysis.details || !analysis.details.length) {
    return '<div class="muted" style="padding:20px;text-align:center">' + t('fin_no_data') + '</div>';
  }
  var details = analysis.details;
  var maxScore = analysis.maxScore;

  var strengths = details.filter(function(d) { return d.up; });
  var weaknesses = details.filter(function(d) { return !d.up; });

  var html = '';

  // Pros / Cons — average-investor scannable
  html += '<div class="analysis-grid">';
  html += '<div class="analysis-card"><div class="analysis-card-title">✓ ' + t('analysis_pros') + ' (' + strengths.length + ')</div><div class="analysis-details">';
  for (var i = 0; i < Math.min(strengths.length, 6); i++) {
    var d = strengths[i];
    html += '<div class="analysis-detail">';
    html += '<span class="analysis-dot up"></span>';
    html += '<span class="analysis-d-label">' + d.label;
    if (d.ttKey) html += '<span class="analysis-tt" title="' + t(d.ttKey).replace(/"/g, '&quot;') + '">i</span>';
    html += '</span>';
    html += '<span class="analysis-d-val">' + d.val + '</span>';
    html += '<span class="analysis-d-sig up">' + d.signal + '</span>';
    html += '</div>';
  }
  if (!strengths.length) html += '<div class="analysis-detail"><span class="analysis-d-label" style="opacity:0.6">' + (lang==='mk' ? 'Нема издвоени предности' : 'No clear strengths') + '</span></div>';
  html += '</div></div>';

  html += '<div class="analysis-card"><div class="analysis-card-title">✕ ' + t('analysis_cons') + ' (' + weaknesses.length + ')</div><div class="analysis-details">';
  for (var i = 0; i < Math.min(weaknesses.length, 6); i++) {
    var d = weaknesses[i];
    html += '<div class="analysis-detail">';
    html += '<span class="analysis-dot down"></span>';
    html += '<span class="analysis-d-label">' + d.label;
    if (d.ttKey) html += '<span class="analysis-tt" title="' + t(d.ttKey).replace(/"/g, '&quot;') + '">i</span>';
    html += '</span>';
    html += '<span class="analysis-d-val">' + d.val + '</span>';
    html += '<span class="analysis-d-sig down">' + d.signal + '</span>';
    html += '</div>';
  }
  if (!weaknesses.length) html += '<div class="analysis-detail"><span class="analysis-d-label" style="opacity:0.6">' + (lang==='mk' ? 'Нема издвоени слабости' : 'No clear weaknesses') + '</span></div>';
  html += '</div></div>';
  html += '</div>'; // close pros/cons grid

  // What to watch — actionable levels
  if (analysis.watchItems && analysis.watchItems.length) {
    html += '<div class="analysis-card" style="margin-top:12px"><div class="analysis-card-title">👁 ' + t('analysis_watch') + '</div><div class="analysis-verdict-text" style="padding-top:0"><ul style="margin:0;padding-left:18px;line-height:1.6">';
    for (var w = 0; w < analysis.watchItems.length; w++) html += '<li>' + analysis.watchItems[w] + '</li>';
    html += '</ul></div></div>';
  }

  // Details collapsible — only the signals NOT already shown in the
  // pros/cons cards (those cards render the first 6 of each).
  var PROS_CONS_SHOWN = 6;
  var remaining = strengths.slice(PROS_CONS_SHOWN).concat(weaknesses.slice(PROS_CONS_SHOWN));
  if (remaining.length) {
    html += '<details class="analysis-details-toggle" style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--md-sys-color-primary);padding:8px 0">' + t('analysis_details') + ' (' + remaining.length + ')</summary>';
    html += '<div class="analysis-card" style="margin-top:8px"><div class="analysis-details">';
    for (var i = 0; i < remaining.length; i++) {
      var d = remaining[i];
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
    html += '<div class="analysis-breakdown" style="padding-top:10px">';
    html += '<div class="analysis-b-item"><span class="analysis-dot up"></span> ' + t('analysis_strength') + ': <strong>' + strengths.length + '</strong></div>';
    html += '<div class="analysis-b-item"><span class="analysis-dot down"></span> ' + t('analysis_weakness') + ': <strong>' + weaknesses.length + '</strong></div>';
    html += '<div class="analysis-b-item"><span class="analysis-dot" style="background:var(--md-sys-color-on-surface-variant)"></span> ' + t('analysis_neutral') + ': <strong>' + (maxScore - strengths.length - weaknesses.length) + '</strong></div>';
    html += '</div>';
    html += '</details>';
  }

  // Disclaimer
  var disc = lang === 'mk'
    ? 'Оваа анализа е генерирана врз основа на историски податоци и фундаментални показатели. Не претставува инвестициски совет.'
    : 'This analysis is generated based on historical data and fundamental indicators. It does not constitute investment advice.';
  html += '<div class="analysis-disclaimer">' + disc + '</div>';

  return html;
}
function switchFinTab(tab) {
  const btn = document.querySelector(`.fin-tab[data-tab="${tab}"]`);
  if (!btn || btn.classList.contains('hidden')) return;
  $$('.fin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.fin-tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = tab === 'chart' ? document.getElementById('finTabChart') :
    tab === 'data' ? document.getElementById('finTabData') : tab === 'ratios' ? document.getElementById('finTabRatios') : document.getElementById('finTabAnalysis');
  if (panel) panel.classList.remove('hidden');
}
window.switchFinTab = switchFinTab;
const _finTabBar = document.getElementById('finTabBar');
if (_finTabBar) _finTabBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.fin-tab');
  if (btn) { e.preventDefault(); switchFinTab(btn.dataset.tab); }
});
document.querySelectorAll('.fin-tab').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); switchFinTab(b.dataset.tab); }));
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.fin-tab');
  if (btn && btn.closest('#finTabBar')) { e.preventDefault(); switchFinTab(btn.dataset.tab); }
});

// ---- WIRE UP ----
$$('#mainTabs .main-tab').forEach((b) => b.addEventListener('click', () => setMainView(b.dataset.mtab)));
// Dividends header sorting — delegation survives buildDivHead re-renders
$('#divHead').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-divsort]');
  if (!th) return;
  const col = th.dataset.divsort;
  if (divSortCol === col) divSortDir = divSortDir === 'asc' ? 'desc' : 'asc';
  else { divSortCol = col; divSortDir = 'desc'; }
  renderDivTable();
});
$('#btnLiquid').addEventListener('click', () => setView('liquid'));
$('#btnAll').addEventListener('click', () => setView('all'));
$('#search').addEventListener('input', () => { renderTable(); if (dividendsCache) renderDivTable(); });
// Watchlist collapse (mobile): ★ bar toggles the chips row. Default
// collapsed on small screens; desktop ignores it via CSS.
const watchStripEl = $('#watchStrip');
$('#watchToggle').addEventListener('click', () => watchStripEl.classList.toggle('collapsed'));
if (window.matchMedia('(max-width: 839px)').matches) watchStripEl.classList.add('collapsed');
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const rows = getFilteredQuotes();
    if (rows.length) {
      const first = document.querySelector('#quotesBody tr');
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
  // Star toggles (table rows, modal header) and chip ✕ removals are handled
  // BEFORE the [data-sym] modal-open check — star buttons live inside rows
  // that carry data-sym.
  const starBtn = e.target.closest('[data-star],[data-unstar]');
  if (starBtn) {
    toggleWatch(starBtn.dataset.star || starBtn.dataset.unstar);
    return;
  }
  const item = e.target.closest('[data-sym]');
  if (item) openCompany(item.dataset.sym);
});
function closeModal() {
  const modal = $('#companyModal');
  modal.classList.add('hidden');
  // Cleanup: remove any chart stored on the modal element
  if (modal._chart) {
    try { modal._chart.remove(); } catch (_) {}
    modal._chart = null;
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
  // Re-render open company modal so all modal strings (stats, chart period, asOf) switch language
  const modal = $('#companyModal');
  if (modal && !modal.classList.contains('hidden') && modal.dataset.company) {
    const sym = modal.dataset.company;
    // close chart before re-opening to avoid leak
    if (modal._chart) { try { modal._chart.remove(); } catch (_) {} modal._chart = null; }
    openCompany(sym);
  }
});

// ---- THEME TOGGLE ----
const THEME_KEY = 'mse_theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const icon = $('#themeIcon');
  icon.textContent = theme === 'light' ? 'light_mode' : 'dark_mode';
}
  // Light theme is the default (dark is one tap away via the toggle).
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
$('#themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

(async function init() {
  applyStaticI18n();
  renderWatchStrip();
  // Sparklines first, in parallel with everything else: the request was already
  // started in <head> (window.__sparksP), so this typically resolves from cache
  // and the charts are painted before the quotes even arrive.
  loadSparks();
  await loadMBI();
  await loadFX();
  await Promise.all([loadQuotes()]);
  // Market-aware scheduler: polls fast when open, slow when closed, no
  // table re-render or sparkline rebuild when there's nothing new to show.
  scheduleNextPoll();
  scheduleNextMBIPoll();
  // MBI10 chip click opens company modal with index chart
  $('#mbiChip').addEventListener('click', () => {
    openCompany('MBI10');
  });
  // Market-status chip → hours popover; FX chip → full NBRM list. Both are
  // rendered by widget.js (shared with widgets.html) so the markup matches.
  if (window.W) {
    const stEl = $('#marketStatus');
    if (stEl) stEl.addEventListener('click', () => W.showMarketInfo());
    const fxEl = $('#fxChip');
    if (fxEl) fxEl.addEventListener('click', () => W.showFxList());
  }
})();

// Dedicated scheduler for the MBI10 chip — slower cadence is fine since
// the chip is just a price+change indicator on the navbar.
function scheduleNextMBIPoll() {
  setTimeout(async () => {
    if (!document.hidden) { await loadMBI(); await loadFX(); }
    scheduleNextMBIPoll();
  }, marketIsOpen ? 60000 : 5 * 60 * 1000);
}

// Expose internals on window for test harnesses / debugging.
// These are no-ops in production since nothing reads them.
if (typeof window !== 'undefined') {
  window.__loadQuotes = loadQuotes;
  window.__loadSparkHistory = loadSparkHistory;
  window.__marketIsOpen = () => marketIsOpen;
}
