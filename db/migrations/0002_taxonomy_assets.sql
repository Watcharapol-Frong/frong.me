-- Phase 1 CMS core: mutable taxonomy, sources, and draft asset usage.
-- Foreign keys are enforced by D1 at the platform level; a PRAGMA here is
-- rejected over the remote API. Local SQLite harnesses set it themselves.

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  lang        TEXT NOT NULL CHECK (lang IN ('th', 'en')),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at  INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at  INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (lang, slug)
);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  lang        TEXT NOT NULL CHECK (lang IN ('th', 'en')),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at  INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at  INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (lang, slug)
);

CREATE TABLE post_categories (
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  position     INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (post_id, category_id)
);

CREATE INDEX idx_post_categories_order
  ON post_categories (post_id, position);

CREATE TABLE post_tags (
  post_id   TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id    TEXT NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  position  INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX idx_post_tags_order
  ON post_tags (post_id, position);

CREATE TABLE post_sources (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (length(trim(label)) > 0),
  url          TEXT NOT NULL CHECK (length(trim(url)) > 0),
  publisher    TEXT,
  accessed_at  INTEGER CHECK (accessed_at IS NULL OR accessed_at >= 0),
  position     INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
);

CREATE INDEX idx_post_sources_order
  ON post_sources (post_id, position);

CREATE TABLE assets (
  id               TEXT PRIMARY KEY,
  media_kind       TEXT NOT NULL
    CHECK (media_kind IN ('photo', 'chart', 'illustration')),
  lifecycle        TEXT NOT NULL DEFAULT 'private'
    CHECK (lifecycle IN ('private', 'public', 'orphaned')),
  private_r2_key   TEXT NOT NULL UNIQUE,
  public_r2_key    TEXT UNIQUE,
  original_name    TEXT,
  mime_type        TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width            INTEGER NOT NULL CHECK (width > 0),
  height           INTEGER NOT NULL CHECK (height > 0),
  byte_size        INTEGER NOT NULL CHECK (byte_size > 0),
  sha256           TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at       INTEGER NOT NULL CHECK (created_at >= 0),
  promoted_at      INTEGER CHECK (promoted_at IS NULL OR promoted_at >= created_at),
  CHECK (
    lifecycle <> 'public'
    OR (public_r2_key IS NOT NULL AND promoted_at IS NOT NULL)
  )
);

CREATE INDEX idx_assets_sha256
  ON assets (sha256);

CREATE TABLE post_asset_usages (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  role       TEXT NOT NULL CHECK (role IN ('cover', 'body')),
  alt_text   TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  caption    TEXT,
  crop_json  TEXT CHECK (crop_json IS NULL OR json_valid(crop_json)),
  position   INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
);

CREATE UNIQUE INDEX idx_one_cover_per_post
  ON post_asset_usages (post_id)
  WHERE role = 'cover';

CREATE INDEX idx_post_asset_usages_order
  ON post_asset_usages (post_id, position);

CREATE INDEX idx_post_asset_usages_asset
  ON post_asset_usages (asset_id);

-- Publication may snapshot only assets that have completed explicit promotion.
-- This guard executes in the same transaction as revision creation.
CREATE TRIGGER post_revisions_require_public_assets
BEFORE INSERT ON post_revisions
WHEN EXISTS (
  SELECT 1
  FROM post_asset_usages AS usage
  JOIN assets AS asset ON asset.id = usage.asset_id
  WHERE usage.post_id = NEW.post_id
    AND (
      asset.lifecycle <> 'public'
      OR asset.public_r2_key IS NULL
      OR asset.promoted_at IS NULL
    )
)
BEGIN
  SELECT RAISE(ABORT, 'all revision assets must be public');
END;
