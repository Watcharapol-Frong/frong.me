import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSeoMetadata, DEFAULT_DESCRIPTION } from '../../src/lib/seo.ts';

const options = {
  siteUrl: 'https://frong.me',
  pathname: '/articles/data-story',
  defaultImageUrl: 'https://frong.me/default.jpg',
};

test('buildSeoMetadata centralizes canonical, social, and article structured data', () => {
  const metadata = buildSeoMetadata({
    type: 'article',
    title: 'Data Story',
    description: 'A practical data story.',
    image: 'https://images.frong.me/data-story.jpg',
    language: 'th',
    publishedAt: '2026-09-20T00:00:00.000Z',
    modifiedAt: '2026-09-21T00:00:00.000Z',
    tags: ['data', 'strategy'],
  }, options);

  assert.equal(metadata.title, 'Data Story | frong.me');
  assert.equal(metadata.canonicalUrl, 'https://frong.me/articles/data-story');
  assert.equal(metadata.openGraphType, 'article');
  assert.equal(metadata.locale, 'th_TH');
  assert.equal(metadata.imageUrl, 'https://images.frong.me/data-story.jpg');

  const graph = metadata.structuredData['@graph'] as Array<Record<string, unknown>>;
  const article = graph.find((entry) => entry['@type'] === 'BlogPosting');
  assert.equal(article?.headline, 'Data Story');
  assert.equal(article?.dateModified, '2026-09-21T00:00:00.000Z');
  assert.equal(article?.keywords, 'data, strategy');
});

test('buildSeoMetadata gives ordinary pages safe defaults and supports noindex', () => {
  const metadata = buildSeoMetadata({ noIndex: true }, {
    ...options,
    pathname: '/404',
  });

  assert.equal(metadata.title, 'frong.me');
  assert.equal(metadata.description, DEFAULT_DESCRIPTION);
  assert.equal(metadata.canonicalUrl, 'https://frong.me/404');
  assert.equal(metadata.openGraphType, 'website');
  assert.equal(metadata.noIndex, true);
});
