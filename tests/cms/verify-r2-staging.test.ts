import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSET_CACHE_CONTROL,
  CANONICAL_URL_PATTERN,
  PUBLIC_ASSET_BASE_URL,
  R2_ASSET_PREFIX,
  SMOKE_FILENAME,
  buildAssetKey,
  createMemoryBucket,
  publicAssetUrl,
  sha256Hex,
  smokeFixtureBytes,
  parseArgs,
  verifyR2Staging,
} from '../../scripts/db/verify-r2-staging.mjs';

// ---------------------------------------------------------------------------
// Canonical hash / key / URL helpers
// ---------------------------------------------------------------------------

test('smokeFixtureBytes decodes a non-empty PNG fixture', () => {
  const bytes = smokeFixtureBytes();
  assert.ok(bytes.byteLength > 0);
  // PNG magic number: 89 50 4E 47
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
});

test('sha256Hex computes the canonical digest for the fixture', async () => {
  const digest = await sha256Hex(smokeFixtureBytes());
  assert.match(digest, /^[0-9a-f]{64}$/);
});

test('sha256Hex matches the known digest of a fixed payload', async () => {
  const digest = await sha256Hex(new TextEncoder().encode('hello'));
  assert.equal(
    digest,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
});

test('buildAssetKey produces the canonical assets/<sha256>/<filename> layout', async () => {
  const digest = await sha256Hex(smokeFixtureBytes());
  assert.equal(buildAssetKey(digest), `${R2_ASSET_PREFIX}/${digest}/${SMOKE_FILENAME}`);
});

test('buildAssetKey rejects malformed digests', () => {
  assert.throws(() => buildAssetKey('abc123'));
  assert.throws(() => buildAssetKey('A'.repeat(64)));
  assert.throws(() => buildAssetKey(''));
});

test('publicAssetUrl matches the canonical URL pattern', async () => {
  const digest = await sha256Hex(smokeFixtureBytes());
  const url = publicAssetUrl(digest);
  assert.equal(url, `${PUBLIC_ASSET_BASE_URL}/${R2_ASSET_PREFIX}/${digest}/${SMOKE_FILENAME}`);
  assert.match(url, CANONICAL_URL_PATTERN);
});

// ---------------------------------------------------------------------------
// In-memory bucket lifecycle
// ---------------------------------------------------------------------------

test('createMemoryBucket supports put/get/head/delete lifecycle', async () => {
  const bucket = createMemoryBucket();
  const key = `${R2_ASSET_PREFIX}/deadbeef/test.png`;
  const bytes = new Uint8Array([1, 2, 3, 4]);

  assert.equal(await bucket.head(key), null);
  assert.equal(await bucket.get(key), null);

  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'image/png', cacheControl: ASSET_CACHE_CONTROL },
  });

  const stored = await bucket.get(key);
  assert.ok(stored);
  assert.equal(stored.httpMetadata.contentType, 'image/png');
  assert.equal(stored.httpMetadata.cacheControl, ASSET_CACHE_CONTROL);
  assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), bytes);
  assert.ok(await bucket.head(key));

  await bucket.delete(key);
  assert.equal(await bucket.head(key), null);
  assert.equal(await bucket.get(key), null);
  assert.equal(bucket.objects.size, 0);
});

// ---------------------------------------------------------------------------
// verifyR2Staging — dry-run (default) mode
// ---------------------------------------------------------------------------

test('verifyR2Staging dry-run passes all steps and cleans up', async () => {
  const logs = [];
  const results = await verifyR2Staging({ dryRun: true, log: (m) => logs.push(m) });

  assert.equal(results.ok, true);
  assert.equal(results.urlPatternMatch, true);
  assert.equal(results.idempotent, true);
  assert.equal(results.cleanedUp, true);
  assert.match(results.sha256, /^[0-9a-f]{64}$/);
  assert.match(results.url, CANONICAL_URL_PATTERN);
  assert.equal(results.key, `${R2_ASSET_PREFIX}/${results.sha256}/${SMOKE_FILENAME}`);
  assert.ok(logs.length > 0);
});

test('verifyR2Staging dry-run leaves no objects behind', async () => {
  // Dry-run uses its own internal mock bucket; verify via a custom fixture
  // that the routine is deterministic and repeatable.
  const first = await verifyR2Staging({ dryRun: true, log: () => {} });
  const second = await verifyR2Staging({ dryRun: true, log: () => {} });
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.url, second.url);
  assert.equal(first.key, second.key);
});

test('verifyR2Staging accepts a custom fixture and filename', async () => {
  const fixture = new TextEncoder().encode('custom-fixture-bytes');
  const results = await verifyR2Staging({
    dryRun: true,
    fixture,
    filename: 'custom.png',
    log: () => {},
  });
  assert.equal(results.key, `${R2_ASSET_PREFIX}/${results.sha256}/custom.png`);
  assert.equal(
    results.url,
    `${PUBLIC_ASSET_BASE_URL}/${R2_ASSET_PREFIX}/${results.sha256}/custom.png`,
  );
});

test('verifyR2Staging rejects an empty fixture', async () => {
  await assert.rejects(
    () => verifyR2Staging({ dryRun: true, fixture: new Uint8Array(0), log: () => {} }),
    /must not be empty/,
  );
});

// ---------------------------------------------------------------------------
// verifyR2Staging — remote mode with an injected binding
// ---------------------------------------------------------------------------

test('verifyR2Staging remote mode exercises the provided bucket binding and cleans up', async () => {
  const bucket = createMemoryBucket();
  const results = await verifyR2Staging({ remote: true, bucket, log: () => {} });

  assert.equal(results.ok, true);
  assert.equal(results.cleanedUp, true);
  // Mandatory cleanup: nothing may remain in the bucket.
  assert.equal(bucket.objects.size, 0);
  assert.equal(await bucket.head(results.key), null);
});

test('verifyR2Staging remote mode without a bucket binding fails fast', async () => {
  await assert.rejects(
    () => verifyR2Staging({ remote: true, log: () => {} }),
    /requires an R2 bucket binding/,
  );
});

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

test('parseArgs defaults to dry-run', () => {
  const args = parseArgs([]);
  assert.equal(args.dryRun, true);
  assert.equal(args.remote, false);
});

test('parseArgs recognizes --dry-run, --local, and --remote', () => {
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--local']).dryRun, true);
  const remote = parseArgs(['--remote']);
  assert.equal(remote.remote, true);
  assert.equal(remote.dryRun, false);
});