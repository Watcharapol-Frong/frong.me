#!/usr/bin/env node

/**
 * Zero Trust Verification Script for Cloudflare Staging.
 *
 * Verifies Cloudflare Access protection and routing behavior:
 * Case 1 (Unauthenticated Admin/API):
 *   GET /earth and GET /earth/api/posts without headers must return
 *   401, 403, or 302 redirect to Cloudflare Access login.
 * Case 2 (Authenticated via Access Service Token / Assertion):
 *   GET /earth and GET /earth/api/posts with CF-Access-Client-Id &
 *   CF-Access-Client-Secret (or JWT assertion) must return 200 OK.
 * Case 3 (Public Route Bypass):
 *   Public route (/articles/cloudflare-cms-architecture or /)
 *   without auth headers must return 200 OK.
 * Case 4 (Release callback, opt-in for live mode):
 *   POST /earth/api/releases/:id/confirm or /fail with the exact backend
 *   payload and callback-secret header, then assert the terminal release state.
 *
 * Supports --dry-run to test locally against an ephemeral mock Access server.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STAGING_HOST = 'https://frong-me-staging.frongbook.workers.dev';
const CALLBACK_OUTCOMES = new Set(['none', 'confirm', 'fail', 'all']);

export class AccessVerificationError extends Error {
  /**
   * @param {string} message
   * @param {string} [caseName]
   * @param {number} [statusCode]
   */
  constructor(message, caseName, statusCode) {
    super(message);
    this.name = 'AccessVerificationError';
    this.caseName = caseName;
    this.statusCode = statusCode;
  }
}

/**
 * Normalizes host URL to ensure valid protocol and no trailing slashes.
 *
 * @param {string} host
 * @returns {string}
 */
export function normalizeHost(host) {
  const trimmed = host.trim();
  const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return withProto.replace(/\/+$/, '');
}

/**
 * Creates an in-process mock Cloudflare Access HTTP server for --dry-run testing.
 *
 * @param {object} [options]
 * @param {string} [options.expectedClientId]
 * @param {string} [options.expectedClientSecret]
 * @param {string} [options.expectedJwt]
 * @param {string} [options.expectedCallbackSecret]
 * @param {string} [options.loginRedirectUrl]
 * @returns {http.Server}
 */
export function createMockAccessServer(options = {}) {
  const {
    expectedClientId = 'mock-dry-run-client-id',
    expectedClientSecret = 'mock-dry-run-client-secret',
    expectedJwt = 'mock-dry-run-jwt-assertion',
    expectedCallbackSecret = 'mock-dry-run-callback-secret',
    loginRedirectUrl = 'https://staging.cloudflareaccess.com/cdn-cgi/access/login/mock-staging-app',
  } = options;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;

    const clientId = req.headers['cf-access-client-id'];
    const clientSecret = req.headers['cf-access-client-secret'];
    const jwtAssertion = req.headers['cf-access-jwt-assertion'];

    const hasValidServiceToken =
      Boolean(clientId && clientSecret &&
      clientId === expectedClientId &&
      clientSecret === expectedClientSecret);

    const hasValidJwt = Boolean(jwtAssertion && jwtAssertion === expectedJwt);
    const isAuthenticated = hasValidServiceToken || hasValidJwt;

    // Earth Admin & API routes
    if (pathname === '/earth' || pathname.startsWith('/earth/')) {
      if (!isAuthenticated) {
        if (pathname === '/earth') {
          // Cloudflare Access edge 302 redirect to login
          res.writeHead(302, {
            Location: loginRedirectUrl,
            'Cache-Control': 'no-store',
          });
          res.end();
          return;
        } else {
          // API endpoint rejected with 401 Unauthorized
          res.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      // Authenticated access
      const callbackMatch = pathname.match(/^\/earth\/api\/releases\/([^/]+)\/(confirm|fail)$/);
      if (callbackMatch && req.method === 'POST') {
        if (req.headers['x-release-callback-secret'] !== expectedCallbackSecret) {
          res.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }));
          return;
        }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: { code: 'VALIDATION_ERROR' } }));
          return;
        }

        const releaseId = decodeURIComponent(callbackMatch[1]);
        const outcome = callbackMatch[2];
        const validPayload = typeof payload?.attemptId === 'string' && payload.attemptId.length > 0
          && (outcome === 'confirm'
            ? typeof payload.providerDeploymentId === 'string' && payload.providerDeploymentId.length > 0
            : typeof payload.errorMessage === 'string' && payload.errorMessage.length > 0);
        if (!validPayload) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: { code: 'VALIDATION_ERROR' } }));
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(outcome === 'confirm'
          ? { liveReleaseId: releaseId, release: { id: releaseId, status: 'live' } }
          : { release: { id: releaseId, status: 'failed' } }));
        return;
      }

      if (pathname.startsWith('/earth/api/')) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ items: [] }));
        return;
      } else {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end('<!DOCTYPE html><html><head><title>Earth CMS Admin</title></head><body><h1>Earth CMS</h1></body></html>');
        return;
      }
    }

    // Public routes (articles, home, etc.)
    if (
      pathname === '/' ||
      pathname.startsWith('/articles/') ||
      pathname.startsWith('/en/articles/')
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
      res.end('<!DOCTYPE html><html><head><title>Article</title></head><body><h1>Public Reader</h1></body></html>');
      return;
    }

    // Unmatched routes return 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
}

/**
 * Builds the exact callback route, headers, payload, and success assertion.
 * Live callers must select only one terminal outcome for a given attempt.
 *
 * @param {object} options
 * @param {'confirm'|'fail'} options.outcome
 * @param {string} options.releaseId
 * @param {string} options.attemptId
 * @param {string} options.callbackSecret
 * @param {string} [options.providerDeploymentId]
 * @param {string} [options.workflowRunId]
 * @param {string} [options.errorMessage]
 */
export function createCallbackProbe(options) {
  const {
    outcome,
    releaseId,
    attemptId,
    callbackSecret,
    providerDeploymentId = '',
    workflowRunId = '',
    errorMessage = 'staging pre-flight callback failure probe',
  } = options;
  if (outcome !== 'confirm' && outcome !== 'fail') {
    throw new AccessVerificationError(`Unsupported callback outcome: ${outcome}`, 'callback-config');
  }

  const payload = outcome === 'confirm'
    ? { attemptId, providerDeploymentId, ...(workflowRunId ? { workflowRunId } : {}) }
    : { attemptId, errorMessage, ...(workflowRunId ? { workflowRunId } : {}) };

  return {
    outcome,
    path: `/earth/api/releases/${encodeURIComponent(releaseId)}/${outcome}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Release-Callback-Secret': callbackSecret,
    },
    payload,
    assert(responseBody) {
      const expectedStatus = outcome === 'confirm' ? 'live' : 'failed';
      return responseBody?.release?.id === releaseId
        && responseBody?.release?.status === expectedStatus
        && (outcome !== 'confirm' || responseBody?.liveReleaseId === releaseId);
    },
  };
}

/**
 * Executes Zero Trust staging access verification against the target host.
 *
 * @param {object} [options]
 * @param {string} [options.host] Target staging host (default: CMS_STAGING_HOST or the staging workers.dev URL)
 * @param {boolean} [options.dryRun] If true, run locally against mock server stubs
 * @param {string} [options.clientId] Cloudflare Access Service Token Client ID
 * @param {string} [options.clientSecret] Cloudflare Access Service Token Client Secret
 * @param {string} [options.jwtAssertion] Cloudflare Access JWT Assertion header
 * @param {string} [options.publicPath] Public route path to test (default: /articles/cloudflare-cms-architecture)
 * @param {'none'|'confirm'|'fail'|'all'} [options.callbackMode] Callback to exercise (default: all in dry-run, none live)
 * @param {string} [options.releaseId] Existing release ID for an opt-in callback probe
 * @param {string} [options.attemptId] Existing attempt ID for an opt-in callback probe
 * @param {string} [options.callbackSecret] X-Release-Callback-Secret value
 * @param {string} [options.providerDeploymentId] Provider deployment ID for confirm
 * @param {string} [options.workflowRunId] Optional provider workflow run ID
 * @param {string} [options.errorMessage] Failure message for fail
 * @param {number} [options.timeoutMs] HTTP request timeout in milliseconds (default: 10000)
 * @param {NodeJS.ProcessEnv} [options.env] Environment variables
 * @param {(msg: string) => void} [options.log] Logger function
 * @returns {Promise<{ success: boolean, host: string, dryRun: boolean, results: Record<string, any> }>}
 */
export async function verifyAccessStaging(options = {}) {
  const {
    dryRun = false,
    publicPath = '/articles/cloudflare-cms-architecture',
    timeoutMs = 10000,
    env = process.env,
    log = console.log,
  } = options;

  let serverInstance = null;
  let targetHost = options.host || env.CMS_STAGING_HOST || env.STAGING_HOST || env.CMS_STAGING_URL || '';

  let clientId = options.clientId || env.CF_ACCESS_CLIENT_ID || env.STAGING_CF_ACCESS_CLIENT_ID || '';
  let clientSecret = options.clientSecret || env.CF_ACCESS_CLIENT_SECRET || env.STAGING_CF_ACCESS_CLIENT_SECRET || '';
  let jwtAssertion = options.jwtAssertion || env.CF_ACCESS_JWT_ASSERTION || env.STAGING_CF_ACCESS_JWT_ASSERTION || '';
  let callbackSecret = options.callbackSecret || env.RELEASE_CALLBACK_SECRET || '';
  const callbackMode = options.callbackMode
    || env.CMS_CALLBACK_PROBE
    || (dryRun && !targetHost ? 'all' : 'none');
  const releaseId = options.releaseId || env.CMS_RELEASE_ID || (dryRun ? 'release_preflight_001' : '');
  const attemptId = options.attemptId || env.CMS_ATTEMPT_ID || (dryRun ? 'attempt_preflight_001' : '');
  const providerDeploymentId = options.providerDeploymentId
    || env.CMS_PROVIDER_DEPLOYMENT_ID
    || (dryRun ? 'deployment-preflight-001' : '');
  const workflowRunId = options.workflowRunId || env.GITHUB_RUN_ID || '';
  const errorMessage = options.errorMessage || 'staging pre-flight callback failure probe';

  if (!CALLBACK_OUTCOMES.has(callbackMode)) {
    throw new AccessVerificationError(
      `Invalid callback mode "${callbackMode}"; expected none, confirm, fail, or all.`,
      'callback-config'
    );
  }
  if (!dryRun && callbackMode === 'all') {
    throw new AccessVerificationError(
      'Live callback verification cannot run confirm and fail against the same attempt. Select exactly one with --callback confirm or --callback fail.',
      'callback-config'
    );
  }

  if (dryRun) {
    // If dry-run without a custom host, spin up the local mock server
    if (!targetHost) {
      clientId = clientId || 'mock-dry-run-client-id';
      clientSecret = clientSecret || 'mock-dry-run-client-secret';
      jwtAssertion = jwtAssertion || 'mock-dry-run-jwt-assertion';
      callbackSecret = callbackSecret || 'mock-dry-run-callback-secret';

      const mockServer = createMockAccessServer({
        expectedClientId: clientId,
        expectedClientSecret: clientSecret,
        expectedJwt: jwtAssertion,
        expectedCallbackSecret: callbackSecret,
      });

      await new Promise((resolveServer) => {
        mockServer.listen(0, '127.0.0.1', () => {
          const address = mockServer.address();
          targetHost = `http://127.0.0.1:${address.port}`;
          serverInstance = mockServer;
          resolveServer(undefined);
        });
      });
    }
  } else {
    // In live mode, use the reachable staging Worker as the primary endpoint.
    if (!targetHost) {
      targetHost = DEFAULT_STAGING_HOST;
    }

    // Ensure credentials exist for Case 2
    const hasServiceToken = Boolean(clientId && clientSecret);
    const hasJwt = Boolean(jwtAssertion);
    if (!hasServiceToken && !hasJwt) {
      throw new AccessVerificationError(
        'Missing Cloudflare Access credentials for Case 2 authentication. Please set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (or CF_ACCESS_JWT_ASSERTION) in environment variables, or run with --dry-run for local mock verification.',
        'missing-credentials'
      );
    }

    if (callbackMode !== 'none') {
      const requiredCallbackValues = [
        ['CMS_RELEASE_ID', releaseId],
        ['CMS_ATTEMPT_ID', attemptId],
        ['RELEASE_CALLBACK_SECRET', callbackSecret],
        ...(callbackMode === 'confirm'
          ? [['CMS_PROVIDER_DEPLOYMENT_ID', providerDeploymentId]]
          : []),
      ];
      const missing = requiredCallbackValues
        .filter(([, value]) => !String(value).trim())
        .map(([name]) => name);
      if (missing.length > 0) {
        throw new AccessVerificationError(
          `Missing callback probe configuration: ${missing.join(', ')}.`,
          'callback-config'
        );
      }
    }
  }

  const baseHost = normalizeHost(targetHost);
  const protectedReleaseId = releaseId || 'preflight_missing_release';
  const protectedAttemptId = attemptId || 'preflight_missing_attempt';
  log(`[verify-access-staging] Target Host: ${baseHost} (${dryRun ? 'mode: DRY-RUN / mock stub' : 'mode: LIVE staging'})`);

  const results = {
    case1: {},
    case2: {},
    case3: {},
    case4: {},
  };

  try {
    // =========================================================================
    // CASE 1: Unauthenticated Admin / API Access
    // =========================================================================
    log('\n[verify-access-staging] === Case 1: Unauthenticated Admin/API Access ===');

    // 1.1 Query GET /earth without auth headers
    const earthUrl = `${baseHost}/earth`;
    log(`[verify-access-staging] Step 1.1: GET /earth (unauthenticated)...`);
    const earthRes = await fetch(earthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const isEarthStatusAllowed = [401, 403, 302].includes(earthRes.status);
    if (!isEarthStatusAllowed) {
      throw new AccessVerificationError(
        `Case 1.1 FAILED: GET /earth returned HTTP ${earthRes.status} without authentication (expected 401, 403, or 302 redirect). Admin route is not properly protected!`,
        'case1-earth-unauthenticated',
        earthRes.status
      );
    }

    const redirectLocation = earthRes.headers.get('location');
    const earthDetail = earthRes.status === 302
      ? `HTTP 302 Redirect to ${redirectLocation || 'Cloudflare Access login'}`
      : `HTTP ${earthRes.status}`;
    log(`[verify-access-staging] Step 1.1: PASSED (${earthDetail})`);
    results.case1.earth = { status: earthRes.status, location: redirectLocation, passed: true };

    // 1.2 Query GET /earth/api/posts without auth headers
    const apiPostsUrl = `${baseHost}/earth/api/posts`;
    log(`[verify-access-staging] Step 1.2: GET /earth/api/posts (unauthenticated)...`);
    const apiRes = await fetch(apiPostsUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const isApiStatusAllowed = [401, 403, 302].includes(apiRes.status);
    if (!isApiStatusAllowed) {
      throw new AccessVerificationError(
        `Case 1.2 FAILED: GET /earth/api/posts returned HTTP ${apiRes.status} without authentication (expected 401, 403, or 302 redirect). CMS API is not properly protected!`,
        'case1-api-unauthenticated',
        apiRes.status
      );
    }
    log(`[verify-access-staging] Step 1.2: PASSED (HTTP ${apiRes.status})`);
    results.case1.api = { status: apiRes.status, passed: true };

    // 1.3 Verify both POST callback routes reject requests before processing
    // their payload when no Access/callback credentials are supplied. Synthetic
    // IDs keep this non-mutating even if a backend is unexpectedly reachable.
    results.case1.callbacks = {};
    for (const outcome of ['confirm', 'fail']) {
      const probe = createCallbackProbe({
        outcome,
        releaseId: protectedReleaseId,
        attemptId: protectedAttemptId,
        callbackSecret: '',
        providerDeploymentId: 'preflight-protected-route-check',
      });
      log(`[verify-access-staging] Step 1.3: POST ${probe.path} (unauthenticated)...`);
      const callbackRes = await fetch(`${baseHost}${probe.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(probe.payload),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (![401, 403, 302].includes(callbackRes.status)) {
        throw new AccessVerificationError(
          `Case 1.3 FAILED: POST ${probe.path} returned HTTP ${callbackRes.status} without authentication (expected 401, 403, or 302). Callback route is not properly protected!`,
          `case1-callback-${outcome}-unauthenticated`,
          callbackRes.status
        );
      }
      log(`[verify-access-staging] Step 1.3: PASSED (${outcome}: HTTP ${callbackRes.status})`);
      results.case1.callbacks[outcome] = { status: callbackRes.status, passed: true };
    }

    // =========================================================================
    // CASE 2: Authenticated via Access Service Token / Assertion
    // =========================================================================
    log('\n[verify-access-staging] === Case 2: Authenticated via Access Service Token / Assertion ===');

    const authHeaders = {};
    if (clientId && clientSecret) {
      authHeaders['CF-Access-Client-Id'] = clientId;
      authHeaders['CF-Access-Client-Secret'] = clientSecret;
    }
    if (jwtAssertion) {
      authHeaders['Cf-Access-Jwt-Assertion'] = jwtAssertion;
    }

    // 2.1 Query GET /earth with auth headers
    log(`[verify-access-staging] Step 2.1: GET /earth (authenticated)...`);
    const authEarthRes = await fetch(earthUrl, {
      method: 'GET',
      headers: authHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (authEarthRes.status !== 200) {
      throw new AccessVerificationError(
        `Case 2.1 FAILED: Authenticated GET /earth returned HTTP ${authEarthRes.status} (expected 200 OK). Access credentials were not accepted or route failed.`,
        'case2-earth-authenticated',
        authEarthRes.status
      );
    }
    log(`[verify-access-staging] Step 2.1: PASSED (HTTP 200 OK)`);
    results.case2.earth = { status: authEarthRes.status, passed: true };

    // 2.2 Query GET /earth/api/posts with auth headers
    log(`[verify-access-staging] Step 2.2: GET /earth/api/posts (authenticated)...`);
    const authApiRes = await fetch(apiPostsUrl, {
      method: 'GET',
      headers: authHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (authApiRes.status !== 200) {
      throw new AccessVerificationError(
        `Case 2.2 FAILED: Authenticated GET /earth/api/posts returned HTTP ${authApiRes.status} (expected 200 OK).`,
        'case2-api-authenticated',
        authApiRes.status
      );
    }
    log(`[verify-access-staging] Step 2.2: PASSED (HTTP 200 OK)`);
    results.case2.api = { status: authApiRes.status, passed: true };

    // =========================================================================
    // CASE 3: Public Route Bypass
    // =========================================================================
    log('\n[verify-access-staging] === Case 3: Public Route Bypass ===');

    let testedPublicPath = publicPath;
    let publicUrl = `${baseHost}${testedPublicPath.startsWith('/') ? testedPublicPath : `/${testedPublicPath}`}`;
    log(`[verify-access-staging] Step 3.1: GET ${testedPublicPath} (public route without auth)...`);

    let pubRes = await fetch(publicUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    // If specific article returns 404 in live environment (e.g. unseeded), attempt fallback to public root /
    if (pubRes.status === 404 && testedPublicPath !== '/') {
      log(`[verify-access-staging] Notice: ${testedPublicPath} returned 404 Not Found. Attempting fallback to public root /`);
      testedPublicPath = '/';
      publicUrl = `${baseHost}/`;
      pubRes = await fetch(publicUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    }

    if (pubRes.status === 401 || pubRes.status === 403 || pubRes.status === 302) {
      throw new AccessVerificationError(
        `Case 3 FAILED: Public route ${testedPublicPath} returned HTTP ${pubRes.status}. Public routes must NOT be intercepted by Cloudflare Access or auth middleware!`,
        'case3-public-blocked',
        pubRes.status
      );
    }

    if (pubRes.status !== 200) {
      throw new AccessVerificationError(
        `Case 3 FAILED: Public route ${testedPublicPath} returned HTTP ${pubRes.status} (expected 200 OK).`,
        'case3-public-status',
        pubRes.status
      );
    }

    log(`[verify-access-staging] Step 3.1: PASSED (HTTP 200 OK for ${testedPublicPath})`);
    results.case3.publicRoute = { path: testedPublicPath, status: pubRes.status, passed: true };

    // =========================================================================
    // CASE 4: Authenticated release callback (dry-run by default; live opt-in)
    // =========================================================================
    if (callbackMode !== 'none') {
      log('\n[verify-access-staging] === Case 4: Authenticated Release Callback ===');
      const outcomes = callbackMode === 'all' ? ['confirm', 'fail'] : [callbackMode];
      for (const outcome of outcomes) {
        const probe = createCallbackProbe({
          outcome,
          releaseId,
          attemptId,
          callbackSecret,
          providerDeploymentId,
          workflowRunId,
          errorMessage,
        });
        log(`[verify-access-staging] Step 4: POST ${probe.path} (${outcome})...`);
        const callbackRes = await fetch(`${baseHost}${probe.path}`, {
          method: 'POST',
          headers: { ...authHeaders, ...probe.headers },
          body: JSON.stringify(probe.payload),
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        const responseText = await callbackRes.text();
        let responseBody = null;
        try {
          responseBody = responseText ? JSON.parse(responseText) : null;
        } catch {
          // The assertion below reports a concise contract failure.
        }
        if (callbackRes.status !== 200 || !probe.assert(responseBody)) {
          throw new AccessVerificationError(
            `Case 4 FAILED: ${outcome} callback returned HTTP ${callbackRes.status} with an unexpected response contract (expected release.status=${outcome === 'confirm' ? 'live' : 'failed'}).`,
            `case4-callback-${outcome}`,
            callbackRes.status
          );
        }
        log(`[verify-access-staging] Step 4: PASSED (${outcome}: HTTP 200, release.status=${responseBody.release.status})`);
        results.case4[outcome] = {
          status: callbackRes.status,
          releaseStatus: responseBody.release.status,
          passed: true,
        };
      }
    } else {
      log('\n[verify-access-staging] Case 4: SKIPPED (live callback mutation requires --callback confirm|fail)');
      results.case4.skipped = true;
    }

    log('\n[verify-access-staging] All Zero Trust staging access verifications PASSED successfully.');
    return {
      success: true,
      host: baseHost,
      dryRun,
      results,
    };
  } finally {
    if (serverInstance) {
      await new Promise((resolveClose) => serverInstance.close(resolveClose));
    }
  }
}

/**
 * Parses CLI arguments.
 *
 * @param {string[]} args
 * @returns {Record<string, any>}
 */
export function parseCliArgs(args) {
  const options = {
    host: '',
    dryRun: false,
    clientId: '',
    clientSecret: '',
    jwtAssertion: '',
    publicPath: '/articles/cloudflare-cms-architecture',
    callbackMode: '',
    releaseId: '',
    attemptId: '',
    providerDeploymentId: '',
    workflowRunId: '',
    errorMessage: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host' && args[i + 1]) {
      options.host = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--client-id' && args[i + 1]) {
      options.clientId = args[++i];
    } else if (arg === '--client-secret' && args[i + 1]) {
      options.clientSecret = args[++i];
    } else if (arg === '--jwt' && args[i + 1]) {
      options.jwtAssertion = args[++i];
    } else if (arg === '--public-path' && args[i + 1]) {
      options.publicPath = args[++i];
    } else if (arg === '--callback' && args[i + 1]) {
      options.callbackMode = args[++i];
    } else if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[++i];
    } else if (arg === '--attempt-id' && args[i + 1]) {
      options.attemptId = args[++i];
    } else if (arg === '--provider-deployment-id' && args[i + 1]) {
      options.providerDeploymentId = args[++i];
    } else if (arg === '--workflow-run-id' && args[i + 1]) {
      options.workflowRunId = args[++i];
    } else if (arg === '--error-message' && args[i + 1]) {
      options.errorMessage = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/build/verify-access-staging.mjs [options]

Zero Trust Verification Script for Cloudflare Staging.

Options:
  --host <url>           Target host (default: ${DEFAULT_STAGING_HOST}; CMS_STAGING_HOST overrides)
  --dry-run              Verify assertions locally using mock stub server
  --client-id <id>       Access Service Token Client ID (or CF_ACCESS_CLIENT_ID env var)
  --client-secret <sec>  Access Service Token Client Secret (or CF_ACCESS_CLIENT_SECRET env var)
  --jwt <assertion>      Access JWT assertion header (or CF_ACCESS_JWT_ASSERTION env var)
  --public-path <path>   Public route path to test (default: /articles/cloudflare-cms-architecture)
  --callback <mode>      none, confirm, or fail (dry-run defaults to both callbacks)
  --release-id <id>      Existing release ID (or CMS_RELEASE_ID) for callback verification
  --attempt-id <id>      Existing attempt ID (or CMS_ATTEMPT_ID) for callback verification
  RELEASE_CALLBACK_SECRET must be provided through the environment for live callbacks.
  --provider-deployment-id <id>
                         Provider deployment ID (or CMS_PROVIDER_DEPLOYMENT_ID) for confirm
  --workflow-run-id <id> Optional workflow run ID (or GITHUB_RUN_ID)
  --error-message <text> Failure message payload for fail
  --help, -h             Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  (async () => {
    try {
      const options = parseCliArgs(process.argv.slice(2));
      await verifyAccessStaging(options);
      process.exit(0);
    } catch (err) {
      if (err instanceof AccessVerificationError) {
        console.error(`\n[verify-access-staging] FAILED [${err.caseName}]: ${err.message}`);
      } else {
        console.error(`\n[verify-access-staging] UNEXPECTED ERROR:`, err.message || err);
      }
      process.exit(1);
    }
  })();
}
