export type Bar = { date: string; close: number; high: number; volume: number };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function formatDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { path: `${dd}${mm}${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

function prevWeekday(d: Date) {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return x;
}

function tradingDays(end: Date, count: number): Date[] {
  const out: Date[] = [];
  let d = prevWeekday(end);
  while (out.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d));
    d.setDate(d.getDate() - 1);
    if (out.length > 0 && (end.getTime() - d.getTime()) / 86400000 > count * 4) break;
  }
  return out.reverse();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function fetchDay(date: Date): Promise<Map<string, Bar>> {
  const { path, iso } = formatDate(date);
  const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${path}.csv`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/csv,*/*", Referer: "https://www.nseindia.com/" },
  });
  if (!res.ok) return new Map();
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return new Map();
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const symI = headers.findIndex((h) => h === "symbol");
  const serI = headers.findIndex((h) => h === "series");
  const closeI = headers.findIndex((h) => h.includes("close"));
  const highI = headers.findIndex((h) => h === "high_price" || h === "high price");
  const volI = headers.findIndex((h) => h.includes("ttl_trd") || h.includes("total traded quantity"));

  const map = new Map<string, Bar>();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    if (serI >= 0 && cols[serI]?.trim() !== "EQ") continue;
    const sym = cols[symI]?.trim();
    if (!sym) continue;
    const close = parseFloat(cols[closeI] || "0");
    const high = parseFloat(cols[highI] || cols[closeI] || "0");
    const volume = parseFloat(cols[volI] || "0");
    if (!close) continue;
    map.set(sym, { date: iso, close, high, volume });
  }
  return map;
}

export async function loadPriceHistory(
  symbols: string[],
  lookbackDays: number,
): Promise<{ bySymbol: Map<string, Bar[]>; fetchedDays: number; asOf: string | null }> {
  const symbolSet = new Set(symbols);
  const days = tradingDays(new Date(), lookbackDays);
  const bySymbol = new Map<string, Bar[]>();
  for (const s of symbols) bySymbol.set(s, []);

  let fetched = 0;
  let asOf: string | null = null;

  const batchSize = 12;
  for (let i = 0; i < days.length; i += batchSize) {
    const chunk = days.slice(i, i + batchSize);
    const maps = await Promise.all(chunk.map((d) => fetchDay(d)));
    for (const dayMap of maps) {
      if (dayMap.size === 0) continue;
      fetched++;
      for (const [sym, bar] of dayMap) {
        if (!symbolSet.has(sym)) continue;
        bySymbol.get(sym)!.push(bar);
        asOf = bar.date;
      }
    }
  }

  for (const [, bars] of bySymbol) {
    bars.sort((a, b) => a.date.localeCompare(b.date));
  }

  return { bySymbol, fetchedDays: fetched, asOf };
}
