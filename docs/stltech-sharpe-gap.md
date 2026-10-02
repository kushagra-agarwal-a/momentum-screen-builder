# STLTECH 1Y Sharpe: our 12.29 vs Momo 10.88

Reference date: **2026-10-01** (same as MomoIndia screen #1).

## Side-by-side

| | **MomoIndia** | **Our engine (raw bhavcopy)** |
|---|---------------|-------------------------------|
| Sorting factor / Sharpe | **10.88** | **12.29** |
| Last price shown | **955.35** (BE) | **955.35** LTP |
| Formula (ours) | (unknown; likely ROC/vol on adjusted series) | **ROC₂₅₂ ÷ (σ_daily × √252)** on last **252 trading days** |

## Our calculation (reproducible)

Run:

```bash
pip install aynse pandas
PYTHONPATH=. python3 scripts/stltech_sharpe_reconcile.py
```

On **2026-10-01**, using NSE full bhavcopy (BE when listed, else EQ), **LAST_PRICE** on the final bar:

| Input | Value |
|--------|--------|
| Window | Last **252** trading days ending 2026-10-01 |
| Start (2025-10-14) | **112.63** (EQ, `close_price`) |
| End (2026-10-01) | **955.35** (BE, `last_price`) |
| 1Y ROC | **748%** (955.35 / 112.63 − 1) |
| Ann. vol (daily stdev × √252) | **60.9%** |
| **Sharpe = ROC / vol** | **12.29** |

Momo’s **10.88** on the same LTP implies, with the **same formula**, either:

- Effective ROC ≈ **663%** (about **11% lower** start price ≈ **125** instead of **112.63**), or  
- Effective vol ≈ **68.7%** (about **13% higher**), or  
- A **different definition** (e.g. mean(daily return)×252 / vol ≈ **3.8** — not what Momo displays).

So the gap is **not** from displaying LTP vs close on the last tick (both use **955.35**).

## Corporate actions (NSE PR / corp-actions API)

STLTECH events from [NSE corporate actions API](https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=STLTECH):

| Ex-date | Subject |
|---------|---------|
| **2025-04-24** | **Demerger** (EQ → BE listing) |
| 2023-08-08 | Dividend ₹1 |
| … | Older dividends / 2010 **1:1 bonus** |

### Demerger **inside** vs **outside** the 252-day window

- **Demerger ex-date: 2025-04-24** (EQ **86.97** → BE **65.05** on the next session).  
- Our **252-day window** runs **2025-10-14 → 2026-10-01** — entirely **after** the demerger.  
- **Back-adjusting** pre–Apr-2025 prices does **not** change any price inside this window, so it **does not** explain 12.29 vs 10.88 by itself.

NSE **PR archives** (`PRddmmyy.zip`, **Bc** CSV) are the official CA feed; archives often return 503 from some networks — we use the **corp-actions JSON API** plus ex-date **price ratios** from bhavcopy when the ex-date is present in the loaded series.

### EQ / BE on the same symbol

Within the 252-day window:

- **2025-10-14 → 2026-05-13**: **EQ** (e.g. 112 → 405)  
- **2026-05-14 → 2026-10-01**: **BE** (405 → 955)  
- Switch on **2026-05-13 / 2026-05-14**: EQ **405.15** → BE **422.90** (~**4%** — not a gap driver).

We prefer **BE** when both exist on a day; otherwise **EQ** — same idea as showing **BE** on Momo.

## What likely explains the remaining ~1.4 Sharpe gap

1. **Momo’s internal adjusted price series** (corporate actions + possibly vendor restatements) over a **longer** history than raw bhavcopy, used for both ROC and vol — we use **unadjusted** NSE `CLOSE_PRICE` / `LAST_PRICE` except where we apply explicit CA back-adjusts when ex-dates fall **inside** loaded history.  
2. **Unknown Momo formula tweaks** (risk-free subtraction, winsorizing returns, min history rules, etc.) — not published.  
3. **Historical bhavcopy gaps** in bulk sync (some dates 404 via aynse) — can shift window start slightly; run `scripts/stltech_sharpe_reconcile.py` after a full sync to verify.

## What we changed in the product

- **`apply_corporate_actions`** (default on): NSE corp-actions + back-adjust (demerger/scheme, bonus, cash dividend) when ex-dates appear in the loaded bar series.  
- **LTP** stored and used on the **latest bar** for ranking.  
- **`scripts/stltech_sharpe_reconcile.py`**: line-by-line Sharpe audit for STLTECH.

To compare fairly with Momo screen #1, use preset **Momo screen #1**, hard-refresh after deploy, and compare **symbols + order** first; treat **10.88 vs 12.x** as adjusted-history / methodology unless Momo documents their exact Sharpe.
