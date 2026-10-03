import { put } from "@vercel/blob";
import type { PricesManifest } from "./price-db";

export async function publishPricesGzipToBlob(gzipBytes: Buffer, meta: { builtAt?: string } = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured on this deployment.");
  }

  const dbBlob = await put("prices/nifty-total-market-2y.sqlite.gz", gzipBytes, {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/gzip",
    cacheControlMaxAge: 3600,
  });

  return { download_url: dbBlob.url, gzip_size_bytes: gzipBytes.length };
}

export async function publishManifestToBlob(manifest: PricesManifest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured on this deployment.");
  }
  const manifestBlob = await put("prices/manifest.json", JSON.stringify(manifest, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 300,
  });
  return manifestBlob.url;
}
