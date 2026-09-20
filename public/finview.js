/* MSE Berza — company financial view builders (stats, fin tables, analysis).
 *
 * Shared by the Node server (require('./public/finview.js')) to SSR the
 * /s/{SYM} pages. Pure string builders: no DOM, no fetch, no window.
 * Language is module state (setLang) — SSR pages use 'mk', matching every
 * other server-rendered page.
 *
 * Logic is kept byte-equivalent with the dashboard company modal in
 * public/app.js (openCompany + buildFinTable + buildDividendSummary +
 * buildAnalysisData + buildAnalysisHTML). If the modal logic changes, mirror
 * it here (and vice versa) until app.js is migrated onto this module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // ---- Strings (subset of the dashboard I18N used by these builders) ----
  const STR = {
    en: {
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
      includes_series: 'Also includes series:',
      tab_chart: 'Chart',
      tab_fin_data: 'Financial Data',
      tab_ratios: 'Financial Ratios',
      tab_analysis: 'Analysis',
      fin_no_data: 'No financial data available.',
      fin_no_ratios: 'No financial ratios available.',
      fin_note_000: '* data in 000 MKD',
      div_th_dps: 'DPS {y}',
      div_th_yield: 'Yield {y}',
      div_th_trend: 'DPS trend (3y)',
      div_th_payout: 'Payout',
      chart_legend: 'Green = closed above yesterday · Red = closed below yesterday',
      analysis_sma50: '50-day SMA',
      analysis_sma200: '200-day SMA',
      analysis_rsi: 'RSI (14)',
      analysis_52w: '52-Week Position',
      analysis_momentum: 'Momentum',
      analysis_volume_trend: 'Volume Trend',
      analysis_eps_growth: 'EPS Growth',
      analysis_revenue_growth: 'Revenue Growth',
      analysis_roe: 'ROE Trend',
      analysis_div_yield: 'Dividend Yield',
      analysis_pros: 'Pros — why to hold',
      analysis_cons: 'Cons — why to be cautious',
      analysis_watch: 'What to watch next',
      analysis_details: 'Details',
      analysis_strength: 'Strength',
      analysis_weakness: 'Weakness',
      analysis_neutral: 'Neutral',
      analysis_overbought: 'Overbought territory',
      analysis_oversold: 'Oversold territory',
      analysis_uptrend: 'Uptrend',
      analysis_downtrend: 'Downtrend',
      analysis_positive: 'Positive',
      analysis_negative: 'Negative',
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
    },
    mk: {
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
      includes_series: 'Вклучува и сериите:',
      tab_chart: 'Графикон',
      tab_fin_data: 'Податоци',
      tab_ratios: 'Показатели',
      tab_analysis: 'Анализа',
      fin_no_data: 'Нема финансиски податоци.',
      fin_no_ratios: 'Нема финансиски показатели.',
      fin_note_000: '* податоците се во 000 денари',
      div_th_dps: 'ДПС {y}',
      div_th_yield: 'Принос {y}',
      div_th_trend: 'ДПС тренд (3 год.)',
      div_th_payout: 'Исплата',
      chart_legend: 'Зелено = затворено над вчера · Црвено = затворено под вчера',
      analysis_sma50: '50-дневен ПП',
      analysis_sma200: '200-дневен ПП',
      analysis_rsi: 'RSI (14)',
      analysis_52w: '52-неделна позиција',
      analysis_momentum: 'Моментум',
      analysis_volume_trend: 'Тренд на волумен',
      analysis_eps_growth: 'Раст на EPS',
      analysis_revenue_growth: 'Раст на приход',
      analysis_roe: 'Тренд на ROE',
      analysis_div_yield: 'Дивидентен принос',
      analysis_pros: 'Предности — зошто да држиш',
      analysis_cons: 'Слабости — зошто да внимаваш',
      analysis_watch: 'Што да следиш',
      analysis_details: 'Детали',
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
    },
  };

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

  let _lang = 'mk';
  function setLang(l) { _lang = l === 'en' ? 'en' : 'mk'; }
  function T(key) { return (STR[_lang] && STR[_lang][key]) || STR.en[key] || key; }
  function tl(label) {
    if (_lang === 'mk' && FIN_LABELS_MK[label]) return FIN_LABELS_MK[label];
    return label;
  }

  // ---- Pure helpers (same implementations as the dashboard) ----
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

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
    if (_lang !== 'mk') {
      return d.toLocaleDateString('en-GB', { timeZone: 'Europe/Skopje', day: '2-digit', month: 'short', year: 'numeric' });
    }
    // Deterministic Macedonian months — toLocaleDateString('mk-MK') returns
    // Latin/English month names in some browsers.
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Skopje', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type).value;
    const months = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
    return `${get('day')} ${months[Number(get('month')) - 1]} ${get('year')}`;
  }
  // Parses a number string (e.g. "1,254.61", "10.64%") to a float
  function pNum(s) {
    if (s == null) return null;
    const clean = String(s).replace(/,/g, '').replace('%', '');
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  }

  // ---- Company header (logo HTML is passed in: CoLogo.icon on the server,
  // logoHTML() on the dashboard). No watchlist star — SSR pages have no
  // watchlist UI. The #asOf line is filled with the last session date;
  // the /s/ chart script refreshes it when the range changes.
  function companyHead(symbol, q, logoHtml, asOfText) {
    const chg = q.changePct ?? 0;
    const chgAbs = q.dailyChange ?? 0;
    return `
      <div class="company-head">
        <h2>${logoHtml}${esc(symbol)}</h2>
        <span class="${pctClass(chg)}">
          <span class="material-symbols-outlined icon-fill" style="font-size:20px;vertical-align:middle">${chg >= 0 ? 'trending_up' : 'trending_down'}</span>
          ${chgStr(chgAbs)} (${pctStr(chg)})</span>
      </div>
      <div class="company-sub">${esc(q.name || '')} ${q.isin ? '· ISIN ' + esc(q.isin) : ''}</div>
      ${q.seriesList && q.seriesList.length ? `<div class="series-note">${esc(T('includes_series'))} ${q.seriesList.map(esc).join(', ')}</div>` : ''}
      <div class="as-of" id="asOf">${asOfText || ''}</div>`;
  }

  // ---- Stat grids (primary + secondary). Stocks only — the caller hides
  // both grids for indices, like the modal does.
  function statGrids(q) {
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
          <div class="k">${T('last_price')}</div>
          <div class="v">${fmt(q.lastPrice)}</div>
          <div class="u">MKD</div>
        </div>
        <div class="stat">
          <div class="k" id="avgPriceLabel">${T('avg_price')}</div>
          <div class="v" id="avgPriceVal">${fmt(q.avgPrice)}</div>
          <div class="u">MKD</div>
        </div>
        <div class="stat stat-with-bar">
          <div class="k">${T('day_range')}</div>
          <div class="v">${fmt(lo, 0)} – ${fmt(hi, 0)}</div>
          ${bar(dayPct)}
        </div>
        <div class="stat stat-with-bar">
          <div class="k">${T('range_52w')}</div>
          <div class="v">${yrPct == null ? '—' : yrPct.toFixed(0) + '%'}</div>
          ${bar(yrPct, lo52, hi52)}
        </div>
      </div>
      <div class="stat-grid stat-grid-secondary">
        <div class="stat"><div class="k">${T('volume')}</div><div class="v-sm">${fmtInt(q.volume)}</div></div>
        <div class="stat"><div class="k">${T('turnover_l')}</div><div class="v-sm">${fmtInt(q.value)}<span class="u-sm"> MKD</span></div></div>
        <div class="stat"><div class="k">${T('trades')}</div><div class="v-sm">${fmtInt(q.trades)}</div></div>
        <div class="stat"><div class="k">P/E</div><div class="v-sm">${q.peRatio != null ? fmt(q.peRatio) : '—'}</div></div>
      </div>`;
  }

  function buildFinTable(data, isRatios) {
    const years = data.years || [];
    const rows = data.rows || [];
    if (!rows.length) return '';
    // Number format: en uses commas, mk uses periods as thousands separator
    const fmtNum = (v) => _lang === 'mk' ? v.replace(/,/g, '.') : v;
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
      html += `<div class="fin-note">${T('fin_note_000')}</div>`;
    }
    return html;
  }

  // Compact dividend summary above the ratios table.
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
    ${chip(T('div_th_dps').replace('{y}', years[0]), dps[0] != null ? fmt(dps[0], 0) : '—')}
    ${chip(T('div_th_yield').replace('{y}', years[0]), yld[0] != null ? fmt(yld[0]) + '%' : '—')}
    ${chip(T('div_th_payout'), pay0 != null ? fmt(pay0, 0) + '%' : '—')}
    ${chip(T('div_th_trend'), dps.map((v) => (v == null ? '—' : fmt(v, 0))).join(' → '))}
  </div>`;
  }

  // ---- ANALYSIS ENGINE (same signals as the dashboard) ----
  // allQuotes replaces the dashboard's quotesCache for market comparison.
  function buildAnalysisData(quote, fullHistory, fin, mbi10Rows, allQuotes) {
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

    // ---- MARKET COMPARISON ----
    let mktPEs = [], mktROEs = [], mktPBVs = [];
    for (const r of allQuotes) {
      if (r.peRatio != null && r.peRatio > 0) mktPEs.push(r.peRatio);
      // For ROE and PBV we need the ratios data — collect from cached financials if available
    }
    const avgMktPE = mktPEs.length ? mktPEs.reduce((a, b) => a + b, 0) / mktPEs.length : 15;

    // ---- TECHNICAL ----
    // SMA-50 / SMA-200
    let sma50 = null, sma200 = null;
    if (n >= 50) {
      sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
      addSig(T('analysis_sma50'), price > sma50);
      details.push({ label: T('analysis_sma50'), val: sma50.toFixed(2), signal: price > sma50 ? T('analysis_uptrend') : T('analysis_downtrend'), up: price > sma50, ttKey: 'tt_sma50' });
    }
    if (n >= 200) {
      sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
      addSig(T('analysis_sma200'), price > sma200);
      details.push({ label: T('analysis_sma200'), val: sma200.toFixed(2), signal: price > sma200 ? T('analysis_uptrend') : T('analysis_downtrend'), up: price > sma200, ttKey: 'tt_sma200' });
    } else if (n >= 100) {
      const sma100 = closes.slice(-100).reduce((a, b) => a + b, 0) / 100;
      addSig(T('analysis_sma200'), price > sma100);
      details.push({ label: T('analysis_sma200'), val: sma100.toFixed(2), signal: price > sma100 ? T('analysis_uptrend') : T('analysis_downtrend'), up: price > sma100, ttKey: 'tt_sma200' });
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
      addSig(T('analysis_rsi'), rsi < 70 && rsi > 30);
      const rsiSignal = rsi > 70 ? T('analysis_overbought') : rsi < 30 ? T('analysis_oversold') : T('analysis_neutral');
      details.push({ label: T('analysis_rsi'), val: rsi.toFixed(1), signal: rsiSignal, up: rsi < 70 && rsi > 30, ttKey: 'tt_rsi' });
    }

    // 52-week position
    const hi52 = quote.week52Max, lo52 = quote.week52Min;
    let wkPos = null;
    if (hi52 && lo52 && hi52 > lo52) {
      wkPos = ((price - lo52) / (hi52 - lo52)) * 100;
      addSig(T('analysis_52w'), wkPos >= 25 && wkPos <= 75);
      const wkSignal = wkPos > 75 ? T('analysis_overbought') : wkPos < 25 ? T('analysis_oversold') : T('analysis_neutral');
      details.push({ label: T('analysis_52w'), val: wkPos.toFixed(0) + '%', signal: wkSignal, up: wkPos >= 25 && wkPos <= 75, ttKey: 'tt_52w' });
    }

    // Momentum (last 20 days)
    if (n >= 21) {
      const mom20 = ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
      addSig(T('analysis_momentum'), mom20 > 0);
      details.push({ label: T('analysis_momentum'), val: (mom20 >= 0 ? '+' : '') + mom20.toFixed(1) + '%', signal: mom20 > 0 ? T('analysis_positive') : T('analysis_negative'), up: mom20 > 0, ttKey: 'tt_momentum' });
    }

    // Volume trend
    if (volumes.length >= 100) {
      const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const avgVol100 = volumes.slice(-100).reduce((a, b) => a + b, 0) / 100;
      const volRatio = avgVol20 / avgVol100;
      addSig(T('analysis_volume_trend'), volRatio > 1.2 || (volRatio > 0.8 && quote.dailyChange > 0));
      details.push({ label: T('analysis_volume_trend'), val: (volRatio > 1 ? '+' : '') + ((volRatio - 1) * 100).toFixed(0) + '%', signal: volRatio > 1 ? T('analysis_positive') : T('analysis_negative'), up: volRatio > 1, ttKey: 'tt_volume' });
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
          addSig(T('analysis_eps_growth'), epsGrowth > 0);
          details.push({ label: T('analysis_eps_growth'), val: (epsGrowth >= 0 ? '+' : '') + epsGrowth.toFixed(1) + '%', signal: epsGrowth > 0 ? T('analysis_positive') : T('analysis_negative'), up: epsGrowth > 0, ttKey: 'tt_eps' });
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
          addSig(T('analysis_revenue_growth'), avgGrowth > 0);
          details.push({ label: T('analysis_revenue_growth'), val: (avgGrowth >= 0 ? '+' : '') + avgGrowth.toFixed(1) + '%', signal: avgGrowth > 0 ? T('analysis_positive') : T('analysis_negative'), up: avgGrowth > 0, ttKey: 'tt_revenue' });
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
          addSig(T('analysis_roe'), roeStrong);
          details.push({ label: T('analysis_roe'), val: roe.toFixed(1) + '%', signal: roeStrong ? '>15% ✅' : '<15%', up: roeStrong, ttKey: 'tt_roe' });
        }
        // ROE trend
        if (roeRow.length >= 4) {
          const roe3 = pNum(roeRow[3]);
          if (roe3 != null && roe != null) {
            const improving = roe >= roe3;
            addSig('ROE Тренд', improving);
            details.push({ label: 'ROE Тренд', val: roe.toFixed(1) + '%', signal: improving ? T('analysis_positive') : T('analysis_negative'), up: improving, ttKey: 'tt_roe' });
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
          addSig(T('analysis_div_yield'), divY > 1.5);
          details.push({ label: T('analysis_div_yield'), val: divY.toFixed(2) + '%', signal: divY > 1.5 ? T('analysis_positive') : T('analysis_negative'), up: divY > 1.5, ttKey: 'tt_div' });
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
      watchItems.push(_lang === 'mk'
        ? `Враќање над ${fmt(sma)} (${smaLabel} просек) со зголемен волумен би го сменило трендот.`
        : `Break above ${fmt(sma)} (${smaLabel} avg) on rising volume would flip the trend.`);
    } else if (sma != null && price != null && price > sma) {
      watchItems.push(_lang === 'mk'
        ? `Држење над ${fmt(sma)} го чува позитивниот тренд — пад под него е сигнал за претпазливост.`
        : `Holding above ${fmt(sma)} keeps the uptrend — a drop below is caution.`);
    }
    if (wkPos != null && wkPos < 25) {
      watchItems.push(_lang === 'mk'
        ? `Цена на ${wkPos.toFixed(0)}% од годишниот опсег — близу дно, можен отскок или пробив надолу.`
        : `Price at ${wkPos.toFixed(0)}% of yearly range — near low, bounce or breakdown possible.`);
    } else if (wkPos != null && wkPos > 75) {
      watchItems.push(_lang === 'mk'
        ? `Цена на ${wkPos.toFixed(0)}% од годишниот опсег — близу врв, ризик од корекција.`
        : `Price at ${wkPos.toFixed(0)}% of yearly range — near top, pullback risk.`);
    }
    if (rsi != null && rsi < 35) {
      watchItems.push(_lang === 'mk'
        ? `RSI ${rsi.toFixed(0)} близу препродадено — следи потенцијален пресврт.`
        : `RSI ${rsi.toFixed(0)} near oversold — watch for reversal.`);
    } else if (rsi != null && rsi > 65) {
      watchItems.push(_lang === 'mk'
        ? `RSI ${rsi.toFixed(0)} близу прекупено — можен пад.`
        : `RSI ${rsi.toFixed(0)} near overbought — pullback risk.`);
    }
    if (isBank && watchItems.length < 3) {
      watchItems.push(_lang === 'mk'
        ? `За банка, D/E ~7 е нормален — гледај дивиденда и ROE, не само долг.`
        : `For a bank, D/E ~7 is normal — focus on dividend and ROE, not just debt.`);
    }
    if (watchItems.length < 2) {
      watchItems.push(_lang === 'mk'
        ? `Следи дали волуменот расте со цената — потврда на трендот.`
        : `Watch if volume rises with price — confirms the trend.`);
    }

    return { score, maxScore, details, watchItems };
  }

  function buildAnalysisHTML(analysis) {
    if (!analysis || !analysis.details || !analysis.details.length) {
      return '<div class="muted" style="padding:20px;text-align:center">' + T('fin_no_data') + '</div>';
    }
    var details = analysis.details;
    var maxScore = analysis.maxScore;

    var strengths = details.filter(function (d) { return d.up; });
    var weaknesses = details.filter(function (d) { return !d.up; });

    var html = '';

    // Pros / Cons — average-investor scannable
    html += '<div class="analysis-grid">';
    html += '<div class="analysis-card"><div class="analysis-card-title">✓ ' + T('analysis_pros') + ' (' + strengths.length + ')</div><div class="analysis-details">';
    for (var i = 0; i < Math.min(strengths.length, 6); i++) {
      var d = strengths[i];
      html += '<div class="analysis-detail">';
      html += '<span class="analysis-dot up"></span>';
      html += '<span class="analysis-d-label">' + d.label;
      if (d.ttKey) html += '<span class="analysis-tt" title="' + T(d.ttKey).replace(/"/g, '&quot;') + '">i</span>';
      html += '</span>';
      html += '<span class="analysis-d-val">' + d.val + '</span>';
      html += '<span class="analysis-d-sig up">' + d.signal + '</span>';
      html += '</div>';
    }
    if (!strengths.length) html += '<div class="analysis-detail"><span class="analysis-d-label" style="opacity:0.6">' + (_lang === 'mk' ? 'Нема издвоени предности' : 'No clear strengths') + '</span></div>';
    html += '</div></div>';

    html += '<div class="analysis-card"><div class="analysis-card-title">✕ ' + T('analysis_cons') + ' (' + weaknesses.length + ')</div><div class="analysis-details">';
    for (var i = 0; i < Math.min(weaknesses.length, 6); i++) {
      var d = weaknesses[i];
      html += '<div class="analysis-detail">';
      html += '<span class="analysis-dot down"></span>';
      html += '<span class="analysis-d-label">' + d.label;
      if (d.ttKey) html += '<span class="analysis-tt" title="' + T(d.ttKey).replace(/"/g, '&quot;') + '">i</span>';
      html += '</span>';
      html += '<span class="analysis-d-val">' + d.val + '</span>';
      html += '<span class="analysis-d-sig down">' + d.signal + '</span>';
      html += '</div>';
    }
    if (!weaknesses.length) html += '<div class="analysis-detail"><span class="analysis-d-label" style="opacity:0.6">' + (_lang === 'mk' ? 'Нема издвоени слабости' : 'No clear weaknesses') + '</span></div>';
    html += '</div></div>';
    html += '</div>'; // close pros/cons grid

    // What to watch — actionable levels
    if (analysis.watchItems && analysis.watchItems.length) {
      html += '<div class="analysis-card" style="margin-top:12px"><div class="analysis-card-title">👁 ' + T('analysis_watch') + '</div><div class="analysis-verdict-text" style="padding-top:0"><ul style="margin:0;padding-left:18px;line-height:1.6">';
      for (var w = 0; w < analysis.watchItems.length; w++) html += '<li>' + analysis.watchItems[w] + '</li>';
      html += '</ul></div></div>';
    }

    // Details collapsible — only the signals NOT already shown in the
    // pros/cons cards (those cards render the first 6 of each).
    var PROS_CONS_SHOWN = 6;
    var remaining = strengths.slice(PROS_CONS_SHOWN).concat(weaknesses.slice(PROS_CONS_SHOWN));
    if (remaining.length) {
      html += '<details class="analysis-details-toggle" style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--md-sys-color-primary);padding:8px 0">' + T('analysis_details') + ' (' + remaining.length + ')</summary>';
      html += '<div class="analysis-card" style="margin-top:8px"><div class="analysis-details">';
      for (var i = 0; i < remaining.length; i++) {
        var d = remaining[i];
        html += '<div class="analysis-detail">';
        html += '<span class="analysis-dot ' + (d.up ? 'up' : 'down') + '"></span>';
        html += '<span class="analysis-d-label">' + d.label;
        if (d.ttKey) html += '<span class="analysis-tt" title="' + T(d.ttKey).replace(/"/g, '&quot;') + '">i</span>';
        html += '</span>';
        html += '<span class="analysis-d-val">' + d.val + '</span>';
        html += '<span class="analysis-d-sig ' + (d.up ? 'up' : 'down') + '">' + d.signal + '</span>';
        html += '</div>';
      }
      html += '</div></div>';
      html += '<div class="analysis-breakdown" style="padding-top:10px">';
      html += '<div class="analysis-b-item"><span class="analysis-dot up"></span> ' + T('analysis_strength') + ': <strong>' + strengths.length + '</strong></div>';
      html += '<div class="analysis-b-item"><span class="analysis-dot down"></span> ' + T('analysis_weakness') + ': <strong>' + weaknesses.length + '</strong></div>';
      html += '<div class="analysis-b-item"><span class="analysis-dot" style="background:var(--md-sys-color-on-surface-variant)"></span> ' + T('analysis_neutral') + ': <strong>' + (maxScore - strengths.length - weaknesses.length) + '</strong></div>';
      html += '</div>';
      html += '</details>';
    }

    // Disclaimer
    var disc = _lang === 'mk'
      ? 'Оваа анализа е генерирана врз основа на историски податоци и фундаментални показатели. Не претставува инвестициски совет.'
      : 'This analysis is generated based on historical data and fundamental indicators. It does not constitute investment advice.';
    html += '<div class="analysis-disclaimer">' + disc + '</div>';

    return html;
  }

  return {
    setLang: setLang,
    T: T,
    tl: tl,
    esc: esc,
    fmt: fmt,
    fmtInt: fmtInt,
    fmtDate: fmtDate,
    pctClass: pctClass,
    pctStr: pctStr,
    chgStr: chgStr,
    companyHead: companyHead,
    statGrids: statGrids,
    buildFinTable: buildFinTable,
    buildDividendSummary: buildDividendSummary,
    buildAnalysisData: buildAnalysisData,
    buildAnalysisHTML: buildAnalysisHTML,
  };
});
