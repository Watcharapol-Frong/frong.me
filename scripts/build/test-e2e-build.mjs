#!/usr/bin/env node

/**
 * End-to-end static build verification script for Astro SSG.
 *
 * Workflow:
 * 1. Runs `scripts/build/export-live-snapshot.mjs --mock` (or local SQLite).
 * 2. Triggers `astro build` (using snapshot-aware Astro configuration).
 * 3. Asserts that output HTML files for bilingual articles
 *    (e.g., `dist/articles/cloudflare-cms-architecture/index.html` and
 *           `dist/en/articles/cloudflare-cms-architecture/index.html`)
 *    exist and contain expected snapshot titles and content.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { exportLiveSnapshot } from './export-live-snapshot.mjs';

const DEFAULT_CACHE_PATH = resolve(process.cwd(), '.cache/cms-live-snapshot.json');
const DEFAULT_CONFIG_PATH = 'scripts/build/astro.config.mjs';
const DEFAULT_DIST_DIR = resolve(process.cwd(), 'dist');

/**
 * Executes a child process command and returns output.
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      if (options.verbose) process.stdout.write(chunk);
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (options.verbose) process.stderr.write(chunk);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ code, stdout, stderr });
      } else {
        const error = new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}\n${stderr || stdout}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        rejectPromise(error);
      }
    });

    proc.on('error', (err) => {
      rejectPromise(err);
    });
  });
}

/**
 * Resolves the expected output HTML path for a public article DTO.
 *
 * Routing convention:
 * - Thai ('th'): /articles/[slug]/index.html
 * - English ('en'): /en/articles/[slug]/index.html
 */
export function getExpectedArticleHtmlPath(article, distDir = DEFAULT_DIST_DIR) {
  if (article.lang === 'th') {
    return join(distDir, 'articles', article.slug, 'index.html');
  }
  if (article.lang === 'en') {
    return join(distDir, 'en', 'articles', article.slug, 'index.html');
  }
  return join(distDir, article.lang, 'articles', article.slug, 'index.html');
}

/**
 * Main E2E build verification runner.
 */
export async function runE2eBuildTest(options = {}) {
  const logger = options.logger || console;
  const snapshotPath = resolve(options.snapshotPath || process.env.CMS_SNAPSHOT_PATH || DEFAULT_CACHE_PATH);
  const distDir = resolve(options.distDir || DEFAULT_DIST_DIR);
  const sqlitePath = options.sqlitePath || null;
  const mode = options.mode || (sqlitePath ? 'auto' : 'mock');
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;

  logger.log('====================================================');
  logger.log('CMS E2E Static Build Verification');
  logger.log('====================================================');

  // Step 1: Export live snapshot (mock or SQLite)
  logger.log(`\n[1/3] Exporting live snapshot (mode: ${mode})...`);
  const exportResult = await exportLiveSnapshot({
    mode,
    sqlitePath,
    outputPath: snapshotPath,
    logger,
  });

  const snapshot = exportResult.snapshot;
  if (!snapshot || !Array.isArray(snapshot.articles) || snapshot.articles.length === 0) {
    throw new Error('Exported snapshot contains no articles for E2E build testing.');
  }

  logger.log(`✓ Snapshot contains ${snapshot.articles.length} article(s):`);
  for (const article of snapshot.articles) {
    logger.log(`   - [${article.lang}] ${article.slug}: "${article.title}"`);
  }

  // Step 2: Trigger astro build
  logger.log('\n[2/3] Triggering Astro static build...');
  const buildArgs = ['astro', 'build'];
  if (configPath && existsSync(resolve(process.cwd(), configPath))) {
    const relConfig = relative(process.cwd(), resolve(process.cwd(), configPath));
    buildArgs.push('--config', relConfig);
  }

  logger.log(`Executing: npx ${buildArgs.join(' ')}`);
  const buildStart = Date.now();
  await runCommand('npx', buildArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CMS_SNAPSHOT_PATH: snapshotPath,
    },
    verbose: options.verbose ?? true,
  });
  const buildDuration = ((Date.now() - buildStart) / 1000).toFixed(2);
  logger.log(`✓ Astro build completed successfully in ${buildDuration}s`);

  // Step 3: Assert output HTML files for bilingual articles
  logger.log('\n[3/3] Asserting generated HTML files and titles...');
  const assertions = [];

  for (const article of snapshot.articles) {
    const expectedHtmlPath = getExpectedArticleHtmlPath(article, distDir);
    logger.log(`Checking [${article.lang}] article: ${expectedHtmlPath}`);

    // Assertion A: Output HTML file exists
    if (!existsSync(expectedHtmlPath)) {
      throw new Error(
        `E2E build assertion failed: Expected HTML file not found at ${expectedHtmlPath} for [${article.lang}] article "${article.slug}"`,
      );
    }

    // Assertion B: Output HTML file is non-empty and contains expected title
    const htmlContent = readFileSync(expectedHtmlPath, 'utf8');
    if (htmlContent.length === 0) {
      throw new Error(`E2E build assertion failed: File is empty at ${expectedHtmlPath}`);
    }

    if (!htmlContent.includes(article.title)) {
      throw new Error(
        `E2E build assertion failed: Output HTML at ${expectedHtmlPath} does not contain expected title "${article.title}".`,
      );
    }

    // Assertion C: Slug is present in HTML structure
    if (!htmlContent.includes(article.slug) && !htmlContent.includes(article.excerpt || '')) {
      logger.warn?.(`Warning: Article slug or excerpt not found in ${expectedHtmlPath}`);
    }

    logger.log(`✓ [${article.lang}] Verified ${article.slug}`);
    logger.log(`   Title match: "${article.title}"`);
    assertions.push({
      lang: article.lang,
      slug: article.slug,
      title: article.title,
      htmlPath: expectedHtmlPath,
    });
  }

  logger.log('\n====================================================');
  logger.log(`✓ All E2E build assertions PASSED (${assertions.length} articles verified)`);
  logger.log('====================================================\n');

  return {
    success: true,
    snapshot,
    verifiedArticles: assertions,
    distDir,
  };
}

/**
 * Parses CLI arguments.
 */
export function parseCliArgs(argv) {
  const args = {
    mode: null,
    sqlitePath: null,
    configPath: DEFAULT_CONFIG_PATH,
    snapshotPath: null,
    distDir: DEFAULT_DIST_DIR,
    verbose: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mock') args.mode = 'mock';
    else if (arg.startsWith('--sqlite=')) args.sqlitePath = arg.split('=')[1];
    else if (arg === '--sqlite') args.sqlitePath = argv[++i];
    else if (arg.startsWith('--config=')) args.configPath = arg.split('=')[1];
    else if (arg === '--config') args.configPath = argv[++i];
    else if (arg.startsWith('--dist=')) args.distDir = arg.split('=')[1];
    else if (arg === '--dist') args.distDir = argv[++i];
    else if (arg === '--quiet') args.verbose = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  if (!args.mode) {
    args.mode = args.sqlitePath ? 'auto' : 'mock';
  }

  return args;
}

async function main() {
  const args = parseCliArgs(process.argv);

  if (args.help) {
    console.log(`
Usage: node scripts/build/test-e2e-build.mjs [options]

Executes live snapshot export, triggers Astro static build, and verifies
that output HTML files for bilingual articles exist and contain expected titles.

Options:
  --mock               Use mock release snapshot (default)
  --sqlite <path>      Extract release snapshot from local SQLite database file
  --config <path>      Custom Astro configuration file (default: scripts/build/astro.config.mjs)
  --dist <path>        Custom dist directory to inspect (default: dist)
  --quiet              Suppress build stdout
  --help, -h           Show this help message
`);
    return;
  }

  await runE2eBuildTest(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`\n[test-e2e-build] ✗ Test failed: ${err.message}`);
    process.exitCode = 1;
  });
}
