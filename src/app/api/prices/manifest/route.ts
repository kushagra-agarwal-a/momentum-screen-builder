import { fetchManifest } from "@/lib/engine/price-db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public metadata + download URL for the shared CA-adjusted prices SQLite. */
export async function GET() {
  const url = process.env.PRICES_MANIFEST_URL;
  if (!url) {
    return NextResponse.json(
      {
        error: "Shared prices database is not published yet.",
        hint: "Set PRICES_MANIFEST_URL after running scripts/publish_prices_db.mjs or POST /api/admin/publish-prices.",
      },
      { status: 503 },
    );
  }
  const manifest = await fetchManifest(url);
  if (!manifest) {
    return NextResponse.json({ error: "Could not load manifest from PRICES_MANIFEST_URL." }, { status: 502 });
  }
  return NextResponse.json(manifest, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
