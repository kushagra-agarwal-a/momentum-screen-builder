import type { Bar } from "./bhavcopy";

/** Price series for returns/Sharpe: LAST_PRICE (LTP) on every session, fallback to EOD close. */
export function closesForMetrics(bars: Bar[]): number[] {
  if (!bars.length) return [];
  return bars.map((b) => (b.ltp != null && b.ltp > 0 ? b.ltp : b.close));
}

export function lastDisplayPrice(bars: Bar[]): { ltp: number | null; close: number | null } {
  if (!bars.length) return { ltp: null, close: null };
  const last = bars[bars.length - 1];
  return {
    ltp: last.ltp ?? last.close ?? null,
    close: last.close ?? null,
  };
}
