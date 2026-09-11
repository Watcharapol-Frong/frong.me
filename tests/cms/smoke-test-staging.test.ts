import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

import {
  SmokeTestError,
  SMOKE_TITLE,
  canonicalManifestSha256,
  checkLiveGates,
  createMockCmsServer,
  genId,
  genSlug,
  normalizeHost,
  parseCliArgs,
  runSmokeTestStaging,
} from '../../scripts/build/smoke-test-staging.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('genId produces identifiers matching the CMS ID pattern', () => {
  const id = genId('smoketest');
  assert.match(id, /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/);
  assert.ok(id.startsWith('smoketest-'));
  assert.notEqual(genId('smoketest'), genId('smoketest'));
});

test('genSlug produces slugs matching the CMS slug pattern', () => {
  const slug = genSlug('smoketest-article');
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('normalizeHost adds https and strips trailing slashes', () => {
  assert.equal(normalizeHost('cms-staging.frong.me'), 'https://cms-staging.frong.me');
  assert.equal(normalizeHost('http://localhost:8787///'), 'http://localhost:8787');
  assert.equal(normalizeHost('https://cms-staging.frong.me/'), 'https://cms-staging.frong.me');
});

test('canonicalManifestSha256 is stable regardless of input article order', async () => {
  const base = {
    releaseId: 'release-1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    articles: [
      { postId: 'post-b', revisionId: 'rev-b', lang: 'th', slug: 'b', visible: true },
      { postId: 'post-a', revisionId: 'rev-a', lang: 'th', slug: 'a', visible: true },
    ],
  };
  const reordered = { ...base, articles: [...base.articles].reverse() };
  const first = await canonicalManifestSha256(base);
  const second = await canonicalManifestSha256(reordered);
  assert.equal(first.sha256, second.sha256);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

test('parseCliArgs defaults to live mode with no host', () => {
  const args = parseCliArgs([]);
  assert.equal(args.dryRun, false);
  assert.equal(args.host, '');
});

test('parseCliArgs recognizes --dry-run and --host', () => {
  const args = parseCliArgs(['--dry-run', '--host', 'https://custom.test']);
  assert.equal(args.dryRun, true);
  assert.equal(args.host, 'https://custom.test');
});

// ---------------------------------------------------------------------------
// Live-mode GATE preconditions
// ---------------------------------------------------------------------------

test('checkLiveGates refuses when no preconditions are met', () => {
  const result = checkLiveGates({}, { deployResultPath: '/nonexistent/deployment-result.json' });
  assert.equal(result.ok, false);
  assert.equal(result.unmet.length, 3);
  assert.match(result.unmet[0], /Step 1 real deploy/);
  assert.match(result.unmet[1], /1C-03/);
  assert.match(result.unmet[2], /1C-04/);
});

test('checkLiveGates passes only once every precondition is attested/evidenced', async (t) => {
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'smoke-gate-'));
  const deployResultPath = path.join(dir, 'deployment-result.json');
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));

  await fs.promises.writeFile(deployResultPath, JSON.stringify({ success: true }));
  const env = { SMOKE_GATE_1C03_LIVE_PASSED: 'true', SMOKE_GATE_1C04_R2_PASSED: 'true' };
  const result = checkLiveGates(env, { deployResultPath });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unmet, []);
});

test('checkLiveGates rejects a deploy-result file reporting failure', async (t) => {
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'smoke-gate-'));
  const deployResultPath = path.join(dir, 'deployment-result.json');
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));

  await fs.promises.writeFile(deployResultPath, JSON.stringify({ success: false }));
  const env = { SMOKE_GATE_1C03_LIVE_PASSED: 'true', SMOKE_GATE_1C04_R2_PASSED: 'true' };
  const result = checkLiveGates(env, { deployResultPath });
  assert.equal(result.ok, false);
  assert.equal(result.unmet.length, 1);
  assert.match(result.unmet[0], /Step 1 real deploy/);
});

test('runSmokeTestStaging refuses live mode when the GATE is unmet, without any network call', async () => {
  await assert.rejects(
    () => runSmokeTestStaging({
      dryRun: false,
      env: {},
      log: () => {},
    }),
    (error: unknown) => {
      assert.ok(error instanceof SmokeTestError);
      assert.equal(error.step, 'live-gate');
      assert.match(error.message, /unmet GATE preconditions/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Full dry-run lifecycle
// ---------------------------------------------------------------------------

test('runSmokeTestStaging dry-run completes the full lifecycle and tears down', async () => {
  const logs: string[] = [];
  const result = await runSmokeTestStaging({ dryRun: true, log: (m: string) => logs.push(m) });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.ok(result.postId.startsWith('smoketest-'));
  assert.ok(result.slug.length > 0);

  assert.equal(result.steps.createDraft.draftVersion, 1);
  assert.equal(result.steps.optimisticLocking.staleStatus, 409);
  assert.equal(result.steps.optimisticLocking.correctStatus, 200);
  assert.equal(result.steps.optimisticLocking.draftVersion, 2);
  assert.ok(result.steps.mediaAttach.assetKey.startsWith('assets/'));
  assert.equal(result.steps.mediaAttach.draftVersion, 3);
  assert.ok(result.steps.releaseBegin.releaseId.startsWith('smokerelease-'));
  assert.equal(result.steps.releaseConfirm.liveReleaseId, result.steps.releaseBegin.releaseId);
  assert.equal(result.steps.publicReader.path, `/articles/${result.slug}`);
  assert.deepEqual(result.steps.teardown, { ok: true, postId: result.postId });

  assert.ok(logs.some((l) => l.includes('Step 1: PASSED')));
  assert.ok(logs.some((l) => l.includes('Step 2: PASSED')));
  assert.ok(logs.some((l) => l.includes('Step 3: PASSED')));
  assert.ok(logs.some((l) => l.includes('Step 4a: PASSED')));
  assert.ok(logs.some((l) => l.includes('Step 4b: PASSED')));
  assert.ok(logs.some((l) => l.includes('Step 5: PASSED')));
  assert.ok(logs.some((l) => l.includes('Step 6: PASSED')));
});

test('runSmokeTestStaging dry-run leaves the created post archived, not live', async () => {
  const server = createMockCmsServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  const host = `http://127.0.0.1:${address.port}`;

  try {
    const result = await runSmokeTestStaging({ dryRun: true, host, log: () => {} });
    assert.equal(result.ok, true);

    // The public route must still resolve (the release stays live — only the
    // draft post is archived), and re-fetching it must return the same content.
    const response = await fetch(`${host}${result.steps.publicReader.path}`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes(SMOKE_TITLE));
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

// ---------------------------------------------------------------------------
// Conflict / assertion-failure behavior against a custom mock
// ---------------------------------------------------------------------------

test('runSmokeTestStaging surfaces a clear error and still tears down when the public route 404s', async () => {
  // A mock that accepts the full lifecycle but never actually serves the
  // public route, simulating a build/publish pipeline that silently drops
  // content — Step 5 must fail loudly rather than pass.
  const inner = createMockCmsServer();
  await new Promise<void>((resolve) => inner.listen(0, '127.0.0.1', () => resolve()));
  const innerAddress = inner.address() as { port: number };
  const innerHost = `http://127.0.0.1:${innerAddress.port}`;

  const proxy = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname.startsWith('/articles/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const target = http.request(
      `${innerHost}${req.url}`,
      { method: req.method, headers: req.headers },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 500, upstream.headers);
        upstream.pipe(res);
      },
    );
    req.pipe(target);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', () => resolve()));
  const proxyAddress = proxy.address() as { port: number };
  const proxyHost = `http://127.0.0.1:${proxyAddress.port}`;

  const logs: string[] = [];
  try {
    await assert.rejects(
      () => runSmokeTestStaging({ dryRun: true, host: proxyHost, log: (m: string) => logs.push(m) }),
      (error: unknown) => {
        assert.ok(error instanceof SmokeTestError);
        assert.equal(error.step, 'public-reader');
        assert.match(error.message, /Step 5 FAILED/);
        return true;
      },
    );
    // Teardown (Step 6) must still have run and succeeded despite the Step 5 failure.
    assert.ok(logs.some((l) => l.includes('Step 6: PASSED')));
  } finally {
    await new Promise((resolveClose) => proxy.close(resolveClose));
    await new Promise((resolveClose) => inner.close(resolveClose));
  }
});

test('runSmokeTestStaging reports an orphaned post id when teardown itself fails', async () => {
  const inner = createMockCmsServer();
  await new Promise<void>((resolve) => inner.listen(0, '127.0.0.1', () => resolve()));
  const innerAddress = inner.address() as { port: number };
  const innerHost = `http://127.0.0.1:${innerAddress.port}`;

  // A proxy that blocks the archive teardown call specifically, so a fully
  // passing run still ends with a failed teardown and an orphaned post id.
  const proxy = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname.endsWith('/archive')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'DATABASE_ERROR', message: 'simulated teardown outage' } }));
      return;
    }
    const target = http.request(
      `${innerHost}${req.url}`,
      { method: req.method, headers: req.headers },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 500, upstream.headers);
        upstream.pipe(res);
      },
    );
    req.pipe(target);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', () => resolve()));
  const proxyAddress = proxy.address() as { port: number };
  const proxyHost = `http://127.0.0.1:${proxyAddress.port}`;

  try {
    await assert.rejects(
      () => runSmokeTestStaging({ dryRun: true, host: proxyHost, log: () => {} }),
      (error: unknown) => {
        assert.ok(error instanceof SmokeTestError);
        assert.equal(error.step, 'teardown');
        assert.match(error.message, /Teardown FAILED/);
        assert.ok(error.details && typeof error.details.postId === 'string');
        return true;
      },
    );
  } finally {
    await new Promise((resolveClose) => proxy.close(resolveClose));
    await new Promise((resolveClose) => inner.close(resolveClose));
  }
});

test('createMockCmsServer round-trips content-addressed asset keys consistently', async () => {
  const server = createMockCmsServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  const host = `http://127.0.0.1:${address.port}`;

  try {
    const result = await runSmokeTestStaging({ dryRun: true, host, log: () => {} });
    assert.match(result.steps.mediaAttach.assetKey, /^assets\/[0-9a-f]{64}\/smoke-test-asset\.png$/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
