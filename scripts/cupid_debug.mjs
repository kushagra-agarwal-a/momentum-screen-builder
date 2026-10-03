import { loadPriceHistory } from "../src/lib/engine/bhavcopy.ts";
import { closesForMetrics } from "../src/lib/engine/prices.ts";
import { computeSortMetric, dailyReturns } from "../src/lib/engine/metrics.ts";
import { sliceByCalendarPeriod, calendarStartIso, indexOnOrBeforeCalendarStart } from "../src/lib/engine/calendar-window.ts";
import { fetchCorporateActions, backAdjustBars } from "../src/lib/engine/corporate-actions.ts";

const sym = "CUPID";
const { bySymbol, fetchedDays, asOf } = await loadPriceHistory([sym], 300, "all");
const bars = bySymbol.get(sym);
if (!bars?.length) {
  console.error("No bars");
  process.exit(1);
}
const dates = bars.map((b) => b.date);
const closes = closesForMetrics(bars);
const slice = sliceByCalendarPeriod(dates, closes, "1_year");
const endIdx = dates.length - 1;
const startIdx = indexOnOrBeforeCalendarStart(dates, endIdx, "1_year");

function stdev(a, ddof) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - ddof));
}

const seg = slice.segment;
const rets = dailyReturns(seg);
const roc = seg.at(-1) / seg[0] - 1;
const vol = stdev(rets, 1) * Math.sqrt(252);

console.log(
  JSON.stringify(
    {
      fetchedDays,
      asOf,
      barCount: bars.length,
      lastSeries: bars.at(-1)?.series,
      calendarAnchor: calendarStartIso(dates[endIdx], "1_year"),
      window: { start: dates[slice.startIdx], end: dates[slice.endIdx], sessions: seg.length },
      startClose: seg[0],
      endClose: seg.at(-1),
      absolute_return_1y_pct: (roc * 100).toFixed(2),
      vol_pct: (vol * 100).toFixed(2),
      sharpe: roc / vol,
      engine_sharpe: computeSortMetric("sharpe_return_1_year", closes, bars.map((b) => b.high), [], dates),
      engine_abs: computeSortMetric("absolute_return_1_year", closes, bars.map((b) => b.high), [], dates),
    },
    null,
    2,
  ),
);

const moves = rets
  .map((r, i) => ({ date: dates[slice.startIdx + i + 1], ret: r, close: closes[slice.startIdx + i + 1] }))
  .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret))
  .slice(0, 12);
console.log("\nLargest daily moves in 1Y window:");
console.log(moves);

console.log("\nMar 2026 bars (bonus 4:1 ex 09-Mar-2026):");
for (const b of bars.filter((x) => x.date >= "2026-03-01" && x.date <= "2026-03-20")) {
  console.log(b.date, b.series, b.close);
}

console.log("\nAround calendar start Oct 2025:");
for (let i = Math.max(0, startIdx - 2); i <= Math.min(bars.length - 1, startIdx + 5); i++) {
  const b = bars[i];
  console.log(b.date, b.series, b.close);
}

const ca = await fetchCorporateActions("CUPID");
const { bars: adj, notes } = backAdjustBars(bars, ca);
const adjCloses = closesForMetrics(adj);
const adjDates = adj.map((b) => b.date);
console.log("\nCorporate actions applied:", notes);
console.log("Adjusted metrics:", {
  abs: computeSortMetric("absolute_return_1_year", adjCloses, [], [], adjDates),
  sharpe: computeSortMetric("sharpe_return_1_year", adjCloses, [], [], adjDates),
});
