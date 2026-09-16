# MSE Berza — Full Sweep Audit + Action Plan

**Target:** `https://7nyicjckbtrd-production-b1bwmp46.europe-west1.suga.run`
**Future domain:** `https://mseberza.info/`
**Date:** 2026-09-16
**Source:** `C:\Users\User\Documents\Default Project\mse-clone` (`mse-berza v2.0.0`)
**Scope:** live sweep of `/`, `/api/symbols`, `/api/quotes`, `/api/history/ALK?range=1M`, `/api/quote/ALK`, `/api/indices`, `/robots.txt`, `/sitemap.xml` + local `public/index.html`, `public/app.js`, `server.js`

**Verdict:** Solid v2.0 core. Data layer works, UX is 10x better than `mse.mk`. Not ready to own `mseberza.info` yet — invisible to Google, 1 formatting bug, 2 perf wastes, and zero MK-specific moats.

---

## 1. What was tested

| Endpoint | Result |
|---|---|
| `/` | `MSE Berza \| Македонска берза во живо`, Liquid (13) / All (139), table Symbol/Name/Price/Change%/Volume/52W%/52W Range, Watchlist, Dividends tab |
| `/api/symbols` | 139 symbols incl. `TTKO3`, `STBP`, bonds `RMDEN16-24`, preferred `UNIPO2-4`, `marketOpen:true` |
| `/api/quotes` | Full OHLCV + `peRatio, marketCap, week52Max/Min/Chg, ISIN, segment, trades, totalShares` |
| `/api/history/ALK?range=1M` | 22 rows, e.g. 25/08 24,999 → 03/09 23,000, with `turnoverBest/Total` |
| `/api/quote/ALK` | ALK 23,000 / +2.63% / vol 44 / P/E 19.92 / MCap 35.7B / 52W 22,300-27,300 |
| `/api/indices` | `{"MBI10":{"value":9150.96,"changePct":0}}` — **BUG: change always 0**, mse.mk shows -0.28% |
| `/robots.txt` | 404 `Not found` |
| `/sitemap.xml` | 404 `Not found` |

Reference points: `mse.mk` (15.09.2026: turnover 7.3M MKD, 45 trades, MBI10 9,151.03 -0.28%), `berza.info` (direct competitor: 50+ companies, 10+ charts, P/E compare, Bitcoin/Gold compare, quarterly profit, blog, 2 founders).

---

## 2. What is GOOD — keep it

### 2.1 Data engine works
- Scraper (`lib/scraper.js`) → symbol list, `/mk/symbol/{TICKER}`, `POST /en/stats/symbolhistory`, `/en/indicies/MBI10/values` — no API key needed.
- Store (`lib/db.js` + `lib/store.js`) → Postgres `quotes/history/indices`, polls Mon-Fri 09:00-14:30 Skopje every 60s.
- Server (`server.js`) → plain Node `http`, gzip, `Cache-Control: public max-age 300` for CSS/JS, `no-cache` for HTML.
- APIs: `/api/symbols`, `/api/quotes`, `/api/quote/{SYM}`, `/api/history/{SYM}?range=1M|3M|6M|1Y`, `/api/indices`, `/api/backfill-all`, `/api/refresh`.

### 2.2 Product decisions right for MK
- **Liquid (13) / All (139)** — best decision. MK has ~13 tradable names, rest is noise.
- **Watchlist in localStorage, no login** — correct, nobody registers to track 3 stocks.
- **Dividends tab** from MSE ratios tables — dividend yield is THE reason people hold ALK/KMB/TEL.
- **Company modal, 4 tabs:** Chart / Financial Data / Ratios / Analysis + Methodology & Limitations card (`Not DCF, no beta/Sharpe, not sector-aware, no Graham/Buffett`). Honest, builds trust.
- **MK/EN i18n, dark mode, MBI10 chip, market open badge.**
- **Footer:** `Data scraped from mse.mk — free public end-of-day data — for educational use.` Keep + expand.

### 2.3 Tech basics sane
- `defer` on Chart.js + lightweight-charts, `preconnect` for fonts, Inter + Material Symbols, M3 tokens.
- Canonical + OG already point to `https://mseberza.info/` — correct pre-move.

---

## 3. What must be FIXED — actionable steps

### P0 — blocks launch

#### 3.1 Invisible to Google (client-only render)
**Problem:** `index.html` ships empty `<tbody id="quotesBody">`. Crawlers see empty shell. One URL for 139 companies. `html lang="en"` with MK content.
**Fix:**
- [ ] `server.js`: inject last quotes into `/` as JSON + first 13 `<tr>` rows (SSR first paint)
- [ ] Add routes `/s/ALK`, `/s/KMB` … each with `<h1>Alkaloid AD Skopje (ALK) — цена, дивиденда</h1>` + static price/div/52W table
- [ ] Change to `<html lang="mk">`, add `hreflang mk/en`
- [ ] After move to `mseberza.info`, verify in Search Console (staging `suga.run` correctly won't index due to canonical mismatch — expected)

#### 3.2 No robots.txt / sitemap.xml (confirmed 404)
- [ ] Add `public/robots.txt`:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://mseberza.info/sitemap.xml
  ```
- [ ] Add `GET /sitemap.xml` in `server.js`: `/`, `/dividendi`, `/s/ALK` … (139 urls), update on backfill
- [ ] Serve with `Content-Type: application/xml`

#### 3.3 52W Range formatting bug
**Live:** `51,30059,698` — missing dash.
- [ ] `public/app.js` table render: fix to `` `${fmt(lo)} – ${fmt(hi)}` ``
- [ ] Verify: TNB `51,300 – 59,698`, KMB `24,700 – 28,500`, ALK `22,300 – 27,300`

#### 3.4 MBI10 change always 0
**Live:** `/api/indices` returns `changePct:0`, mse.mk shows `-0.28%`.
- [ ] `lib/store.js`: compute `changePct` from last 2 index closes, same logic already in `server.js` `/api/quote/MBI10` modal special-case — move it to store so API is correct
- [ ] Add OMB: return `{ MBI10, OMB }` instead of MBI10-only

### P1 — UX / trust

#### 3.5 Table header accessibility
**Live extract:** column header literal `show_chart`, rows `starTNB` concatenated.
- [ ] `<th aria-label="Sparkline"><span aria-hidden="true">show_chart</span></th>`
- [ ] Star button: `aria-label="Add TNB to watchlist"`, symbol in separate `<span>`, CSS gap 6px

#### 3.7 Dividends = dead end
**Now:** only `Ex-date: follow mse.mk`.
- [ ] New page `/dividendi`: Symbol | Last div | Yield | Ex-date (manual from SEINet, 13 liquid only) | Payout streak, sortable by yield
- [ ] Per-symbol dividend history chart in modal (data already in ratios tables)

#### 3.8 Mobile table (8 cols won't fit, MK is phone-first)
- [ ] `<720px`: collapse to Star | Symbol+Name | Price+Change | Sparkline. Move Volume/52W to modal.
- [ ] Test on real phone, not desktop resize. No horizontal scroll.

#### 3.9 Missing trust pages
- [ ] Footer: `За нас | Извор на податоци | Методологија | Контакт`
- [ ] Each 1 paragraph + `Не е инвестициски совет. Податоците се едукативни, извор mse.mk.`
- [ ] Contact email + response time. Brokers won't link to anonymous scraper.

### P2 — performance

#### 3.10 Two chart libs loaded for everyone
`Chart.js 4.4.1` + `lightweight-charts 4.1.3` in `<head>` even if modal never opened (~300KB+).
- [ ] Remove from `<head>`, lazy-load on first `openCompany()`:
  ```js
  let lwcPromise = null;
  function loadLWC(){ if(window.LightweightCharts) return Promise.resolve(window.LightweightCharts); if(lwcPromise) return lwcPromise; lwcPromise = new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'; s.async=true; s.onload=()=>res(window.LightweightCharts); s.onerror=()=>{lwcPromise=null;rej(new Error('lwc load failed'))}; document.head.appendChild(s); }); return lwcPromise; }
  ```
- [ ] Table sparklines → inline SVG `<path>` (per `web-perf` skill), heavy lib only for modal.

#### 3.11 Missing SEO/social extras
- [ ] Add `twitter:card=summary_large_image`, `twitter:title/description/image`
- [ ] Add JSON-LD `Organization + WebSite` with `name: MSE Berza`
- [ ] Add single `<h1>` per page (home: `Македонска берза во живо — котации, графици, дивиденди`)
- [ ] Add lightweight analytics (plausible/umami) to learn which 5 symbols drive 80% traffic

---

## 4. SEO validation (blog-seo-check)

| # | Check | Status | Fix |
|---|---|---|---|
| 1 | Title ~31 chars, keyword front | PASS | — |
| 2 | Meta description bilingual | PASS | — |
| 3 | Canonical absolute `https://mseberza.info/` | PASS (mismatch on staging = expected) | Verify after move |
| 4 | OG title/desc/image/site_name | PASS | — |
| 5 | Twitter Card | FAIL | Add `summary_large_image` |
| 6 | Single H1 | FAIL | Add H1 per page |
| 7 | Internal links 3-10 | FAIL | `/s/{SYM}` links give 139 |
| 8 | URL slugs with keyword | FAIL | Ship `/s/ALK` |
| 9 | Icon alt / aria | WARN | Fix 3.5 |

---

4. **Broker directory.** List members from `mse.mk/mk/brokers` (Ilirika, Kompas, etc.) with fees + links. They link back = free SEO.
6. **USD/EUR rate in header.** mse.mk shows `1 USD=53.24 1 EUR=61.50`. Foreign investors need it.
7. **Explainer `Како да купиш акција: Инвестор → Брокер → Берза → ЦХВ`.** `berza.info` ranks because they wrote it. Write shorter MK version + broker links.
8. **Most active by turnover, not volume.** Penny stocks distort volume. Add turnover toggle — 1-line change, pro signal.

**Do NOT copy `berza.info`:** P/E multi-compare, Bitcoin compare, quarterly profit charts are their moat. Your moat = speed + dividends + alerts + bonds.

> Brand warning: `mseberza.info` vs `berza.info` will confuse users. Always brand as `MSE Berza — mseberza.info`, never just "Berza".

---

## 6. Roadmap checklist

### Before buying traffic (P0)
- [ ] Fix 52W dash, MBI10 %, `lang="mk"`, add H1
- [ ] Add `robots.txt` + `sitemap.xml` + `/s/{SYM}` pages
- [ ] Lazy-load chart libs (remove from `<head>`)
- [ ] Ship `/dividendi` calendar for 13 liquid

### Week after `mseberza.info` live (P1)
- [ ] OMB + bonds toggle
- [ ] About / Methodology / Disclaimer / Contact
- [ ] Mobile collapsed table, no h-scroll
- [ ] Daily recap post + newsletter signup
- [ ] Broker directory outreach (Ilirika, Kompas + `pari.com.mk` widget offer)

### KPIs to watch
- Indexed pages in Search Console (target: 140+ in 30 days)
- Top 5 symbols by traffic (expect ALK, KMB, TEL, MPT, TNB)
- Dividend page CTR from `алкалоид дивиденда` queries
- Returning visitors via watchlist (localStorage count)
- Backlinks from 1 portal + 1 broker

---

## 7. Files to touch

- `server.js` — SSR first paint, `/s/{SYM}`, `/sitemap.xml`, `/robots.txt`, OMB in `/api/indices`
- `public/index.html` — `lang="mk"`, H1, twitter cards, JSON-LD, remove eager chart scripts, footer trust links
- `public/app.js` — 52W formatter, aria labels, mobile render, lazy LWC loader, dividend table sort by yield
- `lib/store.js` — MBI10/OMB `changePct` from history, bond metadata passthrough

*Generated from live sweep 2026-09-16. Re-run after P0 fixes for verification.*
