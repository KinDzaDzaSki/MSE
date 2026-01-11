# Deploying to Vercel

Minimal steps to deploy this Next.js app to Vercel.

1) Connect repository
- Go to https://vercel.com and import the repository (or use `vercel link`).

2) Set environment variables
- Required: `NEON_DATABASE_URL` or `DATABASE_URL` (production/preview/development)
- Optional: `LOCAL_DATABASE_URL` for local dev

Example `vercel` CLI commands (run locally after `vercel login` and `vercel link`):

```powershell
# add production secret
vercel env add NEON_DATABASE_URL production
# add preview secret
vercel env add NEON_DATABASE_URL preview
# add development secret
vercel env add NEON_DATABASE_URL development
```

You can also set variables in the Vercel Dashboard under Project → Settings → Environment Variables.

3) Deploy
- From the repo root:

```powershell
# first deploy (link + confirm)
vercel --confirm
# or deploy production
vercel --prod
```

4) Verify
- Health endpoint: `https://<your-deployment-url>/api/health`

Notes & recommendations
- `puppeteer` is included in the project. Vercel Serverless Functions do not include a Chromium binary by default. Options:
  - Move scraping to a dedicated worker or separate service (recommended).
  - Use a headless-browser-as-a-service (Browserless, Playwright Cloud).
  - Use a Docker-based host that provides Chromium.

- Files added/edited:
  - `vercel.json` (build settings)
  - `.env.example` (example env vars)
  - `VERCEL_DEPLOY.md` (these instructions)

If you want, I can:
- Create a small PowerShell script to run the `vercel env add` commands with placeholder values.
- Implement a scraping worker scaffold and a simple API bridge.
