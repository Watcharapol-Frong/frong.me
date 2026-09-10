-- Phase 1 CMS core: mutable article drafts and immutable public revisions.
-- Foreign keys are enforced by D1 at the platform level; a PRAGMA here is
-- rejected over the remote API. Local SQLite harnesses set it themselves.

CREATE TABLE posts (
  id                    TEXT PRIMARY KEY,
  lang                  TEXT NOT NULL CHECK (lang IN ('th', 'en')),
  translation_group_id  TEXT,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL CHECK (length(trim(title)) > 0),
  excerpt               TEXT,
  body_markdown         TEXT NOT NULL DEFAULT '',
  draft_version         INTEGER NOT NULL DEFAULT 1 CHECK (draft_version >= 1),
  lifecycle             TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft', 'active', 'archived')),
  created_at            INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at            INTEGER NOT NULL CHECK (updated_at >= created_at),
  archived_at           INTEGER CHECK (archived_at IS NULL OR archived_at >= created_at),
  UNIQUE (lang, slug)
);

CREATE INDEX idx_posts_translation_group
  ON posts (translation_group_id);

CREATE INDEX idx_posts_updated_at
  ON posts (updated_at DESC);

CREATE TABLE post_revisions (
  id                    TEXT PRIMARY KEY,
  post_id               TEXT NOT NULL REFERENCES posts(id) ON DELETE RESTRICT,
  source_draft_version  INTEGER NOT NULL CHECK (source_draft_version >= 1),
  lang                  TEXT NOT NULL CHECK (lang IN ('th', 'en')),
  translation_group_id  TEXT,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL CHECK (length(trim(title)) > 0),
  excerpt               TEXT,
  body_markdown         TEXT NOT NULL,
  categories_json       TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(categories_json) AND json_type(categories_json) = 'array'),
  tags_json             TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
  sources_json          TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(sources_json) AND json_type(sources_json) = 'array'),
  published_at          INTEGER NOT NULL CHECK (published_at >= 0),
  created_at            INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (id, post_id, lang, slug)
);

CREATE INDEX idx_post_revisions_post_created
  ON post_revisions (post_id, created_at DESC);

CREATE INDEX idx_post_revisions_route
  ON post_revisions (lang, slug);

-- assets is introduced by 0002. SQLite permits the forward foreign-key
-- reference, and the full migration set is verified with foreign_key_check.
CREATE TABLE post_revision_assets (
  revision_id    TEXT NOT NULL REFERENCES post_revisions(id) ON DELETE RESTRICT,
  usage_id       TEXT NOT NULL,
  asset_id       TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  role           TEXT NOT NULL CHECK (role IN ('cover', 'body')),
  public_r2_key  TEXT NOT NULL CHECK (length(trim(public_r2_key)) > 0),
  mime_type      TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width          INTEGER NOT NULL CHECK (width > 0),
  height         INTEGER NOT NULL CHECK (height > 0),
  byte_size      INTEGER NOT NULL CHECK (byte_size > 0),
  sha256         TEXT NOT NULL CHECK (length(sha256) = 64),
  alt_text       TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
  caption        TEXT,
  crop_json      TEXT CHECK (crop_json IS NULL OR json_valid(crop_json)),
  position       INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (revision_id, usage_id)
);

CREATE INDEX idx_post_revision_assets_asset
  ON post_revision_assets (asset_id);

-- Revisions and their reader-visible asset metadata are append-only.
CREATE TRIGGER post_revisions_reject_update
BEFORE UPDATE ON post_revisions
BEGIN
  SELECT RAISE(ABORT, 'post revisions are immutable');
END;

CREATE TRIGGER post_revisions_reject_delete
BEFORE DELETE ON post_revisions
BEGIN
  SELECT RAISE(ABORT, 'post revisions are immutable');
END;

CREATE TRIGGER post_revision_assets_reject_update
BEFORE UPDATE ON post_revision_assets
BEGIN
  SELECT RAISE(ABORT, 'post revision assets are immutable');
END;

CREATE TRIGGER post_revision_assets_reject_delete
BEFORE DELETE ON post_revision_assets
BEGIN
  SELECT RAISE(ABORT, 'post revision assets are immutable');
END;
