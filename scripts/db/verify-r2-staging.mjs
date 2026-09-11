#!/usr/bin/env node

/**
 * R2 media upload smoke verification for the frong.me CMS (Task 1C-04).
 *
 * Single-pass routine that verifies the canonical content-addressed asset
 * contract shared with `src/lib/cms/assets/r2.ts`:
 *
 * 1. Canonical URL & hash — SHA-256 of the fixture must produce the URL
 *    `https://images.frong.me/assets/<sha256>/smoke-test-asset.png`.
 * 2. Idempotency — re-hashing the identical payload must yield the strictly
 *    identical key/URL (content addressing, no duplication).
 * 3. Storage lifecycle — `put` -> `get` -> `delete` against a bucket binding,
 *    with mandatory cleanup verified (the object must no longer exist).
 *
 * Modes:
 * - `--dry-run` (default): uses an in-memory Map-backed mock R2 bucket. Runs
 *   instantly, no network, no credentials, no bucket mutation.
 * - `--remote`: requires an injected R2 bucket binding (pass `{ bucket }`
 *   when calling `verifyR2Staging` programmatically, e.g. from workerd where
 *   `MEDIA_BUCKET` is bound). Performs a real put/get/delete and cleans up.
 *
 * Exit code: 0 on success, 1 on any failure.
 */

import { pathToFileURL } from 'node:url';

/** Filename of the smoke-test fixture inside the asset key. */
export const SMOKE_FILENAME = 'smoke-test-asset.png';

/** Deterministic 1x1 transparent PNG used as the smoke-test fixture. */
export const SMOKE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Public CDN origin that fronts the R2 bucket (mirrors r2.ts). */
export const PUBLIC_ASSET_BASE_URL = 'https://images.frong.me';

/** Prefix for all CMS media objects stored in R2 (mirrors r2.ts). */
export const R2_ASSET_PREFIX = 'assets';

/** Cache-Control applied to uploaded assets (mirrors r2.ts). */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * The canonical public URL contract for the smoke fixture:
 * `https://images.frong.me/assets/<64-char lowercase hex sha256>/smoke-test-asset.png`
 */
export const CANONICAL_URL_PATTERN = new RegExp(
  `^https:\\/\\/images\\.frong\\.me\\/${R2_ASSET_PREFIX}\\/[0-9a-f]{64}\\/smoke-test-asset\\.png$`,
);

function toBytes(input) {
  if (input instanceof Uint8Array && !(input instanceof Buffer)) return input;
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

/**
 * Compute the lowercase hex SHA-256 digest of the given bytes using WebCrypto
 * (the same canonical path `src/lib/cms/assets/r2.ts` uses).
 */
export async function sha256Hex(input) {
  const bytes = toBytes(input);
  if (bytes.byteLength === 0) {
    throw new Error('sha256Hex input must not be empty');
  }
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const digest = await crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build the canonical R2 object key: `assets/<sha256>/<filename>`. */
export function buildAssetKey(sha256, filename = SMOKE_FILENAME) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('sha256 must be a 64-character lowercase hex digest');
  }
  return `${R2_ASSET_PREFIX}/${sha256}/${filename}`;
}

/** Build the canonical public CDN URL for an asset. */
export function publicAssetUrl(sha256, filename = SMOKE_FILENAME) {
  return `${PUBLIC_ASSET_BASE_URL}/${buildAssetKey(sha256, filename)}`;
}

/** Decode the built-in smoke fixture into bytes. */
export function smokeFixtureBytes() {
  return Uint8Array.from(atob(SMOKE_PNG_BASE64), (c) => c.charCodeAt(0));
}

function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Create an in-memory R2Bucket-compatible mock backed by a Map.
 * Supports the subset of the R2 API the smoke test needs:
 * `put`, `get`, `head`, and `delete`.
 */
export function createMemoryBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options = {}) {
      const body = toBytes(value);
      objects.set(key, {
        key,
        body: body.slice(),
        httpMetadata: { ...(options.httpMetadata ?? {}) },
      });
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        ...object,
        arrayBuffer: async () => object.body.slice().buffer,
      };
    },
    async head(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

/**
 * Run the single-pass R2 staging smoke verification.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] Force the in-memory mock bucket.
 * @param {boolean} [options.remote=false] Require a real bucket binding.
 * @param {object|null} [options.bucket=null] R2Bucket-compatible binding
 *   (e.g. the `MEDIA_BUCKET` binding in workerd). Ignored in dry-run mode.
 * @param {(message: string) => void} [options.log] Logger.
 * @param {Uint8Array|Buffer} [options.fixture] Override the test fixture bytes.
 * @param {string} [options.filename] Override the fixture filename.
 * @returns {Promise<{ok: boolean, urlPatternMatch: boolean, idempotent: boolean,
 *   cleanedUp: boolean, sha256: string, url: string, key: string}>}
 */
export async function verifyR2Staging({
  dryRun = false,
  remote = false,
  bucket = null,
  log = console.log,
  fixture = null,
  filename = SMOKE_FILENAME,
} = {}) {
  const bytes = toBytes(fixture ?? smokeFixtureBytes());
  if (bytes.byteLength === 0) {
    throw new Error('Smoke fixture must not be empty');
  }

  const results = {
    ok: false,
    urlPatternMatch: false,
    idempotent: false,
    cleanedUp: false,
    sha256: null,
    url: null,
    key: null,
  };

  // --- Step 1: canonical URL & hash check ---------------------------------
  log('[verify-r2] 1/3 Computing SHA-256 and checking the canonical URL...');
  const digest = await sha256Hex(bytes);
  const key = buildAssetKey(digest, filename);
  const url = publicAssetUrl(digest, filename);
  results.sha256 = digest;
  results.key = key;
  results.url = url;

  if (!CANONICAL_URL_PATTERN.test(publicAssetUrl(digest, SMOKE_FILENAME))) {
    throw new Error(`Canonical URL contract violated for the smoke fixture: ${url}`);
  }
  const genericPattern = new RegExp(
    `^https:\\/\\/images\\.frong\\.me\\/${R2_ASSET_PREFIX}\\/[0-9a-f]{64}\\/[^/]+$`,
  );
  if (!genericPattern.test(url)) {
    throw new Error(`URL ${url} does not match the canonical pattern ${genericPattern}`);
  }
  results.urlPatternMatch = true;
  log(`[verify-r2] ✓ Canonical URL verified: ${url}`);

  // --- Step 2: idempotency (identical payload -> identical path) ----------
  log('[verify-r2] 2/3 Re-verifying with the identical payload...');
  const digest2 = await sha256Hex(bytes);
  const key2 = buildAssetKey(digest2, filename);
  const url2 = publicAssetUrl(digest2, filename);
  if (digest2 !== digest || key2 !== key || url2 !== url) {
    throw new Error(
      `Idempotency check failed: first=${url} second=${url2}`,
    );
  }
  results.idempotent = true;
  log(`[verify-r2] ✓ Identical payload resolved to the identical key: ${key}`);

  // --- Step 3: storage put/get/delete lifecycle with mandatory cleanup ----
  if (remote && !dryRun && !bucket) {
    throw new Error(
      'Remote mode requires an R2 bucket binding (pass { bucket }, e.g. the MEDIA_BUCKET binding)',
    );
  }
  const target = dryRun ? createMemoryBucket() : (bucket ?? createMemoryBucket());
  const mode = dryRun || !bucket ? 'in-memory mock bucket' : 'provided R2 bucket binding';
  log(`[verify-r2] 3/3 Exercising put/get/delete lifecycle against the ${mode}...`);

  await target.put(key, bytes, {
    httpMetadata: { contentType: 'image/png', cacheControl: ASSET_CACHE_CONTROL },
  });
  const stored = await target.get(key);
  if (!stored) {
    throw new Error(`Object ${key} not found in the bucket after put`);
  }
  const storedBytes = new Uint8Array(await stored.arrayBuffer());
  if (!bytesEqual(storedBytes, bytes)) {
    throw new Error('Stored object bytes differ from the uploaded fixture');
  }
  log('[verify-r2] ✓ Object round-trips intact under the canonical key.');

  // Cleanup is mandatory: delete, then prove the object is gone.
  await target.delete(key);
  const afterDelete = await target.head(key);
  if (afterDelete !== null && afterDelete !== undefined) {
    throw new Error(`Cleanup failed: object ${key} still exists after delete`);
  }
  results.cleanedUp = true;
  log(`[verify-r2] ✓ Cleanup verified: ${key} no longer exists.`);

  results.ok = true;
  log('[verify-r2] ✓ All R2 smoke verifications PASSED (URL pattern, idempotency, lifecycle, cleanup).');
  return results;
}

export function parseArgs(argv = process.argv) {
  // Accept either a full process.argv-style array (script path first) or a
  // bare list of flags.
  const flags = argv.length > 0 && String(argv[0]).endsWith('.mjs') ? argv.slice(2) : argv;
  const args = { dryRun: true, remote: false, help: false };
  for (const arg of flags) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.remote = false;
    } else if (arg === '--remote') {
      args.remote = true;
      args.dryRun = false;
    } else if (arg === '--local') {
      args.dryRun = true;
      args.remote = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`
Usage: node scripts/db/verify-r2-staging.mjs [options]

Options:
  --dry-run   Run against an in-memory mock R2 bucket (default; no network, no credentials)
  --local     Alias for --dry-run
  --remote    Require a real R2 bucket binding (only usable when invoked
              programmatically with { bucket }; the CLI exits with an error)
  --help, -h  Show this help message
`);
    return;
  }

  const results = await verifyR2Staging({ dryRun: args.dryRun, remote: args.remote });
  console.log(
    `[verify-r2] Summary: urlPatternMatch=${results.urlPatternMatch} idempotent=${results.idempotent} ` +
    `cleanedUp=${results.cleanedUp} sha256=${results.sha256}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`[verify-r2] ✗ R2 smoke verification failed: ${err.message}`);
    process.exitCode = 1;
  });
}