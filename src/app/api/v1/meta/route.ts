import { fetchManifest } from "@/lib/engine/price-db";
import { getMarketMeta } from "@/lib/engine/market-data-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Dataset freshness, symbol count, and blob links. */
export async function GET() {
  const meta = await getMarketMeta();
  const manifestUrl = process.env.PRICES_MANIFEST_URL;
  const manifest = manifestUrl ? await fetchManifest(manifestUrl) : null;

  if (!meta && !manifest) {
    return NextResponse.json(
      { error: "Market data not available. PRICES_MANIFEST_URL unset or DB not published." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      universe: "is_nifty_total_market",
      as_of_date: meta?.as_of_date ?? null,
      metrics_computed_at: meta?.metrics_computed_at ?? null,
      pipeline_daily_at: meta?.pipeline_daily_at ?? null,
      symbol_count: meta?.symbol_count ?? 0,
      manifest: manifest
        ? {
            built_at: manifest.built_at,
            sha256: manifest.sha256,
            download_url: manifest.download_url,
            manifest_url: manifest.manifest_url ?? manifestUrl,
          }
        : null,
      api: {
        stocks: "/api/v1/stocks",
        stock: "/api/v1/stocks/{symbol}",
      },
    },
    { headers: { "Cache-Control": "public, max-age=120" } },
  );
}
