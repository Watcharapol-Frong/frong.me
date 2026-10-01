#!/usr/bin/env node
/** Read-only smoke check after deploying search policy changes. */
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const originFlag = args.indexOf('--origin');
const origin = new URL(originFlag < 0 ? 'https://frong.me' : args[originFlag + 1]).origin;
const production = origin === 'https://frong.me';

async function read(pathname, agent = 'Mozilla/5.0') {
  const response = await fetch(new URL(pathname, origin), {
    headers: { 'user-agent': agent },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `${pathname}: expected 200, got ${response.status}`);
  return { response, text: await response.text() };
}

try {
  const robots = await read('/robots.txt');
  assert.match(robots.response.headers.get('content-type') ?? '', /^text\/plain/);
  const sitemap = await read('/articles-sitemap.xml');

  if (production) {
    assert.match(robots.text, /User-agent: OAI-SearchBot/);
    assert.match(robots.text, /Disallow: \/earth\$/);
    assert.match(robots.text, /Disallow: \/earth\//);
    const index = await read('/sitemap-index.xml');
    assert.match(index.text, /<loc>https:\/\/frong.me\/articles-sitemap.xml<\/loc>/);
    const paths = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
      const url = new URL(match[1]);
      assert.equal(url.origin, origin, 'article sitemap must use the canonical host');
      assert.ok(url.pathname.startsWith('/articles/'));
      return url.pathname;
    });
    if (paths.length) {
      for (const agent of ['Googlebot', 'OAI-SearchBot', 'Claude-SearchBot']) {
        const article = await read(paths[0], agent);
        assert.doesNotMatch(article.response.headers.get('X-Robots-Tag') ?? '', /noindex/);
        assert.match(article.text, /<meta name="robots" content="index, follow/);
        assert.match(article.text, /<article[^>]*>[\s\S]+?<\/article>/);
        assert.match(article.text, /"@type":"BlogPosting"/);
        assert.match(article.text, /<time datetime=/);
        assert.match(article.text, /property="article:published_time"/);
      }
    } else console.log('No published articles; article rendering check skipped.');
  } else {
    assert.match(robots.text, /Disallow: \/\n/);
    assert.doesNotMatch(robots.text, /Sitemap:/);
    assert.doesNotMatch(sitemap.text, /<url>|<loc>/);
    for (const pathname of ['/', '/about/']) {
      const page = await read(pathname);
      assert.match(page.response.headers.get('X-Robots-Tag') ?? '', /noindex/);
    }
  }

  // Do not follow Access redirects or print authentication URLs/assertions.
  const privateResponse = await fetch(new URL('/earth/api/posts', origin), {
    redirect: 'manual', headers: { 'user-agent': 'OAI-SearchBot' },
    signal: AbortSignal.timeout(15000),
  });
  assert.ok([301, 302, 303, 307, 308, 401, 403].includes(privateResponse.status), 'anonymous Earth must stay protected');
  console.log(`Search policy checks passed for ${origin}. User-agent checks do not verify crawler source IPs or indexing.`);
} catch (error) {
  console.error(`Search policy check failed: ${error.message}`);
  process.exitCode = 1;
}
