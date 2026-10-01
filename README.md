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

First screen run **syncs ~280 trading days** of bhavcopy into `data/prices.sqlite` (can take several minutes). Later runs are incremental.

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
