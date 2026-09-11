/**
 * Cloudflare R2 storage helpers for CMS media uploads.
 *
 * Canonical object layout: `assets/${sha256}/${filename}` — content-addressed
 * by the image SHA-256 digest so identical bytes deduplicate to a single
 * object. Objects are immutable, which is why they are served with a
 * one-year `immutable` cache header.
 *
 * This module uses only Web-standard APIs (`crypto.subtle`, `R2Bucket`) so it
 * runs identically in Node.js tests and in the Cloudflare Workers runtime.
 */

import { CmsValidationError } from '../validation.ts';
import type { CmsImageMimeType } from './metadata.ts';

/** Public CDN origin that fronts the R2 bucket. */
export const PUBLIC_ASSET_BASE_URL = 'https://images.frong.me';

/** Prefix for all CMS media objects stored in R2. */
export const R2_ASSET_PREFIX = 'assets';

/** Cache-Control applied to every uploaded asset (content-addressed, immutable). */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** MIME types accepted for R2 uploads; mirrors the database schema. */
const ALLOWED_MIME_TYPES: readonly CmsImageMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** File extensions accepted for uploads, mapped to their canonical MIME type. */
const EXTENSION_MIME_TYPES: Readonly<Record<string, CmsImageMimeType>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface R2UploadOptions {
  /** Override the detected/inferred MIME type. Must be an allowed image type. */
  contentType?: CmsImageMimeType;
}

export interface R2UploadResult {
  /** Canonical R2 object key, e.g. `assets/<sha256>/photo.png`. */
  key: string;
  /** Public CDN URL for the uploaded object. */
  url: string;
  /** MIME type stored on the object. */
  contentType: CmsImageMimeType;
  /** SHA-256 hex digest the object is content-addressed by. */
  sha256: string;
}

function toBytes(input: Buffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array && !(input instanceof Buffer)) return input;
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

/**
 * Normalize a filename for use inside an R2 object key: strips directory
 * components, collapses unsafe characters, and rejects empty results.
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') {
    throw new CmsValidationError('filename', 'must be a string');
  }
  const base = filename.split(/[/\\]/).pop() ?? '';
  const normalized = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-]+$/g, '');
  if (normalized.length === 0 || normalized === '.' || normalized === '..') {
    throw new CmsValidationError('filename', 'must contain a usable file name');
  }
  return normalized;
}

/**
 * Infer the canonical MIME type from a filename extension.
 * Throws {@link CmsValidationError} for unknown or missing extensions.
 */
export function contentTypeFromFilename(filename: string): CmsImageMimeType {
  const base = sanitizeFilename(filename);
  const extension = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
  const mimeType = EXTENSION_MIME_TYPES[extension];
  if (!mimeType) {
    throw new CmsValidationError('filename', `has unsupported extension ".${extension}"`);
  }
  return mimeType;
}

/**
 * Compute the lowercase hex SHA-256 digest of the given bytes using WebCrypto.
 */
export async function sha256Hex(input: Buffer | Uint8Array): Promise<string> {
  const bytes = toBytes(input);
  if (bytes.byteLength === 0) {
    throw new CmsValidationError('image', 'must not be empty');
  }
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the canonical R2 object key for an asset:
 * `assets/${sha256}/${filename}`.
 *
 * The digest must be a 64-character lowercase hex string (as produced by
 * {@link sha256Hex} or `extractImageMetadata`).
 */
export function buildAssetKey(sha256: string, filename: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new CmsValidationError('sha256', 'must be a 64-character lowercase hex digest');
  }
  return `${R2_ASSET_PREFIX}/${sha256}/${sanitizeFilename(filename)}`;
}

/**
 * Build the public CDN URL for an asset key or filename:
 * `https://images.frong.me/assets/${sha256}/${filename}`.
 */
export function publicAssetUrl(sha256: string, filename: string): string {
  return `${PUBLIC_ASSET_BASE_URL}/${buildAssetKey(sha256, filename)}`;
}

/**
 * Resolve the Content-Type for an upload. An explicit `options.contentType`
 * must be allowed; otherwise the filename extension decides.
 */
export function resolveContentType(
  filename: string,
  options: R2UploadOptions = {},
): CmsImageMimeType {
  if (options.contentType !== undefined) {
    if (!ALLOWED_MIME_TYPES.includes(options.contentType)) {
      throw new CmsValidationError('contentType', `must be one of ${ALLOWED_MIME_TYPES.join(', ')}`);
    }
    return options.contentType;
  }
  return contentTypeFromFilename(filename);
}

/**
 * Upload an image to R2 under its canonical content-addressed key.
 *
 * Sets `Content-Type` from the filename extension (or explicit override) and
 * `Cache-Control: public, max-age=31536000, immutable`.
 */
export async function uploadAsset(
  bucket: R2Bucket,
  input: Buffer | Uint8Array,
  filename: string,
  options: R2UploadOptions = {},
): Promise<R2UploadResult> {
  if (bucket === null || typeof bucket !== 'object' || typeof bucket.put !== 'function') {
    throw new CmsValidationError('bucket', 'must be an R2Bucket binding');
  }
  const bytes = toBytes(input);
  if (bytes.byteLength === 0) {
    throw new CmsValidationError('image', 'must not be empty');
  }

  const contentType = resolveContentType(filename, options);
  const digest = await sha256Hex(bytes);
  const key = buildAssetKey(digest, filename);

  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: ASSET_CACHE_CONTROL,
    },
  });

  return {
    key,
    url: publicAssetUrl(digest, filename),
    contentType,
    sha256: digest,
  };
}