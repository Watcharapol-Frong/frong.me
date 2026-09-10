import assert from 'node:assert/strict';
import test from 'node:test';
import { CmsValidationError } from '../../src/lib/cms/validation.ts';
import { extractImageMetadata } from '../../src/lib/cms/assets/metadata.ts';
import {
  PUBLIC_ASSET_BASE_URL,
  buildRevisionAssetMap,
  extractAssetReferences,
  publicAssetUrl,
  resolveAssetTokens,
} from '../../src/lib/cms/markdown/asset-resolver.ts';
import type { PostRevisionAssetRow } from '../../src/lib/cms/contracts.ts';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Minimal valid 1x1 PNG (transparent pixel). */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length = 13
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0x00, 0x00, 0x00, 0x01, // width = 1
  0x00, 0x00, 0x00, 0x01, // height = 1
  0x08, 0x06, 0x00, 0x00, 0x00, // bit depth 8, RGBA, default compression/filter/interlace
  0x1f, 0x15, 0xc4, 0x89, // CRC32 of IHDR
  0x00, 0x00, 0x00, 0x0a, // IDAT length = 10
  0x49, 0x44, 0x41, 0x54, // "IDAT"
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // zlib stream
  0x0d, 0x0a, 0x2d, 0xb4, // IDAT CRC32
  0x00, 0x00, 0x00, 0x00, // IEND length = 0
  0x49, 0x45, 0x4e, 0x44, // "IEND"
  0xae, 0x42, 0x60, 0x82, // IEND CRC32
]);

/** Minimal lossy WebP (VP8 key frame, 1x1). */
const WEBP_1X1 = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x32, 0x00, 0x00, 0x00, // file size - 8
  0x57, 0x45, 0x42, 0x50, // "WEBP"
  0x56, 0x50, 0x38, 0x20, // "VP8 "
  0x1a, 0x00, 0x00, 0x00, // chunk payload size = 26
  0x00, 0x00, 0x00, // frame tag: key frame, partition size 0
  0x9d, 0x01, 0x2a, // sync code
  0x00, 0x00, // width-1 = 0 -> width 1 (14-bit LE)
  0x00, 0x00, // height-1 = 0 -> height 1
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // padding payload
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** Minimal baseline JPEG (SOI + SOF0 with 1x1 dimensions). */
const JPEG_1X1 = Uint8Array.from([
  0xff, 0xd8, // SOI
  0xff, 0xc0, 0x00, 0x11, // SOF0, length 17
  0x08, // precision
  0x00, 0x01, // height = 1
  0x00, 0x01, // width = 1
  0x01, // component count
  0x00, 0x11, 0x00, // component 1: id, sampling, quant table
  0xff, 0xd9, // EOI
]);

function revisionAsset(overrides: Partial<PostRevisionAssetRow> = {}): PostRevisionAssetRow {
  return {
    revision_id: 'rev_en_00000001',
    usage_id: 'usg_en_body_0001',
    asset_id: 'asset_chart_00002',
    role: 'body',
    public_r2_key: 'staging/benchmark-latency.png',
    mime_type: 'image/png',
    width: 1200,
    height: 675,
    byte_size: 94208,
    sha256: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
    alt_text: 'D1 Query Latency Benchmark Chart',
    caption: null,
    crop_json: null,
    position: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// metadata.ts
// ---------------------------------------------------------------------------

test('extractImageMetadata parses PNG dimensions, mime type, size, and sha256', async () => {
  const meta = await extractImageMetadata(PNG_1X1);
  assert.equal(meta.mimeType, 'image/png');
  assert.equal(meta.width, 1);
  assert.equal(meta.height, 1);
  assert.equal(meta.byteSize, PNG_1X1.byteLength);
  assert.match(meta.sha256, /^[a-f0-9]{64}$/);
});

test('extractImageMetadata parses lossy WebP (VP8) dimensions', async () => {
  const meta = await extractImageMetadata(WEBP_1X1);
  assert.equal(meta.mimeType, 'image/webp');
  assert.equal(meta.width, 1);
  assert.equal(meta.height, 1);
  assert.equal(meta.byteSize, WEBP_1X1.byteLength);
});

test('extractImageMetadata parses baseline JPEG dimensions', async () => {
  const meta = await extractImageMetadata(JPEG_1X1);
  assert.equal(meta.mimeType, 'image/jpeg');
  assert.equal(meta.width, 1);
  assert.equal(meta.height, 1);
  assert.equal(meta.byteSize, JPEG_1X1.byteLength);
});

test('extractImageMetadata accepts Buffer and Uint8Array identically', async () => {
  const fromBuffer = await extractImageMetadata(Buffer.from(PNG_1X1));
  const fromBytes = await extractImageMetadata(PNG_1X1);
  assert.deepEqual(fromBuffer, fromBytes);
});

test('extractImageMetadata produces a stable sha256 for identical bytes', async () => {
  const first = await extractImageMetadata(PNG_1X1);
  const second = await extractImageMetadata(Uint8Array.from(PNG_1X1));
  assert.equal(first.sha256, second.sha256);
});

test('extractImageMetadata rejects empty input', async () => {
  await assert.rejects(() => extractImageMetadata(new Uint8Array(0)), CmsValidationError);
});

test('extractImageMetadata rejects non-image bytes', async () => {
  const text = new TextEncoder().encode('definitely not an image');
  await assert.rejects(() => extractImageMetadata(text), CmsValidationError);
});

test('extractImageMetadata rejects truncated PNG', async () => {
  await assert.rejects(
    () => extractImageMetadata(PNG_1X1.slice(0, 10)),
    CmsValidationError,
  );
});

test('extractImageMetadata rejects implausible dimensions', async () => {
  const corrupt = Uint8Array.from(PNG_1X1);
  // Overwrite IHDR width with an absurd value.
  corrupt.set([0xff, 0xff, 0xff, 0xff], 16);
  await assert.rejects(() => extractImageMetadata(corrupt), CmsValidationError);
});

// ---------------------------------------------------------------------------
// asset-resolver.ts
// ---------------------------------------------------------------------------

test('buildRevisionAssetMap indexes rows by asset_id', () => {
  const rows = [
    revisionAsset({ asset_id: 'asset_cover_00001' }),
    revisionAsset({ asset_id: 'asset_chart_00002' }),
  ];
  const map = buildRevisionAssetMap(rows);
  assert.equal(map.size, 2);
  assert.equal(map.get('asset_cover_00001')?.usage_id, 'usg_en_body_0001');
  assert.ok(map.has('asset_chart_00002'));
});

test('publicAssetUrl builds canonical HTTPS URL from public_r2_key', () => {
  const url = publicAssetUrl(revisionAsset(), 'https://images.frong.me');
  assert.equal(url, 'https://images.frong.me/staging/benchmark-latency.png');
});

test('publicAssetUrl normalizes trailing slash and encodes key segments', () => {
  const asset = revisionAsset({ public_r2_key: 'staging/my image/key (1).png' });
  const url = publicAssetUrl(asset, 'https://images.frong.me/');
  // Spaces are percent-encoded; the URL parser keeps parentheses literal.
  assert.equal(url, 'https://images.frong.me/staging/my%20image/key%20(1).png');
});

test('publicAssetUrl rejects non-HTTPS base URLs', () => {
  assert.throws(() => publicAssetUrl(revisionAsset(), 'http://images.frong.me'), CmsValidationError);
});

test('resolveAssetTokens replaces asset:// tokens with canonical R2 URLs', () => {
  const body = [
    'Intro paragraph.',
    '',
    '![Benchmark chart](asset://asset_chart_00002)',
    '',
    'Outro.',
  ].join('\n');
  const resolved = resolveAssetTokens(body, buildRevisionAssetMap([revisionAsset()]));
  assert.equal(
    resolved,
    [
      'Intro paragraph.',
      '',
      '![Benchmark chart](https://images.frong.me/staging/benchmark-latency.png)',
      '',
      'Outro.',
    ].join('\n'),
  );
});

test('resolveAssetTokens resolves multiple tokens in one body', () => {
  const body = [
    '![Cover](asset://asset_cover_00001)',
    '![Chart](asset://asset_chart_00002)',
  ].join('\n');
  const map = buildRevisionAssetMap([
    revisionAsset({ asset_id: 'asset_cover_00001', public_r2_key: 'staging/cover.webp' }),
    revisionAsset({ asset_id: 'asset_chart_00002' }),
  ]);
  const resolved = resolveAssetTokens(body, map);
  assert.match(resolved, /!\[Cover\]\(https:\/\/images\.frong\.me\/staging\/cover\.webp\)/);
  assert.match(resolved, /!\[Chart\]\(https:\/\/images\.frong\.me\/staging\/benchmark-latency\.png\)/);
});

test('resolveAssetTokens leaves ordinary markdown links untouched', () => {
  const body = '[External docs](https://developers.cloudflare.com/d1/) and ![alt](asset://asset_chart_00002)';
  const resolved = resolveAssetTokens(body, buildRevisionAssetMap([revisionAsset()]));
  assert.match(resolved, /\[External docs\]\(https:\/\/developers\.cloudflare\.com\/d1\/\)/);
  assert.doesNotMatch(resolved, /asset:\/\//);
});

test('resolveAssetTokens throws for unknown asset ids', () => {
  const body = '![Ghost](asset://asset_missing_01)';
  assert.throws(
    () => resolveAssetTokens(body, buildRevisionAssetMap([revisionAsset()])),
    /unknown asset id "asset_missing_0001"|unknown asset id/,
  );
});

test('resolveAssetTokens throws when public_r2_key is empty', () => {
  const body = '![Private](asset://asset_chart_00002)';
  const map = buildRevisionAssetMap([revisionAsset({ public_r2_key: '' })]);
  assert.throws(() => resolveAssetTokens(body, map), /empty public_r2_key/);
});

test('resolveAssetTokens uses the default staging base URL', () => {
  const resolved = resolveAssetTokens(
    '![alt](asset://asset_chart_00002)',
    buildRevisionAssetMap([revisionAsset()]),
  );
  assert.equal(resolved, `![alt](${PUBLIC_ASSET_BASE_URL}/staging/benchmark-latency.png)`);
});

test('extractAssetReferences returns unique asset ids in order', () => {
  const body = [
    '![A](asset://asset_cover_00001)',
    '![B](asset://asset_chart_00002)',
    '![A again](asset://asset_cover_00001)',
    '[not an image](asset://asset_cover_00001)',
  ].join('\n');
  assert.deepEqual(extractAssetReferences(body), [
    'asset_cover_00001',
    'asset_chart_00002',
  ]);
});

test('extractAssetReferences returns empty array for bodies without tokens', () => {
  assert.deepEqual(extractAssetReferences('No assets here.'), []);
});