import type { Bar } from "./bhavcopy";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function todayIsoIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function nseCookie(): Promise<string> {
  const res = await fetch("https://www.nseindia.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  const set = res.headers.getSetCookie?.() ?? [];
  return set.map((c) => c.split(";")[0]).join("; ");
}

async function fetchSymbolLtp(symbol: string, cookie: string): Promise<number | null> {
  const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://www.nseindia.com/get-quotes/equity",
      Cookie: cookie,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { priceInfo?: { lastPrice?: number } };
  const p = data.priceInfo?.lastPrice;
  return typeof p === "number" && p > 0 ? p : null;
}

/** Patch in-memory bars with NSE live lastPrice (best-effort, rate-limited). */
export async function mergeLiveLtp(
  bySymbol: Map<string, Bar[]>,
  symbols: string[],
): Promise<{ updated: number; liveAsOf: string | null }> {
  let cookie: string;
  try {
    cookie = await nseCookie();
  } catch {
    return { updated: 0, liveAsOf: null };
  }

  const today = todayIsoIst();
  let updated = 0;
  const batch = 10;

  for (let i = 0; i < symbols.length; i += batch) {
    const chunk = symbols.slice(i, i + batch);
    const ltps = await Promise.all(chunk.map((s) => fetchSymbolLtp(s, cookie)));
    for (let j = 0; j < chunk.length; j++) {
      const ltp = ltps[j];
      if (ltp == null) continue;
      const bars = bySymbol.get(chunk[j]);
      if (!bars?.length) continue;
      const last = bars[bars.length - 1];
      if (last.date === today) {
        last.ltp = ltp;
      } else {
        bars.push({
          date: today,
          close: ltp,
          ltp,
          high: Math.max(last.high, ltp),
          volume: 0,
          series: last.series,
        });
      }
      updated++;
    }
  }

  return { updated, liveAsOf: updated > 0 ? today : null };
}
