import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { publishManifestToBlob } from "@/lib/engine/publish-prices-blob";
import type { PricesManifest } from "@/lib/engine/price-db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.PRICES_PUBLISH_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

/** Client-direct upload to Vercel Blob (supports large gzip SQLite via multipart). */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith("prices/")) {
          throw new Error("Invalid pathname");
        }
        return {
          allowedContentTypes: ["application/gzip", "application/octet-stream"],
          maximumSizeInBytes: 120 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 3600,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let meta: { sha256?: string; built_at?: string; size_bytes?: number; gzip_size_bytes?: number } = {};
        if (tokenPayload) {
          try {
            meta = JSON.parse(tokenPayload);
          } catch {
            /* ignore */
          }
        }
        if (!meta.sha256 || !meta.size_bytes) return;

        const manifest: PricesManifest = {
          version: 1,
          universe: "is_nifty_total_market",
          description:
            "Nifty Total Market ~2Y NSE bhavcopy with corporate-action back-adjustment (eod_adjusted).",
          built_at: meta.built_at || new Date().toISOString(),
          sha256: meta.sha256,
          size_bytes: meta.size_bytes,
          gzip_size_bytes: meta.gzip_size_bytes,
          download_url: blob.url,
          format: "sqlite3",
          tables: ["eod_raw", "eod_adjusted", "ca_cache", "build_meta"],
        };
        const manifest_url = await publishManifestToBlob(manifest);
        manifest.manifest_url = manifest_url;
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
