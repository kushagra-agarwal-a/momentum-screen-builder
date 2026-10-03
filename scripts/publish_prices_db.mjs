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

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Missing BLOB_READ_WRITE_TOKEN. Link a Blob store to the Vercel project or export the token.");
    process.exit(1);
  }
  if (!statSync(dbPath, { throwIfNoEntry: false })) {
    console.error(`Missing ${dbPath}. Run: PYTHONPATH=. python3 -m engine.adjusted_db 2`);
    process.exit(1);
  }

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

  const publishUrl = process.env.PRICES_PUBLISH_URL;
  const publishSecret = process.env.PRICES_PUBLISH_SECRET;
  if (publishUrl && publishSecret) {
    console.log(`Uploading via ${publishUrl} …`);
    const gz = readFileSync(gzPath);
    const res = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publishSecret}`,
        "Content-Type": "application/gzip",
        "x-prices-built-at": builtAt,
      },
      body: gz,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(body);
      process.exit(1);
    }
    console.log(JSON.stringify(body, null, 2));
    console.log("\nSet PRICES_MANIFEST_URL on Vercel to:", body.manifest_url);
    return;
  }

  console.log("Uploading prices.sqlite.gz…");
  const dbBlob = await put("prices/nifty-total-market-2y.sqlite.gz", readFileSync(gzPath), {
    access: "public",
    addRandomSuffix: false,
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
    tables: ["eod_raw", "eod_adjusted", "ca_cache", "build_meta"],
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("Uploading prices-manifest.json…");
  const manifestBlob = await put("prices/manifest.json", JSON.stringify(manifest), {
    access: "public",
    addRandomSuffix: false,
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
