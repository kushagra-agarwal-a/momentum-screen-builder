import { publishManifestToBlob } from "@/lib/engine/publish-prices-blob";
import type { PricesManifest } from "@/lib/engine/price-db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Write public manifest.json after the gzip blob upload completes. */
export async function POST(req: Request) {
  const secret = process.env.PRICES_PUBLISH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PRICES_PUBLISH_SECRET not configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as {
    download_url?: string;
    sha256?: string;
    built_at?: string;
    size_bytes?: number;
    gzip_size_bytes?: number;
  };

  if (!body.download_url || !body.sha256 || !body.size_bytes) {
    return NextResponse.json({ error: "download_url, sha256, and size_bytes required." }, { status: 400 });
  }

  const manifest: PricesManifest = {
    version: 1,
    universe: "is_nifty_total_market",
    description:
      "Nifty Total Market ~2Y NSE bhavcopy with corporate-action back-adjustment (eod_adjusted).",
    built_at: body.built_at || new Date().toISOString(),
    sha256: body.sha256,
    size_bytes: body.size_bytes,
    gzip_size_bytes: body.gzip_size_bytes,
    download_url: body.download_url,
    format: "sqlite3",
    tables: ["eod_raw", "eod_adjusted", "ca_cache", "symbol_metrics", "build_meta"],
  };

  const manifest_url = await publishManifestToBlob(manifest);
  manifest.manifest_url = manifest_url;

  return NextResponse.json({ ok: true, manifest_url, manifest });
}
