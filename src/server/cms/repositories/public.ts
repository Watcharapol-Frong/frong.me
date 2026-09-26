/**
 * Public reader queries — direct SSR. There is no release/manifest snapshot:
 * these read `posts` live, filtered to `lifecycle = 'active'`, at request
 * time. Callers must never expose draft-only fields (draft_version, private
 * asset keys) from these rows.
 */
import type { AssetRow, Language, PostRow } from '../../../lib/cms/contracts.ts';
import type { CmsDatabase } from '../db.ts';

const PUBLIC_POST_COLUMNS = `
  id, lang, translation_group_id, slug, title, excerpt, body_markdown,
  created_at, updated_at, published_at, cover_image_url, cover_crop,
  primary_topic
`;

export type PublicPostRow = Pick<
  PostRow,
  | 'id' | 'lang' | 'translation_group_id' | 'slug' | 'title' | 'excerpt'
  | 'body_markdown' | 'created_at' | 'updated_at' | 'published_at' | 'cover_image_url'
  | 'cover_crop'
  | 'primary_topic'
>;

export interface PublicPostAssetRow {
  role: 'cover' | 'body';
  alt_text: string;
  caption: string | null;
  crop_json: string | null;
  position: number;
  public_r2_key: string;
  mime_type: AssetRow['mime_type'];
  width: number;
  height: number;
}

export interface PublicPostCard {
  id: string;
  lang: Language;
  slug: string;
  title: string;
  tags: string[];
  coverAsset: PublicPostAssetRow | null;
  coverImageUrl: string | null;
  primaryTopic: PostRow['primary_topic'];
}

export interface PublishedSitemapEntry {
  slug: string;
  updated_at: number;
}

/** One URL per public slug, matching the Thai-first article reader. */
export async function listPublishedSitemapEntries(db: CmsDatabase): Promise<PublishedSitemapEntry[]> {
  return db.all<PublishedSitemapEntry>(
    `SELECT slug,
            COALESCE(MAX(CASE WHEN lang = 'th' THEN updated_at END), MAX(updated_at)) AS updated_at
     FROM posts
     WHERE lifecycle = 'active'
     GROUP BY slug
     ORDER BY slug ASC`,
  );
}

export async function listPublishedPosts(
  db: CmsDatabase,
  options: { lang?: Language; limit?: number } = {},
): Promise<PublicPostRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const conditions = [`lifecycle = 'active'`];
  const params: Array<string | number> = [];
  if (options.lang) {
    params.push(options.lang);
    conditions.push(`lang = ?${params.length}`);
  }
  params.push(limit);
  return db.all<PublicPostRow>(
    `SELECT ${PUBLIC_POST_COLUMNS}
     FROM posts
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(published_at, updated_at) DESC, id ASC
     LIMIT ?${params.length}`,
    params,
  );
}

/**
 * Homepage read model. Its interface hides the joins and guarantees a fixed
 * three-query cost instead of making the route issue two queries per post.
 */
export async function listPublishedPostCards(
  db: CmsDatabase,
  options: { lang?: Language; limit?: number } = {},
): Promise<PublicPostCard[]> {
  const posts = await listPublishedPosts(db, options);
  if (posts.length === 0) return [];

  const placeholders = posts.map((_, index) => `?${index + 1}`).join(', ');
  const ids = posts.map((post) => post.id);
  const [covers, tags] = await Promise.all([
    db.all<PublicPostAssetRow & { post_id: string }>(
      `SELECT usage.post_id, usage.role, usage.alt_text, usage.caption,
              usage.crop_json, usage.position, asset.public_r2_key,
              asset.mime_type, asset.width, asset.height
       FROM post_asset_usages AS usage
       JOIN assets AS asset ON asset.id = usage.asset_id
       WHERE usage.post_id IN (${placeholders})
         AND usage.role = 'cover'
         AND asset.lifecycle = 'public'
         AND asset.public_r2_key IS NOT NULL
       ORDER BY usage.post_id ASC, usage.position ASC, usage.id ASC`,
      ids,
    ),
    db.all<{ post_id: string; slug: string }>(
      `SELECT post_tags.post_id, tags.slug
       FROM post_tags
       JOIN tags ON tags.id = post_tags.tag_id
       WHERE post_tags.post_id IN (${placeholders})
       ORDER BY post_tags.post_id ASC, post_tags.position ASC, tags.id ASC`,
      ids,
    ),
  ]);

  const coverByPost = new Map(covers.map((cover) => [cover.post_id, cover]));
  const tagsByPost = new Map<string, string[]>();
  for (const tag of tags) {
    const postTags = tagsByPost.get(tag.post_id) ?? [];
    postTags.push(tag.slug);
    tagsByPost.set(tag.post_id, postTags);
  }

  return posts.map((post) => ({
    id: post.id,
    lang: post.lang,
    slug: post.slug,
    title: post.title,
    tags: tagsByPost.get(post.id) ?? [],
    coverAsset: coverByPost.get(post.id) ?? null,
    coverImageUrl: post.cover_image_url,
    primaryTopic: post.primary_topic,
  }));
}

/**
 * A slug may be shared across the two languages of a translation pair, so
 * this prefers Thai (the site's primary language) when both exist.
 */
export async function getPublishedPostBySlug(
  db: CmsDatabase,
  slug: string,
): Promise<PublicPostRow | null> {
  return db.first<PublicPostRow>(
    `SELECT ${PUBLIC_POST_COLUMNS}
     FROM posts
     WHERE slug = ?1 AND lifecycle = 'active'
     ORDER BY CASE lang WHEN 'th' THEN 0 ELSE 1 END
     LIMIT 1`,
    [slug],
  );
}

/** Only ever returns promoted, public assets — never a private draft key. */
export async function listPublicPostAssets(
  db: CmsDatabase,
  postId: string,
): Promise<PublicPostAssetRow[]> {
  return db.all<PublicPostAssetRow>(
    `SELECT usage.role, usage.alt_text, usage.caption, usage.crop_json, usage.position,
            asset.public_r2_key, asset.mime_type, asset.width, asset.height
     FROM post_asset_usages AS usage
     JOIN assets AS asset ON asset.id = usage.asset_id
     WHERE usage.post_id = ?1
       AND asset.lifecycle = 'public'
       AND asset.public_r2_key IS NOT NULL
     ORDER BY CASE usage.role WHEN 'cover' THEN 0 ELSE 1 END,
              usage.position ASC, usage.id ASC`,
    [postId],
  );
}
