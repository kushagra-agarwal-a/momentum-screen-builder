import {
  calendarLookbackTradingDays,
  calendarStartIso,
  indexOnOrBeforeCalendarStart,
  sliceByCalendarPeriod,
  type CalendarPeriod,
} from "./calendar-window";

const W_1M = 21;
const W_6M = 126;
const W_12M = 252;

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

function absoluteReturnCalendar(
  closes: number[],
  dates: string[],
  period: CalendarPeriod,
): number | null {
  const slice = sliceByCalendarPeriod(dates, closes, period);
  if (!slice || slice.segment.length < 2) return null;
  const start = slice.segment[0];
  const end = slice.segment[slice.segment.length - 1];
  if (start <= 0) return null;
  return end / start - 1;
}

function sharpeReturnCalendar(
  closes: number[],
  dates: string[],
  period: CalendarPeriod,
): number | null {
  const slice = sliceByCalendarPeriod(dates, closes, period);
  if (!slice || slice.segment.length < 6) return null;
  const rets = dailyReturns(slice.segment);
  if (rets.length < 5) return null;
  const vol = stdev(rets) * Math.sqrt(252);
  if (vol === 0) return null;
  const start = slice.segment[0];
  const end = slice.segment[slice.segment.length - 1];
  if (start <= 0) return null;
  const roc = end / start - 1;
  return roc / vol;
}

function rsiCalendar(closes: number[], dates: string[], period: CalendarPeriod, rsiPeriod = 14): number | null {
  const slice = sliceByCalendarPeriod(dates, closes, period);
  if (!slice || slice.segment.length < rsiPeriod + 2) return null;
  const segment = slice.segment;
  const deltas = segment.slice(1).map((v, i) => v - segment[i]);
  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));
  const avgGain = mean(gains.slice(-rsiPeriod));
  const avgLoss = mean(losses.slice(-rsiPeriod));
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function indexOnOrBefore(dates: string[], endIdx: number, targetIso: string): number {
  let chosen = 0;
  for (let i = 0; i <= endIdx; i++) {
    if (dates[i] <= targetIso) chosen = i;
    else break;
  }
  return chosen;
}

function averageMetric(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!nums.length) return null;
  return mean(nums);
}

export function betaVsBench(
  stock: number[],
  stockDates: string[],
  bench: number[],
  period: CalendarPeriod = "1_year",
): number | null {
  const slice = sliceByCalendarPeriod(stockDates, stock, period);
  if (!slice || slice.segment.length < 20) return null;
  const n = slice.segment.length;
  const bs = bench.slice(-n);
  if (bs.length < n) return null;
  const rs = dailyReturns(slice.segment);
  const rb = dailyReturns(bs);
  const m = Math.min(rs.length, rb.length);
  if (m < 20) return null;
  const srs = rs.slice(-m);
  const brb = rb.slice(-m);
  const meanB = mean(brb);
  const varB = brb.reduce((s, x) => s + (x - meanB) ** 2, 0) / (brb.length - 1);
  if (varB === 0) return null;
  const meanS = mean(srs);
  let cov = 0;
  for (let i = 0; i < m; i++) cov += (srs[i] - meanS) * (brb[i] - meanB);
  cov /= m - 1;
  return cov / varB;
}

export function computeSortMetric(
  key: string,
  closes: number[],
  highs: number[],
  bench: number[],
  dates: string[],
): number | null {
  if (dates.length !== closes.length) return null;

  const absW = (p: CalendarPeriod) => absoluteReturnCalendar(closes, dates, p);
  const shW = (p: CalendarPeriod) => sharpeReturnCalendar(closes, dates, p);
  const rsiW = (p: CalendarPeriod) => rsiCalendar(closes, dates, p);

  const avgAbs: Record<string, CalendarPeriod[]> = {
    average_absolute_return_12_9_6_3_1_months: ["1_year", "9_months", "6_months", "3_months", "1_months"],
    average_absolute_return_12_9_6_3_months: ["1_year", "9_months", "6_months", "3_months"],
    average_absolute_return_12_9_6_months: ["1_year", "9_months", "6_months"],
    average_absolute_return_12_9_months: ["1_year", "9_months"],
    average_absolute_return_12_6_3_1_months: ["1_year", "6_months", "3_months", "1_months"],
    average_absolute_return_12_6_3_months: ["1_year", "6_months", "3_months"],
    average_absolute_return_12_6_months: ["1_year", "6_months"],
    average_absolute_return_12_3_1_months: ["1_year", "3_months", "1_months"],
    average_absolute_return_12_3_months: ["1_year", "3_months"],
    average_absolute_return_12_9_3_1_months: ["1_year", "9_months", "3_months", "1_months"],
    average_absolute_return_12_9_3_months: ["1_year", "9_months", "3_months"],
  };
  if (key in avgAbs) return averageMetric(avgAbs[key].map(absW));

  const avgSh: Record<string, CalendarPeriod[]> = {
    average_sharpe_return_12_9_6_3_1_months: ["1_year", "9_months", "6_months", "3_months", "1_months"],
    average_sharpe_return_12_9_6_3_months: ["1_year", "9_months", "6_months", "3_months"],
    average_sharpe_return_12_9_6_months: ["1_year", "9_months", "6_months"],
    average_sharpe_return_12_9_months: ["1_year", "9_months"],
    average_sharpe_return_12_6_3_1_months: ["1_year", "6_months", "3_months", "1_months"],
    average_sharpe_return_12_6_3_months: ["1_year", "6_months", "3_months"],
    average_sharpe_return_12_6_months: ["1_year", "6_months"],
    average_sharpe_return_12_3_1_months: ["1_year", "3_months", "1_months"],
    average_sharpe_return_12_3_months: ["1_year", "3_months"],
    average_sharpe_return_12_9_3_1_months: ["1_year", "9_months", "3_months", "1_months"],
    average_sharpe_return_12_9_3_months: ["1_year", "9_months", "3_months"],
    average_sharpe_return_6_3_months: ["6_months", "3_months"],
  };
  if (key in avgSh) return averageMetric(avgSh[key].map(shW));

  const avgRsi: Record<string, CalendarPeriod[]> = {
    average_rsi_12_9_6_3_1_months: ["1_year", "9_months", "6_months", "3_months", "1_months"],
    average_rsi_12_9_6_3_months: ["1_year", "9_months", "6_months", "3_months"],
    average_rsi_12_9_6_months: ["1_year", "9_months", "6_months"],
    average_rsi_12_9_months: ["1_year", "9_months"],
    average_rsi_12_6_3_1_months: ["1_year", "6_months", "3_months", "1_months"],
    average_rsi_12_6_3_months: ["1_year", "6_months", "3_months"],
    average_rsi_12_6_months: ["1_year", "6_months"],
    average_rsi_12_3_1_months: ["1_year", "3_months", "1_months"],
    average_rsi_12_3_months: ["1_year", "3_months"],
    average_rsi_12_9_3_1_months: ["1_year", "9_months", "3_months", "1_months"],
    average_rsi_12_9_3_months: ["1_year", "9_months", "3_months"],
  };
  if (key in avgRsi) return averageMetric(avgRsi[key].map(rsiW));

  const b = betaVsBench(closes, dates, bench.length ? bench : closes, "1_year");

  const endIdx = dates.length - 1;

  const map: Record<string, () => number | null> = {
    absolute_return_1_year: () => absW("1_year"),
    absolute_return_9_months: () => absW("9_months"),
    absolute_return_6_months: () => absW("6_months"),
    absolute_return_3_months: () => absW("3_months"),
    absolute_return_1_months: () => absW("1_months"),
    sharpe_return_1_year: () => shW("1_year"),
    sharpe_return_9_months: () => shW("9_months"),
    sharpe_return_6_months: () => shW("6_months"),
    sharpe_return_3_months: () => shW("3_months"),
    sharpe_return_1_months: () => shW("1_months"),
    rsi_1_year: () => rsiW("1_year"),
    rsi_9_months: () => rsiW("9_months"),
    rsi_6_months: () => rsiW("6_months"),
    rsi_3_months: () => rsiW("3_months"),
    rsi_1_months: () => rsiW("1_months"),
    return_12_minus_1_months: () => {
      const startIdx = indexOnOrBeforeCalendarStart(dates, endIdx, "1_year");
      const endTarget = calendarStartIso(dates[endIdx], "1_months");
      const endM = indexOnOrBefore(dates, endIdx, endTarget);
      if (startIdx == null || startIdx >= endM) return null;
      const start = closes[startIdx];
      const end = closes[endM];
      return start > 0 ? end / start - 1 : null;
    },
    return_12_minus_two_months: () => {
      const startIdx = indexOnOrBeforeCalendarStart(dates, endIdx, "1_year");
      const endD = parseIsoDate(dates[endIdx]);
      endD.setUTCMonth(endD.getUTCMonth() - 2);
      const endTarget = formatIsoDate(endD);
      const endM = indexOnOrBefore(dates, endIdx, endTarget);
      if (startIdx == null || startIdx >= endM) return null;
      const start = closes[startIdx];
      const end = closes[endM];
      return start > 0 ? end / start - 1 : null;
    },
    volatility_1_year: () => {
      const slice = sliceByCalendarPeriod(dates, closes, "1_year");
      if (!slice) return null;
      const rets = dailyReturns(slice.segment);
      return rets.length >= 5 ? stdev(rets) * Math.sqrt(252) : null;
    },
    beta: () => b,
    price_to_earnings: () => null,
    marketcap: () => null,
    close: () => (closes.length ? closes[closes.length - 1] : null),
    close_raw: () => (closes.length ? closes[closes.length - 1] : null),
    away_from_high_all_time: () => {
      const peak = Math.max(...highs);
      return peak > 0 ? (closes[closes.length - 1] / peak - 1) * 100 : null;
    },
    away_from_high_1_year: () => {
      const slice = sliceByCalendarPeriod(dates, highs, "1_year");
      if (!slice) return null;
      const peak = Math.max(...slice.segment);
      return peak > 0 ? (closes[closes.length - 1] / peak - 1) * 100 : null;
    },
    absolute_divide_beta_return_1_year: () => {
      const a = absW("1_year");
      return a != null && b != null && b !== 0 ? a / Math.abs(b) : null;
    },
    sharpe_divide_beta_return_1_year: () => {
      const s = shW("1_year");
      return s != null && b != null && b !== 0 ? s / Math.abs(b) : null;
    },
    average_sharpe_divide_beta_return_12_9_6_3_months: () =>
      averageMetric(
        (["1_year", "9_months", "6_months", "3_months"] as CalendarPeriod[])
          .map(shW)
          .map((sh) => (sh != null && b ? sh / Math.abs(b) : null)),
      ),
    average_sharpe_divide_beta_return_12_6_3_months: () =>
      averageMetric(
        (["1_year", "6_months", "3_months"] as CalendarPeriod[])
          .map(shW)
          .map((sh) => (sh != null && b ? sh / Math.abs(b) : null)),
      ),
    average_sharpe_divide_beta_return_12_6_months: () =>
      averageMetric(
        (["1_year", "6_months"] as CalendarPeriod[])
          .map(shW)
          .map((sh) => (sh != null && b ? sh / Math.abs(b) : null)),
      ),
  };

  return map[key]?.() ?? null;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export { W_12M, W_6M, W_1M, calendarLookbackTradingDays };

/** Minimum trading days to fetch so calendar windows can resolve. */
export function minTradingDaysForSortKey(key: string): number {
  if (!key || key === "none" || key === "price_to_earnings" || key === "marketcap") return 0;
  if (key === "close" || key === "close_raw") return 1;
  if (key === "away_from_high_all_time") return 5;
  if (
    key.includes("1_year") ||
    key.includes("12_") ||
    key === "volatility_1_year" ||
    key === "return_12_minus_1_months" ||
    key === "return_12_minus_two_months" ||
    key === "beta"
  ) {
    return calendarLookbackTradingDays("1_year");
  }
  if (key.includes("9_months")) return calendarLookbackTradingDays("9_months");
  if (key.includes("6_months")) return calendarLookbackTradingDays("6_months");
  if (key.includes("3_months")) return calendarLookbackTradingDays("3_months");
  if (key.includes("1_months")) return calendarLookbackTradingDays("1_months");
  return calendarLookbackTradingDays("3_months");
}

/** Filter helpers: calendar window slices. */
export function pctPositiveCalendar(closes: number[], dates: string[], period: CalendarPeriod): number | null {
  const slice = sliceByCalendarPeriod(dates, closes, period);
  if (!slice) return null;
  const rets = dailyReturns(slice.segment);
  if (!rets.length) return null;
  return (100 * rets.filter((r) => r > 0).length) / rets.length;
}

export function circuitsCalendar(
  closes: number[],
  dates: string[],
  period: CalendarPeriod,
): number {
  const slice = sliceByCalendarPeriod(dates, closes, period);
  if (!slice) return 0;
  return dailyReturns(slice.segment).filter((r) => Math.abs(r) >= 0.19).length;
}

export function medianVolumeCalendar(
  volumes: number[],
  dates: string[],
  period: CalendarPeriod,
): number | null {
  const slice = sliceByCalendarPeriod(dates, volumes, period);
  if (!slice || !slice.segment.length) return null;
  const s = [...slice.segment].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
