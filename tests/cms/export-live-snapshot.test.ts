import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  exportLiveSnapshot,
  fetchLiveSnapshotFromDb,
  getMockLiveSnapshot,
  parseCliArgs,
} from '../../scripts/build/export-live-snapshot.mjs';
import { parseReleaseSnapshot } from '../../src/lib/cms/validation.ts';

function createMigratedAndSeededDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync('db/migrations/0001_articles.sql', 'utf8'));
  db.exec(readFileSync('db/migrations/0002_taxonomy_assets.sql', 'utf8'));
  db.exec(readFileSync('db/migrations/0003_releases.sql', 'utf8'));
  db.exec(readFileSync('db/seeds/staging.sql', 'utf8'));
  return db;
}

test('getMockLiveSnapshot returns schema-compliant ReleaseSnapshot', () => {
  const mockSnapshot = getMockLiveSnapshot();
  assert.equal(mockSnapshot.manifest.schemaVersion, 1);
  assert.equal(mockSnapshot.manifest.releaseId, 'rel_mock_live001');
  assert.equal(mockSnapshot.articles.length, 2);

  // Validate that it passes runtime validator
  const validated = parseReleaseSnapshot(mockSnapshot);
  assert.equal(validated.articles.length, 2);
});

test('fetchLiveSnapshotFromDb extracts and validates live release snapshot from database', async () => {
  const db = createMigratedAndSeededDb();
  const queryFn = async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params);

  const snapshot = await fetchLiveSnapshotFromDb(queryFn, {
    publicAssetBaseUrl: 'https://images.frong.me',
  });

  assert.equal(snapshot.manifest.releaseId, 'rel_20260910_live001');
  assert.equal(snapshot.manifest.schemaVersion, 1);
  assert.equal(snapshot.articles.length, 2);

  const thArticle = snapshot.articles.find((a) => a.lang === 'th');
  const enArticle = snapshot.articles.find((a) => a.lang === 'en');

  assert.ok(thArticle, 'Thai article must exist');
  assert.ok(enArticle, 'English article must exist');

  assert.equal(thArticle.id, 'post_th_00000001');
  assert.equal(thArticle.revisionId, 'rev_th_00000001');
  assert.equal(thArticle.slug, 'cloudflare-cms-architecture');
  assert.equal(thArticle.translationGroupId, 'grp_architecture_2026');
  assert.ok(thArticle.categories.length >= 1);
  assert.ok(thArticle.tags.length >= 1);
  assert.ok(thArticle.sources.length >= 1);
  assert.equal(thArticle.assets.length, 2);

  const coverAsset = thArticle.assets.find((a) => a.role === 'cover');
  assert.ok(coverAsset, 'Cover asset must exist');
  assert.equal(coverAsset.url, 'https://images.frong.me/public/assets/2026/09/cover-architecture.webp');
  assert.equal(coverAsset.mimeType, 'image/webp');
  assert.equal(coverAsset.width, 1600);
  assert.equal(coverAsset.height, 900);
  assert.equal(coverAsset.alt, 'แผนภาพสถาปัตยกรรม CMS บน Cloudflare');
  assert.deepEqual(coverAsset.crop, { x: 50, y: 50, zoom: 1 });

  const chartAsset = thArticle.assets.find((a) => a.role === 'body');
  assert.ok(chartAsset, 'Body asset must exist');
  assert.equal(chartAsset.url, 'https://images.frong.me/public/assets/2026/09/benchmark-latency.png');
  assert.equal(chartAsset.mimeType, 'image/png');

  // Verify ISO publishedAt format
  assert.equal(thArticle.publishedAt, '2026-09-10T09:00:00.000Z');

  db.close();
});

test('fetchLiveSnapshotFromDb throws if site_state has no live release', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync('db/migrations/0001_articles.sql', 'utf8'));
  db.exec(readFileSync('db/migrations/0002_taxonomy_assets.sql', 'utf8'));
  db.exec(readFileSync('db/migrations/0003_releases.sql', 'utf8'));
  // Note: 0003 initializes site_state with live_release_id = NULL
  const queryFn = async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params);

  await assert.rejects(
    () => fetchLiveSnapshotFromDb(queryFn),
    /No live release found in site_state/,
  );

  db.close();
});

test('exportLiveSnapshot writes snapshot file to specified output path', async () => {
  const tmpOut = '/tmp/test-export-output.json';
  if (existsSync(tmpOut)) unlinkSync(tmpOut);

  const logs: string[] = [];
  const mockLogger = { log: (msg: string) => logs.push(msg) };

  const result = await exportLiveSnapshot({
    mode: 'mock',
    outputPath: tmpOut,
    logger: mockLogger,
  });

  assert.equal(result.outputPath, tmpOut);
  assert.equal(result.source, 'mock');
  assert.ok(existsSync(tmpOut));

  const content = JSON.parse(readFileSync(tmpOut, 'utf8'));
  assert.equal(content.manifest.releaseId, 'rel_mock_live001');
  assert.equal(content.articles.length, 2);

  unlinkSync(tmpOut);
});

test('exportLiveSnapshot respects requireLive option on missing database', async () => {
  const logs: string[] = [];
  const mockLogger = { log: (msg: string) => logs.push(msg) };

  await assert.rejects(
    () =>
      exportLiveSnapshot({
        sqlitePath: '/tmp/nonexistent-db.sqlite',
        requireLive: true,
        logger: mockLogger,
      }),
    /Specified SQLite database does not exist: \/tmp\/nonexistent-db\.sqlite/,
  );

  await assert.rejects(
    () =>
      exportLiveSnapshot({
        requireLive: true,
        logger: mockLogger,
      }),
    /No database connection available and requireLive is set to true|no such table: site_state|No live release found in site_state/,
  );
});

test('parseCliArgs parses build extractor options properly', () => {
  const args1 = parseCliArgs(['node', 'export-live-snapshot.mjs', '--mock']);
  assert.equal(args1.mode, 'mock');

  const args2 = parseCliArgs([
    'node',
    'export-live-snapshot.mjs',
    '--output=/tmp/snap.json',
    '--sqlite=/tmp/db.sqlite',
    '--require-live',
  ]);
  assert.equal(args2.outputPath, '/tmp/snap.json');
  assert.equal(args2.sqlitePath, '/tmp/db.sqlite');
  assert.equal(args2.requireLive, true);
});
