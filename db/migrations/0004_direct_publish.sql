-- Direct SSR publishing: posts are published/unpublished in place rather than
-- through a release/manifest pipeline. `lifecycle = 'active'` is the existing
-- "published" state (see 0001_articles.sql); this migration only adds the
-- timestamp direct-publish transitions need. The `releases`/`release_attempts`/
-- `release_items` tables from 0003 are left in place — retiring the release
-- pipeline is an application-code change, not a reason to drop real rows.
ALTER TABLE posts ADD COLUMN published_at INTEGER;
