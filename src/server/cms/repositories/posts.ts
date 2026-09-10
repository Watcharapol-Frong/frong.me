import type {
  CreatePostInput,
  Language,
  PostLifecycle,
  PostRow,
  UpdatePostDraftInput,
  UpdatePostBundleInput,
} from '../../../lib/cms/contracts.ts';
import {
  parseCreatePostInput,
  parseUpdatePostDraftInput,
  parseUpdatePostBundleInput,
} from '../../../lib/cms/validation.ts';
import { type CmsDatabase, requireChanged } from '../db.ts';
import { CmsConflictError, CmsNotFoundError } from '../errors.ts';

const POST_COLUMNS = `
  id,
  lang,
  translation_group_id,
  slug,
  title,
  excerpt,
  body_markdown,
  draft_version,
  lifecycle,
  created_at,
  updated_at,
  archived_at
`;

export interface ListDraftsOptions {
  lang?: Language;
  lifecycle?: PostLifecycle;
  limit?: number;
  offset?: number;
  search?: string;
}

export async function createPost(
  db: CmsDatabase,
  value: unknown,
  now = Date.now(),
): Promise<PostRow> {
  const input: CreatePostInput = parseCreatePostInput(value);
  const result = await db.run<PostRow>(
    `INSERT INTO posts (
      id, lang, translation_group_id, slug, title, excerpt, body_markdown,
      draft_version, lifecycle, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 'draft', ?8, ?8)
    RETURNING ${POST_COLUMNS}`,
    [
      input.id,
      input.lang,
      input.translationGroupId ?? null,
      input.slug,
      input.title,
      input.excerpt ?? null,
      input.bodyMarkdown ?? '',
      now,
    ],
  );
  return requiredReturnedRow(result.results[0], 'post', input.id);
}

/** Explicit API/domain name retained alongside the shorter repository name. */
export const createPostDraft = createPost;

export async function getPostDraft(db: CmsDatabase, postId: string): Promise<PostRow> {
  const post = await db.first<PostRow>(
    `SELECT ${POST_COLUMNS} FROM posts WHERE id = ?1 LIMIT 1`,
    [postId],
  );
  if (!post) throw new CmsNotFoundError('Post', postId);
  return post;
}

export async function listPostDrafts(
  db: CmsDatabase,
  options: ListDraftsOptions = {},
): Promise<PostRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (options.lang) {
    params.push(options.lang);
    conditions.push(`lang = ?${params.length}`);
  }
  if (options.lifecycle) {
    params.push(options.lifecycle);
    conditions.push(`lifecycle = ?${params.length}`);
  }
  if (options.search?.trim()) {
    const escaped = options.search.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
    params.push(`%${escaped}%`);
    conditions.push(`(
      lower(title) LIKE ?${params.length} ESCAPE '\\'
      OR lower(slug) LIKE ?${params.length} ESCAPE '\\'
      OR lower(COALESCE(excerpt, '')) LIKE ?${params.length} ESCAPE '\\'
    )`);
  }
  params.push(limit, offset);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.all<PostRow>(
    `SELECT ${POST_COLUMNS}
     FROM posts
     ${where}
     ORDER BY updated_at DESC, id ASC
     LIMIT ?${params.length - 1} OFFSET ?${params.length}`,
    params,
  );
}

export async function updatePostDraft(
  db: CmsDatabase,
  postId: string,
  value: unknown,
  now = Date.now(),
): Promise<PostRow> {
  const input: UpdatePostDraftInput = parseUpdatePostDraftInput(value);
  const result = await db.run<PostRow>(
    `UPDATE posts
     SET lang = ?1,
         translation_group_id = ?2,
         slug = ?3,
         title = ?4,
         excerpt = ?5,
         body_markdown = ?6,
         draft_version = draft_version + 1,
         updated_at = ?7
     WHERE id = ?8
       AND draft_version = ?9
       AND lifecycle <> 'archived'
     RETURNING ${POST_COLUMNS}`,
    [
      input.lang,
      input.translationGroupId ?? null,
      input.slug,
      input.title,
      input.excerpt ?? null,
      input.bodyMarkdown,
      now,
      postId,
      input.expectedDraftVersion,
    ],
  );
  requireChanged(
    result,
    'The post draft changed after it was loaded',
    'DRAFT_VERSION_CONFLICT',
  );
  return requiredReturnedRow(result.results[0], 'post', postId);
}

/** Atomically replaces the editor's post, taxonomy, and source state once. */
export async function updatePostBundle(
  db: CmsDatabase,
  postId: string,
  value: unknown,
  now = Date.now(),
): Promise<PostRow> {
  const input: UpdatePostBundleInput = parseUpdatePostBundleInput(value);
  const version = input.draft.expectedDraftVersion;
  const sourcesJson = JSON.stringify(input.sources);
  const results = await db.batch<PostRow>([
    {
      sql: `UPDATE posts
            SET lang = ?1, translation_group_id = ?2, slug = ?3, title = ?4,
                excerpt = ?5, body_markdown = ?6
            WHERE id = ?7 AND draft_version = ?8 AND lifecycle <> 'archived'`,
      params: [
        input.draft.lang,
        input.draft.translationGroupId ?? null,
        input.draft.slug,
        input.draft.title,
        input.draft.excerpt ?? null,
        input.draft.bodyMarkdown,
        postId,
        version,
      ],
    },
    {
      sql: `DELETE FROM post_categories
            WHERE post_id = ?1 AND EXISTS (
              SELECT 1 FROM posts WHERE id = ?1 AND draft_version = ?2 AND lifecycle <> 'archived'
            )`,
      params: [postId, version],
    },
    {
      sql: `INSERT INTO post_categories (post_id, category_id, position)
            SELECT ?1, CAST(value AS TEXT), CAST(key AS INTEGER) FROM json_each(?2)
            WHERE EXISTS (
              SELECT 1 FROM posts WHERE id = ?1 AND draft_version = ?3 AND lifecycle <> 'archived'
            )`,
      params: [postId, JSON.stringify(input.categoryIds), version],
    },
    {
      sql: `DELETE FROM post_tags
            WHERE post_id = ?1 AND EXISTS (
              SELECT 1 FROM posts WHERE id = ?1 AND draft_version = ?2 AND lifecycle <> 'archived'
            )`,
      params: [postId, version],
    },
    {
      sql: `INSERT INTO post_tags (post_id, tag_id, position)
            SELECT ?1, CAST(value AS TEXT), CAST(key AS INTEGER) FROM json_each(?2)
            WHERE EXISTS (
              SELECT 1 FROM posts WHERE id = ?1 AND draft_version = ?3 AND lifecycle <> 'archived'
            )`,
      params: [postId, JSON.stringify(input.tagIds), version],
    },
    {
      sql: `DELETE FROM post_sources
            WHERE post_id = ?1 AND EXISTS (
              SELECT 1 FROM posts WHERE id = ?1 AND draft_version = ?2 AND lifecycle <> 'archived'
            )`,
      params: [postId, version],
    },
    {
      sql: `INSERT INTO post_sources (
              id, post_id, label, url, publisher, accessed_at, position
            )
            SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.label'),
                   json_extract(value, '$.url'), json_extract(value, '$.publisher'),
                   json_extract(value, '$.accessedAt'), CAST(key AS INTEGER)
            FROM json_each(?2)
            WHERE EXISTS (
              SELECT 1 FROM posts WHERE id = ?1 AND draft_version = ?3 AND lifecycle <> 'archived'
            )`,
      params: [postId, sourcesJson, version],
    },
    {
      sql: `UPDATE posts
            SET draft_version = draft_version + 1, updated_at = ?1
            WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'
            RETURNING ${POST_COLUMNS}`,
      params: [now, postId, version],
    },
  ]);
  requireChanged(results[7], 'The post draft changed after it was loaded', 'DRAFT_VERSION_CONFLICT');
  return requiredReturnedRow(results[7].results[0], 'post', postId);
}

export async function archivePost(
  db: CmsDatabase,
  postId: string,
  expectedDraftVersion: number,
  now = Date.now(),
): Promise<PostRow> {
  const result = await db.run<PostRow>(
    `UPDATE posts
     SET lifecycle = 'archived',
         archived_at = ?1,
         draft_version = draft_version + 1,
         updated_at = ?1
     WHERE id = ?2
       AND draft_version = ?3
       AND lifecycle <> 'archived'
     RETURNING ${POST_COLUMNS}`,
    [now, postId, expectedDraftVersion],
  );
  requireChanged(
    result,
    'The post draft changed after it was loaded',
    'DRAFT_VERSION_CONFLICT',
  );
  return requiredReturnedRow(result.results[0], 'post', postId);
}

function requiredReturnedRow<T>(row: T | undefined, resource: string, id: string): T {
  if (!row) {
    throw new CmsConflictError(`${resource} mutation returned no row`, 'CONFLICT', {
      details: { id },
    });
  }
  return row;
}
