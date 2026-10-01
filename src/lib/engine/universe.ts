const BASE = "https://www.niftyindices.com/IndexConstituent/";

export const INDEX_FILES: Record<string, string> = {
  is_nifty_50: "ind_nifty50list.csv",
  is_nifty_next_50: "ind_niftynext50list.csv",
  is_nifty_100: "ind_nifty100list.csv",
  is_nifty_200: "ind_nifty200list.csv",
  is_nifty_500: "ind_nifty500list.csv",
  is_nifty_total_market: "ind_niftytotalmarket_list.csv",
  is_nifty_large_mid_250: "ind_niftylargemidcap250list.csv",
  is_nifty_midcap_150: "ind_niftymidcap150list.csv",
  is_nifty_smallcap_250: "ind_niftysmallcap250list.csv",
  is_nifty_microcap_250: "ind_niftymicrocap250list.csv",
  is_nifty_mid_small_400: "ind_niftymidsml400list.csv",
  is_nifty_fo: "ind_nifty500list.csv",
  is_nse_750: "ind_niftytotalmarket_list.csv",
  is_all_nse: "ind_niftytotalmarket_list.csv",
};

export const INDEX_LABELS: Record<string, string> = {
  is_nifty_50: "NIFTY 50",
  is_nifty_next_50: "NIFTY NEXT 50",
  is_nifty_100: "NIFTY 100",
  is_nifty_200: "NIFTY 200",
  is_nifty_500: "NIFTY 500",
  is_nifty_total_market: "NIFTY TOTAL MARKET",
  is_nifty_large_mid_250: "NIFTY LARGE MID 250",
  is_nifty_midcap_150: "NIFTY MIDCAP 150",
  is_nifty_smallcap_250: "NIFTY SMALLCAP 250",
  is_nifty_microcap_250: "NIFTY MICROCAP 250",
  is_nifty_mid_small_400: "NIFTY MID SMALL 400",
  is_nifty_fo: "NIFTY F&O (N500 proxy)",
  is_nse_750: "NSE 750",
  is_all_nse: "All NSE Listed Stocks",
  is_etf: "ETFs (not yet supported)",
};

export async function fetchIndexSymbols(indexKey: string): Promise<string[]> {
  if (indexKey === "is_etf") return [];
  const file = INDEX_FILES[indexKey];
  if (!file) throw new Error(`Unknown index ${indexKey}`);
  const res = await fetch(`${BASE}${file}`, {
    headers: { "User-Agent": "momentum-screen/1.0" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Failed to load index ${indexKey}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  const symIdx = headers.indexOf("Symbol");
  return lines
    .slice(1)
    .map((line) => line.split(",")[symIdx]?.trim())
    .filter(Boolean);
}
