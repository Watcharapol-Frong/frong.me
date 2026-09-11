import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from 'jose';

import {
  createEarthMiddleware,
  isAccessDevBypassEnabled,
  isEarthRoute,
} from '../../src/server/cms/access-guard.ts';
import { verifyAccessJwt, type AccessEnvironment } from '../../src/server/cms/access.ts';

const TEAM_DOMAIN = 'test-team.cloudflareaccess.com';
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUDIENCE = 'test-access-audience';
const environment: AccessEnvironment = {
  CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  CF_ACCESS_AUD: AUDIENCE,
};

function context(pathname: string, env: AccessEnvironment, token?: string) {
  const headers = token ? { 'Cf-Access-Jwt-Assertion': token } : undefined;
  return {
    url: new URL(`https://example.test${pathname}`),
    request: new Request(`https://example.test${pathname}`, { headers }),
    locals: { runtime: { env } },
  } as never;
}

function middleware(jwks: JWTVerifyGetKey, isDev = false) {
  return createEarthMiddleware({
    isDev,
    verify: (assertion, env) => verifyAccessJwt(assertion, env, jwks),
  });
}

async function signingFixture() {
  const valid = await generateKeyPair('RS256');
  const forged = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(valid.publicKey);
  const jwks = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: 'RS256', kid: 'valid-key', use: 'sig' }],
  });

  async function sign(
    privateKey: CryptoKey,
    expiresIn: string | number = '5m',
    audience = AUDIENCE,
  ) {
    return new SignJWT({ type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'valid-key' })
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setSubject('test-user')
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }

  return { valid, forged, jwks, sign };
}

test('route matcher protects only /earth and its descendants', async () => {
  assert.equal(isEarthRoute('/earth'), true);
  assert.equal(isEarthRoute('/earth/'), true);
  assert.equal(isEarthRoute('/earth/api/posts'), true);
  assert.equal(isEarthRoute('/'), false);
  assert.equal(isEarthRoute('/articles/public-post'), false);
  assert.equal(isEarthRoute('/earthquake'), false);

  let verificationCalls = 0;
  const handler = createEarthMiddleware({
    isDev: false,
    verify: async () => {
      verificationCalls += 1;
      return {};
    },
  });
  const response = await handler(context('/articles/public-post', {}), async () => new Response('public'));
  assert.equal(response?.status, 200);
  assert.equal(await response?.text(), 'public');
  assert.equal(verificationCalls, 0);
});

test('missing Access assertion is rejected without internal detail', async () => {
  const { jwks } = await signingFixture();
  const response = await middleware(jwks)(context('/earth', environment), async () => new Response('private'));

  assert.equal(response?.status, 401);
  assert.deepEqual(await response?.json(), { error: 'Unauthorized' });
  assert.equal(response?.headers.get('cache-control'), 'no-store');
});

test('forged, expired, and wrong-audience Access assertions are rejected', async () => {
  const { forged, jwks, sign, valid } = await signingFixture();
  const forgedToken = await sign(forged.privateKey);
  const expiredToken = await sign(valid.privateKey, 0);
  const wrongAudienceToken = await sign(valid.privateKey, '5m', 'different-audience');

  for (const token of [forgedToken, expiredToken, wrongAudienceToken]) {
    const response = await middleware(jwks)(
      context('/earth/api/posts', environment, token),
      async () => new Response('private'),
    );
    assert.equal(response?.status, 403);
    assert.deepEqual(await response?.json(), { error: 'Forbidden' });
  }
});

test('valid mock-signed Access assertion reaches the protected route', async () => {
  const { jwks, sign, valid } = await signingFixture();
  const token = await sign(valid.privateKey);
  const response = await middleware(jwks)(
    context('/earth/api/posts', environment, token),
    async () => new Response('private'),
  );

  assert.equal(response?.status, 200);
  assert.equal(await response?.text(), 'private');
});

test('development bypass requires both DEV and the exact true setting', async () => {
  assert.equal(isAccessDevBypassEnabled(true, 'true'), true);
  assert.equal(isAccessDevBypassEnabled(true, 'TRUE'), false);
  assert.equal(isAccessDevBypassEnabled(true, undefined), false);
  assert.equal(isAccessDevBypassEnabled(false, 'true'), false);

  const next = async () => new Response('bypassed');
  const enabled = await createEarthMiddleware({ isDev: true })(
    context('/earth', { ENABLE_ACCESS_DEV_BYPASS: 'true' }),
    next,
  );
  assert.equal(enabled?.status, 200);

  const production = await createEarthMiddleware({ isDev: false })(
    context('/earth', { ENABLE_ACCESS_DEV_BYPASS: 'true' }),
    next,
  );
  assert.equal(production?.status, 401);
});
