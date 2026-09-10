import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function createMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  const m1 = readFileSync('db/migrations/0001_articles.sql', 'utf8');
  const m2 = readFileSync('db/migrations/0002_taxonomy_assets.sql', 'utf8');
  const m3 = readFileSync('db/migrations/0003_releases.sql', 'utf8');

  db.exec(m1);
  db.exec(m2);
  db.exec(m3);
  return db;
}

test('staging seed script executes cleanly and is strictly idempotent', () => {
  const db = createMigratedDb();
  const seedSql = readFileSync('db/seeds/staging.sql', 'utf8');

  // First run
  db.exec(seedSql);

  const getCounts = () => {
    const posts = db.prepare('SELECT COUNT(*) AS c FROM posts;').get() as { c: number };
    const categories = db.prepare('SELECT COUNT(*) AS c FROM categories;').get() as { c: number };
    const tags = db.prepare('SELECT COUNT(*) AS c FROM tags;').get() as { c: number };
    const assets = db.prepare('SELECT COUNT(*) AS c FROM assets;').get() as { c: number };
    const postCategories = db.prepare('SELECT COUNT(*) AS c FROM post_categories;').get() as { c: number };
    const postTags = db.prepare('SELECT COUNT(*) AS c FROM post_tags;').get() as { c: number };
    const postSources = db.prepare('SELECT COUNT(*) AS c FROM post_sources;').get() as { c: number };
    const postAssetUsages = db.prepare('SELECT COUNT(*) AS c FROM post_asset_usages;').get() as { c: number };
    const postRevisions = db.prepare('SELECT COUNT(*) AS c FROM post_revisions;').get() as { c: number };
    const postRevisionAssets = db.prepare('SELECT COUNT(*) AS c FROM post_revision_assets;').get() as { c: number };
    const releases = db.prepare('SELECT COUNT(*) AS c FROM releases;').get() as { c: number };
    const releaseItems = db.prepare('SELECT COUNT(*) AS c FROM release_items;').get() as { c: number };
    const releaseAttempts = db.prepare('SELECT COUNT(*) AS c FROM release_attempts;').get() as { c: number };
    const siteState = db.prepare('SELECT live_release_id FROM site_state WHERE id = 1;').get() as { live_release_id: string };

    return {
      posts: posts.c,
      categories: categories.c,
      tags: tags.c,
      assets: assets.c,
      postCategories: postCategories.c,
      postTags: postTags.c,
      postSources: postSources.c,
      postAssetUsages: postAssetUsages.c,
      postRevisions: postRevisions.c,
      postRevisionAssets: postRevisionAssets.c,
      releases: releases.c,
      releaseItems: releaseItems.c,
      releaseAttempts: releaseAttempts.c,
      liveReleaseId: siteState.liveRelease_id ?? siteState.live_release_id,
    };
  };

  const firstCounts = getCounts();
  assert.equal(firstCounts.posts, 2, '2 posts (th and en)');
  assert.equal(firstCounts.categories, 4, '4 categories');
  assert.equal(firstCounts.tags, 6, '6 tags');
  assert.equal(firstCounts.assets, 2, '2 assets');
  assert.equal(firstCounts.releases, 1, '1 live release');
  assert.equal(firstCounts.releaseItems, 2, '2 release items');
  assert.equal(firstCounts.liveReleaseId, 'rel_20260910_live001', 'site_state points to live release');

  // Second run: prove strict idempotency (no errors, no duplicate rows created)
  assert.doesNotThrow(() => {
    db.exec(seedSql);
  }, 'Re-running seed SQL must be completely idempotent and not throw');

  const secondCounts = getCounts();
  assert.deepEqual(firstCounts, secondCounts, 'Row counts must remain identical after re-seeding');

  // Third run: verify foreign key check produces zero violations
  const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
  assert.equal(fkViolations.length, 0, 'Foreign key check must return zero violations');

  db.close();
});

test('partial index idx_one_cover_per_post strictly enforces one cover per post', () => {
  const db = createMigratedDb();
  const seedSql = readFileSync('db/seeds/staging.sql', 'utf8');
  db.exec(seedSql);

  // Attempting to add a SECOND cover image to post_th_00000001 must violate the partial unique index
  assert.throws(() => {
    db.prepare(`
      INSERT INTO post_asset_usages (id, post_id, asset_id, role, alt_text, caption, crop_json, position)
      VALUES ('usg_duplicate_cover', 'post_th_00000001', 'asset_chart_00002', 'cover', 'Duplicate cover', NULL, NULL, 99);
    `).run();
  }, /UNIQUE constraint failed/);

  // Adding an additional BODY role image to post_th_00000001 is permitted by the partial index
  assert.doesNotThrow(() => {
    db.prepare(`
      INSERT INTO post_asset_usages (id, post_id, asset_id, role, alt_text, caption, crop_json, position)
      VALUES ('usg_second_body', 'post_th_00000001', 'asset_cover_00001', 'body', 'Second body asset', NULL, NULL, 2);
    `).run();
  });

  db.close();
});

test('partial index idx_one_active_release strictly enforces at most one active release', () => {
  const db = createMigratedDb();
  const seedSql = readFileSync('db/seeds/staging.sql', 'utf8');
  db.exec(seedSql);

  // Seeded release is status='live' (terminal). Adding ONE active release ('queued') must succeed:
  db.prepare(`
    INSERT INTO releases (
      id, schema_version, status, trigger_kind, idempotency_key,
      manifest_json, manifest_sha256, created_at, updated_at
    ) VALUES (
      'rel_active_001', 1, 'queued', 'publish', 'idem_active_001',
      '{}', '${'0'.repeat(64)}', 1789030900000, 1789030900000
    );
  `).run();

  // Attempting to insert a SECOND active release ('building') must violate idx_one_active_release:
  assert.throws(() => {
    db.prepare(`
      INSERT INTO releases (
        id, schema_version, status, trigger_kind, idempotency_key,
        manifest_json, manifest_sha256, created_at, updated_at
      ) VALUES (
        'rel_active_002', 1, 'building', 'publish', 'idem_active_002',
        '{}', '${'1'.repeat(64)}', 1789030910000, 1789030910000
      );
    `).run();
  }, /UNIQUE constraint failed/);

  // Terminal statuses ('failed', 'live') are NOT restricted by the partial index:
  assert.doesNotThrow(() => {
    db.prepare(`
      INSERT INTO releases (
        id, schema_version, status, trigger_kind, idempotency_key,
        manifest_json, manifest_sha256, created_at, updated_at
      ) VALUES (
        'rel_failed_003', 1, 'failed', 'publish', 'idem_failed_003',
        '{}', '${'2'.repeat(64)}', 1789030920000, 1789030920000
      );
    `).run();
  });

  db.close();
});

test('partial index idx_release_visible_routes strictly enforces visible route uniqueness', () => {
  const db = createMigratedDb();
  const seedSql = readFileSync('db/seeds/staging.sql', 'utf8');
  db.exec(seedSql);

  // In seeded release 'rel_20260910_live001', (th, 'cloudflare-cms-architecture') is visible.
  // We cannot add a duplicate visible item for the same release and route.
  // Note that release_items has PRIMARY KEY (release_id, post_id). To test idx_release_visible_routes
  // independently of PK, we insert a second post with the same (lang, slug) in a new revision.
  db.prepare(`
    INSERT INTO posts (
      id, lang, translation_group_id, slug, title, body_markdown, draft_version, lifecycle, created_at, updated_at
    ) VALUES (
      'post_conflict_th', 'th', NULL, 'conflict-slug', 'Conflict Title', '', 1, 'active', 1789030800000, 1789030800000
    );
  `).run();

  db.prepare(`
    INSERT INTO post_revisions (
      id, post_id, source_draft_version, lang, slug, title, body_markdown, published_at, created_at
    ) VALUES (
      'rev_conflict_th', 'post_conflict_th', 1, 'th', 'cloudflare-cms-architecture', 'Conflict Title', '', 1789030800000, 1789030800000
    );
  `).run();

  // Attempting to insert a visible item for (rel_20260910_live001, 'th', 'cloudflare-cms-architecture') fails:
  assert.throws(() => {
    db.prepare(`
      INSERT INTO release_items (release_id, post_id, revision_id, lang, slug, visible)
      VALUES ('rel_20260910_live001', 'post_conflict_th', 'rev_conflict_th', 'th', 'cloudflare-cms-architecture', 1);
    `).run();
  }, /UNIQUE constraint failed/);

  // But inserting it with visible = 0 is permitted:
  assert.doesNotThrow(() => {
    db.prepare(`
      INSERT INTO release_items (release_id, post_id, revision_id, lang, slug, visible)
      VALUES ('rel_20260910_live001', 'post_conflict_th', 'rev_conflict_th', 'th', 'cloudflare-cms-architecture', 0);
    `).run();
  });

  db.close();
});

