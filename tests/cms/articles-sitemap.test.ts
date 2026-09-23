import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../../src/pages/articles-sitemap.xml.ts';
import { SqliteD1Binding } from './d1-test-adapter.ts';

test('article sitemap follows public slug routing and never exposes drafts', async (t) => {
  const binding = new SqliteD1Binding();
  t.after(() => binding.close());
  binding.migrate(
    'db/migrations/0001_articles.sql',
    'db/migrations/0002_taxonomy_assets.sql',
    'db/migrations/0003_releases.sql',
    'db/migrations/0004_direct_publish.sql',
    'db/migrations/0005_post_cover_url.sql',
    'db/migrations/0006_post_cover_crop.sql',
    'db/migrations/0007_site_settings.sql',
    'db/migrations/0008_ai_provider_configs.sql',
  );

  const now = Date.UTC(2026, 8, 23);
  for (const [id, lang, slug, lifecycle, updatedAt] of [
    ['post_sitemap_th', 'th', 'shared-story', 'active', now],
    ['post_sitemap_en', 'en', 'shared-story', 'active', now + 86_400_000],
    ['post_sitemap_two', 'en', 'new-post', 'active', now],
    ['post_sitemap_draft', 'en', 'private-draft', 'draft', now],
    ['post_sitemap_old', 'en', 'old-archived', 'archived', now],
  ] as const) {
    const stmt = binding.prepare(
      `INSERT INTO posts (id, lang, slug, title, lifecycle, created_at, updated_at, published_at)
       VALUES (?1, ?2, ?3, 'Article', ?4, ?5, ?6, ?7)`,
    ).bind(id, lang, slug, lifecycle, now, updatedAt, lifecycle === 'active' ? now : null);
    await stmt.run();
  }

  const response = await GET({ locals: { env: { DB: binding } } } as never);
  const xml = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/xml/);
  assert.match(xml, /https:\/\/frong\.me\/articles\/new-post/);
  assert.equal(xml.match(/https:\/\/frong\.me\/articles\/shared-story/g)?.length, 1);
  assert.match(xml, new RegExp(`<loc>https://frong\\.me/articles/shared-story</loc><lastmod>${new Date(now).toISOString()}</lastmod>`));
  assert.doesNotMatch(xml, new RegExp(new Date(now + 86_400_000).toISOString()));
  assert.doesNotMatch(xml, /private-draft|old-archived/);
});
