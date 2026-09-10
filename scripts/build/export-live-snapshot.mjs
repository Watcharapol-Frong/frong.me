#!/usr/bin/env node

/**
 * Build-time snapshot extractor for Astro SSG.
 *
 * Reads the live release snapshot from:
 * 1. Cloudflare D1 via HTTP API (if remote credentials present)
 * 2. Local D1 database (via node:sqlite or Wrangler state)
 * 3. Fallback mock mode (if no database is connected or --mock is specified)
 *
 * Validates output using parseReleaseSnapshot from src/lib/cms/validation.ts
 * and writes to .cache/cms-live-snapshot.json (or CMS_SNAPSHOT_PATH).
 */

import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReleaseSnapshot, parseReleaseManifest } from '../../src/lib/cms/validation.ts';
import { mockPublicArticleTh } from '../../tests/cms/fixtures/article-th.ts';
import { mockPublicArticleEn } from '../../tests/cms/fixtures/article-en.ts';

const DEFAULT_CACHE_PATH = resolve(process.cwd(), '.cache/cms-live-snapshot.json');
const DEFAULT_PUBLIC_ASSET_BASE_URL = 'https://images.frong.me';

/**
 * Generates a mock release snapshot conforming to ReleaseSnapshot contract.
 */
export function getMockLiveSnapshot() {
  const manifest = {
    schemaVersion: 1,
    releaseId: 'rel_mock_live001',
    generatedAt: '2026-09-10T09:00:00.000Z',
    articles: [
      {
        postId: mockPublicArticleTh.id,
        revisionId: mockPublicArticleTh.revisionId,
        lang: mockPublicArticleTh.lang,
        slug: mockPublicArticleTh.slug,
        visible: true,
      },
      {
        postId: mockPublicArticleEn.id,
        revisionId: mockPublicArticleEn.revisionId,
        lang: mockPublicArticleEn.lang,
        slug: mockPublicArticleEn.slug,
        visible: true,
      },
    ],
  };

  const snapshot = {
    manifest,
    articles: [mockPublicArticleTh, mockPublicArticleEn],
  };

  return parseReleaseSnapshot(snapshot);
}

/**
 * Converts a database revision asset row to a PublicAsset DTO.
 */
function revisionAssetToPublic(asset, assetBaseUrl) {
  let url;
  const key = String(asset.public_r2_key || '').trim();
  if (key.startsWith('https://') || key.startsWith('http://')) {
    url = key;
  } else {
    const base = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`;
    const cleanKey = key.replace(/^\/+/, '');
    url = new URL(cleanKey, base).href;
  }

  let crop;
  if (asset.crop_json) {
    try {
      crop = JSON.parse(asset.crop_json);
    } catch {
      crop = undefined;
    }
  }

  return {
    usageId: asset.usage_id,
    assetId: asset.asset_id,
    role: asset.role,
    url,
    mimeType: asset.mime_type,
    width: Number(asset.width),
    height: Number(asset.height),
    byteSize: Number(asset.byte_size),
    sha256: asset.sha256,
    alt: asset.alt_text,
    ...(asset.caption ? { caption: asset.caption } : {}),
    ...(crop ? { crop } : {}),
    position: Number(asset.position || 0),
  };
}

/**
 * Fetches the live release snapshot using a generic query function.
 * @param {(sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>} queryFn
 * @param {object} [options]
 */
export async function fetchLiveSnapshotFromDb(queryFn, options = {}) {
  const assetBaseUrl = options.publicAssetBaseUrl || process.env.CMS_PUBLIC_ASSET_BASE_URL || DEFAULT_PUBLIC_ASSET_BASE_URL;

  // 1. Read live_release_id from site_state
  const stateRows = await queryFn('SELECT live_release_id FROM site_state WHERE id = 1 LIMIT 1;');
  const liveReleaseId = stateRows[0]?.live_release_id;
  if (!liveReleaseId) {
    throw new Error('No live release found in site_state');
  }

  // 2. Fetch the corresponding release row
  const releaseRows = await queryFn(
    'SELECT id, manifest_json, manifest_sha256, status FROM releases WHERE id = ? LIMIT 1;',
    [liveReleaseId],
  );
  const release = releaseRows[0];
  if (!release) {
    throw new Error(`Live release ${liveReleaseId} not found in releases table`);
  }

  const manifest = parseReleaseManifest(JSON.parse(release.manifest_json));
  if (manifest.releaseId !== release.id) {
    throw new Error(`Release manifest releaseId (${manifest.releaseId}) does not match row id (${release.id})`);
  }

  // 3. Fetch post_revisions for visible release items
  const revisionRows = await queryFn(
    `SELECT
       revision.id,
       revision.post_id,
       revision.source_draft_version,
       revision.lang,
       revision.translation_group_id,
       revision.slug,
       revision.title,
       revision.excerpt,
       revision.body_markdown,
       revision.categories_json,
       revision.tags_json,
       revision.sources_json,
       revision.published_at,
       revision.created_at
     FROM release_items AS item
     JOIN post_revisions AS revision ON revision.id = item.revision_id
     WHERE item.release_id = ? AND item.visible = 1
     ORDER BY revision.published_at DESC, revision.id ASC;`,
    [liveReleaseId],
  );

  // 4. Fetch post_revision_assets for visible release items
  const assetRows = await queryFn(
    `SELECT
       asset.revision_id,
       asset.usage_id,
       asset.asset_id,
       asset.role,
       asset.public_r2_key,
       asset.mime_type,
       asset.width,
       asset.height,
       asset.byte_size,
       asset.sha256,
       asset.alt_text,
       asset.caption,
       asset.crop_json,
       asset.position
     FROM release_items AS item
     JOIN post_revision_assets AS asset ON asset.revision_id = item.revision_id
     WHERE item.release_id = ? AND item.visible = 1
     ORDER BY asset.revision_id ASC,
              CASE asset.role WHEN 'cover' THEN 0 ELSE 1 END,
              asset.position ASC,
              asset.usage_id ASC;`,
    [liveReleaseId],
  );

  const assetsByRevision = new Map();
  for (const row of assetRows) {
    const list = assetsByRevision.get(row.revision_id) || [];
    list.push(revisionAssetToPublic(row, assetBaseUrl));
    assetsByRevision.set(row.revision_id, list);
  }

  // 5. Construct PublicArticle DTOs
  const articles = revisionRows.map((rev) => {
    let categories = [];
    let tags = [];
    let sources = [];
    try { categories = JSON.parse(rev.categories_json || '[]'); } catch { /* ignore */ }
    try { tags = JSON.parse(rev.tags_json || '[]'); } catch { /* ignore */ }
    try { sources = JSON.parse(rev.sources_json || '[]'); } catch { /* ignore */ }

    return {
      id: rev.post_id,
      revisionId: rev.id,
      lang: rev.lang,
      ...(rev.translation_group_id ? { translationGroupId: rev.translation_group_id } : {}),
      slug: rev.slug,
      title: rev.title,
      ...(rev.excerpt ? { excerpt: rev.excerpt } : {}),
      bodyMarkdown: rev.body_markdown,
      categories,
      tags,
      sources,
      assets: assetsByRevision.get(rev.id) || [],
      publishedAt: new Date(Number(rev.published_at)).toISOString(),
    };
  });

  // 6. Validate full snapshot against CMS schema contracts
  return parseReleaseSnapshot({ manifest, articles });
}

/**
 * Searches for a local SQLite database file in common Wrangler state locations.
 */
async function findLocalWranglerSqlite(startDir = process.cwd()) {
  const candidateDirs = [
    join(startDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'),
    join(startDir, '.wrangler/state/v3/d1'),
    join(startDir, 'spikes/cloudflare-architecture/.wrangler/state/v3/d1/miniflare-D1DatabaseObject'),
  ];

  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = await readdir(dir);
      const sqliteFile = files.find((f) => f.endsWith('.sqlite'));
      if (sqliteFile) return join(dir, sqliteFile);
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Main export live snapshot executor.
 */
export async function exportLiveSnapshot(options = {}) {
  const logger = options.logger || console;
  const outputPath = resolve(
    options.outputPath || process.env.CMS_SNAPSHOT_PATH || DEFAULT_CACHE_PATH,
  );

  let snapshot = null;
  let source = 'mock';

  // Explicit mock mode requested
  if (options.mode === 'mock') {
    logger.log('[export-live-snapshot] Mode: mock explicitly requested.');
    snapshot = getMockLiveSnapshot();
  } else {
    // Attempt connecting to database
    let queryFn = null;

    // Check direct SQLite file path option
    const sqlitePath = options.sqlitePath || process.env.CMS_LOCAL_DB_PATH;
    if (sqlitePath) {
      if (!existsSync(sqlitePath)) {
        if (options.requireLive) {
          throw new Error(`Specified SQLite database does not exist: ${sqlitePath}`);
        }
        logger.warn?.(`[export-live-snapshot] SQLite database not found: ${sqlitePath}`);
      } else {
        try {
          const { DatabaseSync } = await import('node:sqlite');
          const db = new DatabaseSync(sqlitePath);
          queryFn = async (sql, params = []) => db.prepare(sql).all(...params);
          source = `local-sqlite (${sqlitePath})`;
        } catch (err) {
          if (options.requireLive) throw err;
          logger.warn?.(`[export-live-snapshot] Failed to open local sqlite ${sqlitePath}: ${err.message}`);
        }
      }
    }

    // Check remote D1 HTTP API credentials (if not already bound to explicit sqlite)
    if (!queryFn && !sqlitePath) {
      const accountId = options.accountId || process.env.CF_ACCOUNT_ID;
      const databaseId = options.databaseId || process.env.CF_D1_DATABASE_ID;
      const apiToken = options.apiToken || process.env.CF_D1_READ_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

      if (accountId && databaseId && apiToken) {
        const { createD1HttpExecutor } = await import('../db/verify-staging.mjs');
        queryFn = createD1HttpExecutor({
          accountId,
          databaseId,
          apiToken,
          apiBaseUrl: options.apiBaseUrl || process.env.CF_D1_API_BASE_URL,
        });
        source = `remote-d1-http (${databaseId})`;
      }
    }

    // Check auto-discovered local wrangler D1 database (if not already bound to explicit sqlite)
    if (!queryFn && !sqlitePath) {
      const discoveredSqlite = await findLocalWranglerSqlite();
      if (discoveredSqlite) {
        try {
          const { DatabaseSync } = await import('node:sqlite');
          const db = new DatabaseSync(discoveredSqlite);
          queryFn = async (sql, params = []) => db.prepare(sql).all(...params);
          source = `discovered-wrangler-sqlite (${discoveredSqlite})`;
        } catch {
          // continue to fallback
        }
      }
    }

    // If a database query executor was resolved, attempt extraction
    if (queryFn) {
      try {
        logger.log(`[export-live-snapshot] Querying live snapshot from ${source}...`);
        snapshot = await fetchLiveSnapshotFromDb(queryFn, options);
      } catch (err) {
        if (options.requireLive) {
          throw err;
        }
        logger.warn?.(`[export-live-snapshot] Database extraction failed (${err.message}). Falling back to mock mode.`);
      }
    } else {
      if (options.requireLive) {
        throw new Error('No database connection available and requireLive is set to true');
      }
      logger.log('[export-live-snapshot] No database connected. Using fallback mock mode.');
    }

    // Fallback to mock mode if DB returned null or extraction failed
    if (!snapshot) {
      snapshot = getMockLiveSnapshot();
      source = 'mock-fallback';
    }
  }

  // Ensure output directory exists and write JSON snapshot
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  logger.log(
    `[export-live-snapshot] ✓ Successfully exported live snapshot [${snapshot.manifest.releaseId}] ` +
    `with ${snapshot.articles.length} article(s) to ${outputPath} (source: ${source})`,
  );

  return { snapshot, outputPath, source };
}

/**
 * Parses command-line arguments.
 */
export function parseCliArgs(argv) {
  const args = {
    outputPath: null,
    sqlitePath: null,
    mode: 'auto',
    requireLive: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mock') args.mode = 'mock';
    else if (arg === '--require-live') args.requireLive = true;
    else if (arg.startsWith('--output=')) args.outputPath = arg.split('=')[1];
    else if (arg === '--output' || arg === '-o') args.outputPath = argv[++i];
    else if (arg.startsWith('--sqlite=')) args.sqlitePath = arg.split('=')[1];
    else if (arg === '--sqlite') args.sqlitePath = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

async function main() {
  const args = parseCliArgs(process.argv);

  if (args.help) {
    console.log(`
Usage: node scripts/build/export-live-snapshot.mjs [options]

Extracts the live release snapshot for Astro build-time static page generation.

Options:
  --output, -o <path>   Destination path (default: .cache/cms-live-snapshot.json)
  --sqlite <path>       Path to local SQLite database file
  --mock                Force fallback mock mode without querying database
  --require-live        Fail instead of falling back to mock mode if DB is unavailable
  --help, -h            Show this help message
`);
    return;
  }

  await exportLiveSnapshot(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`[export-live-snapshot] ✗ Error: ${err.message}`);
    process.exitCode = 1;
  });
}
