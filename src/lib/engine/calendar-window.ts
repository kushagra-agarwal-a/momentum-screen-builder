/** Momo-style calendar lookbacks (not fixed 252 trading-day windows). */

export type CalendarPeriod =
  | "1_year"
  | "9_months"
  | "6_months"
  | "3_months"
  | "1_months";

const PERIOD_OFFSET: Record<
  CalendarPeriod,
  { years?: number; months?: number }
> = {
  "1_year": { years: 1 },
  "9_months": { months: 9 },
  "6_months": { months: 6 },
  "3_months": { months: 3 },
  "1_months": { months: 1 },
};

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Same calendar anchor as end date (e.g. 2026-10-01 → 2025-10-01). */
export function calendarStartIso(endIso: string, period: CalendarPeriod): string {
  const end = parseIso(endIso);
  const off = PERIOD_OFFSET[period];
  const start = new Date(end);
  if (off.years) start.setUTCFullYear(start.getUTCFullYear() - off.years);
  if (off.months) start.setUTCMonth(start.getUTCMonth() - off.months);
  return formatIso(start);
}

/**
 * Latest index i where dates[i] <= targetIso (last available on/before calendar start).
 * If none, index 0 (earliest bar we have).
 */
export function indexOnOrBeforeCalendarStart(
  dates: string[],
  endIdx: number,
  period: CalendarPeriod,
): number | null {
  if (endIdx < 0 || !dates.length) return null;
  const target = calendarStartIso(dates[endIdx], period);
  let chosen = -1;
  for (let i = 0; i <= endIdx; i++) {
    if (dates[i] <= target) chosen = i;
    else break;
  }
  if (chosen >= 0) return chosen;
  return endIdx >= 0 ? 0 : null;
}

export function sliceByCalendarPeriod(
  dates: string[],
  values: number[],
  period: CalendarPeriod,
): { startIdx: number; endIdx: number; segment: number[] } | null {
  if (dates.length !== values.length || !dates.length) return null;
  const endIdx = dates.length - 1;
  const startIdx = indexOnOrBeforeCalendarStart(dates, endIdx, period);
  if (startIdx == null || startIdx >= endIdx) return null;
  return {
    startIdx,
    endIdx,
    segment: values.slice(startIdx, endIdx + 1),
  };
}

/** Calendar span in days for bhavcopy lookback (with slack). */
export function calendarLookbackTradingDays(period: CalendarPeriod): number {
  switch (period) {
    case "1_year":
      return 280;
    case "9_months":
      return 210;
    case "6_months":
      return 160;
    case "3_months":
      return 90;
    case "1_months":
      return 35;
    default:
      return 280;
  }
}
