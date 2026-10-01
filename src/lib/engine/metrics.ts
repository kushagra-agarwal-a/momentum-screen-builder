const W_1M = 21;
const W_3M = 63;
const W_6M = 126;
const W_9M = 189;
const W_12M = 252;

const WINDOW: Record<string, number> = {
  "1_year": W_12M,
  "9_months": W_9M,
  "6_months": W_6M,
  "3_months": W_3M,
  "1_months": W_1M,
};

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

export function absoluteReturn(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const start = closes[closes.length - window - 1];
  const end = closes[closes.length - 1];
  if (start <= 0) return null;
  return end / start - 1;
}

export function sharpeReturn(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const seg = closes.slice(-window - 1);
  const rets = dailyReturns(seg);
  if (rets.length < 5) return null;
  const vol = stdev(rets) * Math.sqrt(252);
  if (vol === 0) return null;
  const roc = absoluteReturn(closes, window);
  if (roc == null) return null;
  return roc / vol;
}

function averageMetric(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!nums.length) return null;
  return mean(nums);
}

export function rsi(closes: number[], window: number, period = 14): number | null {
  if (closes.length < window) return null;
  const segment = closes.slice(-window);
  if (segment.length < period + 1) return null;
  const deltas = segment.slice(1).map((v, i) => v - segment[i]);
  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));
  const avgGain = mean(gains.slice(-period));
  const avgLoss = mean(losses.slice(-period));
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function betaVsBench(stock: number[], bench: number[], window = W_12M): number | null {
  const n = Math.min(stock.length, bench.length);
  if (n < window + 1) return null;
  const rs = dailyReturns(stock.slice(-window - 1));
  const rb = dailyReturns(bench.slice(-window - 1));
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
): number | null {
  const absW = (s: string) => absoluteReturn(closes, WINDOW[s]);
  const shW = (s: string) => sharpeReturn(closes, WINDOW[s]);
  const rsiW = (s: string) => rsi(closes, WINDOW[s]);

  const avgAbs: Record<string, string[]> = {
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

  const avgSh: Record<string, string[]> = {
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

  const avgRsi: Record<string, string[]> = {
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

  const b = betaVsBench(closes, bench.length ? bench : closes, W_12M);

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
      if (closes.length < W_12M + 1) return null;
      const start = closes[closes.length - W_12M - 1];
      const end = closes[closes.length - W_1M - 1];
      return start > 0 ? end / start - 1 : null;
    },
    return_12_minus_two_months: () => {
      if (closes.length < W_12M + 1) return null;
      const start = closes[closes.length - W_12M - 1];
      const end = closes[closes.length - 2 * W_1M - 1];
      return start > 0 ? end / start - 1 : null;
    },
    volatility_1_year: () => {
      const rets = dailyReturns(closes.slice(-W_12M - 1));
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
      const h = highs.slice(-W_12M);
      const peak = Math.max(...h);
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
      averageMetric(["1_year", "9_months", "6_months", "3_months"].map(shW).map((sh) => (sh != null && b ? sh / Math.abs(b) : null))),
    average_sharpe_divide_beta_return_12_6_3_months: () =>
      averageMetric(["1_year", "6_months", "3_months"].map(shW).map((sh) => (sh != null && b ? sh / Math.abs(b) : null))),
    average_sharpe_divide_beta_return_12_6_months: () =>
      averageMetric(["1_year", "6_months"].map(shW).map((sh) => (sh != null && b ? sh / Math.abs(b) : null))),
  };

  return map[key]?.() ?? null;
}

export { W_12M, W_6M, W_3M, W_1M, W_9M };

/** Minimum daily bars needed to compute this sort key (trading days). */
export function minTradingDaysForSortKey(key: string): number {
  if (key === "none" || key === "price_to_earnings" || key === "marketcap") return 0;
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
    return W_12M;
  }
  if (key.includes("9_months")) return W_9M;
  if (key.includes("6_months")) return W_6M;
  if (key.includes("3_months")) return W_3M;
  if (key.includes("1_months")) return W_1M;
  return W_3M;
}
