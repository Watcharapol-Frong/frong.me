/**
 * Markdown asset-token resolution for published article bodies.
 *
 * Article bodies reference media with custom `asset://` scheme tokens:
 *
 *   ![alt text](asset://<asset_id>)
 *
 * At build time these tokens are replaced with canonical public R2 URLs taken
 * from the immutable `post_revision_assets` mapping for the revision being
 * rendered. Only assets recorded for the revision may be referenced; unknown
 * or non-public asset ids fail loudly instead of leaking private media.
 */

import type { PostRevisionAssetRow } from '../contracts.ts';
import { CmsValidationError } from '../validation.ts';

/** Canonical public asset base URL for the staging environment. */
export const PUBLIC_ASSET_BASE_URL = 'https://images.frong.me';

const ASSET_SCHEME_PATTERN = /^asset:\/\/([A-Za-z0-9][A-Za-z0-9_-]{7,95})$/;
const IMAGE_TOKEN_PATTERN = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Dictionary of revision assets keyed by `asset_id`. */
export type RevisionAssetMap = ReadonlyMap<string, PostRevisionAssetRow>;

/** Build a {@link RevisionAssetMap} from revision asset rows. */
export function buildRevisionAssetMap(
  assets: readonly PostRevisionAssetRow[],
): RevisionAssetMap {
  const map = new Map<string, PostRevisionAssetRow>();
  for (const asset of assets) {
    map.set(asset.asset_id, asset);
  }
  return map;
}

function validatePublicAssetBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  } catch {
    throw new CmsValidationError('publicAssetBaseUrl', 'must be a valid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CmsValidationError(
      'publicAssetBaseUrl',
      'must use HTTPS without embedded credentials',
    );
  }
  return url;
}

/** Canonical public R2 URL for a revision asset's `public_r2_key`. */
export function publicAssetUrl(asset: PostRevisionAssetRow, baseUrl: string): string {
  const base = validatePublicAssetBaseUrl(baseUrl);
  const encodedKey = asset.public_r2_key
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(encodedKey, base).href;
}

/**
 * Replace every `![alt](asset://<asset_id>)` token in a Markdown body with
 * `![alt](<canonical public R2 URL>)`.
 *
 * The mapping dictionary is keyed by `asset_id` from `post_revision_assets`.
 * Tokens referencing an asset id that is absent from the mapping (or whose
 * `public_r2_key` is empty) throw {@link CmsValidationError} so private or
 * dangling media can never reach a public build.
 *
 * Non-image Markdown links and ordinary URLs are left untouched.
 */
export function resolveAssetTokens(
  bodyMarkdown: string,
  assets: RevisionAssetMap,
  baseUrl: string = PUBLIC_ASSET_BASE_URL,
): string {
  if (typeof bodyMarkdown !== 'string') {
    throw new CmsValidationError('bodyMarkdown', 'must be a string');
  }

  return bodyMarkdown.replace(
    /!\[([^\]\n]*)\]\((asset:\/\/[A-Za-z0-9][A-Za-z0-9_-]{7,95})\)/g,
    (_match, alt: string, token: string) => {
      const assetId = token.slice('asset://'.length);
      const asset = assets.get(assetId);
      if (!asset) {
        throw new CmsValidationError(
          'bodyMarkdown',
          `references unknown asset id "${assetId}" not present in the revision asset mapping`,
        );
      }
      if (!asset.public_r2_key.trim()) {
        throw new CmsValidationError(
          'bodyMarkdown',
          `asset "${assetId}" has an empty public_r2_key and cannot be resolved`,
        );
      }
      return `![${alt}](${publicAssetUrl(asset, baseUrl)})`;
    },
  );
}

/**
 * Extract the asset ids referenced by `asset://` image tokens in a Markdown
 * body, in order of first appearance, without duplicates. Useful for
 * validating that a draft only references assets attached to the post.
 */
export function extractAssetReferences(bodyMarkdown: string): string[] {
  if (typeof bodyMarkdown !== 'string') {
    throw new CmsValidationError('bodyMarkdown', 'must be a string');
  }
  const ids = new Set<string>();
  for (const match of bodyMarkdown.matchAll(/!\[[^\]\n]*\]\(asset:\/\/([A-Za-z0-9][A-Za-z0-9_-]{7,95})\)/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

export { ASSET_SCHEME_PATTERN, IMAGE_TOKEN_PATTERN };