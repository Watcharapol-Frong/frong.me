import type {
  AssetRow,
  CategoryRow,
  PostAssetUsageRow,
  PostRow,
  TagRow,
} from '../../lib/cms/contracts.ts';
import type { PostSourceRow } from './repositories/taxonomy.ts';
import { createCmsDatabase, type CmsDatabase, type D1DatabaseBinding } from './db.ts';
import { CmsBadRequestError, CmsDatabaseError, CmsInvariantError } from './errors.ts';
import { resolveRuntimeEnv } from './runtime-env.ts';

export type { CmsDatabase } from './db.ts';

export interface CmsApiLocals {
  env?: CmsApiEnvironment;
}

export interface CmsApiEnvironment {
  DB?: D1DatabaseBinding;
  MEDIA_BUCKET?: R2BucketBinding;
  MEDIA_PUBLIC_BASE_URL?: string;
  GEMINI_API_KEY?: string;
}

export interface R2BucketBinding {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

export async function resolveCmsEnvironment(locals: unknown): Promise<CmsApiEnvironment> {
  return resolveRuntimeEnv<CmsApiEnvironment>(locals);
}

export async function resolveCmsDatabase(locals: unknown): Promise<CmsDatabase> {
  const { DB } = await resolveCmsEnvironment(locals);
  if (!DB) throw new CmsDatabaseError('CMS database binding is unavailable');
  return createCmsDatabase(DB);
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new CmsBadRequestError('Content-Type must be application/json');
  }
  try {
    return await request.json();
  } catch (error) {
    throw new CmsBadRequestError('Request body must contain valid JSON', { cause: error });
  }
}

export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export interface PostListDto {
  id: string;
  lang: PostRow['lang'];
  translationGroupId: string | null;
  slug: string;
  title: string;
  excerpt: string | null;
  lifecycle: PostRow['lifecycle'];
  draftVersion: number;
  updatedAt: number;
  publishedAt: number | null;
  coverImageUrl: string | null;
  coverCrop: { x: number; y: number; zoom: number } | null;
}

export function postRowToListDto(row: PostRow): PostListDto {
  return {
    id: row.id,
    lang: row.lang,
    translationGroupId: row.translation_group_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    lifecycle: row.lifecycle,
    draftVersion: row.draft_version,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    coverImageUrl: row.cover_image_url,
    coverCrop: parseCrop(row.cover_crop, 'post cover crop'),
  };
}

export interface DraftAssetRow extends PostAssetUsageRow {
  media_kind: AssetRow['media_kind'];
  lifecycle: AssetRow['lifecycle'];
  original_name: string | null;
  mime_type: AssetRow['mime_type'];
  width: number;
  height: number;
  byte_size: number;
  sha256: string;
}

export function postDetailDto(
  post: PostRow,
  categories: CategoryRow[],
  tags: TagRow[],
  sources: PostSourceRow[],
  assets: DraftAssetRow[],
) {
  return {
    ...postRowToListDto(post),
    bodyMarkdown: post.body_markdown,
    createdAt: post.created_at,
    archivedAt: post.archived_at,
    categories: categories.map(taxonomyDto),
    tags: tags.map(taxonomyDto),
    categoryIds: categories.map((term) => term.id),
    tagIds: tags.map((term) => term.id),
    sources: sources.map((source) => ({
      id: source.id,
      label: source.label,
      url: source.url,
      publisher: source.publisher,
      accessedAt: source.accessed_at,
    })),
    assets: assets.map((asset) => ({
      id: asset.id,
      assetId: asset.asset_id,
      role: asset.role,
      alt: asset.alt_text,
      caption: asset.caption,
      crop: parseCrop(asset.crop_json),
      position: asset.position,
      mediaKind: asset.media_kind,
      lifecycle: asset.lifecycle,
      originalName: asset.original_name,
      mimeType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byte_size,
      sha256: asset.sha256,
    })),
  };
}

function taxonomyDto(row: CategoryRow | TagRow) {
  return { id: row.id, slug: row.slug, name: row.name };
}

function parseCrop(value: string | null, label = 'draft asset crop'): { x: number; y: number; zoom: number } | null {
  if (value === null) return null;
  try {
    const crop = JSON.parse(value) as unknown;
    if (!crop || typeof crop !== 'object' || Array.isArray(crop)) throw new Error('not an object');
    const candidate = crop as Record<string, unknown>;
    if (
      typeof candidate.x !== 'number'
      || typeof candidate.y !== 'number'
      || typeof candidate.zoom !== 'number'
    ) throw new Error('invalid crop fields');
    return { x: candidate.x, y: candidate.y, zoom: candidate.zoom };
  } catch (error) {
    throw new CmsInvariantError(`Stored ${label} is invalid`, { cause: error });
  }
}
