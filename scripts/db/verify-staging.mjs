#!/usr/bin/env node

/**
 * Staging database verification script for frong.me CMS.
 *
 * Verifies relational integrity and partial index enforcement using:
 * 1. PRAGMA foreign_key_check
 * 2. Partial index definitions in sqlite_master
 * 3. Partial index data compliance queries
 *
 * Supported execution backends:
 * - Cloudflare D1 HTTP API (when CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_READ_TOKEN are present or --http is passed)
 * - Wrangler CLI (when --wrangler is passed or as fallback)
 * - Direct SQLite / in-memory (when --sqlite <path> or custom executor is passed)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const EXPECTED_PARTIAL_INDEXES = [
  {
    name: 'idx_one_cover_per_post',
    table: 'post_asset_usages',
    predicateKeyword: "role = 'cover'",
    description: 'Enforces at most one cover asset per post',
    duplicateCheckSql: `
      SELECT post_id, COUNT(*) AS cnt
      FROM post_asset_usages
      WHERE role = 'cover'
      GROUP BY post_id
      HAVING cnt > 1;
    `,
  },
  {
    name: 'idx_one_active_release',
    table: 'releases',
    predicateKeyword: "'queued'",
    description: 'Enforces at most one non-terminal active release',
    duplicateCheckSql: `
      SELECT COUNT(*) AS cnt
      FROM releases
      WHERE status IN ('queued', 'building', 'deploying', 'reconciling')
      HAVING cnt > 1;
    `,
  },
  {
    name: 'idx_release_visible_routes',
    table: 'release_items',
    predicateKeyword: 'visible = 1',
    description: 'Enforces unique (lang, slug) visible routes per release',
    duplicateCheckSql: `
      SELECT release_id, lang, slug, COUNT(*) AS cnt
      FROM release_items
      WHERE visible = 1
      GROUP BY release_id, lang, slug
      HAVING cnt > 1;
    `,
  },
];

/**
 * Run PRAGMA foreign_key_check and assert no violations exist.
 * @param {(sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>} queryFn
 */
export async function verifyForeignKeys(queryFn) {
  const violations = await queryFn('PRAGMA foreign_key_check;');
  if (!Array.isArray(violations)) {
    throw new Error(`Unexpected result from foreign_key_check: expected array, got ${typeof violations}`);
  }
  if (violations.length > 0) {
    const details = violations
      .map((v) => `table=${v.table ?? v.tbl_name ?? 'unknown'}, rowid=${v.rowid}, parent=${v.parent}, fkid=${v.fkid}`)
      .join('; ');
    throw new Error(`Foreign key check failed with ${violations.length} violation(s): ${details}`);
  }
  return { ok: true, violationsCount: 0 };
}

/**
 * Verify that required partial indexes exist in sqlite_master, are declared UNIQUE,
 * have the appropriate WHERE predicates, and have zero constraint violations in current data.
 * @param {(sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>} queryFn
 */
export async function verifyPartialIndexes(queryFn) {
  const masterRows = await queryFn(`
    SELECT name, tbl_name, sql
    FROM sqlite_master
    WHERE type = 'index'
      AND name IN ('idx_one_cover_per_post', 'idx_one_active_release', 'idx_release_visible_routes');
  `);

  const indexesByName = new Map(masterRows.map((r) => [r.name, r]));
  const results = [];

  for (const expected of EXPECTED_PARTIAL_INDEXES) {
    const found = indexesByName.get(expected.name);
    if (!found) {
      throw new Error(`Missing expected partial index: ${expected.name} on table ${expected.table}`);
    }

    if (found.tbl_name !== expected.table) {
      throw new Error(
        `Index ${expected.name} belongs to table ${found.tbl_name}, expected ${expected.table}`,
      );
    }

    const ddl = String(found.sql || '').toUpperCase();
    if (!ddl.includes('UNIQUE INDEX')) {
      throw new Error(`Index ${expected.name} is not defined as a UNIQUE INDEX: ${found.sql}`);
    }

    if (!String(found.sql || '').includes(expected.predicateKeyword)) {
      throw new Error(
        `Index ${expected.name} definition missing expected predicate keyword '${expected.predicateKeyword}': ${found.sql}`,
      );
    }

    // Check data compliance
    const duplicates = await queryFn(expected.duplicateCheckSql);
    if (duplicates.length > 0) {
      throw new Error(
        `Partial index data check failed for ${expected.name}: found ${duplicates.length} duplicate group(s)`,
      );
    }

    results.push({
      name: expected.name,
      table: expected.table,
      description: expected.description,
      verified: true,
    });
  }

  return { ok: true, indexes: results };
}

/**
 * Create a query function using Cloudflare D1 HTTP API.
 */
export function createD1HttpExecutor({
  accountId,
  databaseId,
  apiToken,
  apiBaseUrl = 'https://api.cloudflare.com/client/v4',
  fetchImpl = fetch,
}) {
  if (!accountId?.trim()) throw new Error('Missing CF_ACCOUNT_ID for D1 HTTP API');
  if (!databaseId?.trim()) throw new Error('Missing CF_D1_DATABASE_ID for D1 HTTP API');
  if (!apiToken?.trim()) throw new Error('Missing CF_D1_READ_TOKEN or CLOUDFLARE_API_TOKEN for D1 HTTP API');

  const cleanBase = apiBaseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/accounts/${encodeURIComponent(accountId.trim())}/d1/database/${encodeURIComponent(databaseId.trim())}/query`;

  return async function d1HttpQuery(sql, params = []) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken.trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      throw new Error(`D1 HTTP API returned HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    if (payload?.success !== true) {
      const errorMsg = payload?.errors?.map((e) => e.message).join(', ') || 'Unknown D1 API error';
      throw new Error(`D1 HTTP API query failed: ${errorMsg}`);
    }

    const queryResult = payload?.result?.[0];
    if (queryResult?.success !== true && queryResult?.success !== undefined) {
      throw new Error('D1 HTTP API statement execution failed');
    }

    return queryResult?.results ?? [];
  };
}

/**
 * Create a query function using the Wrangler CLI.
 */
export function createWranglerExecutor({
  databaseName = 'portfolio-db-staging',
  local = false,
  cwd = process.cwd(),
}) {
  return async function wranglerQuery(sql, params = []) {
    if (params.length > 0) {
      throw new Error('Wrangler CLI executor does not support parameterized queries in this script');
    }

    const args = [
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--json',
      `--command=${sql}`,
    ];

    if (local) {
      args.push('--local');
    }

    const { stdout, stderr } = await execFileAsync('npx', args, {
      cwd,
      env: { ...process.env },
    });

    try {
      const parsed = JSON.parse(stdout);
      const batchResult = Array.isArray(parsed) ? parsed[0] : parsed;
      return batchResult?.results ?? [];
    } catch (err) {
      throw new Error(`Failed to parse Wrangler output as JSON: ${err.message}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    }
  };
}

/**
 * Create a query function using node:sqlite.
 */
export function createSqliteExecutor(db) {
  return async function sqliteQuery(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  };
}

/**
 * Main verification routine.
 */
export async function runVerification(queryFn, options = {}) {
  const logger = options.logger ?? console;

  logger.log('[verify-staging] 1/3 Checking foreign key integrity...');
  const fkResult = await verifyForeignKeys(queryFn);
  logger.log(`[verify-staging] ✓ Foreign keys OK: ${fkResult.violationsCount} violations found.`);

  logger.log('[verify-staging] 2/3 Checking partial index definitions and data constraints...');
  const partialResult = await verifyPartialIndexes(queryFn);
  for (const idx of partialResult.indexes) {
    logger.log(`[verify-staging] ✓ Partial index ${idx.name} verified on ${idx.table} (${idx.description})`);
  }

  logger.log('[verify-staging] 3/3 Checking basic staging table population...');
  const counts = await queryFn(`
    SELECT
      (SELECT COUNT(*) FROM posts) AS posts_count,
      (SELECT COUNT(*) FROM categories) AS categories_count,
      (SELECT COUNT(*) FROM tags) AS tags_count,
      (SELECT COUNT(*) FROM assets) AS assets_count,
      (SELECT COUNT(*) FROM releases WHERE status = 'live') AS live_releases_count;
  `);

  const summary = counts[0] ?? {};
  logger.log(
    `[verify-staging] ✓ Staging rows: posts=${summary.posts_count}, categories=${summary.categories_count}, ` +
    `tags=${summary.tags_count}, assets=${summary.assets_count}, live_releases=${summary.live_releases_count}`,
  );

  logger.log('[verify-staging] ✓ All staging database verifications PASSED successfully.');
  return { ok: true, fkResult, partialResult, summary };
}

/**
 * Parse CLI arguments.
 */
export function parseArgs(argv) {
  const args = {
    mode: 'auto',
    databaseName: process.env.CF_D1_DATABASE_NAME || 'portfolio-db-staging',
    local: false,
    sqlitePath: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--http') args.mode = 'http';
    else if (arg === '--wrangler') args.mode = 'wrangler';
    else if (arg === '--local') args.local = true;
    else if (arg.startsWith('--database=')) args.databaseName = arg.split('=')[1];
    else if (arg === '--database') args.databaseName = argv[++i];
    else if (arg.startsWith('--sqlite=')) {
      args.mode = 'sqlite';
      args.sqlitePath = arg.split('=')[1];
    } else if (arg === '--sqlite') {
      args.mode = 'sqlite';
      args.sqlitePath = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`
Usage: node scripts/db/verify-staging.mjs [options]

Options:
  --http               Force D1 HTTP API mode (requires CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_READ_TOKEN)
  --wrangler           Force Wrangler CLI mode
  --local              Use --local flag with Wrangler
  --database <name>    Database name for Wrangler (default: portfolio-db-staging)
  --sqlite <path>      Verify local SQLite database file using node:sqlite
  --help, -h           Show this help message
`);
    return;
  }

  let queryFn;

  if (args.mode === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(args.sqlitePath);
    queryFn = createSqliteExecutor(db);
  } else if (
    args.mode === 'http' ||
    (args.mode === 'auto' && process.env.CF_ACCOUNT_ID && process.env.CF_D1_DATABASE_ID && (process.env.CF_D1_READ_TOKEN || process.env.CLOUDFLARE_API_TOKEN))
  ) {
    console.log('[verify-staging] Connecting via Cloudflare D1 HTTP API...');
    queryFn = createD1HttpExecutor({
      accountId: process.env.CF_ACCOUNT_ID,
      databaseId: process.env.CF_D1_DATABASE_ID,
      apiToken: process.env.CF_D1_READ_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN,
      apiBaseUrl: process.env.CF_D1_API_BASE_URL,
    });
  } else {
    console.log(`[verify-staging] Connecting via Wrangler CLI (database: ${args.databaseName}, local: ${args.local})...`);
    queryFn = createWranglerExecutor({
      databaseName: args.databaseName,
      local: args.local,
    });
  }

  await runVerification(queryFn);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`[verify-staging] ✗ Verification failed: ${err.message}`);
    process.exitCode = 1;
  });
}