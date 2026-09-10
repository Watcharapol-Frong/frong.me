import type {
  AssetRow,
  CategoryRow,
  PostAssetUsageRow,
  PostRow,
  ReleaseRow,
  TagRow,
} from '../../lib/cms/contracts.ts';
import type { PostSourceRow } from './repositories/taxonomy.ts';
import { createCmsDatabase, type CmsDatabase, type D1DatabaseBinding } from './db.ts';
import { CmsBadRequestError, CmsDatabaseError, CmsInvariantError } from './errors.ts';

export interface CmsApiLocals {
  runtime?: { env?: { DB?: D1DatabaseBinding } };
  env?: { DB?: D1DatabaseBinding };
}

export function databaseFromLocals(locals: unknown): CmsDatabase {
  const candidate = (locals ?? {}) as CmsApiLocals;
  const binding = candidate.runtime?.env?.DB ?? candidate.env?.DB;
  if (!binding) throw new CmsDatabaseError('CMS database binding is unavailable');
  return createCmsDatabase(binding);
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

export function releaseRowToSummary(row: ReleaseRow, itemCount: number) {
  return {
    id: row.id,
    status: row.status,
    triggerKind: row.trigger_kind,
    itemCount,
    manifestSha256: row.manifest_sha256,
    codeCommit: row.code_commit,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

function taxonomyDto(row: CategoryRow | TagRow) {
  return { id: row.id, slug: row.slug, name: row.name };
}

function parseCrop(value: string | null): { x: number; y: number; zoom: number } | null {
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
    throw new CmsInvariantError('Stored draft asset crop is invalid', { cause: error });
  }
}
