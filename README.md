# India Momentum Portfolio Research

Research notes and small utilities for **DIY momentum portfolios** on NSE, based on the Portfolio Yoga (PY-Slack) community, [MomoIndiaScreener](https://momoindiascreener.in/), and official NSE/Nifty Indices data.

## Contents

- **[docs/momentum-portfolios-guide.md](docs/momentum-portfolios-guide.md)** — Full write-up: system design, WRH, MomoIndia filters, bhavcopy, index universes, historical constituents.
- **`scripts/nse_universe.py`** — Download **current** Nifty index constituent symbols (50, 500, Total Market / ~750, mid/small/micro, etc.).
- **`scripts/bhavcopy_fetch.py`** — Fetch one day of **full equity bhavcopy** via `aynse`.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Current Nifty 500 symbols
python scripts/nse_universe.py NIFTY_500 --symbols-only | head

# Nifty Total Market (~755 names — community "N750" universe proxy)
python scripts/nse_universe.py NIFTY_TOTAL_MARKET --symbols-only | wc -l

# Latest available full bhavcopy
python scripts/bhavcopy_fetch.py --date 2026-09-29 --out /tmp/bhav.csv
```

## Data sources (summary)

| Need | Source |
|------|--------|
| Daily OHLCV (equities) | NSE `sec_bhavdata_full` / CM-UDiFF bhavcopy; `aynse full_bhavcopy_df` |
| Index OHLC | NSE index bhavcopy (`ind_close_all`, etc.) |
| **Current** index members | [niftyindices.com IndexConstituent CSVs](https://www.niftyindices.com/) |
| **Historical** members | `IndexInclExcl.xls`, monthly weightage archives, AMFI lists, or reconstructed from bhavcopy |

## Disclaimer

Educational research only—not investment advice. Momentum strategies can draw down sharply; backtests are sensitive to survivorship bias and taxes.
