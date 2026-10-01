# MomoIndia Screen #1 vs Momentum Screen Builder

Reference: [MomoIndia Sharpe Based Momentum (`/screens/1`)](https://momoindiascreener.in/screens/1)

## What Screen #1 uses (verified in UI)

| Setting | Value |
|---------|--------|
| Universe | **NIFTY TOTAL MARKET** |
| Sort by | **Sharpe return 1 year** |
| Direction | Highest → lowest |
| Secondary / tertiary sort | None |
| Advanced filters (liquidity, MA, % positive days, circuits) | **Off** on the public example |
| Result count shown | **~210** rows (Momo’s table) |

## Why lists differed (root causes)

### 1. EQ-only bhavcopy (fixed)

NSE publishes the same symbol on **EQ** or **BE** series. Screen #1’s top names include **BE** listings (e.g. **STLTECH**, **SIGMAADV**, **MTARTECH**, **HFCL**). Our engine previously kept **EQ rows only**, so those symbols had no (or wrong) history and never appeared at the top.

**Fix:** When `Series` is **All**, we now use **EQ if present, else BE** per day (same as viewing BE names on Momo).

### 2. App defaults ≠ Screen #1

The builder’s **default** screen is **Nifty 500 + average Sharpe 12-6-3 + secondary sort 12M−1M + limit 50**, not Screen #1. Use the **“Momo screen #1”** preset (or Sharpe 1Y preset + limit 210).

### 3. Universe size (~750 vs ~210)

We rank **all current Nifty Total Market CSV constituents** (~755 symbols) with enough price history (~685 with 1Y Sharpe). Momo’s table shows **~210** rows—likely their own **valid-data / liquidity / price-database** rules, not something exposed on the example screen. Rankings should still align on names **both** systems include.

### 4. Sharpe level on the same symbol

For names both lists share (e.g. **SANSERA**, **WELCORP**), Sharpe can differ slightly because Momo almost certainly uses **corporate-action-adjusted** prices and a proprietary history stack; we use **raw NSE `CLOSE_PRICE`** from daily bhavcopy. Formula shape matches community DIY: \(\text{ROC}_{252} / (\sigma_{\text{daily}} \sqrt{252})\).

### 5. Not investment metadata

Momo shows market cap, beta, MA200, etc. We do not filter on P/E or market cap unless you set those filters.

## How to compare fairly

1. Click **Momo screen #1** in the app (or set universe + Sharpe 1Y + no secondary sort + **Series: All** + limit **210**).
2. Hard-refresh after deploy so bhavcopy includes BE.
3. Compare **order and symbols** first; expect small numeric gaps on Sharpe.
