import type { Bar } from "./bhavcopy";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type CorpAction = {
  exDate: string; // YYYY-MM-DD
  subject: string;
  series: string;
};

export type CorpActionType =
  | "bonus"
  | "split"
  | "consolidation"
  | "scheme_merger_demerger"
  | "dividend"
  | "rights"
  | "buyback"
  | "administrative"
  | "other";

export type BackAdjustOptions = {
  /** Adjust cash dividends (default false — price-return screens). */
  adjustDividends?: boolean;
};

export function classifyCorpActionSubject(subject: string): CorpActionType {
  const s = subject.trim();
  const lower = s.toLowerCase();
  if (/right\s*issue|^rights\b/i.test(s)) return "rights";
  if (/buy\s*back|buyback/i.test(lower)) return "buyback";
  if (/merger|amalgamation|scheme of arrangement|demerger|spin[- ]?off|slump sale/i.test(lower))
    return "scheme_merger_demerger";
  if (/face value|sub-division|sub division|stock split|split from/i.test(lower)) return "split";
  if (/capital reduction|consolidation|reverse split/i.test(lower)) return "consolidation";
  if (/bonus/i.test(lower)) return "bonus";
  if (/dividend|int\.?\s*div|interim div|final div|special div/i.test(lower)) return "dividend";
  if (
    /annual general meeting|extraordinary general|postal ballot|book closure|record date|meeting of equity/i.test(
      lower,
    )
  )
    return "administrative";
  return "other";
}

/** Types that can change the EOD price series (excluding optional dividends). */
export function isStructuralCorpAction(type: CorpActionType): boolean {
  return (
    type === "bonus" ||
    type === "split" ||
    type === "consolidation" ||
    type === "scheme_merger_demerger" ||
    type === "rights"
  );
}

export function corpActionAffectsPriceHistory(type: CorpActionType, opts: BackAdjustOptions): boolean {
  if (type === "dividend") return opts.adjustDividends === true;
  return isStructuralCorpAction(type);
}

function parseExDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const mm = months[m[2]];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

function parseDividendAmount(subject: string): number | null {
  const m = subject.match(/(?:dividend|int\.?\s*div)[^0-9]*(?:rs\.?|re\.?)\s*([\d.]+)/i);
  if (m) return parseFloat(m[1]);
  const m2 = subject.match(/(?:rs\.?|re\.?)\s*([\d.]+)\s*(?:per share)?/i);
  if (m2 && /div/i.test(subject)) return parseFloat(m2[1]);
  return null;
}

/** NSE "Bonus A:B" → multiply pre-ex prices by B/(A+B). */
export function bonusBackAdjustFactor(subject: string): number | null {
  if (!/bon/i.test(subject)) return null;
  const m = subject.match(/(\d+)\s*:\s*(\d+)/i);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!a || !b) return null;
  return b / (a + b);
}

/** Face-value split "From Rs X … To Re/Rs Y" → Y/X. */
export function splitBackAdjustFactor(subject: string): number | null {
  const fromTo = subject.match(
    /from\s*rs\.?\s*([\d.]+)[\s/-]*(?:per share)?\s*to\s*(?:re\.?|rs\.?\s*)?\s*([\d.]+)/i,
  );
  if (fromTo) {
    const oldF = parseFloat(fromTo[1]);
    const newF = parseFloat(fromTo[2]);
    if (oldF > 0 && newF > 0) return newF / oldF;
  }
  return null;
}

function ratioAtExDate(bars: Bar[], exIso: string): number | null {
  const idx = bars.findIndex((b) => b.date === exIso);
  if (idx <= 0) return null;
  const pre = bars[idx - 1].close;
  const post = bars[idx].close;
  if (!pre || !post) return null;
  return post / pre;
}

function resolveBackAdjustFactor(
  act: CorpAction,
  type: CorpActionType,
  bars: Bar[],
  opts: BackAdjustOptions,
): number | null {
  const subj = act.subject;
  switch (type) {
    case "bonus":
      return bonusBackAdjustFactor(subj);
    case "split":
      return splitBackAdjustFactor(subj) ?? ratioAtExDate(bars, act.exDate);
    case "consolidation":
    case "scheme_merger_demerger":
      return ratioAtExDate(bars, act.exDate);
    case "dividend": {
      if (!opts.adjustDividends) return null;
      const div = parseDividendAmount(subj);
      const idx = bars.findIndex((b) => b.date === act.exDate);
      if (div == null || idx <= 0) return null;
      const pre = bars[idx - 1].close;
      if (pre <= div) return null;
      return (pre - div) / pre;
    }
    case "rights":
      // TODO: parse A:B @ premium and TERP; until then use ex-day ratio if present.
      return ratioAtExDate(bars, act.exDate);
    default:
      return null;
  }
}

export async function getNseSessionCookie(): Promise<string> {
  const landing = await fetch("https://www.nseindia.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  return (landing.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

export async function fetchCorporateActions(symbol: string, cookie?: string): Promise<CorpAction[]> {
  try {
    const session = cookie ?? (await getNseSessionCookie());
    const res = await fetch(
      `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(symbol)}`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.nseindia.com/",
          Cookie: session,
        },
      },
    );
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{ exDate: string; subject: string; series: string }>;
    const out: CorpAction[] = [];
    for (const row of raw) {
      const ex = parseExDate(row.exDate);
      if (ex) out.push({ exDate: ex, subject: row.subject, series: row.series || "EQ" });
    }
    return out.sort((a, b) => a.exDate.localeCompare(b.exDate));
  } catch {
    return [];
  }
}

/** True if NSE CA list contains any structural event on or before lastBar (needs fetch + adjust). */
export function corpActionsNeedBackAdjust(
  actions: CorpAction[],
  lastBarDate: string,
  opts: BackAdjustOptions = {},
): boolean {
  return actions.some((a) => {
    if (a.exDate > lastBarDate) return false;
    const t = classifyCorpActionSubject(a.subject);
    return corpActionAffectsPriceHistory(t, opts);
  });
}

/** Back-adjust prices using classified NSE corporate actions (oldest ex-date first). */
export function backAdjustBars(
  bars: Bar[],
  actions: CorpAction[],
  opts: BackAdjustOptions = {},
): { bars: Bar[]; notes: string[] } {
  if (!bars.length || !actions.length) return { bars, notes: [] };

  const out = [...bars].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ ...b }));
  const notes: string[] = [];
  const sorted = [...actions].sort((a, b) => a.exDate.localeCompare(b.exDate));

  for (const act of sorted) {
    const type = classifyCorpActionSubject(act.subject);
    if (!corpActionAffectsPriceHistory(type, opts)) continue;

    const factor = resolveBackAdjustFactor(act, type, out, opts);
    if (factor == null || factor <= 0 || !Number.isFinite(factor)) continue;

    notes.push(`${type} ${act.exDate}: back-adjust ×${factor.toFixed(4)} (${act.subject.trim().slice(0, 60)})`);

    for (const b of out) {
      if (b.date < act.exDate) {
        b.close *= factor;
        b.ltp *= factor;
        b.high *= factor;
      }
    }
  }

  return { bars: out, notes };
}

/** @deprecated Use corpActionsNeedBackAdjust after fetching NSE CA. */
export function hasExtremePriceGap(bars: Bar[], threshold = 0.35): boolean {
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev <= 0) continue;
    if (Math.abs(cur / prev - 1) >= threshold) return true;
  }
  return false;
}
