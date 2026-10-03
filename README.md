# Momentum Screen Builder

Web app to **create and run NSE momentum screens** with the same **64 “Sort by” factors** as [MomoIndiaScreener](https://momoindiascreener.in/), plus MomoIndia-style filters (liquidity, % positive days, MA200, distance from highs, circuits, multi-sort, presets).

## Stack

- **UI:** Next.js 16, TypeScript, Tailwind, shadcn/ui  
- **Engine:** Python (`engine/`) — metrics, filters, NSE bhavcopy cache via [aynse](https://github.com/sudotman/aynse)  
- **Universes:** Nifty Indices constituent CSVs (50, 500, Total Market / N750 proxy, mid/small/micro, etc.)

## Run locally

```bash
# Node
npm install
npm run dev
# → http://127.0.0.1:43123

# Python (API route invokes this)
pip install -r requirements.txt
```

First screen run **syncs ~280 trading days** of bhavcopy into `data/prices.sqlite` (can take several minutes). Each row stores **EOD close** (`close_price`) and **LTP** (`last_price`); rankings use **LTP on the latest bar**. Later runs are incremental.

### Nifty Total Market — 2Y CA-adjusted cache (optional)

For offline analytics or faster local screens without per-run NSE corporate-action calls, build a **2-year** Nifty Total Market universe with **back-adjusted** prices:

```bash
pip install -r requirements.txt
PYTHONPATH=. python3 -m engine.adjusted_db 2
```

This writes to `data/prices.sqlite`:

| Table | Contents |
|-------|----------|
| `eod_raw` | Unadjusted EQ/BE bhavcopy for ~755 index symbols |
| `eod_adjusted` | Same bars after bonus/split/consolidation/scheme back-adjust |
| `ca_cache` | NSE corporate-actions JSON per symbol |
| `build_meta` | Last sync timestamps |

Re-run the command to refresh (raw days are replaced; CA cache is reused). See [docs/nse-corporate-actions-handling.md](docs/nse-corporate-actions-handling.md).

### Publish for everyone (Vercel Blob)

The SQLite file is too large for git (~88MB). Publish it to **public Vercel Blob** so anyone can download it and the live app can use pre-adjusted prices:

1. Link a **Blob** store to the Vercel project (Storage → Blob). This adds `BLOB_READ_WRITE_TOKEN`.
2. Set `PRICES_PUBLISH_SECRET` on the project (random string; protects the upload endpoint).
3. Deploy, then upload from a machine that has `data/prices.sqlite`:

```bash
export PRICES_PUBLISH_SECRET="<same as Vercel env>"
node scripts/publish_prices_db.mjs
```

The script uses **client-side multipart upload** (~35MB gzip) to Vercel Blob (avoids the 4.5MB serverless body limit).

Or with a local Blob token: `BLOB_READ_WRITE_TOKEN=... node scripts/publish_prices_db.mjs`

4. Set **`PRICES_MANIFEST_URL`** on Vercel to the printed `manifest_url` (public JSON with `download_url` + `sha256`).

**Public API:** `GET /api/prices/manifest` — metadata and download link. Screens use the shared DB automatically when `PRICES_MANIFEST_URL` is set (`sync.price_source: shared_db` in API responses).

## Live demo (Vercel)

**Production:** [https://momentum-screen-builder-app.vercel.app](https://momentum-screen-builder-app.vercel.app)

Linked to this repo on Cursor Origin; pushes to `main` redeploy automatically. Anonymous CLI “temporary” URLs often return **403** for visitors outside the agent session—use the production link above instead.

On Vercel, the API syncs enough trading days for your chosen sort (e.g. ~267 days for 1Y Sharpe). The results panel shows **Synced X / Y days bhavcopy**; if X is much smaller than Y or Primary factor is blank, hard-refresh and run again.

## CLI (optional)

```bash
PYTHONPATH=. python3 -m engine.screen <<'JSON'
{"index":"is_nifty_500","sort_by":"average_sharpe_return_12_6_3_months","limit":20}
JSON
```

## Features

| Area | Support |
|------|---------|
| Sort by | All **64** dropdown values |
| Sort direction | Highest → lowest / reverse |
| Secondary / tertiary sort | Yes |
| Index universe | 15 options (see UI) |
| Filters | Median volume, away-from-high (1Y/5Y/ATH), MA100/200, repo min return, return > vol, % positive days, max circuit days, ignore top beta, apply on all vs ranked |
| Presets | Viraj-style, Sharpe 1Y, Low vol |

## Limitations

- **P/E and market cap** need fundamentals (not in bhavcopy); those sorts/filters are stubs until you add a fundamentals source.  
- **Nifty F&O** universe uses N500 as proxy. **5Y high** uses cached history (full 5Y needs longer sync).  
- **ETF universe** not implemented yet.  
- Educational use only — not investment advice.

## Docs

See [docs/momentum-portfolios-guide.md](docs/momentum-portfolios-guide.md) for background on DIY momentum and data sources.
