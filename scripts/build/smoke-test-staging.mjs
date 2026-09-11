#!/usr/bin/env node

/**
 * Full live-staging E2E smoke test orchestration for the frong.me CMS
 * (Task 1C-05).
 *
 * Exercises the complete draft -> publish -> read -> archive lifecycle
 * against the Earth CMS API:
 *
 *   1. Create draft            POST /earth/api/posts
 *   2. Optimistic locking      PUT  /earth/api/posts/:id  (stale -> 409, correct -> 200)
 *   3. Media asset attachment  POST /earth/api/posts/:id/assets
 *   4. Release + promotion     POST /earth/api/releases, POST /earth/api/releases/:id/confirm
 *   5. Public reader check     GET  /articles/:slug (the slug captured in step 1)
 *   6. Mandatory teardown      POST /earth/api/posts/:id/archive (always, via try/finally)
 *
 * Modes:
 * - `--dry-run` (default when no host/credentials are supplied): runs entirely
 *   against an in-process mock server implementing the same request/response
 *   contracts as `src/pages/earth/api/**`, with no network access.
 * - live (no `--dry-run`): targets a real deployed host. Refuses to run
 *   unless the 1C-05 GATE preconditions are met (see `checkLiveGates`) and
 *   Cloudflare Access service-token credentials are present.
 *
 * Known live-mode limitation (separate from the GATE): the real API has no
 * HTTP route yet to dispatch a release and create a deployment attempt
 * (P1-04), and no route to attach a media asset to a draft (P1-11 upload
 * pipeline). Step 3 and the confirm half of Step 4 will therefore fail
 * against the real deployed API today with a clearly labeled error rather
 * than a false pass. `--dry-run` exercises the full intended contract via
 * the in-process mock so the orchestration logic itself is proven now.
 *
 * Exit code: 0 only if every assertion passes AND teardown (Step 6)
 * succeeds. 1 on any assertion failure, on a refused live run, or if
 * teardown itself fails (in which case the orphaned post ID is printed for
 * manual cleanup).
 */

import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CMS_SCHEMA_VERSION } from '../../src/lib/cms/contracts.ts';
import {
  SMOKE_FILENAME,
  buildAssetKey,
  sha256Hex,
  smokeFixtureBytes,
} from '../db/verify-r2-staging.mjs';

export class SmokeTestError extends Error {
  /**
   * @param {string} message
   * @param {string} [step]
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, step, details) {
    super(message);
    this.name = 'SmokeTestError';
    this.step = step;
    this.details = details;
  }
}

export const SMOKE_TITLE = '__smoketest_article__';

/** Path checked for Step 1 real-deploy evidence (see `checkLiveGates`). */
export const DEPLOY_RESULT_PATH = path.resolve(
  process.cwd(),
  '.wrangler/deploy-result/deployment-result.json',
);

function randomToken() {
  return Math.random().toString(36).slice(2, 10);
}

/** Generates a CMS identifier matching `ID_PATTERN` in `src/lib/cms/validation.ts`. */
export function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomToken()}`;
}

/** Generates a slug matching `SLUG_PATTERN` in `src/lib/cms/validation.ts`. */
export function genSlug(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomToken()}`;
}

/**
 * Normalizes a host URL to a valid protocol with no trailing slash.
 * @param {string} host
 */
export function normalizeHost(host) {
  const trimmed = host.trim();
  const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return withProto.replace(/\/+$/, '');
}

/**
 * Recomputes the canonical manifest SHA-256 exactly as
 * `canonicalReleaseManifest` does in `src/server/cms/repositories/releases.ts`:
 * fixed key order, articles sorted by `postId`.
 *
 * @param {{ releaseId: string, generatedAt: string, articles: Array<Record<string, unknown>> }} manifest
 */
export async function canonicalManifestSha256(manifest) {
  const canonical = {
    schemaVersion: CMS_SCHEMA_VERSION,
    releaseId: manifest.releaseId,
    generatedAt: manifest.generatedAt,
    articles: [...manifest.articles].sort((left, right) => (
      left.postId < right.postId ? -1 : left.postId > right.postId ? 1 : 0
    )),
  };
  const json = JSON.stringify(canonical);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { manifest: canonical, json, sha256 };
}

// ---------------------------------------------------------------------------
// GATE — live-mode preconditions (1C-05)
// ---------------------------------------------------------------------------

/**
 * Checks the three preconditions this task's GATE requires before this
 * script may run in live (non-dry-run) mode. None of these can be verified
 * purely from this process's own state, so each is either read from a
 * concrete evidence artifact left by that step, or requires an explicit
 * environment-variable attestation that a human (or the orchestrating agent
 * that actually observed the result) sets only after the real check passed.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ deployResultPath?: string }} [options]
 * @returns {{ ok: boolean, unmet: string[] }}
 */
export function checkLiveGates(env = process.env, options = {}) {
  const unmet = [];
  const deployResultPath = options.deployResultPath || DEPLOY_RESULT_PATH;

  let deploySucceeded = false;
  try {
    if (existsSync(deployResultPath)) {
      const parsed = JSON.parse(readFileSync(deployResultPath, 'utf8'));
      deploySucceeded = Boolean(parsed && parsed.success === true);
    }
  } catch {
    deploySucceeded = false;
  }
  if (!deploySucceeded) {
    unmet.push(
      `Precondition 1 unmet: no successful Step 1 real deploy evidence at ${deployResultPath} `
      + '(run `gh workflow run cms-staging-deploy.yml -f dry_run=false` and confirm it reports success: true)',
    );
  }

  if (env.SMOKE_GATE_1C03_LIVE_PASSED !== 'true') {
    unmet.push(
      'Precondition 2 unmet: 1C-03 live run (not :dry) has not been attested to pass Case 1 and Case 3 '
      + '(set SMOKE_GATE_1C03_LIVE_PASSED=true only after `npm run verify:access` truly passes against the live host)',
    );
  }

  if (env.SMOKE_GATE_1C04_R2_PASSED !== 'true') {
    unmet.push(
      'Precondition 3 unmet: 1C-04 R2 smoke verification success has not been attested from Agent 4 '
      + '(set SMOKE_GATE_1C04_R2_PASSED=true only after that report is received)',
    );
  }

  return { ok: unmet.length === 0, unmet };
}

// ---------------------------------------------------------------------------
// In-process mock CMS server (--dry-run)
// ---------------------------------------------------------------------------

function jsonBody(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function cmsError(res, status, code, message, details) {
  jsonBody(res, status, { error: { code, message, ...(details ? { details } : {}) } });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function postDto(post) {
  return {
    id: post.id,
    lang: post.lang,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? null,
    bodyMarkdown: post.bodyMarkdown,
    lifecycle: post.lifecycle,
    draftVersion: post.draftVersion,
    assets: post.assets.map((asset) => ({ ...asset })),
  };
}

/**
 * Creates an in-process mock of the Earth CMS API surface this smoke test
 * exercises. Implements the same request/response contracts as the real
 * `src/pages/earth/api/**` routes (including the `{ error: { code,
 * message, details } }` conflict shape) so assertions written against it
 * also hold against a real deployed API — with two intentional exceptions,
 * called out where implemented below, for capability that does not exist
 * server-side yet (release dispatch/attempt creation, and asset upload).
 */
export function createMockCmsServer() {
  const posts = new Map();
  const releases = new Map();
  /** @type {Map<string, { title: string, bodyMarkdown: string }>} keyed `lang:slug` */
  const liveContent = new Map();
  let liveReleaseId = null;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // POST /earth/api/posts
      if (req.method === 'POST' && url.pathname === '/earth/api/posts') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object') return cmsError(res, 400, 'BAD_REQUEST', 'Invalid JSON body');
        if (posts.has(body.id)) return cmsError(res, 409, 'CONFLICT', 'Post id already exists');
        const post = {
          id: body.id,
          lang: body.lang,
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt ?? null,
          bodyMarkdown: body.bodyMarkdown ?? '',
          lifecycle: 'draft',
          draftVersion: 1,
          assets: [],
        };
        posts.set(post.id, post);
        return jsonBody(res, 201, postDto(post));
      }

      // POST /earth/api/posts/:id/assets — mock-only: no such route exists in
      // the real API yet (P1-11 upload/attach pipeline is not implemented).
      if (req.method === 'POST' && parts.length === 5
        && parts[0] === 'earth' && parts[1] === 'api' && parts[2] === 'posts' && parts[4] === 'assets') {
        const id = decodeURIComponent(parts[3]);
        const post = posts.get(id);
        if (!post) return cmsError(res, 404, 'NOT_FOUND', 'Post not found');
        const body = await readJson(req);
        if (!body || typeof body.expectedDraftVersion !== 'number') {
          return cmsError(res, 400, 'BAD_REQUEST', 'expectedDraftVersion is required');
        }
        if (body.expectedDraftVersion !== post.draftVersion) {
          return cmsError(res, 409, 'DRAFT_VERSION_CONFLICT', 'The draft changed before the asset could be attached', {
            currentDraftVersion: post.draftVersion,
          });
        }
        post.assets.push({ assetKey: body.assetKey, role: body.role, altText: body.altText });
        post.draftVersion += 1;
        return jsonBody(res, 200, postDto(post));
      }

      // POST /earth/api/posts/:id/archive
      if (req.method === 'POST' && parts.length === 5
        && parts[0] === 'earth' && parts[1] === 'api' && parts[2] === 'posts' && parts[4] === 'archive') {
        const id = decodeURIComponent(parts[3]);
        const post = posts.get(id);
        if (!post) return cmsError(res, 404, 'NOT_FOUND', 'Post not found');
        const body = await readJson(req);
        if (!body || typeof body.expectedDraftVersion !== 'number') {
          return cmsError(res, 400, 'BAD_REQUEST', 'expectedDraftVersion is required');
        }
        if (body.expectedDraftVersion !== post.draftVersion) {
          return cmsError(res, 409, 'DRAFT_VERSION_CONFLICT', 'The draft changed before it could be archived', {
            currentDraftVersion: post.draftVersion,
          });
        }
        post.lifecycle = 'archived';
        post.draftVersion += 1;
        return jsonBody(res, 200, postDto(post));
      }

      // PUT /earth/api/posts/:id (bundled draft update)
      if (req.method === 'PUT' && parts.length === 4
        && parts[0] === 'earth' && parts[1] === 'api' && parts[2] === 'posts') {
        const id = decodeURIComponent(parts[3]);
        const post = posts.get(id);
        if (!post) return cmsError(res, 404, 'NOT_FOUND', 'Post not found');
        const body = await readJson(req);
        const draft = body && body.draft;
        if (!draft || typeof draft.expectedDraftVersion !== 'number') {
          return cmsError(res, 400, 'BAD_REQUEST', 'draft.expectedDraftVersion is required');
        }
        if (draft.expectedDraftVersion !== post.draftVersion) {
          return cmsError(res, 409, 'DRAFT_VERSION_CONFLICT', 'The draft changed before it could be saved', {
            currentDraftVersion: post.draftVersion,
          });
        }
        post.lang = draft.lang;
        post.slug = draft.slug;
        post.title = draft.title;
        post.excerpt = draft.excerpt ?? null;
        post.bodyMarkdown = draft.bodyMarkdown;
        post.draftVersion += 1;
        return jsonBody(res, 200, postDto(post));
      }

      // GET /earth/api/releases
      if (req.method === 'GET' && url.pathname === '/earth/api/releases') {
        return jsonBody(res, 200, { liveReleaseId });
      }

      // POST /earth/api/releases (beginRelease)
      if (req.method === 'POST' && url.pathname === '/earth/api/releases') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object') return cmsError(res, 400, 'BAD_REQUEST', 'Invalid JSON body');
        if (releases.has(body.id)) return cmsError(res, 409, 'CONFLICT', 'Release id already exists');
        if ((body.baseReleaseId ?? null) !== liveReleaseId) {
          return cmsError(res, 409, 'CONFLICT', 'Release base does not match the current live release');
        }
        const recomputed = await canonicalManifestSha256(body.manifest);
        if (recomputed.sha256 !== body.manifestSha256) {
          return cmsError(res, 400, 'BAD_REQUEST', 'Release manifest SHA-256 does not match its canonical payload');
        }
        // Snapshot referenced draft content now, mirroring the real
        // createRevisionSnapshot's copy-of-draft-at-publish-time semantics.
        const snapshotArticles = body.manifest.articles.map((article) => {
          const post = posts.get(article.postId);
          if (!post) throw new SmokeTestError(`manifest references unknown post ${article.postId}`, 'mock-manifest');
          return {
            lang: article.lang,
            slug: article.slug,
            visible: article.visible,
            title: post.title,
            bodyMarkdown: post.bodyMarkdown,
          };
        });
        // Mock-only convenience: the real API has no HTTP route yet to
        // dispatch a release and create a deployment attempt (P1-04), so a
        // real client cannot obtain an attemptId this way. This mock
        // simulates that missing dispatch step inline so the rest of the
        // lifecycle can be exercised end-to-end in --dry-run.
        const attemptId = genId('smokeattempt');
        const release = {
          id: body.id,
          status: 'deploying',
          manifestSha256: recomputed.sha256,
          itemCount: body.manifest.articles.filter((a) => a.visible).length,
          attemptId,
          providerDeploymentId: null,
          snapshotArticles,
        };
        releases.set(release.id, release);
        return jsonBody(res, 201, {
          id: release.id,
          status: release.status,
          itemCount: release.itemCount,
          manifestSha256: release.manifestSha256,
          attemptId,
        });
      }

      // POST /earth/api/releases/:id/confirm
      if (req.method === 'POST' && parts.length === 5
        && parts[0] === 'earth' && parts[1] === 'api' && parts[2] === 'releases' && parts[4] === 'confirm') {
        const id = decodeURIComponent(parts[3]);
        const release = releases.get(id);
        if (!release) return cmsError(res, 404, 'NOT_FOUND', 'Release not found');
        const body = await readJson(req);
        if (!body || !body.attemptId || !body.providerDeploymentId) {
          return cmsError(res, 400, 'BAD_REQUEST', 'attemptId and providerDeploymentId are required');
        }
        if (body.attemptId !== release.attemptId || release.status !== 'deploying') {
          return cmsError(res, 409, 'INVALID_STATE_TRANSITION', 'Release deployment confirmation did not advance the live pointer');
        }
        release.status = 'live';
        release.providerDeploymentId = body.providerDeploymentId;
        liveReleaseId = release.id;
        for (const article of release.snapshotArticles) {
          if (!article.visible) continue;
          liveContent.set(`${article.lang}:${article.slug}`, {
            title: article.title,
            bodyMarkdown: article.bodyMarkdown,
          });
        }
        return jsonBody(res, 200, {
          liveReleaseId,
          release: { id: release.id, status: release.status },
        });
      }

      // GET /articles/:slug and /en/articles/:slug (public reader)
      if (req.method === 'GET' && (
        (parts.length === 2 && parts[0] === 'articles')
        || (parts.length === 3 && parts[0] === 'en' && parts[1] === 'articles')
      )) {
        const lang = parts[0] === 'en' ? 'en' : 'th';
        const slug = decodeURIComponent(parts[parts.length - 1]);
        const article = liveContent.get(`${lang}:${slug}`);
        if (!article) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><title>${article.title}</title></head>`
          + `<body><h1>${article.title}</h1><article>${article.bodyMarkdown}</article></body></html>`);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (error) {
      cmsError(res, 500, 'DATABASE_ERROR', error instanceof Error ? error.message : String(error));
    }
  });
}

// ---------------------------------------------------------------------------
// HTTP client helper
// ---------------------------------------------------------------------------

async function call(baseHost, method, pathname, { headers = {}, body, timeoutMs = 15_000 } = {}) {
  const response = await fetch(`${baseHost}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json;
  try {
    json = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Runs the full staging smoke test lifecycle.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {string} [options.host]
 * @param {string} [options.clientId]
 * @param {string} [options.clientSecret]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(message: string) => void} [options.log]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ ok: boolean, dryRun: boolean, host: string, postId: string, slug: string, steps: Record<string, unknown> }>}
 */
export async function runSmokeTestStaging(options = {}) {
  const {
    dryRun = false,
    env = process.env,
    log = console.log,
    timeoutMs = 15_000,
  } = options;

  if (!dryRun) {
    const gate = checkLiveGates(env);
    if (!gate.ok) {
      throw new SmokeTestError(
        `Refusing to run in live mode — unmet GATE preconditions:\n  - ${gate.unmet.join('\n  - ')}`,
        'live-gate',
      );
    }
  }

  let serverInstance = null;
  let targetHost = options.host || env.STAGING_HOST || '';
  let clientId = options.clientId || env.CF_ACCESS_CLIENT_ID || '';
  let clientSecret = options.clientSecret || env.CF_ACCESS_CLIENT_SECRET || '';

  if (dryRun) {
    if (!targetHost) {
      const mock = createMockCmsServer();
      await new Promise((resolveListen) => mock.listen(0, '127.0.0.1', resolveListen));
      const address = mock.address();
      targetHost = `http://127.0.0.1:${address.port}`;
      serverInstance = mock;
    }
  } else {
    if (!targetHost) targetHost = 'https://cms-staging.frong.me';
    if (!clientId || !clientSecret) {
      throw new SmokeTestError(
        'Missing Cloudflare Access credentials for live mode. Set CF_ACCESS_CLIENT_ID and '
        + 'CF_ACCESS_CLIENT_SECRET, or run with --dry-run.',
        'missing-credentials',
      );
    }
  }

  const baseHost = normalizeHost(targetHost);
  const headers = {};
  if (clientId && clientSecret) {
    headers['CF-Access-Client-Id'] = clientId;
    headers['CF-Access-Client-Secret'] = clientSecret;
  }
  log(`[smoke-test-staging] Target: ${baseHost} (${dryRun ? 'mode: DRY-RUN / mock server' : 'mode: LIVE staging'})`);

  const steps = {};
  let postId = null;
  let capturedSlug = null;
  let capturedLang = null;
  let draftVersion = null;
  let stepError = null;
  let teardownError = null;

  try {
    // -----------------------------------------------------------------
    // Step 1: create draft (bilingual TH/EN content within one post)
    // -----------------------------------------------------------------
    log('[smoke-test-staging] Step 1: creating draft...');
    postId = genId('smoketest');
    const requestedSlug = genSlug('smoketest-article');
    const smokeMarker = `smoke-marker-${postId}`;
    const bilingualBody = [
      '# บทความทดสอบระบบอัตโนมัติ (Automated smoke test article)',
      '',
      'เนื้อหาภาษาไทยสำหรับทดสอบวงจรการเผยแพร่แบบอัตโนมัติ end-to-end.',
      '',
      'English content for the automated end-to-end publish smoke test.',
      '',
      smokeMarker,
    ].join('\n');
    const created = await call(baseHost, 'POST', '/earth/api/posts', {
      headers,
      timeoutMs,
      body: {
        id: postId,
        lang: 'th',
        slug: requestedSlug,
        title: SMOKE_TITLE,
        excerpt: 'Automated end-to-end smoke test draft (bilingual TH/EN content).',
        bodyMarkdown: bilingualBody,
      },
    });
    if (created.status !== 201 || !created.json) {
      throw new SmokeTestError(`Step 1 FAILED: expected 201, got ${created.status}: ${created.text}`, 'create-draft');
    }
    // Never assume the slug equals the title or the requested slug — always
    // read the server-generated value from the response body.
    capturedSlug = created.json.slug;
    capturedLang = created.json.lang;
    draftVersion = created.json.draftVersion;
    if (!capturedSlug || typeof draftVersion !== 'number') {
      throw new SmokeTestError('Step 1 FAILED: response did not include slug/draftVersion', 'create-draft', created.json);
    }
    steps.createDraft = { postId, slug: capturedSlug, draftVersion };
    log(`[smoke-test-staging] Step 1: PASSED (postId=${postId}, slug=${capturedSlug}, draftVersion=${draftVersion})`);

    // -----------------------------------------------------------------
    // Step 2: optimistic locking
    // -----------------------------------------------------------------
    log('[smoke-test-staging] Step 2: optimistic locking...');
    const updatePayload = (expectedDraftVersion) => ({
      draft: {
        expectedDraftVersion,
        lang: capturedLang,
        slug: capturedSlug,
        title: SMOKE_TITLE,
        excerpt: 'Automated end-to-end smoke test draft (updated).',
        bodyMarkdown: `${bilingualBody}\n\nUpdated in Step 2.`,
      },
      categoryIds: [],
      tagIds: [],
      sources: [],
    });

    const staleAttempt = await call(baseHost, 'PUT', `/earth/api/posts/${postId}`, {
      headers,
      timeoutMs,
      body: updatePayload(draftVersion + 1),
    });
    if (staleAttempt.status !== 409) {
      throw new SmokeTestError(
        `Step 2 FAILED: stale expectedDraftVersion expected 409, got ${staleAttempt.status}: ${staleAttempt.text}`,
        'optimistic-locking',
      );
    }

    const correctAttempt = await call(baseHost, 'PUT', `/earth/api/posts/${postId}`, {
      headers,
      timeoutMs,
      body: updatePayload(draftVersion),
    });
    if (correctAttempt.status !== 200 || !correctAttempt.json || correctAttempt.json.draftVersion !== draftVersion + 1) {
      throw new SmokeTestError(
        `Step 2 FAILED: correct expectedDraftVersion expected 200 with a bumped version, got ${correctAttempt.status}: ${correctAttempt.text}`,
        'optimistic-locking',
      );
    }
    draftVersion = correctAttempt.json.draftVersion;
    steps.optimisticLocking = { staleStatus: staleAttempt.status, correctStatus: correctAttempt.status, draftVersion };
    log(`[smoke-test-staging] Step 2: PASSED (409 on stale, 200 on correct, draftVersion=${draftVersion})`);

    // -----------------------------------------------------------------
    // Step 3: media asset attachment
    // -----------------------------------------------------------------
    log('[smoke-test-staging] Step 3: attaching media asset...');
    const assetBytes = smokeFixtureBytes();
    const assetSha256 = await sha256Hex(assetBytes);
    const assetKey = buildAssetKey(assetSha256, SMOKE_FILENAME);
    const assetAttach = await call(baseHost, 'POST', `/earth/api/posts/${postId}/assets`, {
      headers,
      timeoutMs,
      body: { expectedDraftVersion: draftVersion, assetKey, role: 'cover', altText: 'Smoke test cover image' },
    });
    if (assetAttach.status === 404) {
      throw new SmokeTestError(
        'Step 3 FAILED: no asset-attach route is available on this host yet '
        + '(the P1-11 upload/attach pipeline has not shipped)',
        'media-attach',
      );
    }
    if (assetAttach.status !== 200 || !assetAttach.json) {
      throw new SmokeTestError(`Step 3 FAILED: expected 200, got ${assetAttach.status}: ${assetAttach.text}`, 'media-attach');
    }
    draftVersion = assetAttach.json.draftVersion;
    steps.mediaAttach = { assetKey, draftVersion };
    log(`[smoke-test-staging] Step 3: PASSED (assetKey=${assetKey}, draftVersion=${draftVersion})`);

    // -----------------------------------------------------------------
    // Step 4: release snapshot & promotion
    // -----------------------------------------------------------------
    log('[smoke-test-staging] Step 4: release snapshot & promotion...');
    const currentState = await call(baseHost, 'GET', '/earth/api/releases', { headers, timeoutMs });
    if (currentState.status !== 200 || !currentState.json) {
      throw new SmokeTestError(`Step 4 FAILED: could not read current release state (${currentState.status}): ${currentState.text}`, 'release-state');
    }
    const baseReleaseId = currentState.json.liveReleaseId ?? null;

    const releaseId = genId('smokerelease');
    const revisionId = genId('smokerev');
    const manifest = {
      schemaVersion: CMS_SCHEMA_VERSION,
      releaseId,
      generatedAt: new Date().toISOString(),
      articles: [{ postId, revisionId, lang: capturedLang, slug: capturedSlug, visible: true }],
    };
    const { sha256: manifestSha256 } = await canonicalManifestSha256(manifest);

    const beginRelease = await call(baseHost, 'POST', '/earth/api/releases', {
      headers,
      timeoutMs,
      body: {
        id: releaseId,
        triggerKind: 'publish',
        triggerPostId: postId,
        ...(baseReleaseId ? { baseReleaseId } : {}),
        idempotencyKey: `smoke-${releaseId}`,
        manifest,
        manifestSha256,
        revisionSnapshot: {
          revisionId,
          postId,
          expectedDraftVersion: draftVersion,
          publishedAt: Date.now(),
        },
      },
    });
    if (beginRelease.status !== 201 || !beginRelease.json) {
      throw new SmokeTestError(`Step 4a FAILED: beginRelease expected 201, got ${beginRelease.status}: ${beginRelease.text}`, 'release-begin');
    }
    steps.releaseBegin = { releaseId, manifestSha256, response: beginRelease.json };
    log(`[smoke-test-staging] Step 4a: PASSED (candidate manifest created, releaseId=${releaseId})`);

    const attemptId = beginRelease.json.attemptId;
    if (!attemptId) {
      throw new SmokeTestError(
        'Step 4b FAILED: beginRelease response did not include a deployment attempt id — release '
        + 'confirmation cannot proceed until repository dispatch/attempt creation (P1-04) is implemented '
        + 'server-side and exposed to this smoke test',
        'release-confirm-unavailable',
      );
    }
    const confirmRelease = await call(baseHost, 'POST', `/earth/api/releases/${releaseId}/confirm`, {
      headers,
      timeoutMs,
      body: { attemptId, providerDeploymentId: `smoke-provider-${Date.now()}` },
    });
    if (confirmRelease.status !== 200 || !confirmRelease.json || confirmRelease.json.liveReleaseId !== releaseId) {
      throw new SmokeTestError(`Step 4b FAILED: confirm expected 200 with liveReleaseId=${releaseId}, got ${confirmRelease.status}: ${confirmRelease.text}`, 'release-confirm');
    }
    steps.releaseConfirm = { liveReleaseId: confirmRelease.json.liveReleaseId };
    log(`[smoke-test-staging] Step 4b: PASSED (release is live, liveReleaseId=${releaseId})`);

    // -----------------------------------------------------------------
    // Step 5: public reader verification (using the captured slug)
    // -----------------------------------------------------------------
    log('[smoke-test-staging] Step 5: public reader verification...');
    const publicPath = capturedLang === 'en' ? `/en/articles/${capturedSlug}` : `/articles/${capturedSlug}`;
    const publicRead = await call(baseHost, 'GET', publicPath, { timeoutMs });
    if (publicRead.status !== 200) {
      throw new SmokeTestError(`Step 5 FAILED: GET ${publicPath} expected 200, got ${publicRead.status}`, 'public-reader');
    }
    if (!publicRead.text.includes(SMOKE_TITLE) || !publicRead.text.includes(smokeMarker)) {
      throw new SmokeTestError(
        `Step 5 FAILED: public route ${publicPath} did not contain the expected smoke test content`,
        'public-reader',
      );
    }
    steps.publicReader = { path: publicPath };
    log(`[smoke-test-staging] Step 5: PASSED (${publicPath} matches published content)`);
  } catch (error) {
    stepError = error instanceof SmokeTestError ? error : new SmokeTestError(String(error?.message ?? error), 'unknown');
  } finally {
    // -----------------------------------------------------------------
    // Step 6: mandatory teardown — runs even if an earlier step failed.
    // -----------------------------------------------------------------
    if (postId) {
      log('[smoke-test-staging] Step 6: archiving smoke test post (mandatory teardown)...');
      try {
        const archive = await call(baseHost, 'POST', `/earth/api/posts/${postId}/archive`, {
          headers,
          timeoutMs,
          body: { expectedDraftVersion: draftVersion },
        });
        if (archive.status !== 200 || !archive.json || archive.json.lifecycle !== 'archived') {
          throw new Error(`archive expected 200 with lifecycle=archived, got ${archive.status}: ${archive.text}`);
        }
        steps.teardown = { ok: true, postId };
        log(`[smoke-test-staging] Step 6: PASSED (postId=${postId} archived)`);
      } catch (error) {
        teardownError = error;
        steps.teardown = { ok: false, postId, error: error instanceof Error ? error.message : String(error) };
        log(`[smoke-test-staging] Step 6: FAILED — ORPHANED POST ID (manual cleanup required): ${postId}`);
        log(`[smoke-test-staging] Step 6 error: ${teardownError.message}`);
      }
    }
    if (serverInstance) {
      await new Promise((resolveClose) => serverInstance.close(resolveClose));
    }
  }

  if (teardownError) {
    // Teardown failing after a live run always wins: exit 1 regardless of
    // whether the assertions above passed, with the orphaned ID already
    // printed above.
    throw new SmokeTestError(
      `Teardown FAILED after ${stepError ? 'a prior step failure' : 'otherwise-passing steps'}: ${teardownError.message}. `
      + `Orphaned post ID: ${postId}`,
      'teardown',
      { postId },
    );
  }
  if (stepError) throw stepError;

  return { ok: true, dryRun, host: baseHost, postId, slug: capturedSlug, steps };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseCliArgs(args) {
  const options = { dryRun: false, host: '' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--host' && args[i + 1]) options.host = args[++i];
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
Usage: node scripts/build/smoke-test-staging.mjs [options]

Full live-staging E2E smoke test orchestration for the frong.me CMS.

Options:
  --dry-run    Run against an in-process mock server (no network, no credentials)
  --host <url> Target staging host (or set STAGING_HOST env var; live mode
               defaults to https://cms-staging.frong.me)
  --help, -h   Show this help message

Live mode additionally requires CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
and the 1C-05 GATE preconditions (see the module header comment).
`);
    return;
  }

  try {
    const result = await runSmokeTestStaging(options);
    console.log(
      `[smoke-test-staging] Summary: ok=${result.ok} dryRun=${result.dryRun} postId=${result.postId} slug=${result.slug}`,
    );
  } catch (error) {
    if (error instanceof SmokeTestError) {
      console.error(`\n[smoke-test-staging] FAILED [${error.step}]: ${error.message}`);
    } else {
      console.error('\n[smoke-test-staging] UNEXPECTED ERROR:', error?.message || error);
    }
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
