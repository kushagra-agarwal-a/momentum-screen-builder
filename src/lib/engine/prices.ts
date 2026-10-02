import type { Bar } from "./bhavcopy";

/** EOD close series; the latest bar uses LTP when available (MomoIndia-style). */
export function closesForMetrics(bars: Bar[]): number[] {
  if (!bars.length) return [];
  return bars.map((b, i) => {
    const isLast = i === bars.length - 1;
    if (isLast && b.ltp != null && b.ltp > 0) return b.ltp;
    return b.close;
  });
}

export function lastDisplayPrice(bars: Bar[]): { ltp: number | null; close: number | null } {
  if (!bars.length) return { ltp: null, close: null };
  const last = bars[bars.length - 1];
  return {
    ltp: last.ltp ?? last.close ?? null,
    close: last.close ?? null,
  };
}
