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

  // Direction-colored multi-run line chart (requires lightweight-charts).
  // Each maximal same-direction run is its own series — adjacent runs
  // alternate colors, so cross-connection is impossible.
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
    const mk = (run) => {
      const s = chart.addLineSeries({
        color: run.dir === 'up' ? '#16c784' : '#ea3943',
        lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      s.setData(run.pts);
      return s;
    };
    const series = upRuns.map(mk).concat(downRuns.map(mk));
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

  window.W = W;
})();
