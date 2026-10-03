import type { Bar } from "./bhavcopy";

/** EOD close series for returns, Sharpe, and ROC (consistent start/end). */
export function closesForMetrics(bars: Bar[]): number[] {
  if (!bars.length) return [];
  return bars.map((b) => b.close);
}

export function lastDisplayPrice(bars: Bar[]): { ltp: number | null; close: number | null } {
  if (!bars.length) return { ltp: null, close: null };
  const last = bars[bars.length - 1];
  return {
    ltp: last.ltp ?? last.close ?? null,
    close: last.close ?? null,
  };
}
