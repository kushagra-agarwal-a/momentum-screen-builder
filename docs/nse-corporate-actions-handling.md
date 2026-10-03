# NSE corporate actions — sample & back-adjust rules

## Data source (only)

| Item | Detail |
|------|--------|
| API | `GET https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol={SYMBOL}` |
| Auth | Session cookie from `https://www.nseindia.com/` |
| Fields used | `exDate` (e.g. `09-Mar-2026`), `subject` (free text), `series` (usually `EQ`) |
| Not used | NSE PR `.zip` archives, bhavcopy, BSE, MomoIndia |

Sample script: `scripts/sample_nse_corporate_actions.mjs`  
Raw summary: `docs/nse-ca-sample.json` (200 NIFTY 500 names, Oct 2026 run).

## Sample stats (200 symbols, 2,880 rows)

| Classification | Count | % of rows | Back-adjust for price momentum? |
|----------------|------:|----------:|----------------------------------|
| Dividend | 2,307 | 80% | Optional (see below) |
| Administrative (AGM, book closure, etc.) | 373 | 13% | **No** |
| Bonus | 65 | 2.3% | **Yes** |
| Face-value split / sub-division | 41 | 1.4% | **Yes** |
| Buyback | 35 | 1.2% | **No** (market price; no historical rewrite) |
| Scheme / demerger / arrangement | 16 | 0.6% | **Yes** (ratio from prices; see limits) |
| Other / unparsed | 42 | 1.5% | Review |
| Rights | 1* | — | **Special** (formula, not a simple factor) |

\*Rights are rare in this slice; ADANIENT `Rights 3:25 @ Premium…` was mis-bucketed as “other” until subject parser includes `Rights` before generic patterns.

187/200 symbols returned at least one row; 13 empty/failed (illiquid, NSE gap, or cookie).

## How to handle each type (price back-adjustment)

Apply factors to **all sessions with `date < exDate`** on `close`, `high`, `ltp`.  
Process events in **chronological order** (oldest `exDate` first).  
Use **official ex-date** from NSE (not record date).

### Bonus (`Bonus A:B`)

NSE means **A bonus shares for every B shares held**.  
New share count multiplier = `(A+B)/B`. Price back-adjust factor:

```text
factor = B / (A + B)
```

Examples: `Bonus 1:1` → ×0.5; `Bonus 4:1` → ×0.2.

### Face-value split / sub-division

Typical subject:  
`Face Value Split (Sub-Division) - From Rs 10/- Per Share To Re 1/- Per Share`

```text
factor = newFaceValue / oldFaceValue
```

(10 → 1 gives ×0.1 on pre-ex prices; 2 → 1 gives ×0.5.)

If only a ratio `A:B` appears without face values, treat as **B/A** on price (verify against ex-day close ratio).

### Consolidation / reverse split

Rare in sample. Prefer **ex-day ratio** `close(ex) / close(ex−1)` on unadjusted series, same as demerger fallback.

### Demerger / scheme of arrangement / merger

Subject is often vague (`Demerger`, `Scheme Of Arrangement`).  
**Default:** factor = `close(ex) / close(ex−1)` on the parent symbol.  

**Limit:** NSE does not give clean “ratio” in JSON; value may be listed separately, and sibling listings (e.g. STLTECH BE after demerger) need series-aware history. Full parity may require NSE adjustment factor or combined entity pricing.

### Dividend

For **total-return** style continuity:

```text
factor = (P_pre − D) / P_pre
```

where `P_pre` is close on the session before ex-date, `D` = dividend per share parsed from subject (`Rs`, `Re`, typos like `Divdend`).

For **price-return momentum** (many screeners): **omit dividend adjustments** — dividends are ~80% of rows and barely move Sharpe on 1Y; splits/bonus dominate (CUPID, STLTECH).

### Rights issue

Subject example: `Rights 3:25 @ Premium Rs 1799/-`.  
Requires **theoretical ex-rights price** (TERP), not `B/(A+B)`:

```text
TERP = (P_old * N + subscriptionPrice * newShares) / (N + newShares)
factor = TERP / P_old
```

Parse `A:B` and premium from subject; flag when premium missing.

### Buyback / AGM / meetings

**No** historical price multiply. Buyback ex-dates are informational for this engine.

## What was wrong before

1. **Gap heuristic (±35% day)** — misses small splits, wrong order vs NSE ex-date list, no split face-value parsing.  
2. **Bonus-only + dividend + demerger regex** — **splits** often paired with bonus (CUPID 2024) but split line was ignored.  
3. **CA only after rank** — names like CUPID never got adjusted.  
4. **Dividend typos** — `Interim Divdend` skipped.  
5. **Rights** — not implemented.

## Recommended engine pipeline

1. Load unadjusted bhavcopy closes.  
2. Fetch NSE CA JSON **per symbol** (or bulk cache — see scaling).  
3. Classify each row; drop administrative + buyback.  
4. Keep events with `exDate` within `(firstBar, lastBar]` or that affect lookback (bonus/split before window still adjust earlier history).  
5. Apply chronological back-adjust for bonus, split, scheme/demerger (ratio), optional dividend.  
6. Compute calendar Sharpe on adjusted closes.

## Scaling (200+ stocks)

Per-symbol NSE calls do not scale to 750 names × every screen run (~2–3 min+). Options:

- Nightly job: write `symbol → CorpAction[]` to SQLite / blob.  
- Or NSE “corporate actions for date range” bulk endpoint if available.  
- Screen run reads cache only.

Until then, typed CA after fetch is **correct**; gap-only is **not** sufficient.

## Offline DB build (implemented)

```bash
PYTHONPATH=. python3 -m engine.adjusted_db 2   # years of history (≈252 × years trading days)
```

Pipeline (`engine/adjusted_db.py` + `engine/corporate_actions.py`):

1. Resolve **Nifty Total Market** symbols (`engine/universe.py`).
2. Pull daily full bhavcopy via **aynse** → `eod_raw`.
3. Fetch NSE CA JSON per symbol (cached in `ca_cache`) → back-adjust → `eod_adjusted`.

Python loaders: `engine.data_loader.load_adjusted_series()`. Raw bhavcopy table `eod` (legacy screen sync) coexists in the same SQLite file.
