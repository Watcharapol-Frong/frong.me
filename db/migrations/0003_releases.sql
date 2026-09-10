-- Phase 1 CMS core: immutable release manifests and mutable deployment state.
PRAGMA foreign_keys = ON;

CREATE TABLE releases (
  id                    TEXT PRIMARY KEY,
  schema_version        INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  status                TEXT NOT NULL
    CHECK (status IN (
      'queued',
      'building',
      'deploying',
      'reconciling',
      'live',
      'failed'
    )),
  trigger_kind          TEXT NOT NULL
    CHECK (trigger_kind IN ('publish', 'withdraw', 'rollback')),
  trigger_post_id       TEXT REFERENCES posts(id) ON DELETE RESTRICT,
  base_release_id       TEXT REFERENCES releases(id) ON DELETE RESTRICT,
  idempotency_key       TEXT NOT NULL UNIQUE,
  manifest_json         TEXT NOT NULL CHECK (json_valid(manifest_json)),
  manifest_sha256       TEXT NOT NULL CHECK (length(manifest_sha256) = 64),
  code_commit           TEXT,
  error_code            TEXT,
  error_message         TEXT,
  created_at            INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at            INTEGER NOT NULL CHECK (updated_at >= created_at),
  finished_at           INTEGER CHECK (finished_at IS NULL OR finished_at >= created_at)
);

-- A constant-expression partial unique index permits only one non-terminal
-- release, regardless of which active state it currently occupies.
CREATE UNIQUE INDEX idx_one_active_release
  ON releases ((1))
  WHERE status IN ('queued', 'building', 'deploying', 'reconciling');

CREATE INDEX idx_releases_created_at
  ON releases (created_at DESC);

CREATE TABLE release_items (
  release_id   TEXT NOT NULL REFERENCES releases(id) ON DELETE RESTRICT,
  post_id      TEXT NOT NULL,
  revision_id  TEXT NOT NULL,
  lang         TEXT NOT NULL CHECK (lang IN ('th', 'en')),
  slug         TEXT NOT NULL,
  visible      INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  PRIMARY KEY (release_id, post_id),
  FOREIGN KEY (revision_id, post_id, lang, slug)
    REFERENCES post_revisions(id, post_id, lang, slug)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_release_visible_routes
  ON release_items (release_id, lang, slug)
  WHERE visible = 1;

CREATE INDEX idx_release_items_revision
  ON release_items (revision_id);

CREATE TABLE release_attempts (
  id                      TEXT PRIMARY KEY,
  release_id              TEXT NOT NULL REFERENCES releases(id) ON DELETE RESTRICT,
  attempt_number          INTEGER NOT NULL CHECK (attempt_number >= 1),
  workflow_run_id         TEXT,
  provider_deployment_id  TEXT,
  status                  TEXT NOT NULL
    CHECK (status IN ('dispatching', 'building', 'deploying', 'confirmed', 'failed')),
  error_message           TEXT,
  started_at              INTEGER NOT NULL CHECK (started_at >= 0),
  finished_at             INTEGER CHECK (finished_at IS NULL OR finished_at >= started_at),
  UNIQUE (release_id, attempt_number)
);

CREATE INDEX idx_release_attempts_release
  ON release_attempts (release_id, attempt_number DESC);

CREATE TABLE site_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  live_release_id  TEXT REFERENCES releases(id) ON DELETE RESTRICT,
  updated_at       INTEGER NOT NULL CHECK (updated_at >= 0)
);

INSERT INTO site_state (id, live_release_id, updated_at)
VALUES (1, NULL, 0);

-- The release payload and membership are append-only. Only orchestration fields
-- such as status, errors, and timestamps may change after creation.
CREATE TRIGGER releases_reject_snapshot_update
BEFORE UPDATE OF
  schema_version,
  trigger_kind,
  trigger_post_id,
  base_release_id,
  idempotency_key,
  manifest_json,
  manifest_sha256,
  code_commit,
  created_at
ON releases
BEGIN
  SELECT RAISE(ABORT, 'release snapshots are immutable');
END;

CREATE TRIGGER releases_reject_delete
BEFORE DELETE ON releases
BEGIN
  SELECT RAISE(ABORT, 'releases are retained for rollback');
END;

CREATE TRIGGER release_items_reject_update
BEFORE UPDATE ON release_items
BEGIN
  SELECT RAISE(ABORT, 'release items are immutable');
END;

CREATE TRIGGER release_items_reject_delete
BEFORE DELETE ON release_items
BEGIN
  SELECT RAISE(ABORT, 'release items are immutable');
END;

CREATE TRIGGER releases_validate_status_transition
BEFORE UPDATE OF status ON releases
WHEN NEW.status <> OLD.status
  AND NOT (
    (OLD.status = 'queued' AND NEW.status IN ('building', 'reconciling', 'failed'))
    OR (OLD.status = 'building' AND NEW.status IN ('deploying', 'reconciling', 'failed'))
    OR (OLD.status = 'deploying' AND NEW.status IN ('live', 'reconciling', 'failed'))
    OR (OLD.status = 'reconciling' AND NEW.status IN ('queued', 'live', 'failed'))
    OR (OLD.status = 'failed' AND NEW.status = 'queued')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid release status transition');
END;

-- base_release_id is the compare-and-set expectation captured when the release
-- was created. A stale deployment can therefore never replace a newer live site.
CREATE TRIGGER releases_require_live_pointer_match
BEFORE UPDATE OF status ON releases
WHEN NEW.status = 'live'
  AND OLD.status <> 'live'
  AND NOT (
    (SELECT live_release_id FROM site_state WHERE id = 1)
    IS NEW.base_release_id
  )
BEGIN
  SELECT RAISE(ABORT, 'live release compare-and-set failed');
END;

CREATE TRIGGER releases_require_confirmed_attempt
BEFORE UPDATE OF status ON releases
WHEN NEW.status = 'live'
  AND OLD.status <> 'live'
  AND NOT EXISTS (
    SELECT 1
    FROM release_attempts
    WHERE release_id = NEW.id
      AND status = 'confirmed'
      AND provider_deployment_id IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'live release requires a confirmed deployment');
END;

-- A live pointer may only target a release already confirmed as live. DAL code
-- must additionally use WHERE live_release_id IS ? for compare-and-set.
CREATE TRIGGER site_state_require_live_release
BEFORE UPDATE OF live_release_id ON site_state
WHEN NEW.live_release_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM releases
    WHERE id = NEW.live_release_id AND status = 'live'
  )
BEGIN
  SELECT RAISE(ABORT, 'site_state may only reference a live release');
END;
