import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { publishManifestToBlob, publishPricesGzipToBlob } from "@/lib/engine/publish-prices-blob";
import type { PricesManifest } from "@/lib/engine/price-db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Upload gzip-compressed prices.sqlite to Vercel Blob (public).
 * Auth: Authorization: Bearer <PRICES_PUBLISH_SECRET>
 * Body: raw application/gzip bytes (~35MB).
 */
export async function POST(req: Request) {
  const secret = process.env.PRICES_PUBLISH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PRICES_PUBLISH_SECRET not configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const gzipBytes = Buffer.from(await req.arrayBuffer());
  if (gzipBytes.length < 1024) {
    return NextResponse.json({ error: "Body too small; expected gzip SQLite." }, { status: 400 });
  }

  let dbBytes: Buffer;
  try {
    dbBytes = gunzipSync(gzipBytes);
  } catch {
    return NextResponse.json({ error: "Invalid gzip payload." }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(dbBytes).digest("hex");
  const builtHeader = req.headers.get("x-prices-built-at");
  const built_at = builtHeader || new Date().toISOString();

  const { download_url, gzip_size_bytes } = await publishPricesGzipToBlob(gzipBytes, { builtAt: built_at });

  const manifest: PricesManifest = {
    version: 1,
    universe: "is_nifty_total_market",
    description:
      "Nifty Total Market ~2Y NSE bhavcopy with corporate-action back-adjustment (eod_adjusted). Built with engine.adjusted_db.",
    built_at,
    sha256,
    size_bytes: dbBytes.length,
    gzip_size_bytes,
    download_url,
    format: "sqlite3",
    tables: ["eod_raw", "eod_adjusted", "ca_cache", "build_meta"],
  };

  const manifest_url = await publishManifestToBlob(manifest);
  manifest.manifest_url = manifest_url;

  return NextResponse.json({
    ok: true,
    download_url,
    manifest_url,
    sha256,
    size_bytes: dbBytes.length,
    gzip_size_bytes,
  });
}
