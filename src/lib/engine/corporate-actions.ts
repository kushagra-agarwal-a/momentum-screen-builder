import type { Bar } from "./bhavcopy";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type CorpAction = {
  exDate: string; // YYYY-MM-DD
  subject: string;
  series: string;
};

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
  const m = subject.match(/Dividend[^0-9]*(?:Rs\.?|Re\.?)\s*([\d.]+)/i);
  if (m) return parseFloat(m[1]);
  return null;
}

function parseBonusFactor(subject: string): number | null {
  if (!/bon/i.test(subject)) return null;
  const m = subject.match(/(\d+)\s*:\s*(\d+)/i);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!a || !b) return null;
  return b / (a + b);
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
    return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
  } catch {
    return [];
  }
}

function ratioAtExDate(bars: Bar[], exIso: string): number | null {
  const idx = bars.findIndex((b) => b.date === exIso);
  if (idx <= 0) return null;
  const pre = bars[idx - 1].close;
  const post = bars[idx].close;
  if (!pre || !post) return null;
  return post / pre;
}

/** Back-adjust prices before each ex-date (NSE corporate-actions / PR Bc logic). */
export function backAdjustBars(
  bars: Bar[],
  actions: CorpAction[],
): { bars: Bar[]; notes: string[] } {
  if (!bars.length || !actions.length) return { bars, notes: [] };

  const out = [...bars].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ ...b }));
  const notes: string[] = [];

  for (const act of actions) {
    const ex = act.exDate;
    const subj = act.subject;
    let factor: number | null = null;

    if (/demerger|scheme of arrangement|spin[- ]?off/i.test(subj)) {
      factor = ratioAtExDate(out, ex);
      if (factor != null) notes.push(`Demerger ${ex}: back-adjust ×${factor.toFixed(4)}`);
    } else {
      const bonus = parseBonusFactor(subj);
      if (bonus != null) {
        factor = bonus;
        notes.push(`Bonus ${ex}: back-adjust ×${factor.toFixed(4)}`);
      } else if (/dividend/i.test(subj)) {
        const div = parseDividendAmount(subj);
        const idx = out.findIndex((b) => b.date === ex);
        if (div != null && idx > 0) {
          const pre = out[idx - 1].close;
          if (pre > div) {
            factor = (pre - div) / pre;
            notes.push(`Dividend ${ex}: back-adjust ×${factor.toFixed(4)} (₹${div})`);
          }
        }
      }
    }

    if (factor == null || factor <= 0 || !Number.isFinite(factor)) continue;

    for (const b of out) {
      if (b.date < ex) {
        b.close *= factor;
        b.ltp *= factor;
        b.high *= factor;
      }
    }
  }

  return { bars: out, notes };
}
