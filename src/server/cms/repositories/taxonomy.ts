import type {
  CategoryRow,
  EpochMilliseconds,
  Language,
  TagRow,
} from '../../../lib/cms/contracts.ts';
import { slugifyHeading } from '../../../lib/cms/markdown/render.ts';
import { type CmsDatabase, requireChanged } from '../db.ts';
import { CmsBadRequestError, CmsNotFoundError } from '../errors.ts';

export interface TaxonomyTermInput {
  id: string;
  lang: Language;
  slug: string;
  name: string;
}

export interface PostSourceInput {
  id: string;
  label: string;
  url: string;
  publisher?: string | null;
  accessedAt?: EpochMilliseconds | null;
}

export interface PostSourceRow {
  id: string;
  post_id: string;
  label: string;
  url: string;
  publisher: string | null;
  accessed_at: EpochMilliseconds | null;
  position: number;
}

export interface PostTaxonomy {
  categories: CategoryRow[];
  tags: TagRow[];
}

export async function upsertCategory(
  db: CmsDatabase,
  input: TaxonomyTermInput,
  now = Date.now(),
): Promise<CategoryRow> {
  return upsertTerm<CategoryRow>(db, 'categories', input, now);
}

export async function upsertTag(
  db: CmsDatabase,
  input: TaxonomyTermInput,
  now = Date.now(),
): Promise<TagRow> {
  return upsertTerm<TagRow>(db, 'tags', input, now);
}

/**
 * Resolves free-typed tag names (the Zen Editor's comma-separated tag input)
 * into real `tags(id)` rows — `post_tags.tag_id` is a foreign key, so typed
 * text can never be written there directly.
 *
 * Upserts by `(lang, slug)`, which `tags` already enforces UNIQUE: a name
 * that slugifies to one already stored reuses that row's existing id rather
 * than creating a duplicate on every save. The existing row's `name` is left
 * untouched on a repeat match — a tag is shared taxonomy, so a later post's
 * differently-cased retyping of the same word should not silently rename it
 * for every other post already using it.
 */
export async function resolveTagIds(
  db: CmsDatabase,
  lang: Language,
  tagNames: readonly string[],
  now = Date.now(),
): Promise<string[]> {
  const ids: string[] = [];
  for (const rawName of tagNames) {
    const name = rawName.trim();
    if (!name) continue;
    const slug = slugifyHeading(name);
    const newId = `tag_${crypto.randomUUID().replace(/-/g, '')}`;
    const result = await db.run<{ id: string }>(
      `INSERT INTO tags (id, lang, slug, name, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(lang, slug) DO UPDATE SET updated_at = excluded.updated_at
       RETURNING id`,
      [newId, lang, slug, name, now],
    );
    const row = result.results[0];
    if (row) ids.push(row.id);
  }
  return [...new Set(ids)];
}

export async function listCategories(db: CmsDatabase, lang?: Language): Promise<CategoryRow[]> {
  return listTerms<CategoryRow>(db, 'categories', lang);
}

export async function listTags(db: CmsDatabase, lang?: Language): Promise<TagRow[]> {
  return listTerms<TagRow>(db, 'tags', lang);
}

/**
 * Tag names for every post in one query, so the portal list can show and
 * filter by real tags without an N+1 fetch per row.
 */
export async function listTagNamesByPost(db: CmsDatabase): Promise<Map<string, string[]>> {
  const rows = await db.all<{ post_id: string; name: string }>(
    `SELECT relation.post_id, t.name
     FROM post_tags AS relation
     JOIN tags AS t ON t.id = relation.tag_id
     ORDER BY relation.post_id ASC, relation.position ASC, t.id ASC`,
  );
  const byPost = new Map<string, string[]>();
  for (const row of rows) {
    const existing = byPost.get(row.post_id);
    if (existing) existing.push(row.name);
    else byPost.set(row.post_id, [row.name]);
  }
  return byPost;
}

export async function getPostTaxonomy(db: CmsDatabase, postId: string): Promise<PostTaxonomy> {
  const [categories, tags] = await Promise.all([
    db.all<CategoryRow>(
      `SELECT c.id, c.lang, c.slug, c.name, c.created_at, c.updated_at
       FROM post_categories AS relation
       JOIN categories AS c ON c.id = relation.category_id
       WHERE relation.post_id = ?1
       ORDER BY relation.position ASC, c.id ASC`,
      [postId],
    ),
    db.all<TagRow>(
      `SELECT t.id, t.lang, t.slug, t.name, t.created_at, t.updated_at
       FROM post_tags AS relation
       JOIN tags AS t ON t.id = relation.tag_id
       WHERE relation.post_id = ?1
       ORDER BY relation.position ASC, t.id ASC`,
      [postId],
    ),
  ]);
  return { categories, tags };
}

export async function replacePostTaxonomy(
  db: CmsDatabase,
  postId: string,
  categoryIds: readonly string[],
  tagIds: readonly string[],
  expectedDraftVersion: number,
  now = Date.now(),
): Promise<PostTaxonomy> {
  validateUniqueIds(categoryIds, 'categoryIds', 20);
  validateUniqueIds(tagIds, 'tagIds', 100);
  const versionGuard = [postId, expectedDraftVersion] as const;
  const results = await db.batch([
    {
      sql: `DELETE FROM post_categories
            WHERE post_id = ?1
              AND EXISTS (
                SELECT 1 FROM posts
                WHERE id = ?1 AND draft_version = ?2 AND lifecycle <> 'archived'
              )`,
      params: versionGuard,
    },
    {
      sql: `INSERT INTO post_categories (post_id, category_id, position)
            SELECT ?1, CAST(value AS TEXT), CAST(key AS INTEGER)
            FROM json_each(?2)
            WHERE EXISTS (
              SELECT 1 FROM posts
              WHERE id = ?1 AND draft_version = ?3 AND lifecycle <> 'archived'
            )`,
      params: [postId, JSON.stringify(categoryIds), expectedDraftVersion],
    },
    {
      sql: `DELETE FROM post_tags
            WHERE post_id = ?1
              AND EXISTS (
                SELECT 1 FROM posts
                WHERE id = ?1 AND draft_version = ?2 AND lifecycle <> 'archived'
              )`,
      params: versionGuard,
    },
    {
      sql: `INSERT INTO post_tags (post_id, tag_id, position)
            SELECT ?1, CAST(value AS TEXT), CAST(key AS INTEGER)
            FROM json_each(?2)
            WHERE EXISTS (
              SELECT 1 FROM posts
              WHERE id = ?1 AND draft_version = ?3 AND lifecycle <> 'archived'
            )`,
      params: [postId, JSON.stringify(tagIds), expectedDraftVersion],
    },
    {
      sql: `UPDATE posts
            SET draft_version = draft_version + 1, updated_at = ?1
            WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'`,
      params: [now, postId, expectedDraftVersion],
    },
  ]);
  requireChanged(
    results[4],
    'The post draft changed before its taxonomy could be replaced',
    'DRAFT_VERSION_CONFLICT',
  );
  return getPostTaxonomy(db, postId);
}

export async function listPostSources(
  db: CmsDatabase,
  postId: string,
): Promise<PostSourceRow[]> {
  return db.all<PostSourceRow>(
    `SELECT id, post_id, label, url, publisher, accessed_at, position
     FROM post_sources
     WHERE post_id = ?1
     ORDER BY position ASC, id ASC`,
    [postId],
  );
}

export async function replacePostSources(
  db: CmsDatabase,
  postId: string,
  sources: readonly PostSourceInput[],
  expectedDraftVersion: number,
  now = Date.now(),
): Promise<PostSourceRow[]> {
  validateSources(sources);
  const serialized = JSON.stringify(sources.map((source) => ({
    id: source.id,
    label: source.label,
    url: source.url,
    publisher: source.publisher ?? null,
    accessedAt: source.accessedAt ?? null,
  })));
  const results = await db.batch([
    {
      sql: `DELETE FROM post_sources
            WHERE post_id = ?1
              AND EXISTS (
                SELECT 1 FROM posts
                WHERE id = ?1 AND draft_version = ?2 AND lifecycle <> 'archived'
              )`,
      params: [postId, expectedDraftVersion],
    },
    {
      sql: `INSERT INTO post_sources (
              id, post_id, label, url, publisher, accessed_at, position
            )
            SELECT
              json_extract(value, '$.id'),
              ?1,
              json_extract(value, '$.label'),
              json_extract(value, '$.url'),
              json_extract(value, '$.publisher'),
              json_extract(value, '$.accessedAt'),
              CAST(key AS INTEGER)
            FROM json_each(?2)
            WHERE EXISTS (
              SELECT 1 FROM posts
              WHERE id = ?1 AND draft_version = ?3 AND lifecycle <> 'archived'
            )`,
      params: [postId, serialized, expectedDraftVersion],
    },
    {
      sql: `UPDATE posts
            SET draft_version = draft_version + 1, updated_at = ?1
            WHERE id = ?2 AND draft_version = ?3 AND lifecycle <> 'archived'`,
      params: [now, postId, expectedDraftVersion],
    },
  ]);
  requireChanged(
    results[2],
    'The post draft changed before its sources could be replaced',
    'DRAFT_VERSION_CONFLICT',
  );
  return listPostSources(db, postId);
}

async function upsertTerm<T extends CategoryRow>(
  db: CmsDatabase,
  table: 'categories' | 'tags',
  input: TaxonomyTermInput,
  now: number,
): Promise<T> {
  validateTerm(input);
  const result = await db.run<T>(
    `INSERT INTO ${table} (id, lang, slug, name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(id) DO UPDATE SET
       lang = excluded.lang,
       slug = excluded.slug,
       name = excluded.name,
       updated_at = excluded.updated_at
     RETURNING id, lang, slug, name, created_at, updated_at`,
    [input.id, input.lang, input.slug, input.name, now],
  );
  const row = result.results[0];
  if (!row) throw new CmsNotFoundError(table === 'tags' ? 'Tag' : 'Category', input.id);
  return row;
}

function listTerms<T extends CategoryRow>(
  db: CmsDatabase,
  table: 'categories' | 'tags',
  lang?: Language,
): Promise<T[]> {
  return db.all<T>(
    `SELECT id, lang, slug, name, created_at, updated_at
     FROM ${table}
     ${lang ? 'WHERE lang = ?1' : ''}
     ORDER BY name COLLATE NOCASE ASC, id ASC`,
    lang ? [lang] : [],
  );
}

function validateTerm(input: TaxonomyTermInput): void {
  if (!input.id || !input.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    throw new CmsBadRequestError('Taxonomy term has an invalid id, name, or slug');
  }
  if (input.lang !== 'th' && input.lang !== 'en') {
    throw new CmsBadRequestError('Taxonomy language must be th or en');
  }
}

function validateUniqueIds(ids: readonly string[], field: string, maximum: number): void {
  if (ids.length > maximum || ids.some((id) => !id)) {
    throw new CmsBadRequestError(`${field} contains too many or empty identifiers`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new CmsBadRequestError(`${field} contains duplicate identifiers`);
  }
}

function validateSources(sources: readonly PostSourceInput[]): void {
  if (sources.length > 200) throw new CmsBadRequestError('A post may have at most 200 sources');
  validateUniqueIds(sources.map((source) => source.id), 'sources', 200);
  for (const source of sources) {
    if (!source.label.trim()) throw new CmsBadRequestError('Source labels cannot be empty');
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      throw new CmsBadRequestError('Source URL is invalid');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new CmsBadRequestError('Source URL must use HTTPS without credentials');
    }
  }
}
