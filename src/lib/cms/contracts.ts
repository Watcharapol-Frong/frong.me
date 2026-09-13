/**
 * CMS data contracts.
 *
 * Database row contracts intentionally use snake_case and epoch-millisecond
 * timestamps. Public/build contracts use camelCase and canonical ISO-8601 UTC
 * timestamps. Do not serialize database rows directly into public artifacts.
 */

export const CMS_SCHEMA_VERSION = 1 as const;

export type EpochMilliseconds = number;
export type IsoDateTime = string;
export type Language = 'th' | 'en';
export type PostLifecycle = 'draft' | 'active' | 'archived';
export type AssetMediaKind = 'photo' | 'chart' | 'illustration';
export type AssetLifecycle = 'private' | 'public' | 'orphaned';
export type AssetRole = 'cover' | 'body';

export interface PostRow {
  id: string;
  lang: Language;
  translation_group_id: string | null;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  draft_version: number;
  lifecycle: PostLifecycle;
  created_at: EpochMilliseconds;
  updated_at: EpochMilliseconds;
  archived_at: EpochMilliseconds | null;
  published_at: EpochMilliseconds | null;
}

export interface CategoryRow {
  id: string;
  lang: Language;
  slug: string;
  name: string;
  created_at: EpochMilliseconds;
  updated_at: EpochMilliseconds;
}

export interface TagRow extends CategoryRow {}

export interface AssetRow {
  id: string;
  media_kind: AssetMediaKind;
  lifecycle: AssetLifecycle;
  private_r2_key: string;
  public_r2_key: string | null;
  original_name: string | null;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  byte_size: number;
  sha256: string;
  created_at: EpochMilliseconds;
  promoted_at: EpochMilliseconds | null;
}

export interface PostAssetUsageRow {
  id: string;
  post_id: string;
  asset_id: string;
  role: AssetRole;
  alt_text: string;
  caption: string | null;
  crop_json: string | null;
  position: number;
}

export interface PostRevisionAssetRow {
  revision_id: string;
  usage_id: string;
  asset_id: string;
  role: AssetRole;
  public_r2_key: string;
  mime_type: AssetRow['mime_type'];
  width: number;
  height: number;
  byte_size: number;
  sha256: string;
  alt_text: string;
  caption: string | null;
  crop_json: string | null;
  position: number;
}

export interface TaxonomySnapshot {
  id: string;
  slug: string;
  name: string;
}

export interface PublicSource {
  label: string;
  url: string;
  publisher?: string;
  accessedAt?: IsoDateTime;
}

export interface PublicAsset {
  usageId: string;
  assetId: string;
  role: AssetRole;
  url: string;
  mimeType: AssetRow['mime_type'];
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  alt: string;
  caption?: string;
  crop?: {
    x: number;
    y: number;
    zoom: number;
  };
  position: number;
}

/**
 * Public-facing article DTO for direct-SSR reader routes: read straight from
 * `posts` (WHERE lifecycle = 'active') at request time, no release/revision
 * snapshot involved.
 */
export interface PublicArticle {
  id: string;
  lang: Language;
  translationGroupId?: string;
  slug: string;
  title: string;
  excerpt?: string;
  bodyMarkdown: string;
  categories: TaxonomySnapshot[];
  tags: TaxonomySnapshot[];
  sources: PublicSource[];
  assets: PublicAsset[];
  publishedAt: IsoDateTime;
}

export interface CreatePostInput {
  id: string;
  lang: Language;
  translationGroupId?: string;
  slug: string;
  title: string;
  excerpt?: string;
  bodyMarkdown?: string;
}

export interface UpdatePostDraftInput {
  expectedDraftVersion: number;
  lang: Language;
  translationGroupId?: string | null;
  slug: string;
  title: string;
  excerpt?: string | null;
  bodyMarkdown: string;
}

export interface DraftSourceInput {
  id: string;
  label: string;
  url: string;
  publisher: string | null;
  accessedAt: EpochMilliseconds | null;
}

export interface UpdatePostBundleInput {
  draft: UpdatePostDraftInput;
  categoryIds: string[];
  tagIds: string[];
  sources: DraftSourceInput[];
}

export interface AttachPostAssetInput {
  id: string;
  assetId: string;
  role: AssetRole;
  altText: string;
  caption?: string | null;
  crop?: { x: number; y: number; zoom: number } | null;
  position?: number;
  expectedDraftVersion: number;
}
