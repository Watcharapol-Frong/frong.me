import type {
  AssetMediaKind,
  AssetRole,
  AssetRow,
  PostAssetUsageRow,
} from '../../../lib/cms/contracts.ts';
import { type CmsDatabase, requireChanged } from '../db.ts';
import {
  CmsBadRequestError,
  CmsConflictError,
  CmsNotFoundError,
} from '../errors.ts';

export interface CreateAssetInput {
  id: string;
  mediaKind: AssetMediaKind;
  privateR2Key: string;
  originalName?: string;
  mimeType: AssetRow['mime_type'];
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
}

export interface AssetCrop {
  x: number;
  y: number;
  zoom: number;
}

export interface AddPostAssetUsageInput {
  id: string;
  postId: string;
  assetId: string;
  role: AssetRole;
  altText: string;
  caption?: string | null;
  crop?: AssetCrop | null;
  position?: number;
  expectedDraftVersion: number;
}

export interface UpdatePostAssetUsageInput {
  role: AssetRole;
  altText: string;
  caption?: string | null;
  crop?: AssetCrop | null;
  position?: number;
  expectedDraftVersion: number;
}

export async function createAsset(
  db: CmsDatabase,
  input: CreateAssetInput,
  now = Date.now(),
): Promise<AssetRow> {
  validateAsset(input);
  const result = await db.run<AssetRow>(
    `INSERT INTO assets (
       id, media_kind, lifecycle, private_r2_key, public_r2_key,
       original_name, mime_type, width, height, byte_size, sha256,
       created_at, promoted_at
     ) VALUES (?1, ?2, 'private', ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)
     RETURNING *`,
    [
      input.id,
      input.mediaKind,
      input.privateR2Key,
      input.originalName ?? null,
      input.mimeType,
      input.width,
      input.height,
      input.byteSize,
      input.sha256,
      now,
    ],
  );
  return requiredAsset(result.results[0], input.id);
}

export async function getAsset(db: CmsDatabase, assetId: string): Promise<AssetRow> {
  const asset = await db.first<AssetRow>(`SELECT * FROM assets WHERE id = ?1 LIMIT 1`, [assetId]);
  return requiredAsset(asset ?? undefined, assetId);
}

export async function promoteAsset(
  db: CmsDatabase,
  assetId: string,
  publicR2Key: string,
  now = Date.now(),
): Promise<AssetRow> {
  if (!publicR2Key.trim()) throw new CmsBadRequestError('Public R2 key cannot be empty');
  const result = await db.run<AssetRow>(
    `UPDATE assets
     SET lifecycle = 'public', public_r2_key = ?1, promoted_at = ?2
     WHERE id = ?3 AND lifecycle = 'private'
     RETURNING *`,
    [publicR2Key, now, assetId],
  );
  if ((result.meta.changes ?? 0) > 0) return requiredAsset(result.results[0], assetId);

  const existing = await getAsset(db, assetId);
  if (existing.lifecycle === 'public' && existing.public_r2_key === publicR2Key) return existing;
  throw new CmsConflictError('Asset cannot be promoted from its current state');
}

export async function markPrivateAssetOrphaned(
  db: CmsDatabase,
  assetId: string,
): Promise<AssetRow> {
  const result = await db.run<AssetRow>(
    `UPDATE assets
     SET lifecycle = 'orphaned'
     WHERE id = ?1 AND lifecycle = 'private'
     RETURNING *`,
    [assetId],
  );
  if ((result.meta.changes ?? 0) > 0) return requiredAsset(result.results[0], assetId);
  const existing = await getAsset(db, assetId);
  if (existing.lifecycle === 'orphaned') return existing;
  throw new CmsConflictError('A public asset cannot be marked as a private orphan');
}

export async function listPostAssetUsages(
  db: CmsDatabase,
  postId: string,
): Promise<PostAssetUsageRow[]> {
  return db.all<PostAssetUsageRow>(
    `SELECT id, post_id, asset_id, role, alt_text, caption, crop_json, position
     FROM post_asset_usages
     WHERE post_id = ?1
     ORDER BY CASE role WHEN 'cover' THEN 0 ELSE 1 END, position ASC, id ASC`,
    [postId],
  );
}

export async function addPostAssetUsage(
  db: CmsDatabase,
  input: AddPostAssetUsageInput,
  now = Date.now(),
): Promise<PostAssetUsageRow> {
  validateUsage(input);
  const cropJson = serializeCrop(input.crop);
  const results = await db.batch<PostAssetUsageRow>([
    {
      sql: `INSERT INTO post_asset_usages (
              id, post_id, asset_id, role, alt_text, caption, crop_json, position
            )
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
            FROM posts
            WHERE id = ?2 AND draft_version = ?9 AND lifecycle <> 'archived'`,
      params: [
        input.id,
        input.postId,
        input.assetId,
        input.role,
        input.altText,
        input.caption ?? null,
        cropJson,
        input.position ?? 0,
        input.expectedDraftVersion,
      ],
    },
    {
      sql: `UPDATE posts
            SET draft_version = draft_version + 1, updated_at = ?1
            WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'`,
      params: [now, input.postId, input.expectedDraftVersion],
    },
  ]);
  requireChanged(
    results[1],
    'The post draft changed before the asset could be attached',
    'DRAFT_VERSION_CONFLICT',
  );
  return getPostAssetUsage(db, input.postId, input.id);
}

export async function updatePostAssetUsage(
  db: CmsDatabase,
  postId: string,
  usageId: string,
  input: UpdatePostAssetUsageInput,
  now = Date.now(),
): Promise<PostAssetUsageRow> {
  validateUsage({ ...input, id: usageId, postId, assetId: 'unchanged_asset' });
  await getPostAssetUsage(db, postId, usageId);
  const results = await db.batch([
    {
      sql: `UPDATE post_asset_usages
            SET role = ?1, alt_text = ?2, caption = ?3, crop_json = ?4, position = ?5
            WHERE id = ?6 AND post_id = ?7
              AND EXISTS (
                SELECT 1 FROM posts
                WHERE id = ?7 AND draft_version = ?8 AND lifecycle <> 'archived'
              )`,
      params: [
        input.role,
        input.altText,
        input.caption ?? null,
        serializeCrop(input.crop),
        input.position ?? 0,
        usageId,
        postId,
        input.expectedDraftVersion,
      ],
    },
    {
      sql: `UPDATE posts
            SET draft_version = draft_version + 1, updated_at = ?1
            WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'`,
      params: [now, postId, input.expectedDraftVersion],
    },
  ]);
  requireChanged(
    results[1],
    'The post draft changed before the asset usage could be updated',
    'DRAFT_VERSION_CONFLICT',
  );
  return getPostAssetUsage(db, postId, usageId);
}

export async function removePostAssetUsage(
  db: CmsDatabase,
  postId: string,
  usageId: string,
  expectedDraftVersion: number,
  now = Date.now(),
): Promise<void> {
  await getPostAssetUsage(db, postId, usageId);
  const results = await db.batch([
    {
      sql: `DELETE FROM post_asset_usages
            WHERE id = ?1 AND post_id = ?2
              AND EXISTS (
                SELECT 1 FROM posts
                WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'
              )`,
      params: [usageId, postId, expectedDraftVersion],
    },
    {
      sql: `UPDATE posts
            SET draft_version = draft_version + 1, updated_at = ?1
            WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'`,
      params: [now, postId, expectedDraftVersion],
    },
  ]);
  requireChanged(
    results[1],
    'The post draft changed before the asset usage could be removed',
    'DRAFT_VERSION_CONFLICT',
  );
}

async function getPostAssetUsage(
  db: CmsDatabase,
  postId: string,
  usageId: string,
): Promise<PostAssetUsageRow> {
  const usage = await db.first<PostAssetUsageRow>(
    `SELECT id, post_id, asset_id, role, alt_text, caption, crop_json, position
     FROM post_asset_usages
     WHERE id = ?1 AND post_id = ?2
     LIMIT 1`,
    [usageId, postId],
  );
  if (!usage) throw new CmsNotFoundError('Post asset usage', usageId);
  return usage;
}

function requiredAsset(asset: AssetRow | undefined, assetId: string): AssetRow {
  if (!asset) throw new CmsNotFoundError('Asset', assetId);
  return asset;
}

function validateAsset(input: CreateAssetInput): void {
  if (!input.id || !input.privateR2Key.trim()) {
    throw new CmsBadRequestError('Asset id and private R2 key are required');
  }
  if (!['photo', 'chart', 'illustration'].includes(input.mediaKind)) {
    throw new CmsBadRequestError('Asset media kind is invalid');
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType)) {
    throw new CmsBadRequestError('Asset MIME type is invalid');
  }
  if (
    !Number.isSafeInteger(input.width) || input.width <= 0
    || !Number.isSafeInteger(input.height) || input.height <= 0
    || !Number.isSafeInteger(input.byteSize) || input.byteSize <= 0
    || !/^[a-f0-9]{64}$/.test(input.sha256)
  ) {
    throw new CmsBadRequestError('Asset dimensions, byte size, or checksum are invalid');
  }
}

function validateUsage(
  input: AddPostAssetUsageInput | (UpdatePostAssetUsageInput & {
    id: string;
    postId: string;
    assetId: string;
  }),
): void {
  if (!input.id || !input.postId || !input.assetId || !input.altText.trim()) {
    throw new CmsBadRequestError('Asset usage identifiers and alt text are required');
  }
  if (input.role !== 'cover' && input.role !== 'body') {
    throw new CmsBadRequestError('Asset role must be cover or body');
  }
  if (!Number.isSafeInteger(input.position ?? 0) || (input.position ?? 0) < 0) {
    throw new CmsBadRequestError('Asset position must be a non-negative integer');
  }
  if (!Number.isSafeInteger(input.expectedDraftVersion) || input.expectedDraftVersion < 1) {
    throw new CmsBadRequestError('Expected draft version must be a positive integer');
  }
  serializeCrop(input.crop);
}

function serializeCrop(crop: AssetCrop | null | undefined): string | null {
  if (crop == null) return null;
  if (
    !Number.isFinite(crop.x) || crop.x < 0 || crop.x > 100
    || !Number.isFinite(crop.y) || crop.y < 0 || crop.y > 100
    || !Number.isFinite(crop.zoom) || crop.zoom <= 0
  ) {
    throw new CmsBadRequestError('Asset crop values are invalid');
  }
  return JSON.stringify(crop);
}
