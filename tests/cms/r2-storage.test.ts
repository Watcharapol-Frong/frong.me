import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSET_CACHE_CONTROL,
  PUBLIC_ASSET_BASE_URL,
  R2_ASSET_PREFIX,
  buildAssetKey,
  contentTypeFromFilename,
  publicAssetUrl,
  resolveContentType,
  sanitizeFilename,
  sha256Hex,
  uploadAsset,
} from '../../src/lib/cms/assets/r2.ts';
import { CmsValidationError } from '../../src/lib/cms/validation.ts';

const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'f'.repeat(64);

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

test('sanitizeFilename keeps simple names intact', () => {
  assert.equal(sanitizeFilename('photo.png'), 'photo.png');
  assert.equal(sanitizeFilename('banner-v2.webp'), 'banner-v2.webp');
});

test('sanitizeFilename strips directory components', () => {
  assert.equal(sanitizeFilename('uploads/2026/photo.jpg'), 'photo.jpg');
  assert.equal(sanitizeFilename('C:\\temp\\image.png'), 'image.png');
});

test('sanitizeFilename normalizes unsafe characters', () => {
  assert.equal(sanitizeFilename('my photo (final).png'), 'my-photo-final-.png');
  assert.equal(sanitizeFilename('café.jpg'), 'cafe.jpg');
});

test('sanitizeFilename rejects empty or unusable names', () => {
  assert.throws(() => sanitizeFilename(''), CmsValidationError);
  assert.throws(() => sanitizeFilename('///'), CmsValidationError);
  assert.throws(() => sanitizeFilename('   '), CmsValidationError);
});

// ---------------------------------------------------------------------------
// contentTypeFromFilename / resolveContentType
// ---------------------------------------------------------------------------

test('contentTypeFromFilename maps extensions to canonical MIME types', () => {
  assert.equal(contentTypeFromFilename('photo.jpg'), 'image/jpeg');
  assert.equal(contentTypeFromFilename('photo.JPG'), 'image/jpeg');
  assert.equal(contentTypeFromFilename('photo.jpeg'), 'image/jpeg');
  assert.equal(contentTypeFromFilename('diagram.png'), 'image/png');
  assert.equal(contentTypeFromFilename('hero.webp'), 'image/webp');
});

test('contentTypeFromFilename rejects unsupported extensions', () => {
  assert.throws(() => contentTypeFromFilename('movie.gif'), CmsValidationError);
  assert.throws(() => contentTypeFromFilename('archive.tar.gz'), CmsValidationError);
});

test('resolveContentType prefers the explicit override', () => {
  assert.equal(resolveContentType('photo.dat', { contentType: 'image/png' }), 'image/png');
  assert.equal(resolveContentType('photo.jpg', { contentType: 'image/webp' }), 'image/webp');
});

test('resolveContentType rejects disallowed overrides', () => {
  assert.throws(
    () => resolveContentType('photo.jpg', { contentType: 'text/html' as never }),
    CmsValidationError,
  );
});

test('resolveContentType falls back to the filename extension', () => {
  assert.equal(resolveContentType('photo.png'), 'image/png');
});

// ---------------------------------------------------------------------------
// sha256Hex
// ---------------------------------------------------------------------------

test('sha256Hex computes the expected digest', async () => {
  const digest = await sha256Hex(new TextEncoder().encode('hello'));
  assert.equal(
    digest,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
});

test('sha256Hex treats Buffer and Uint8Array identically', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.equal(await sha256Hex(bytes), await sha256Hex(Buffer.from(bytes)));
});

test('sha256Hex rejects empty input', async () => {
  await assert.rejects(() => sha256Hex(new Uint8Array(0)), CmsValidationError);
});

// ---------------------------------------------------------------------------
// buildAssetKey
// ---------------------------------------------------------------------------

test('buildAssetKey produces the canonical assets/<sha256>/<filename> layout', () => {
  assert.equal(buildAssetKey(DIGEST, 'photo.png'), `${R2_ASSET_PREFIX}/${DIGEST}/photo.png`);
});

test('buildAssetKey sanitizes the filename', () => {
  assert.equal(
    buildAssetKey(DIGEST, 'uploads/my photo.jpg'),
    `${R2_ASSET_PREFIX}/${DIGEST}/my-photo.jpg`,
  );
});

test('buildAssetKey rejects malformed digests', () => {
  assert.throws(() => buildAssetKey('abc123', 'photo.png'), CmsValidationError);
  assert.throws(() => buildAssetKey(DIGEST.toUpperCase(), 'photo.png'), CmsValidationError);
  assert.throws(() => buildAssetKey('', 'photo.png'), CmsValidationError);
});

// ---------------------------------------------------------------------------
// publicAssetUrl
// ---------------------------------------------------------------------------

test('publicAssetUrl builds CDN URLs on the images.frong.me origin', () => {
  assert.equal(
    publicAssetUrl(DIGEST, 'photo.png'),
    `${PUBLIC_ASSET_BASE_URL}/${R2_ASSET_PREFIX}/${DIGEST}/photo.png`,
  );
  assert.equal(PUBLIC_ASSET_BASE_URL, 'https://images.frong.me');
});

test('publicAssetUrl matches the object key', () => {
  assert.equal(publicAssetUrl(OTHER_DIGEST, 'hero.webp'), `https://images.frong.me/${buildAssetKey(OTHER_DIGEST, 'hero.webp')}`);
});

// ---------------------------------------------------------------------------
// uploadAsset
// ---------------------------------------------------------------------------

interface RecordedPut {
  key: string;
  value: Uint8Array;
  options: { httpMetadata?: { contentType?: string; cacheControl?: string } };
}

function makeBucket() {
  const puts: RecordedPut[] = [];
  const bucket = {
    put: async (key: string, value: Uint8Array, options: RecordedPut['options']) => {
      puts.push({ key, value, options });
      return { key };
    },
  };
  return { bucket: bucket as unknown as R2Bucket, puts };
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('uploadAsset stores bytes under the canonical key with correct metadata', async () => {
  const { bucket, puts } = makeBucket();
  const result = await uploadAsset(bucket, PNG_BYTES, 'photo.png');

  assert.equal(puts.length, 1);
  const recorded = puts[0]!;
  assert.equal(recorded.key, result.key);
  assert.equal(recorded.key, `${R2_ASSET_PREFIX}/${result.sha256}/photo.png`);
  assert.equal(recorded.options.httpMetadata?.contentType, 'image/png');
  assert.equal(recorded.options.httpMetadata?.cacheControl, ASSET_CACHE_CONTROL);
  assert.equal(ASSET_CACHE_CONTROL, 'public, max-age=31536000, immutable');
  assert.deepEqual(Array.from(recorded.value), Array.from(PNG_BYTES));

  assert.equal(result.contentType, 'image/png');
  assert.equal(result.url, publicAssetUrl(result.sha256, 'photo.png'));
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
});

test('uploadAsset honors an explicit contentType override', async () => {
  const { bucket, puts } = makeBucket();
  const result = await uploadAsset(bucket, PNG_BYTES, 'photo.png', { contentType: 'image/jpeg' });

  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(puts[0]?.options.httpMetadata?.contentType, 'image/jpeg');
});

test('uploadAsset accepts Buffer input', async () => {
  const { bucket, puts } = makeBucket();
  const result = await uploadAsset(bucket, Buffer.from(PNG_BYTES), 'buffered.png');
  assert.equal(puts[0]?.key, result.key);
});

test('uploadAsset rejects empty payloads and invalid bindings', async () => {
  const { bucket } = makeBucket();
  await assert.rejects(() => uploadAsset(bucket, new Uint8Array(0), 'empty.png'), CmsValidationError);
  await assert.rejects(
    () => uploadAsset(null as unknown as R2Bucket, PNG_BYTES, 'photo.png'),
    CmsValidationError,
  );
  await assert.rejects(
    () => uploadAsset({} as unknown as R2Bucket, PNG_BYTES, 'photo.png'),
    CmsValidationError,
  );
});