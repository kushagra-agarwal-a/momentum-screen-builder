# Building Momentum Portfolios (India) — Research Notes

Compiled from [PY-Slack momentum archive](https://py-slack.virajkhatavkar.com/channels/momentum), [MomoIndiaScreener](https://momoindiascreener.in/), NSE/Nifty Indices data sources, and community DIY guides.

---

## 1. What “momentum investing” means in this community

Momentum factor investing ranks stocks by **recent risk-adjusted or raw price strength**, holds a concentrated basket (often top decile or top 20–30 names), and **rebalances on a fixed calendar** (weekly, monthly, or quarterly). The PY-Slack `#momentum` channel (~48k messages) is essentially a DIY practitioners’ forum sharing monthly returns, rebalance rules, and system design—not a single official recipe.

Core idea from multiple PY threads (e.g. S K Rahman, Anand M, Abhinav Mehrotra):

| Layer | Typical choices |
|--------|------------------|
| **Universe** | Nifty 50/100/200/500, Nifty Total Market (~755, often called “N750”), Midcap 150, Smallcap 250, Microcap 250, All NSE listed (liquidity-filtered) |
| **Liquidity filter** | e.g. median daily volume ≥ ₹25 lakh, or turnover > ₹2 crore/day |
| **Ranking** | 12M ROC, average return over 12/9/6/3/1M, **Sharpe** over same windows, RSI, beta-adjusted Sharpe, “12M minus 1M” (skip recent month) |
| **Portfolio size** | 10–30 common; some use 75–150 on large universes (top ~10% decile) |
| **Weighting** | Equal weight most common in DIY; NSE factor indices often cap-weight momentum |
| **Rebalance** | Monthly most common; NSE factor indices often **semi-annual** (Jun/Dec) |
| **Churn control** | **Worst Rank Held (WRH)** — keep a holding until rank falls below a threshold (e.g. 2× portfolio size: 25 stocks → WRH 50) |

Official NSE momentum benchmarks cited often:

- **Nifty 500 Momentum 50 (N500M50)** — ~50 stocks, semi-annual rebalance, 12M–6M risk-adjusted ranking, momentum + market-cap weighting  
- **Nifty 200 Momentum 30 (N200M30)**  
- **Nifty Midcap 150 Momentum 50 (M150M50)**

DIY systems frequently target **equal weight + monthly rebalance + WRH** to reduce turnover vs index funds.

---

## 2. Step-by-step system design (Python-oriented roadmap)

From Nilesh Nayak / PY `#python-project` (paraphrased pipeline):

1. **Fetch EOD bhavcopy** from NSE (daily).  
2. **Store** in SQLite or partitioned CSV.  
3. **Resolve universe** for each rebalance date (point-in-time constituents—avoid survivorship bias).  
4. **Pull lookback closes** (e.g. 252 trading days) per symbol.  
5. **Compute factor** (Sharpe, avg Sharpe 12-6-3, ROC, etc.).  
6. **Apply filters** (liquidity, % positive days, MA200, circuit limits, distance from high).  
7. **Rank** → select top N → apply WRH for exits between formal rebalance dates.  
8. **Simulate** with realistic turnover, taxes, and delisted names.

**Backtesting caveats (PY consensus):**

- Use **point-in-time index membership** (not today’s Nifty 500 list for 2018).  
- Include **delisted/bankrupt** names in price history.  
- **Skip 1 month** after lookback when simulating entries to reduce serial-correlation optimism.  
- Parameter overfitting (exact WRH, stock count) is less important than **asset allocation to the strategy** and sticking to rules through drawdowns.

---

## 3. Ranking formulas (practical)

### Simple price momentum

\[
\text{ROC}_{12M} = \frac{P_t}{P_{t-252}} - 1
\]

### Sharpe (DIY convention from Google Sheets guide)

1. Daily returns over lookback (e.g. 252 days).  
2. \(\sigma_{\text{daily}} = \text{stdev}(\text{daily returns})\), annualize: \(\sigma_{\text{ann}} = \sigma_{\text{daily}} \sqrt{252}\).  
3. \(\text{Sharpe} \approx \dfrac{\text{ROC}_{\text{lookback}}}{\sigma_{\text{ann}}}\) (risk-free term often omitted in ranking).  

For **multi-window Sharpe** (e.g. Viraj’s screen: average of 12, 6, 3 months): compute Sharpe for each window, then average.

### Secondary sort (example from PY)

Primary: **Average Sharpe 12-6-3** descending.  
Secondary: **Return 12M minus 1M** descending (reduce short-term reversal noise).

---

## 4. MomoIndiaScreener — universes and filters

Login required for custom screens; example screens are visible when logged in. Screen `/screens/1` is a template; community configs often use URLs like screen `318` with query parameters.

### Index / universe options

- NIFTY 50, NEXT 50, 100, 200, 500  
- NIFTY TOTAL MARKET  
- NIFTY LARGE MID 250, MIDCAP 150, SMALLCAP 250, MICROCAP 250, MID SMALL 400  
- NIFTY F&O  
- All NSE listed stocks / ETFs  

**Note:** “NSE 750” in the screener (`index=is_nse_750`) aligns with the community’s **Nifty Total Market–style** broad liquid universe (~750 names), not a separate NSE index ticker.

### Ranking factors (64 in dropdown)

Grouped as:

- Absolute return (1, 3, 6, 9, 12 months)  
- Average absolute return (many combinations of 12/9/6/3/1)  
- Sharpe return (1, 3, 6, 9, 12 months)  
- Average Sharpe (combinations above)  
- RSI and average RSI  
- Beta-adjusted (absolute/Sharpe ÷ beta)  
- **Return 12 minus 1 month**, **Return 12 minus 2 months**  
- Volatility 1Y, Beta  
- P/E, Market cap  
- Close / Close raw  
- **Away from high** (all-time, 1Y)  

### Example preset screens

| Name | Universe | Sort factor | Direction |
|------|-----------|-------------|-----------|
| Sharpe Based Momentum | NIFTY TOTAL MARKET | Sharpe return 1 year | High → Low |
| Viraj's Momentum Screen | NIFTY ALLCAP | Average Sharpe 12-6-3 months | High → Low |
| Low Volatility | NIFTY ALLCAP | Volatility 1 year | Low → High |
| ETF Screen | ETF | Average Sharpe 12-9-6-3 months | High → Low |

### Additional filters (URL parameters — example DIY config from PY)

| Parameter | Example | Meaning |
|-----------|---------|---------|
| `median_volume` | 2500000 | Liquidity (median volume) |
| `ma_200` | yes | Price above 200 DMA |
| `percentage_positive_days_one_year` | 50 | FIP-style filter (Quantitative Momentum) |
| `exclude_stocks_with_circuits_one_year` | 5 | Exclude frequent circuit-hit names |
| `away_from_all_time_high` | -100 | Cap on distance from ATH (e.g. -25%) |
| `ignore_top_beta` | no | Exclude very high-beta names |
| `sort_by_two` | return_twelve_one | Secondary: 12M−1M return |
| `minimum_return_one_year` | repo | vs repo rate |

---

## 5. NSE bhavcopy — what to download

### Post–July 2024 (current)

NSE discontinued legacy **CM bhavcopy CSV** (Circular 62424). Use:

- **CM-UDiFF Common Bhavcopy Final (ZIP)** — from [NSE All Reports](https://www.nseindia.com/all-reports)  
- **`sec_bhavdata_full_{DDMMYYYY}.csv`** on `nsearchives.nseindia.com` (full equity EOD)  

Python: [`aynse`](https://github.com/sudotman/aynse) — `full_bhavcopy_df(date)`, `bhavcopy_index_*` for index OHLC.

### Pre–July 2024

Historical ZIP path:  
`/content/historical/EQUITIES/{yyyy}/{MMM}/cm{dd}{MMM}{yyyy}bhav.csv.zip`

### Index level OHLC

Index bhavcopy files (e.g. `ind_close_all`) for Nifty 50, sector indices, etc.

### IP blocking

NSE may block datacenter IPs. Mitigations discussed in PY: residential IP, rate limiting, cookies/session headers, paid vendors (Accelpix, etc.), or tools like GetBhavCopy.

---

## 6. Current index constituents (Nifty 50, 500, etc.)

### Free — current snapshot (official)

Nifty Indices publishes CSV under:

`https://www.niftyindices.com/IndexConstituent/{file}`

| Index | CSV file | Approx. count |
|-------|----------|----------------|
| Nifty 50 | `ind_nifty50list.csv` | 50 |
| Nifty Next 50 | `ind_niftynext50list.csv` | 50 |
| Nifty 100 | `ind_nifty100list.csv` | 100 |
| Nifty 200 | `ind_nifty200list.csv` | 200 |
| Nifty 500 | `ind_nifty500list.csv` | 501 |
| **Nifty Total Market** | `ind_niftytotalmarket_list.csv` | **755** |
| Nifty Midcap 150 | `ind_niftymidcap150list.csv` | 150 |
| Nifty Smallcap 250 | `ind_niftysmallcap250list.csv` | 251 |
| Nifty Microcap 250 | `ind_niftymicrocap250list.csv` | 250 |
| Nifty LargeMidcap 250 | `ind_niftylargemidcap250list.csv` | 250 |

Columns typically: Company Name, Industry, **Symbol**, Series, ISIN.

### NSE JSON API (browser-like session)

After visiting `nseindia.com`, `GET /api/allIndices` returns live index levels. Per-index stock lists have moved; some `equity-stockIndices` URLs now 404—prefer Nifty Indices CSV for constituents.

### Historical constituents (harder)

| Source | Coverage | Notes |
|--------|----------|-------|
| [IndexInclExcl.xls](https://archives.nseindia.com/content/indices/IndexInclExcl.xls) | Inclusion/exclusion dates; sheets per index incl. **Nifty 500** from Aug 1998 | Point-in-time reconstruction |
| [Nifty historical reports](https://www.niftyindices.com/reports/historical-data) | Monthly “Market Cap & Weightage” archives | Post–Apr 2022 often **F&O indices only** in some packs; N500 full history gaps after Mar 2022 per forum reports |
| Monthly ZIP pattern | `indices_data{Mon}{yyyy}.zip` on niftyindices | e.g. `indices_dataApr2022.zip` |
| AMFI market-cap lists | Half-year snapshots | Used by some backtest engines for survivorship-free universes |
| Daily bhavcopy + rules | Full NSE history | Reconstruct “who traded and qualified” — heavy but survivorship-free |

For **realistic backtests**, PY consensus: historical membership matters; for **comparing ranking variants** on the same dataset, perfect history is less critical.

---

## 7. Worst Rank Held (WRH) — exit logic

From Anand M (PY):

- Portfolio holds top **N** names by rank.  
- A stock **does not exit** immediately when it slips below rank N.  
- Exit when rank falls below **WRH** (e.g. N=10, WRH=20).  
- Then buy the best-ranked name not held.

Rule of thumb: WRH ≈ **2 × number of positions** (MaheshG). Example DIY fund thought experiment: 30 stocks, WRH=90 on N750 universe (Alex Thomas).

WRH reduces churn and taxes; in strong trends it may keep losers too long—trade-off vs monthly strict top-N.

---

## 8. Reference DIY / NSE index parameters

| Strategy element | DIY common | N500M50 (NSE index) |
|------------------|------------|---------------------|
| Universe | N500 / N750 / NTM | Nifty 500 + liquidity rules |
| Count | 20–30 | 50 |
| Rank | Sharpe 12-6-3 or 12M−6M risk-adj | 12M & 6M risk-adjusted |
| Weight | Equal | Momentum × market cap |
| Rebalance | Monthly | Semi-annual |
| WRH | 50–100 typical | N/A (index rules) |

BSE momentum indices: **30 stocks**, **quarterly** rebalance, **12M** formation only (vs NSE 50 / semi-annual / 12+6M)—JC, PY Jul 2026.

---

## 9. Further reading (linked from PY)

- Clenow — *Stocks on the Move*; Quantitative Momentum (FIP / positive days)  
- [DIY Google Sheets screener](https://oldschoolfinance.wordpress.com/2020/11/03/building-a-diy-momentum-screener-on-google-sheets/) — Abhinav Mehrotra  
- [NSE technical dashboard](https://oldschoolfinance.wordpress.com/2020/10/14/nse-technical-dashboard/)  
- Capitalmind / Old School Finance posts on factor cycles  
- Member strategy spreadsheet (linked in PY): Google Sheet of community approaches  

---

## 10. Security note

Do not commit screener or broker credentials to git. Use environment variables or local secrets for automation.
