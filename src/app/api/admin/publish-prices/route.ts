import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Publish docs — large files must use client upload route. */
export async function GET() {
  return NextResponse.json({
    upload: "POST /api/admin/publish-prices/upload (Vercel Blob client upload; Authorization: Bearer PRICES_PUBLISH_SECRET)",
    manifest: "GET /api/prices/manifest (after PRICES_MANIFEST_URL is set on the project)",
    script: "node scripts/publish_prices_db.mjs",
  });
}
