import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  verifyForeignKeys,
  verifyPartialIndexes,
  runVerification,
  createSqliteExecutor,
  createD1HttpExecutor,
  parseArgs,
} from '../../scripts/db/verify-staging.mjs';

function createMigratedAndSeededDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync('db/migrations/0001_articles.sql', 'utf8'));
  db.exec(readFileSync('db/migrations/0002_taxonomy_assets.sql', 'utf8'));
  db.exec(readFileSync('db/migrations/0003_releases.sql', 'utf8'));
  db.exec(readFileSync('db/seeds/staging.sql', 'utf8'));
  return db;
}

test('verifyForeignKeys passes on valid database and throws when violations exist', async () => {
  const db = createMigratedAndSeededDb();
  const queryFn = createSqliteExecutor(db);

  // Normal database: passes
  const res = await verifyForeignKeys(queryFn);
  assert.equal(res.ok, true);
  assert.equal(res.violationsCount, 0);

  // Mock a queryFn returning a violation
  const failingQueryFn = async (sql: string) => {
    if (sql.includes('foreign_key_check')) {
      return [{ table: 'posts', rowid: 1, parent: 'translation_groups', fkid: 0 }];
    }
    return [];
  };

  await assert.rejects(
    () => verifyForeignKeys(failingQueryFn),
    /Foreign key check failed with 1 violation\(s\): table=posts, rowid=1, parent=translation_groups, fkid=0/,
  );

  db.close();
});

test('verifyPartialIndexes validates definitions and detects duplicates', async () => {
  const db = createMigratedAndSeededDb();
  const queryFn = createSqliteExecutor(db);

  const res = await verifyPartialIndexes(queryFn);
  assert.equal(res.ok, true);
  assert.equal(res.indexes.length, 3);
  assert.deepEqual(
    res.indexes.map((i) => i.name),
    ['idx_one_cover_per_post', 'idx_one_active_release', 'idx_release_visible_routes'],
  );

  // If an index is missing from sqlite_master, it fails
  const missingIndexQueryFn = async (sql: string) => {
    if (sql.includes('sqlite_master')) {
      return [{ name: 'idx_one_cover_per_post', tbl_name: 'post_asset_usages', sql: "CREATE UNIQUE INDEX idx_one_cover_per_post ON post_asset_usages(post_id) WHERE role = 'cover'" }];
    }
    return [];
  };

  await assert.rejects(
    () => verifyPartialIndexes(missingIndexQueryFn),
    /Missing expected partial index: idx_one_active_release/,
  );

  // If duplicate data is returned, it fails
  const duplicateDataQueryFn = async (sql: string) => {
    if (sql.includes('sqlite_master')) {
      return [
        { name: 'idx_one_cover_per_post', tbl_name: 'post_asset_usages', sql: "CREATE UNIQUE INDEX idx_one_cover_per_post ON post_asset_usages(post_id) WHERE role = 'cover'" },
        { name: 'idx_one_active_release', tbl_name: 'releases', sql: "CREATE UNIQUE INDEX idx_one_active_release ON releases((1)) WHERE status IN ('queued', 'building', 'deploying', 'reconciling')" },
        { name: 'idx_release_visible_routes', tbl_name: 'release_items', sql: "CREATE UNIQUE INDEX idx_release_visible_routes ON release_items(release_id, lang, slug) WHERE visible = 1" },
      ];
    }
    if (sql.includes("role = 'cover'")) {
      return [{ post_id: 'post_1', cnt: 2 }];
    }
    return [];
  };

  await assert.rejects(
    () => verifyPartialIndexes(duplicateDataQueryFn),
    /Partial index data check failed for idx_one_cover_per_post/,
  );

  db.close();
});

test('runVerification executes full verification suite against seeded database', async () => {
  const db = createMigratedAndSeededDb();
  const queryFn = createSqliteExecutor(db);

  const logs: string[] = [];
  const mockLogger = {
    log: (msg: string) => logs.push(msg),
  };

  const result = await runVerification(queryFn, { logger: mockLogger });
  assert.equal(result.ok, true);
  assert.equal(result.fkResult.violationsCount, 0);
  assert.equal(result.partialResult.indexes.length, 3);
  assert.equal(result.summary.posts_count, 2);
  assert.equal(result.summary.categories_count, 4);
  assert.equal(result.summary.tags_count, 6);
  assert.equal(result.summary.assets_count, 2);
  assert.equal(result.summary.live_releases_count, 1);

  assert.ok(logs.some((l) => l.includes('Foreign keys OK')));
  assert.ok(logs.some((l) => l.includes('Partial index idx_one_cover_per_post verified')));
  assert.ok(logs.some((l) => l.includes('All staging database verifications PASSED')));

  db.close();
});

test('createD1HttpExecutor constructs parameterized query and handles API responses', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        result: [
          {
            success: true,
            results: [{ count: 42 }],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  const executor = createD1HttpExecutor({
    accountId: 'test-account-id',
    databaseId: 'test-db-id',
    apiToken: 'test-token',
    fetchImpl: mockFetch,
  });

  const rows = await executor('SELECT COUNT(*) AS count FROM posts WHERE lang = ?;', ['en']);
  assert.deepEqual(rows, [{ count: 42 }]);

  assert.equal(
    capturedUrl,
    'https://api.cloudflare.com/client/v4/accounts/test-account-id/d1/database/test-db-id/query',
  );
  assert.equal((capturedInit?.headers as Record<string, string>)?.authorization, 'Bearer test-token');
  const parsedBody = JSON.parse(String(capturedInit?.body));
  assert.equal(parsedBody.sql, 'SELECT COUNT(*) AS count FROM posts WHERE lang = ?;');
  assert.deepEqual(parsedBody.params, ['en']);
});

test('parseArgs parses CLI arguments into structured configuration', () => {
  const args1 = parseArgs(['node', 'verify-staging.mjs']);
  assert.equal(args1.mode, 'auto');
  assert.equal(args1.local, false);
  assert.equal(args1.databaseName, 'portfolio-db-staging');

  const args2 = parseArgs(['node', 'verify-staging.mjs', '--http']);
  assert.equal(args2.mode, 'http');

  const args3 = parseArgs(['node', 'verify-staging.mjs', '--wrangler', '--local', '--database=custom-db']);
  assert.equal(args3.mode, 'wrangler');
  assert.equal(args3.local, true);
  assert.equal(args3.databaseName, 'custom-db');

  const args4 = parseArgs(['node', 'verify-staging.mjs', '--sqlite', '/tmp/my.db']);
  assert.equal(args4.mode, 'sqlite');
  assert.equal(args4.sqlitePath, '/tmp/my.db');
});

