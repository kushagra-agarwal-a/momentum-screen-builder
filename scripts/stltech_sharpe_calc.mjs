/** One-off: STLTECH calendar 1Y Sharpe with step-by-step numbers (matches src/lib/engine). */
import { loadPriceHistory } from "../src/lib/engine/bhavcopy.ts";
import { closesForMetrics, lastDisplayPrice } from "../src/lib/engine/prices.ts";
import {
  calendarStartIso,
  indexOnOrBeforeCalendarStart,
  sliceByCalendarPeriod,
} from "../src/lib/engine/calendar-window.ts";
import { dailyReturns } from "../src/lib/engine/metrics.ts";

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

const sym = "STLTECH";
const lookback = 280;
const { bySymbol, fetchedDays, asOf } = await loadPriceHistory([sym], lookback, "all");
const bars = bySymbol.get(sym);
if (!bars?.length) {
  console.error("No bars loaded");
  process.exit(1);
}

const dates = bars.map((b) => b.date);
const closes = closesForMetrics(bars);
const display = lastDisplayPrice(bars);
const endIdx = dates.length - 1;
const anchor = calendarStartIso(dates[endIdx], "1_year");
const startIdx = indexOnOrBeforeCalendarStart(dates, endIdx, "1_year");
const slice = sliceByCalendarPeriod(dates, closes, "1_year");

if (!slice) {
  console.error("Could not slice calendar 1Y");
  process.exit(1);
}

const seg = slice.segment;
const rets = dailyReturns(seg);
const volDaily = stdev(rets);
const volAnn = volDaily * Math.sqrt(252);
const startPx = seg[0];
const endPx = seg[seg.length - 1];
const roc = endPx / startPx - 1;
const sharpe = roc / volAnn;

console.log(
  JSON.stringify(
    {
      symbol: sym,
      series: bars[bars.length - 1].series,
      as_of: asOf,
      fetched_trading_days: fetchedDays,
      calendar_anchor_1y: anchor,
      window_start_date: dates[slice.startIdx],
      window_end_date: dates[slice.endIdx],
      trading_sessions_in_window: seg.length,
      daily_returns_count: rets.length,
      start_ltp: seg[0],
      start_eod_close: bars[slice.startIdx].close,
      end_ltp: seg[seg.length - 1],
      end_eod_close: display.close,
      roc_1y: roc,
      daily_return_stdev: volDaily,
      annualized_vol_sqrt252: volAnn,
      sharpe_roc_over_vol: sharpe,
      formula: "Sharpe = (P_end/P_start - 1) / (stdev(daily_returns) * sqrt(252))",
      momo_reference_sharpe: 10.88,
      momo_reference_ltp: 955.35,
    },
    null,
    2,
  ),
);
