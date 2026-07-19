# MSE Clone — Macedonian Stock Exchange Dashboard

A self-hosted clone of the Macedonian Stock Exchange (mse.mk) with a
Yahoo-Finance-style dashboard: live-ish quotes, tickers, sparklines,
company pages with historical price charts, and index tracking.

Data is scraped from the **public, free end-of-day** pages on
[www.mse.mk](https://www.mse.mk) — no API key or contract required.

## How it works

- `lib/scraper.js` — fetches & parses mse.mk HTML:
  - symbol list (history-page dropdown + homepage headline tickers)
  - per-issuer quotes (`/en/symbol/{TICKER}`)
  - historical OHLCV via POST to `/en/stats/symbolhistory/{TICKER}`
  - index values (`/en/indicies/MBI10/values`, `OMB`)
- `lib/db.js` — PostgreSQL persistence (tables: `meta`, `quotes`,
  `history`, `indices`) with upsert helpers and auto-migration.
- `lib/store.js` — scheduler that polls **while the market is open**
  (Mon–Fri, 09:00–14:30 Skopje time) every 60s, and a historical backfill
  that fetches ~1y windows per symbol; reads/writes go through `lib/db.js`.
- `server.js` — Node HTTP server exposing JSON APIs + static dashboard.
- `public/` — dashboard UI (Chart.js + lightweight-charts from CDN).

## Requirements

- Node.js >= 18
- PostgreSQL (or use the free Render Postgres add-on in one click)

## Run locally

```bash
npm install
export DATABASE_URL="postgresql://user:pass@localhost:5432/mse"
node server.js
# open http://localhost:3000
```

On first boot the schema is created automatically (`lib/db.js` → `migrate()`),
the symbol list is fetched from mse.mk, and an initial poll runs.

Backfill history for charts (one-off, takes a few minutes for all symbols):

```bash
# backfill a single symbol
curl "http://localhost:3000/api/backfill/ALK?days=400"
# backfill everything (sequential, polite)
curl "http://localhost:3000/api/backfill-all"
# force a quote/index refresh now
curl "http://localhost:3000/api/refresh"
```

Set `PORT` to change the port (default 3000).

## Deploy (free tier)

### Railway (recommended, free to start)

1. Push this repo to GitHub.
2. In Railway, **New Project → Deploy from GitHub repo** → select `KinDzaDzaSki/MSE`.
   `railway.json` configures the build (`npm install`) and start (`npm start`).
3. Add a **PostgreSQL** plugin to the project (free). Railway auto-injects
   `DATABASE_URL` — no manual env setup needed.
4. First deploy runs schema migration + initial poll. Then trigger a backfill:
   `curl https://<your-app>.up.railway.app/api/backfill-all`.

Railway gives free trial credits; a low-traffic app stays within the free
allowance. Upgrade only when you're ready to market.

### Render (paid web service)

Render now charges ~$7/mo for web services (Postgres stays free). If you
prefer Render, use `render.yaml` via **New → Blueprint**. Set
`DATABASE_URL` from the Postgres add-on.


## APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/symbols` | symbol list + market-open flag |
| GET | `/api/quotes` | all quotes (price, %chg, volume, turnover) |
| GET | `/api/quote/{SYM}` | single issuer detail |
| GET | `/api/history/{SYM}?range=1M\|3M\|6M\|1Y` | historical OHLCV |
| GET | `/api/indices` | MBI10 + OMB values |
| GET | `/api/backfill/{SYM}?days=N` | fetch & store history |
| GET | `/api/backfill-all` | backfill all symbols |
| GET | `/api/refresh` | force quote + index refresh |

## Notes & limitations

- Source data is **end-of-day / delayed**; this is not a real-time feed.
  During market hours the scraper refreshes every 60s; outside hours it
  holds the last snapshot.
- Historical depth is limited to ~1 year per request by the source; the
  backfill stitches multiple windows to build a longer series.
- Respect the source: requests are throttled (~40ms between quotes). For
  production/commercial use, license the official MSE data feed.
- Educational / personal use. Attribute mse.mk as the data source.
