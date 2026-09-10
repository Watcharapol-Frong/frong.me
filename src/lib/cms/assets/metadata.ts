/**
 * Image metadata extraction for CMS media uploads.
 *
 * Extracts intrinsic dimensions, MIME type, byte size, and SHA-256 checksum
 * from raw image bytes (Buffer or Uint8Array) without external dependencies.
 * Supports the three formats allowed by the database schema:
 * `image/jpeg`, `image/png`, and `image/webp`.
 *
 * SHA-256 is computed with WebCrypto (`crypto.subtle`) so this module runs
 * identically in Node.js and in the Cloudflare Workers (workerd) runtime.
 */

import { CmsValidationError } from '../validation.ts';

/** MIME types permitted by the `assets` and `post_revision_assets` schema. */
export type CmsImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageMetadata {
  mimeType: CmsImageMimeType;
  width: number;
  height: number;
  byteSize: number;
  /** Lowercase hex-encoded SHA-256 digest (64 characters). */
  sha256: string;
}

/** Upper bound on accepted dimensions; guards against corrupt header values. */
const MAX_DIMENSION = 100_000;

function toBytes(input: Buffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array && !(input instanceof Buffer)) return input;
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1_00_00_00 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index]);
  }
  return text;
}

function validDimensions(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_DIMENSION &&
    height <= MAX_DIMENSION
  );
}

function parsePng(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return null;
  }
  // IHDR chunk: 4-byte length, "IHDR", then width/height as big-endian uint32.
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return { width, height };
}

function parseJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // Standalone markers (fill bytes, TEM, RSTn, SOI, EOI) carry no length.
    const standalone =
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd9) ||
      marker === 0xff;
    if (standalone) {
      offset += 2;
      continue;
    }
    const segmentLength = readUint16BE(bytes, offset + 2);
    if (segmentLength < 2) return null;
    // SOF0–SOF15 except DHT (C4), JPG (C8), and DAC (CC) carry frame dimensions.
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > bytes.length) return null;
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;

  const chunkFourcc = ascii(bytes, 12, 4);
  const payload = 20; // 12-byte RIFF/WEBP header + 8-byte chunk header

  if (chunkFourcc === 'VP8X') {
    // Extended format: canvas width/height minus one as 24-bit little-endian.
    const width = readUint24LE(bytes, payload + 4) + 1;
    const height = readUint24LE(bytes, payload + 7) + 1;
    return { width, height };
  }

  if (chunkFourcc === 'VP8 ') {
    // Lossy format: 3-byte frame tag, sync code 0x9D 0x01 0x2A, then
    // 14-bit little-endian width/height minus one in two uint16 values.
    if (bytes[payload + 3] !== 0x9d || bytes[payload + 4] !== 0x01 || bytes[payload + 5] !== 0x2a) {
      return null;
    }
    const width = (readUint16LE(bytes, payload + 6) & 0x3fff) + 1;
    const height = (readUint16LE(bytes, payload + 8) & 0x3fff) + 1;
    return { width, height };
  }

  if (chunkFourcc === 'VP8L') {
    // Lossless format: signature byte 0x2F, then 14-bit width-1 and 14-bit
    // height-1 packed little-endian into the next four bytes.
    if (bytes[payload] !== 0x2f) return null;
    const bits =
      bytes[payload + 1] |
      (bytes[payload + 2] << 8) |
      (bytes[payload + 3] << 16) |
      (bytes[payload + 4] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

function detectFormat(
  bytes: Uint8Array,
): { mimeType: CmsImageMimeType; dimensions: { width: number; height: number } } | null {
  const png = parsePng(bytes);
  if (png) return { mimeType: 'image/png', dimensions: png };

  const jpeg = parseJpeg(bytes);
  if (jpeg) return { mimeType: 'image/jpeg', dimensions: jpeg };

  const webp = parseWebp(bytes);
  if (webp) return { mimeType: 'image/webp', dimensions: webp };

  return null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract image metadata (dimensions, MIME type, byte size, SHA-256) from raw
 * image bytes. Accepts a `Buffer` or `Uint8Array`; both are treated as the
 * same byte sequence.
 *
 * Throws {@link CmsValidationError} when the bytes are empty, truncated, or
 * not a supported JPEG/PNG/WebP image, or when parsed dimensions are implausible.
 */
export async function extractImageMetadata(input: Buffer | Uint8Array): Promise<ImageMetadata> {
  if (!(input instanceof Uint8Array)) {
    throw new CmsValidationError('image', 'must be a Buffer or Uint8Array');
  }
  const bytes = toBytes(input);
  if (bytes.byteLength === 0) {
    throw new CmsValidationError('image', 'must not be empty');
  }

  const detected = detectFormat(bytes);
  if (!detected) {
    throw new CmsValidationError('image', 'must be a supported JPEG, PNG, or WebP image');
  }
  const { mimeType, dimensions } = detected;
  if (!validDimensions(dimensions.width, dimensions.height)) {
    throw new CmsValidationError(
      'image',
      `has implausible dimensions ${dimensions.width}x${dimensions.height}`,
    );
  }

  return {
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: bytes.byteLength,
    sha256: await sha256Hex(bytes),
  };
}