import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GET as robots } from '../../src/pages/robots.txt.ts';
import { isPublicSearchHost } from '../../src/lib/search-policy.ts';
import { applySearchHeaders } from '../../src/server/search-policy.ts';
import { createEarthMiddleware } from '../../src/server/cms/access-guard.ts';

test('production robots permits search and keeps every named bot in the private-path group', async () => {
  const response = await robots({ url: new URL('https://frong.me/robots.txt') } as never);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /^text\/plain/);
  const text = await response.text();
  const [group] = text.split('\n\n');
  for (const agent of ['*', 'Googlebot', 'Bingbot', 'OAI-SearchBot', 'Claude-SearchBot']) {
    assert.ok(group.includes(`User-agent: ${agent}\n`));
  }
  assert.match(group, /Allow: \/\nDisallow: \/earth\$\nDisallow: \/earth\//);
  assert.match(text, /Sitemap: https:\/\/frong.me\/sitemap-index.xml/);
  assert.match(text, /Sitemap: https:\/\/frong.me\/articles-sitemap.xml/);
});

test('staging and other hosts block discovery without advertising production sitemaps', async () => {
  for (const host of ['frong-me-staging.frongbook.workers.dev', 'frong-me.frongbook.workers.dev', 'frong.me.attacker.test', 'localhost']) {
    const url = new URL(`https://${host}/robots.txt`);
    assert.equal(isPublicSearchHost(url), false);
    const response = await robots({ url } as never);
    assert.equal(await response.text(), 'User-agent: *\nDisallow: /\n');
  }
});

test('search headers preserve indexable production and existing explicit noindex directives', () => {
  const publicResponse = new Response('article', { headers: { 'cache-control': 'public, max-age=60' } });
  assert.equal(applySearchHeaders(new URL('https://frong.me/articles/story'), publicResponse), publicResponse);
  const error = new Response('missing', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
  assert.equal(applySearchHeaders(new URL('https://frong.me/missing'), error).headers.get('X-Robots-Tag'), 'noindex');
});

test('SSR aliases and Earth responses get noindex without losing status, cache or content', async () => {
  for (const url of ['https://frong.me/earth', 'https://frong.me/earth/api/posts', 'https://frong-me-staging.frongbook.workers.dev/articles/story']) {
    const response = applySearchHeaders(new URL(url), new Response('protected', {
      status: 401, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(await response.text(), 'protected');
  }
  const redirect = applySearchHeaders(new URL('https://frong.me/earth'), Response.redirect('https://example.test/login', 302));
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://example.test/login');
});

test('a crawler user-agent never bypasses Access verification', async () => {
  for (const agent of ['Googlebot', 'OAI-SearchBot', 'Claude-SearchBot']) {
    const url = new URL('https://frong.me/earth/api/posts');
    let reachedPrivateRoute = false;
    const guarded = await createEarthMiddleware({ isDev: false })({
      url, request: new Request(url, { headers: { 'User-Agent': agent } }), locals: { env: {} },
    }, async () => { reachedPrivateRoute = true; return new Response('private'); });
    const response = applySearchHeaders(url, guarded);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(reachedPrivateRoute, false);
  }
});

test('static Worker assets have host-scoped noindex and the sitemap index includes D1 articles', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /https:\/\/:worker\.:account\.workers\.dev\/\*\n\s+X-Robots-Tag: noindex, nofollow/);
  assert.doesNotMatch(headers, /^\/\*/m);
  const config = readFileSync('astro.config.mjs', 'utf8');
  assert.match(config, /customSitemaps: \['https:\/\/frong.me\/articles-sitemap.xml'\]/);
});
