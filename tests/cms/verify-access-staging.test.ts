import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  verifyAccessStaging,
  parseCliArgs,
  normalizeHost,
  createMockAccessServer,
  AccessVerificationError,
} from '../../scripts/build/verify-access-staging.mjs';

describe('scripts/build/verify-access-staging.mjs', () => {
  it('parses CLI arguments correctly', () => {
    const args = [
      '--host', 'https://custom-staging.frong.me',
      '--dry-run',
      '--client-id', 'test-id',
      '--client-secret', 'test-secret',
      '--jwt', 'test-jwt',
      '--public-path', '/articles/test-article',
    ];
    const options = parseCliArgs(args);
    assert.equal(options.host, 'https://custom-staging.frong.me');
    assert.equal(options.dryRun, true);
    assert.equal(options.clientId, 'test-id');
    assert.equal(options.clientSecret, 'test-secret');
    assert.equal(options.jwtAssertion, 'test-jwt');
    assert.equal(options.publicPath, '/articles/test-article');
  });

  it('normalizes host URLs properly', () => {
    assert.equal(normalizeHost('cms-staging.frong.me'), 'https://cms-staging.frong.me');
    assert.equal(normalizeHost('cms-staging.frong.me/'), 'https://cms-staging.frong.me');
    assert.equal(normalizeHost('http://localhost:8787///'), 'http://localhost:8787');
    assert.equal(normalizeHost('https://cms-staging.frong.me'), 'https://cms-staging.frong.me');
  });

  it('completes all 3 cases in --dry-run mode against mock server', async () => {
    const logs: string[] = [];
    const result = await verifyAccessStaging({
      dryRun: true,
      log: (msg: string) => logs.push(msg),
    });

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.results.case1.earth.status, 302);
    assert.equal(result.results.case1.api.status, 401);
    assert.equal(result.results.case2.earth.status, 200);
    assert.equal(result.results.case2.api.status, 200);
    assert.equal(result.results.case3.publicRoute.status, 200);

    assert.ok(logs.some((l) => l.includes('Case 1: Unauthenticated Admin/API Access')));
    assert.ok(logs.some((l) => l.includes('Case 2: Authenticated via Access Service Token / Assertion')));
    assert.ok(logs.some((l) => l.includes('Case 3: Public Route Bypass')));
    assert.ok(logs.some((l) => l.includes('All Zero Trust staging access verifications PASSED successfully')));
  });

  it('fails Case 1 if /earth is accessible without authentication (returns 200)', async () => {
    const brokenServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('Vulnerable Admin');
    });

    await new Promise<void>((resolve) => brokenServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (brokenServer.address() as any).port;
    const host = `http://127.0.0.1:${port}`;

    try {
      await assert.rejects(
        async () => {
          await verifyAccessStaging({
            host,
            dryRun: true,
            log: () => {},
          });
        },
        (err: any) => {
          assert.ok(err instanceof AccessVerificationError);
          assert.equal(err.caseName, 'case1-earth-unauthenticated');
          assert.equal(err.statusCode, 200);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => brokenServer.close(resolve));
    }
  });

  it('fails Case 1 if /earth/api/posts is accessible without authentication', async () => {
    const brokenServer = http.createServer((req, res) => {
      if (req.url === '/earth') {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });

    await new Promise<void>((resolve) => brokenServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (brokenServer.address() as any).port;
    const host = `http://127.0.0.1:${port}`;

    try {
      await assert.rejects(
        async () => {
          await verifyAccessStaging({
            host,
            dryRun: true,
            log: () => {},
          });
        },
        (err: any) => {
          assert.ok(err instanceof AccessVerificationError);
          assert.equal(err.caseName, 'case1-api-unauthenticated');
          assert.equal(err.statusCode, 200);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => brokenServer.close(resolve));
    }
  });

  it('fails in live mode if credentials are missing', async () => {
    await assert.rejects(
      async () => {
        await verifyAccessStaging({
          host: 'https://cms-staging.frong.me',
          dryRun: false,
          env: {}, // no CF_ACCESS_CLIENT_ID or secret
          log: () => {},
        });
      },
      (err: any) => {
        assert.ok(err instanceof AccessVerificationError);
        assert.equal(err.caseName, 'missing-credentials');
        return true;
      }
    );
  });

  it('fails Case 2 if authenticated request is rejected (403)', async () => {
    const rejectingServer = http.createServer((req, res) => {
      const url = req.url || '';
      if (url.startsWith('/earth')) {
        // Reject all requests
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(200);
      res.end();
    });

    await new Promise<void>((resolve) => rejectingServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (rejectingServer.address() as any).port;
    const host = `http://127.0.0.1:${port}`;

    try {
      await assert.rejects(
        async () => {
          await verifyAccessStaging({
            host,
            dryRun: false,
            clientId: 'bad-id',
            clientSecret: 'bad-secret',
            log: () => {},
          });
        },
        (err: any) => {
          assert.ok(err instanceof AccessVerificationError);
          assert.equal(err.caseName, 'case2-earth-authenticated');
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => rejectingServer.close(resolve));
    }
  });

  it('fails Case 3 if public route is accidentally protected (302/401/403)', async () => {
    const overzealousServer = http.createServer((req, res) => {
      const url = req.url || '';
      if (url === '/earth') {
        if (req.headers['cf-access-client-id'] === 'id') {
          res.writeHead(200);
          res.end();
        } else {
          res.writeHead(302, { Location: 'https://login.cloudflareaccess.com' });
          res.end();
        }
        return;
      }
      if (url === '/earth/api/posts') {
        if (req.headers['cf-access-client-id'] === 'id') {
          res.writeHead(200);
          res.end();
        } else {
          res.writeHead(401);
          res.end();
        }
        return;
      }
      // Public route incorrectly protected by Access
      res.writeHead(302, { Location: 'https://login.cloudflareaccess.com' });
      res.end();
    });

    await new Promise<void>((resolve) => overzealousServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (overzealousServer.address() as any).port;
    const host = `http://127.0.0.1:${port}`;

    try {
      await assert.rejects(
        async () => {
          await verifyAccessStaging({
            host,
            dryRun: false,
            clientId: 'id',
            clientSecret: 'secret',
            log: () => {},
          });
        },
        (err: any) => {
          assert.ok(err instanceof AccessVerificationError);
          assert.equal(err.caseName, 'case3-public-blocked');
          assert.equal(err.statusCode, 302);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => overzealousServer.close(resolve));
    }
  });

  it('Case 3 falls back to public root / if specific article returns 404', async () => {
    const fallbackServer = http.createServer((req, res) => {
      const url = req.url || '';
      if (url === '/earth' || url === '/earth/api/posts') {
        const hasAuth = req.headers['cf-access-client-id'] === 'valid-id';
        res.writeHead(hasAuth ? 200 : 401);
        res.end();
        return;
      }
      if (url === '/articles/missing-article') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      if (url === '/') {
        res.writeHead(200);
        res.end('Public Home');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => fallbackServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (fallbackServer.address() as any).port;
    const host = `http://127.0.0.1:${port}`;

    try {
      const logs: string[] = [];
      const result = await verifyAccessStaging({
        host,
        dryRun: false,
        clientId: 'valid-id',
        clientSecret: 'valid-secret',
        publicPath: '/articles/missing-article',
        log: (msg: string) => logs.push(msg),
      });

      assert.equal(result.success, true);
      assert.equal(result.results.case3.publicRoute.path, '/');
      assert.equal(result.results.case3.publicRoute.status, 200);
      assert.ok(logs.some((l) => l.includes('fallback to public root /')));
    } finally {
      await new Promise((resolve) => fallbackServer.close(resolve));
    }
  });
});

