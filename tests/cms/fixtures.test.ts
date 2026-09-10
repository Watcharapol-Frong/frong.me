import assert from 'node:assert/strict';
import test from 'node:test';
import { mockPostRowTh, mockPublicArticleTh, postRowTh, publicArticleTh } from './fixtures/article-th.ts';
import { mockPostRowEn, mockPublicArticleEn, postRowEn, publicArticleEn } from './fixtures/article-en.ts';
import { parseReleaseSnapshot, CmsValidationError } from '../../src/lib/cms/validation.ts';
import type { PostRow, PublicArticle } from '../../src/lib/cms/contracts.ts';

test('PostRow fixtures conform strictly to database row contract', () => {
  const posts: PostRow[] = [mockPostRowTh, mockPostRowEn];

  for (const post of posts) {
    assert.match(post.id, /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/, 'Post ID must match identifier format');
    assert.ok(post.lang === 'th' || post.lang === 'en', 'Language must be th or en');
    assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');
    assert.ok(post.title.trim().length > 0, 'Title must be non-empty');
    assert.ok(post.body_markdown.length > 0, 'Body markdown must be non-empty');
    assert.ok(Number.isSafeInteger(post.draft_version) && post.draft_version >= 1, 'Draft version must be integer >= 1');
    assert.ok(['draft', 'active', 'archived'].includes(post.lifecycle), 'Lifecycle must be draft, active, or archived');
    assert.ok(Number.isSafeInteger(post.created_at) && post.created_at >= 0, 'created_at must be positive epoch ms');
    assert.ok(Number.isSafeInteger(post.updated_at) && post.updated_at >= post.created_at, 'updated_at >= created_at');
    assert.equal(post.archived_at, null, 'Active seed post should have null archived_at');
  }

  // Bilingual pairing validation
  assert.equal(mockPostRowTh.translation_group_id, mockPostRowEn.translation_group_id);
  assert.ok(mockPostRowTh.translation_group_id !== null, 'Translation group ID must be set for paired posts');
  assert.equal(mockPostRowTh.slug, mockPostRowEn.slug, 'Paired translation posts can share route slug');
  assert.notEqual(mockPostRowTh.lang, mockPostRowEn.lang, 'Languages must differ');
});

test('PublicArticle fixtures conform strictly to PublicArticle contract', () => {
  const articles: PublicArticle[] = [mockPublicArticleTh, mockPublicArticleEn];

  for (const article of articles) {
    assert.match(article.id, /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/);
    assert.match(article.revisionId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/);
    assert.ok(article.lang === 'th' || article.lang === 'en');
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(article.title.trim().length > 0);
    assert.ok(article.bodyMarkdown.length > 0);
    assert.ok(article.categories.length > 0, 'Must have at least one category');
    assert.ok(article.tags.length > 0, 'Must have at least one tag');
    assert.ok(article.sources.length > 0, 'Must have analytical sources');
    assert.ok(article.assets.length > 0, 'Must have media assets');

    // Validate ISO timestamp
    assert.equal(new Date(article.publishedAt).toISOString(), article.publishedAt);

    // Validate sources
    for (const src of article.sources) {
      assert.ok(src.label.length > 0);
      assert.ok(src.url.startsWith('https://'), 'Sources must be HTTPS URLs');
      if (src.accessedAt) {
        assert.equal(new Date(src.accessedAt).toISOString(), src.accessedAt);
      }
    }

    // Validate assets
    const covers = article.assets.filter((a) => a.role === 'cover');
    assert.equal(covers.length, 1, 'Article must have exactly one cover asset');
    for (const asset of article.assets) {
      assert.match(asset.usageId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/);
      assert.match(asset.assetId, /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/);
      assert.ok(['cover', 'body'].includes(asset.role));
      assert.ok(asset.url.startsWith('https://'));
      assert.ok(['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType));
      assert.ok(asset.width > 0 && asset.height > 0);
      assert.ok(asset.byteSize > 0);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      assert.ok(asset.alt.length > 0);
      if (asset.crop) {
        assert.ok(asset.crop.x >= 0 && asset.crop.x <= 100);
        assert.ok(asset.crop.y >= 0 && asset.crop.y <= 100);
        assert.ok(asset.crop.zoom > 0);
      }
    }
  }

  // Verify export aliases
  assert.equal(postRowTh, mockPostRowTh);
  assert.equal(publicArticleTh, mockPublicArticleTh);
  assert.equal(postRowEn, mockPostRowEn);
  assert.equal(publicArticleEn, mockPublicArticleEn);
});

test('PublicArticle fixtures pass strict parseReleaseSnapshot runtime validation', () => {
  const snapshot = {
    manifest: {
      schemaVersion: 1,
      releaseId: 'rel_20260910_live001',
      generatedAt: '2026-09-10T09:00:00.000Z',
      articles: [
        {
          postId: mockPublicArticleTh.id,
          revisionId: mockPublicArticleTh.revisionId,
          lang: mockPublicArticleTh.lang,
          slug: mockPublicArticleTh.slug,
          visible: true,
        },
        {
          postId: mockPublicArticleEn.id,
          revisionId: mockPublicArticleEn.revisionId,
          lang: mockPublicArticleEn.lang,
          slug: mockPublicArticleEn.slug,
          visible: true,
        },
      ],
    },
    articles: [mockPublicArticleTh, mockPublicArticleEn],
  };

  const parsed = parseReleaseSnapshot(snapshot);
  assert.equal(parsed.articles.length, 2);
  assert.equal(parsed.manifest.articles.length, 2);
  assert.equal(parsed.articles[0].lang, 'th');
  assert.equal(parsed.articles[1].lang, 'en');
});

test('Snapshot validation fails if article metadata mismatches manifest', () => {
  const corruptSnapshot = {
    manifest: {
      schemaVersion: 1,
      releaseId: 'rel_20260910_live001',
      generatedAt: '2026-09-10T09:00:00.000Z',
      articles: [
        {
          postId: mockPublicArticleTh.id,
          revisionId: mockPublicArticleTh.revisionId,
          lang: mockPublicArticleTh.lang,
          slug: 'mismatched-slug',
          visible: true,
        },
      ],
    },
    articles: [mockPublicArticleTh],
  };

  assert.throws(() => parseReleaseSnapshot(corruptSnapshot), (err: unknown) => {
    return err instanceof CmsValidationError && err.field === 'snapshot.articles';
  });
});

