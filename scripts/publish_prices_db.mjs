#!/usr/bin/env node
/**
 * Upload data/prices.sqlite + manifest to Vercel Blob (public).
 * Requires BLOB_READ_WRITE_TOKEN (auto-added when Blob store is linked to the Vercel project).
 *
 * Usage: node scripts/publish_prices_db.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";
import { upload } from "@vercel/blob/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data/prices.sqlite");
const manifestPath = path.join(root, "data/prices-manifest.json");

function sha256File(p) {
  const h = createHash("sha256");
  h.update(readFileSync(p));
  return h.digest("hex");
}

async function gzipFile(src, dest) {
  await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(dest));
}

async function assertDbReady(dbPath) {
  const sqlite3 = (await import("better-sqlite3")).default;
  const db = sqlite3(dbPath, { readonly: true });
  const metrics = db.prepare("SELECT COUNT(*) AS n FROM symbol_metrics").get()?.n ?? 0;
  const adj = db.prepare("SELECT COUNT(*) AS n FROM eod_adjusted").get()?.n ?? 0;
  db.close();
  if (metrics < 400 || adj < 100000) {
    console.error(
      `Refusing to publish: symbol_metrics=${metrics}, eod_adjusted_rows=${adj}. ` +
        "Run a full build or seed from Blob before publishing.",
    );
    process.exit(1);
  }
}

async function main() {
  const canClientUpload = !!process.env.PRICES_PUBLISH_SECRET;
  const canDirectPut = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (!canClientUpload && !canDirectPut) {
    console.error(
      "Set PRICES_PUBLISH_SECRET (remote upload) or BLOB_READ_WRITE_TOKEN (local put).",
    );
    process.exit(1);
  }
  if (!statSync(dbPath, { throwIfNoEntry: false })) {
    console.error(`Missing ${dbPath}. Run: PYTHONPATH=. python3 -m engine.adjusted_db 2`);
    process.exit(1);
  }
  await assertDbReady(dbPath);

  const gzPath = `${dbPath}.gz`;
  console.log("Compressing SQLite…");
  await gzipFile(dbPath, gzPath);

  const sha256 = sha256File(dbPath);
  const sizeBytes = statSync(dbPath).size;
  const gzSize = statSync(gzPath).size;
  let builtAt = new Date().toISOString();
  try {
    const sqlite3 = (await import("better-sqlite3")).default;
    const db = sqlite3(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM build_meta WHERE key = 'raw_sync_at'").get();
    db.close();
    if (row?.value) builtAt = row.value;
  } catch {
    /* optional */
  }

  const publishBase =
    process.env.PRICES_PUBLISH_BASE_URL || "https://momentum-screen-builder-app.vercel.app";
  const publishSecret = process.env.PRICES_PUBLISH_SECRET;
  const handleUploadUrl = `${publishBase.replace(/\/$/, "")}/api/admin/publish-prices/upload`;

  if (publishSecret && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.log(`Client upload → ${handleUploadUrl}`);
    const tokenPayload = JSON.stringify({
      sha256,
      built_at: builtAt,
      size_bytes: sizeBytes,
      gzip_size_bytes: gzSize,
    });
    const blob = await upload("prices/nifty-total-market-2y.sqlite.gz", readFileSync(gzPath), {
      access: "public",
      handleUploadUrl,
      multipart: true,
      contentType: "application/gzip",
      headers: { Authorization: `Bearer ${publishSecret}` },
      clientPayload: tokenPayload,
    });
    const manifest = {
      version: 1,
      universe: "is_nifty_total_market",
      description:
        "Nifty Total Market ~2Y EOD bhavcopy, corporate-action back-adjusted (eod_adjusted + symbol_metrics)",
      built_at: builtAt,
      sha256,
      size_bytes: sizeBytes,
      gzip_size_bytes: gzSize,
      download_url: blob.url,
      format: "sqlite3",
      tables: ["eod_raw", "eod_adjusted", "ca_cache", "symbol_metrics", "build_meta"],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const manifestBlob = await upload("prices/manifest.json", JSON.stringify(manifest, null, 2), {
      access: "public",
      handleUploadUrl,
      multipart: false,
      contentType: "application/json",
      headers: { Authorization: `Bearer ${publishSecret}` },
    });
    manifest.manifest_url = manifestBlob.url;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ ok: true, download_url: blob.url, manifest_url: manifestBlob.url }, null, 2));
    return;
  }

  console.log("Uploading prices.sqlite.gz…");
  const dbBlob = await put("prices/nifty-total-market-2y.sqlite.gz", readFileSync(gzPath), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
    cacheControlMaxAge: 3600,
  });

  const manifest = {
    version: 1,
    universe: "is_nifty_total_market",
    description: "Nifty Total Market ~2Y EOD bhavcopy, corporate-action back-adjusted (eod_adjusted table)",
    built_at: builtAt,
    sha256,
    size_bytes: sizeBytes,
    gzip_size_bytes: gzSize,
    download_url: dbBlob.url,
    format: "sqlite3",
    tables: ["eod_raw", "eod_adjusted", "ca_cache", "symbol_metrics", "build_meta"],
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("Uploading prices-manifest.json…");
  const manifestBlob = await put("prices/manifest.json", JSON.stringify(manifest), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 300,
  });

  manifest.manifest_url = manifestBlob.url;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({ ok: true, download_url: dbBlob.url, manifest_url: manifestBlob.url }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
