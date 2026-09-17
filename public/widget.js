/* MSE Berza — shared embeddable-widget helpers (window.W) */
(function () {
  const W = {};

  W.params = () => new URLSearchParams(location.search);

  W.setTheme = (t) => { document.documentElement.dataset.theme = (t === 'light') ? 'light' : 'dark'; };

  W.fetchJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  W.fmt = (n, dec = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  W.pctStr = (v) => (v == null || isNaN(v)) ? '—' : (v >= 0 ? '+' : '') + W.fmt(v) + '%';
  W.pctClass = (v) => (v == null || isNaN(v)) ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '';

  W.marketOpen = false;

  // Refresh scheduler: the initial load always runs; afterwards the data is
  // re-fetched every minute ONLY while the MSE market is open — MSE publishes
  // end-of-day data once per session, so outside market hours the last
  // snapshot is already final and re-fetching would be waste.
  W.autoRefresh = (fn, intervalMs = 60000) => {
    const tick = async () => {
      try {
        const st = await W.fetchJSON('/api/symbols');
        W.marketOpen = !!st.marketOpen;
        if (W.marketOpen) await fn();
      } catch (e) { /* keep last snapshot */ }
    };
    setInterval(tick, intervalMs);
  };

  W.sparkline = (canvas, values, color) => {
    if (!canvas || !values || values.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 40;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
    const px = (i) => (i / (values.length - 1)) * (w - 4) + 2;
    const py = (v) => (h - 4) - ((v - min) / span) * (h - 8) + 2;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(px(values.length - 1), h);
    ctx.lineTo(px(0), h);
    ctx.closePath();
    ctx.fillStyle = color + '22';
    ctx.fill();
  };

  // Direction-colored multi-run line/area chart (requires lightweight-charts).
  // Each maximal same-direction run is its own series — adjacent runs
  // alternate colors, so cross-connection is impossible.
  // opts: { showVolume, chartType: 'area'|'line', height }
  W.directionChart = (container, rows, opts = {}) => {
    if (!window.LightweightCharts || !rows || !rows.length) return null;
    const cs = getComputedStyle(document.documentElement);
    const txt = (cs.getPropertyValue('--md-sys-color-on-surface-variant') || '#a0a8b5').trim();
    const grid = 'rgba(128,140,160,0.18)';
    const chart = LightweightCharts.createChart(container, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: txt, fontSize: 10 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid },
      height: opts.height || 300,
    });
    const lineData = rows
      .filter((x) => x.last != null)
      .map((x) => ({ time: Math.floor(new Date(x.date).getTime() / 1000), value: x.last }));
    const mkSeries = (color, fillTop, fillBottom) => (opts.chartType === 'line')
      ? chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      : chart.addAreaSeries({ lineColor: color, topColor: fillTop, bottomColor: fillBottom, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const upRuns = [], downRuns = [];
    let cur = null, dir = null;
    for (let i = 1; i < lineData.length; i++) {
      const d = lineData[i].value >= lineData[i - 1].value ? 'up' : 'down';
      if (d !== dir) {
        cur = { dir: d, pts: [lineData[i - 1], lineData[i]] };
        dir = d;
        (d === 'up' ? upRuns : downRuns).push(cur);
      } else {
        cur.pts.push(lineData[i]);
      }
    }
    const series = upRuns.map((r) => { const s = mkSeries('#16c784', 'rgba(22,199,132,0.25)', 'rgba(22,199,132,0.02)'); s.setData(r.pts); return s; })
      .concat(downRuns.map((r) => { const s = mkSeries('#ea3943', 'rgba(234,57,67,0.25)', 'rgba(234,57,67,0.02)'); s.setData(r.pts); return s; }));
    if (opts.showVolume) {
      const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      let prev = null;
      vol.setData(rows.filter((x) => x.last != null).map((x) => {
        const up = prev == null ? true : x.last >= prev;
        prev = x.last;
        return { time: Math.floor(new Date(x.date).getTime() / 1000), value: x.volume || 0, color: up ? 'rgba(22,199,132,0.5)' : 'rgba(234,57,67,0.5)' };
      }));
    }
    const lastClose = lineData.length ? lineData[lineData.length - 1].value : null;
    if (lastClose != null && series.length) {
      series[0].createPriceLine({
        price: lastClose, color: '#ea3943', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: '',
      });
    }
    chart.timeScale().fitContent();
    return chart;
  };

  W.footer = (el) => {
    if (el) el.innerHTML = 'Податоци: <a href="https://mseberza.info" target="_blank" rel="noopener">MSE Berza Info — mseberza.info</a>';
  };

  // Shared topbar (same markup as the dashboard): theme toggle, market
  // status, MBI10 + FX chips, lang preference. Builder pages call this;
  // embed pages ignore it (they stay minimal by design).
  W.initTopbar = (opts = {}) => {
    const onTheme = opts.onTheme || null;
    const applyTheme = (theme) => {
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('mse_theme', theme); } catch (_) {}
      const icon = document.getElementById('themeIcon');
      if (icon) icon.textContent = theme === 'light' ? 'light_mode' : 'dark_mode';
      if (onTheme) onTheme(theme);
    };
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn && !themeBtn.dataset.wired) {
      themeBtn.dataset.wired = '1';
      themeBtn.addEventListener('click', () => {
        const cur = document.documentElement.dataset.theme || 'dark';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      });
    }
    let stored = 'dark';
    try { stored = localStorage.getItem('mse_theme') || 'dark'; } catch (_) {}
    applyTheme(stored);
    const langBtn = document.getElementById('langToggle');
    if (langBtn && !langBtn.dataset.wired) {
      langBtn.dataset.wired = '1';
      langBtn.addEventListener('click', () => {
        let cur = 'en';
        try { cur = localStorage.getItem('mse_lang') || 'en'; } catch (_) {}
        try { localStorage.setItem('mse_lang', cur === 'en' ? 'mk' : 'en'); } catch (_) {}
      });
    }
    // Chips double as buttons: market status → hours popover, FX → full list.
    const statusEl = document.getElementById('marketStatus');
    if (statusEl && !statusEl.dataset.wired) {
      statusEl.dataset.wired = '1';
      statusEl.addEventListener('click', () => W.showMarketInfo());
    }
    const fxBtn = document.getElementById('fxChip');
    if (fxBtn && !fxBtn.dataset.wired) {
      fxBtn.dataset.wired = '1';
      fxBtn.addEventListener('click', () => W.showFxList());
    }
    const load = async () => {
      try {
        const [q, idx, fx] = await Promise.all([
          W.fetchJSON('/api/quotes').catch(() => null),
          W.fetchJSON('/api/indices').catch(() => null),
          W.fetchJSON('/api/fx').catch(() => null),
        ]);
        const st = document.getElementById('marketStatus');
        if (st && q) {
          if (q.marketOpen) {
            st.innerHTML = '<span class="material-symbols-outlined icon-fill" style="font-size:14px;color:var(--md-sys-color-on-positive-container)">signal_cellular_alt</span> Пазарот е отворен';
            st.className = 'market-status open';
          } else {
            const time = q.lastPoll ? new Date(q.lastPoll).toLocaleTimeString('mk-MK', { timeZone: 'Europe/Skopje', hour: '2-digit', minute: '2-digit' }) : '';
            st.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">block</span> Пазарот е затворен · ' + time;
            st.className = 'market-status closed';
          }
        }
        const chip = document.getElementById('mbiChip');
        if (chip && idx && idx.MBI10) {
          const chg = idx.MBI10.changePct ?? 0;
          chip.innerHTML = 'MBI10 <span class="mbi-val">' + W.fmt(idx.MBI10.value) + '</span> <span class="mbi-chg ' + W.pctClass(chg) + '">' + W.pctStr(chg) + '</span>';
        }
        const fxEl = document.getElementById('fxChip');
        if (fxEl && fx && fx.eur != null && fx.usd != null) {
          fxEl.innerHTML = '€' + W.fmt(fx.eur) + ' <span class="fx-usd">· $' + W.fmt(fx.usd) + '</span>';
          if (fx.date) {
            const parts = String(fx.date).split('-');
            if (parts.length === 3) fxEl.title = `НБРМ среден курс, ${parts[2]}.${parts[1]}.${parts[0]}`;
          }
        }
      } catch (e) { /* keep placeholders */ }
    };
    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  };

  // Shared footer markup — identical to the server-rendered footer in
  // pageShell (server.js) and to the dashboard footer in app.js so every page
  // matches. Keep all three in sync.
  W.renderFoot = async () => {
    const el = document.querySelector('.foot');
    if (!el) return;
    let version = '';
    try {
      const v = await W.fetchJSON('/api/version');
      if (v && v.version) version = ' · v' + v.version;
    } catch (_) {}
    el.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;margin-right:6px;opacity:0.6">database</span>'
      + 'Податоци преземени од <a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a> — бесплатни јавни податоци — за едукативна намена. · '
      + '<a href="/prasanja">Прашања</a> · <a href="/za-nas">За нас</a> · <a href="/izvor-na-podatoci">Извор на податоци</a> · <a href="/metodologija">Методологија</a> · '
      + '<a href="/widgets.html">Виџети</a> · Не е инвестициски совет.' + version;
  };

  // ---- Chip modals (market hours + full NBRM list) ----
  // Reuses the styles.css .modal/.modal-card/.close classes so these look
  // identical to the company dialog. Both pages that show chips (index.html,
  // widgets.html) already load styles.css; embed pages never open these.
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isoToDmy = (iso) => {
    const p = String(iso || '').split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso || '—');
  };

  W.closeModal = () => {
    const el = document.getElementById('msePop');
    if (!el) return;
    if (el._onKey) document.removeEventListener('keydown', el._onKey);
    el.remove();
  };

  W.openModal = (title, bodyHtml, footerHtml) => {
    W.closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'msePop';
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = '<div class="modal-card pop-card">'
      + '<button class="close" type="button" aria-label="Затвори"><span class="material-symbols-outlined">close</span></button>'
      + '<h2 class="pop-title">' + esc(title) + '</h2>'
      + '<div class="pop-body">' + bodyHtml + '</div>'
      + (footerHtml ? '<div class="pop-foot">' + footerHtml + '</div>' : '')
      + '</div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) W.closeModal(); });
    overlay.querySelector('.close').addEventListener('click', () => W.closeModal());
    const onKey = (e) => { if (e.key === 'Escape') W.closeModal(); };
    document.addEventListener('keydown', onKey);
    overlay._onKey = onKey;
    document.body.appendChild(overlay);
    overlay.querySelector('.close').focus();
    return overlay;
  };

  // Market hours / status popover content — data from /api/market (single
  // source of truth for hours + the official non-trading days).
  W.showMarketInfo = async () => {
    const m = await W.fetchJSON('/api/market').catch(() => null);
    if (!m) return;
    const row = (k, v) => '<div class="pop-row"><span class="pop-k">' + k + '</span><span class="pop-v">' + v + '</span></div>';
    const nxt = m.nextNonTrading;
    const nxtLabel = nxt
      ? isoToDmy(nxt.date) + (nxt.type === 'holiday' ? ' (празник)' : ' (викенд)') + (nxt.isToday ? ' — денес' : '')
      : '—';
    W.openModal('Работно време на берзата',
      row('Трговска сесија', m.hours + ' ч.')
      + row('Работни денови', m.days)
      + row('Моментален статус', m.open ? '<span class="pop-open">Отворен</span>' : '<span class="pop-closed">Затворен</span>')
      + row('Следен неработен ден', nxtLabel)
      + '<p class="pop-note">Берзата објавува податоци еднаш дневно, по затворање на сесијата, а MSE Berza се освежува со истото темпо — ова не е берзански feed во реално време. Неработните денови се според официјалниот календар на <a href="https://www.mse.mk" target="_blank" rel="noopener">mse.mk</a>.</p>');
  };

  // Full NBRM middle-rate list (31 currencies) — same daily cache as the chip,
  // no extra request to NBRM. SSR equivalent lives at /kursna-lista.
  W.showFxList = async () => {
    const data = await W.fetchJSON('/api/fx/list').catch(() => null);
    if (!data || !data.list || !data.list.length) {
      W.openModal('Курсна листа на НБРМ', '<p class="pop-note">Податоците сè уште не се вчитани.</p>');
      return;
    }
    const rows = data.list.map((c) => '<tr><td>' + esc(c.name || c.code)
      + ' <span class="fx-code">' + esc(c.code) + '</span>'
      + (c.unit && c.unit !== 1 ? ' <span class="fx-unit">за ' + W.fmt(c.unit, 0) + '</span>' : '')
      + '</td>'
      + '<td class="num">' + W.fmt(c.mid, 4) + '</td></tr>').join('');
    W.openModal('Курсна листа на НБРМ · ' + isoToDmy(data.date),
      '<table class="fx-table"><thead><tr><th>Валута</th><th class="num">Среден курс (денари)</th></tr></thead><tbody>'
      + rows + '</tbody></table>'
      + '<p class="pop-note">Среден курс на Народната банка на РСМ. НБРМ не објавува куповен и продажен курс во оваа листа.</p>',
      '<a href="/kursna-lista">Цела курсна листа →</a>');
  };

  window.W = W;
})();
