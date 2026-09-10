import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import test from 'node:test';
import { AccessDenied, assertMutationOrigin, verifyAccessRequest } from '../src/lib/access.ts';

const issuer = 'https://frong-test.cloudflareaccess.com';
const audience = 'test-audience';
const owner = 'owner@frong.me';
const config = {
  CF_ACCESS_TEAM_DOMAIN: issuer,
  CF_ACCESS_AUD: audience,
  CF_ACCESS_ALLOWED_EMAIL: owner,
};

async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const sign = (claims = {}, options = {}) =>
    new SignJWT({ email: owner, type: 'app', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(options.issuer ?? issuer)
      .setAudience(options.audience ?? audience)
      .setSubject('owner-subject')
      .setIssuedAt()
      .setExpirationTime(options.expiration ?? '5m')
      .sign(privateKey);
  const verify = async (token, _remote, options) => {
    const { createLocalJWKSet, jwtVerify } = await import('jose');
    return jwtVerify(token, createLocalJWKSet({ keys: [jwk] }), options);
  };
  return { sign, verify };
}

test('accepts a signed owner application JWT', async () => {
  const { sign, verify } = await fixture();
  const request = new Request('https://cms-staging.frong.me/earth', {
    headers: { 'cf-access-jwt-assertion': await sign() },
  });
  assert.deepEqual(await verifyAccessRequest(request, config, verify), {
    email: owner,
    subject: 'owner-subject',
  });
});

test('fails closed for missing config or token', async () => {
  await assert.rejects(
    verifyAccessRequest(new Request('https://example.com/earth'), { ...config, CF_ACCESS_AUD: '' }),
    (error) => error instanceof AccessDenied && error.status === 503,
  );
  await assert.rejects(
    verifyAccessRequest(new Request('https://example.com/earth'), config),
    (error) => error instanceof AccessDenied && error.status === 401,
  );
});

test('rejects wrong issuer, audience, expiry, token type, and owner', async () => {
  const { sign, verify } = await fixture();
  const cases = [
    await sign({}, { issuer: 'https://wrong.cloudflareaccess.com' }),
    await sign({}, { audience: 'wrong-audience' }),
    await sign({}, { expiration: 0 }),
    await sign({ type: 'org' }),
    await sign({ email: 'someone@example.com' }),
  ];
  for (const token of cases) {
    await assert.rejects(
      verifyAccessRequest(
        new Request('https://example.com/earth', { headers: { 'cf-access-jwt-assertion': token } }),
        config,
        verify,
      ),
      AccessDenied,
    );
  }
});

test('requires exact Origin for mutations', () => {
  assert.throws(
    () => assertMutationOrigin(new Request('https://example.com/earth', { method: 'POST' }), 'https://cms-staging.frong.me'),
    AccessDenied,
  );
  assert.doesNotThrow(() =>
    assertMutationOrigin(
      new Request('https://example.com/earth', {
        method: 'POST',
        headers: { origin: 'https://cms-staging.frong.me' },
      }),
      'https://cms-staging.frong.me',
    ),
  );
});
