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
  created_at, updated_at, published_at, cover_image_url, cover_crop
`;

export type PublicPostRow = Pick<
  PostRow,
  | 'id' | 'lang' | 'translation_group_id' | 'slug' | 'title' | 'excerpt'
  | 'body_markdown' | 'created_at' | 'updated_at' | 'published_at' | 'cover_image_url'
  | 'cover_crop'
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
