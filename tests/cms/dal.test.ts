import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import {
  createPost,
  getPostDraft,
  updatePostBundle,
  updatePostDraft,
} from '../../src/server/cms/repositories/posts.ts';
import {
  addPostAssetUsage,
  listPostAssetUsages,
  publicR2KeyFromMediaUrl,
  registerUploadedAsset,
} from '../../src/server/cms/repositories/assets.ts';
import {
  getPostTaxonomy,
  replacePostTaxonomy,
  replacePostSources,
  resolveTagIds,
  upsertCategory,
  upsertTag,
} from '../../src/server/cms/repositories/taxonomy.ts';
import { CmsConflictError } from '../../src/server/cms/errors.ts';

const NOW = 1_788_998_400_000;
const POST_ID = 'post_00000001';

test('draft writes use optimistic locking and stale taxonomy batches roll back', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: POST_ID,
    lang: 'th',
    slug: 'dal-proof',
    title: 'DAL proof',
    bodyMarkdown: '# Original',
  }, NOW);
  const updated = await updatePostDraft(db, POST_ID, {
    expectedDraftVersion: 1,
    lang: 'th',
    slug: 'dal-proof',
    title: 'DAL proof updated',
    bodyMarkdown: '# Original',
  }, NOW + 1);
  assert.equal(updated.draft_version, 2);

  await assert.rejects(
    updatePostDraft(db, POST_ID, {
      expectedDraftVersion: 1,
      lang: 'th',
      slug: 'stale-write',
      title: 'Stale',
      bodyMarkdown: '# Stale',
    }, NOW + 2),
    (error: unknown) => error instanceof CmsConflictError
      && error.code === 'DRAFT_VERSION_CONFLICT'
      && error.httpStatus === 409,
  );

  await upsertCategory(db, {
    id: 'category_000001', lang: 'th', slug: 'analysis', name: 'Analysis',
  }, NOW);
  await upsertTag(db, {
    id: 'tag_0000000001', lang: 'th', slug: 'economy', name: 'Economy',
  }, NOW);
  await replacePostTaxonomy(
    db,
    POST_ID,
    ['category_000001'],
    ['tag_0000000001'],
    2,
    NOW + 3,
  );

  await assert.rejects(
    replacePostTaxonomy(db, POST_ID, [], [], 2, NOW + 4),
    (error: unknown) => error instanceof CmsConflictError
      && error.code === 'DRAFT_VERSION_CONFLICT',
  );
  const taxonomy = await getPostTaxonomy(db, POST_ID);
  assert.deepEqual(taxonomy.categories.map((item) => item.id), ['category_000001']);
  assert.deepEqual(taxonomy.tags.map((item) => item.id), ['tag_0000000001']);
  assert.equal((await getPostDraft(db, POST_ID)).draft_version, 3);
});

test('publicR2KeyFromMediaUrl accepts site media covers and rejects externals', () => {
  assert.equal(
    publicR2KeyFromMediaUrl(
      'https://frong.me/media/assets/4d532306e3949a64b8b2e07c6a7feb780e6a79ccb46605ef29bbf7d4ba310e6b/IMG_1044.jpeg',
    ),
    'assets/4d532306e3949a64b8b2e07c6a7feb780e6a79ccb46605ef29bbf7d4ba310e6b/IMG_1044.jpeg',
  );
  assert.equal(publicR2KeyFromMediaUrl('https://images.unsplash.com/photo-1'), null);
  assert.equal(publicR2KeyFromMediaUrl(null), null);
});

test('attaching a second cover replaces the previous cover usage', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: POST_ID,
    lang: 'th',
    slug: 'cover-replace',
    title: 'Cover replace',
    bodyMarkdown: '# Body',
  }, NOW);

  const first = await registerUploadedAsset(db, {
    id: 'asset_cover_old001',
    mediaKind: 'photo',
    privateR2Key: `assets/${'a'.repeat(64)}/old.png`,
    originalName: 'old.png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    byteSize: 128,
    sha256: 'a'.repeat(64),
  }, NOW);
  const second = await registerUploadedAsset(db, {
    id: 'asset_cover_new001',
    mediaKind: 'photo',
    privateR2Key: `assets/${'b'.repeat(64)}/new.jpeg`,
    originalName: 'new.jpeg',
    mimeType: 'image/jpeg',
    width: 200,
    height: 200,
    byteSize: 256,
    sha256: 'b'.repeat(64),
  }, NOW + 1);

  await addPostAssetUsage(db, {
    id: 'usage_cover_old001',
    postId: POST_ID,
    assetId: first.id,
    role: 'cover',
    altText: 'Old cover',
    expectedDraftVersion: 1,
  }, NOW + 2);
  await addPostAssetUsage(db, {
    id: 'usage_cover_new001',
    postId: POST_ID,
    assetId: second.id,
    role: 'cover',
    altText: 'New cover',
    expectedDraftVersion: 2,
  }, NOW + 3);

  const usages = await listPostAssetUsages(db, POST_ID);
  assert.equal(usages.length, 1);
  assert.equal(usages[0]?.asset_id, second.id);
  assert.equal(usages[0]?.role, 'cover');
});

test('updatePostBundle syncs cover usage from a /media cover URL and clears it for externals', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const digest = 'c'.repeat(64);
  const key = `assets/${digest}/IMG_1044.jpeg`;
  const asset = await registerUploadedAsset(db, {
    id: 'asset_cover_sync001',
    mediaKind: 'photo',
    privateR2Key: key,
    originalName: 'IMG_1044.jpeg',
    mimeType: 'image/jpeg',
    width: 6000,
    height: 4000,
    byteSize: 1810992,
    sha256: digest,
  }, NOW);

  await createPost(db, {
    id: POST_ID,
    lang: 'th',
    slug: 'cover-sync',
    title: 'Cover sync',
    bodyMarkdown: '# Body',
    coverImageUrl: `https://frong.me/media/${key}`,
  }, NOW + 1);

  // Stale cover usage pointing at a different asset — mirrors production drift.
  const stale = await registerUploadedAsset(db, {
    id: 'asset_cover_stale01',
    mediaKind: 'photo',
    privateR2Key: `assets/${'d'.repeat(64)}/stale.png`,
    originalName: 'stale.png',
    mimeType: 'image/png',
    width: 10,
    height: 10,
    byteSize: 64,
    sha256: 'd'.repeat(64),
  }, NOW + 2);
  await addPostAssetUsage(db, {
    id: 'usage_cover_stale01',
    postId: POST_ID,
    assetId: stale.id,
    role: 'cover',
    altText: 'Stale',
    expectedDraftVersion: 1,
  }, NOW + 3);

  const synced = await updatePostBundle(db, POST_ID, {
    draft: {
      expectedDraftVersion: 2,
      lang: 'th',
      slug: 'cover-sync',
      title: 'Cover sync',
      bodyMarkdown: '# Body',
      coverImageUrl: `https://frong.me/media/${key}`,
    },
    categoryIds: [],
    tagIds: [],
    sources: [],
  }, NOW + 4);
  assert.equal(synced.cover_image_url, `https://frong.me/media/${key}`);
  const afterSync = await listPostAssetUsages(db, POST_ID);
  assert.equal(afterSync.length, 1);
  assert.equal(afterSync[0]?.asset_id, asset.id);

  const cleared = await updatePostBundle(db, POST_ID, {
    draft: {
      expectedDraftVersion: 3,
      lang: 'th',
      slug: 'cover-sync',
      title: 'Cover sync',
      bodyMarkdown: '# Body',
      coverImageUrl: 'https://images.unsplash.com/photo-external',
    },
    categoryIds: [],
    tagIds: [],
    sources: [],
  }, NOW + 5);
  assert.equal(cleared.cover_image_url, 'https://images.unsplash.com/photo-external');
  assert.deepEqual(await listPostAssetUsages(db, POST_ID), []);
});

test('cover_image_url persists through create, update, and the bundled update, and clearing it stores null', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const created = await createPost(db, {
    id: POST_ID,
    lang: 'th',
    slug: 'cover-proof',
    title: 'Cover proof',
    bodyMarkdown: '# Body',
    coverImageUrl: 'https://images.unsplash.com/photo-1',
  }, NOW);
  assert.equal(created.cover_image_url, 'https://images.unsplash.com/photo-1');

  const afterDraftUpdate = await updatePostDraft(db, POST_ID, {
    expectedDraftVersion: 1,
    lang: 'th',
    slug: 'cover-proof',
    title: 'Cover proof',
    bodyMarkdown: '# Body',
    coverImageUrl: 'https://images.unsplash.com/photo-2',
  }, NOW + 1);
  assert.equal(afterDraftUpdate.cover_image_url, 'https://images.unsplash.com/photo-2');

  const afterBundleUpdate = await updatePostBundle(db, POST_ID, {
    draft: {
      expectedDraftVersion: 2,
      lang: 'th',
      slug: 'cover-proof',
      title: 'Cover proof',
      bodyMarkdown: '# Body',
      coverImageUrl: null,
    },
    categoryIds: [],
    tagIds: [],
    sources: [],
  }, NOW + 2);
  assert.equal(afterBundleUpdate.cover_image_url, null, 'omitting the cover on a later save clears the stored URL rather than leaving it stale');
});

test('cover_crop persists through create, update, and the bundled update, and clearing it stores null', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const created = await createPost(db, {
    id: POST_ID,
    lang: 'th',
    slug: 'cover-crop-proof',
    title: 'Cover crop proof',
    bodyMarkdown: '# Body',
    coverImageUrl: 'https://images.unsplash.com/photo-1',
    coverCrop: { x: 49.16, y: 32.86, zoom: 1.4 },
  }, NOW);
  assert.deepEqual(JSON.parse(created.cover_crop!), { x: 49.16, y: 32.86, zoom: 1.4 });

  const afterDraftUpdate = await updatePostDraft(db, POST_ID, {
    expectedDraftVersion: 1,
    lang: 'th',
    slug: 'cover-crop-proof',
    title: 'Cover crop proof',
    bodyMarkdown: '# Body',
    coverImageUrl: 'https://images.unsplash.com/photo-1',
    coverCrop: { x: 10, y: 90, zoom: 2 },
  }, NOW + 1);
  assert.deepEqual(JSON.parse(afterDraftUpdate.cover_crop!), { x: 10, y: 90, zoom: 2 });

  const afterBundleUpdate = await updatePostBundle(db, POST_ID, {
    draft: {
      expectedDraftVersion: 2,
      lang: 'th',
      slug: 'cover-crop-proof',
      title: 'Cover crop proof',
      bodyMarkdown: '# Body',
      coverImageUrl: 'https://images.unsplash.com/photo-1',
      coverCrop: null,
    },
    categoryIds: [],
    tagIds: [],
    sources: [],
  }, NOW + 2);
  assert.equal(afterBundleUpdate.cover_crop, null, 'resetting to the default framing on a later save clears the stored crop rather than leaving it stale');
});

test('resolveTagIds upserts free-typed tag names and reuses the same row on a repeat name', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const firstPass = await resolveTagIds(db, 'en', ['cms', 'cloudflare', 'cms'], NOW);
  assert.equal(firstPass.length, 2, 'a name repeated in the same call still resolves to one id');

  const secondPass = await resolveTagIds(db, 'en', ['cms', 'sqlite'], NOW + 1);
  assert.equal(secondPass[0], firstPass[0], 'retyping an existing name reuses its row instead of creating a duplicate');
  assert.notEqual(secondPass[1], firstPass[1], 'a genuinely new name gets its own row');

  const sameNameOtherLang = await resolveTagIds(db, 'th', ['cms'], NOW + 2);
  assert.notEqual(sameNameOtherLang[0], firstPass[0], 'tags are scoped per language, so the same word in a different language is a distinct row');
});

test('primary topic is nullable for old content and constrained on every write path', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const legacyCompatible = await createPost(db, {
    id: POST_ID,
    lang: 'en',
    slug: 'primary-topic-proof',
    title: 'Primary topic proof',
  }, NOW);
  assert.equal(legacyCompatible.primary_topic, null);

  const classified = await updatePostDraft(db, POST_ID, {
    expectedDraftVersion: 1,
    lang: 'en',
    slug: 'primary-topic-proof',
    title: 'Primary topic proof',
    bodyMarkdown: '# Topic',
    primaryTopic: 'technology',
  }, NOW + 1);
  assert.equal(classified.primary_topic, 'technology');

  const legacyUpdate = await updatePostDraft(db, POST_ID, {
    expectedDraftVersion: 2,
    lang: 'en',
    slug: 'primary-topic-proof',
    title: 'Primary topic proof',
    bodyMarkdown: '# Topic',
  }, NOW + 2);
  assert.equal(legacyUpdate.primary_topic, 'technology', 'an older client omitting the new field does not erase it');

  await assert.rejects(
    db.run('UPDATE posts SET primary_topic = ?1 WHERE id = ?2', ['lifestyle', POST_ID]),
    (error: unknown) => error instanceof Error
      && /CHECK constraint failed/.test(String((error as Error & { cause?: unknown }).cause)),
  );
});

test('resolveTagIds treats capitalization-only variants as one canonical tag', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const ids = await resolveTagIds(db, 'en', ['AI', 'ai'], NOW);
  assert.equal(ids.length, 1);
  const rows = await db.all<{ name: string }>('SELECT name FROM tags WHERE lang = ?1', ['en']);
  assert.deepEqual(rows.map((row) => row.name), ['AI'], 'the first canonical spelling is preserved');
});

test('resolveTagIds trims whitespace, drops empty entries, and derives a Thai-safe slug', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const ids = await resolveTagIds(db, 'th', ['  เศรษฐกิจ  ', '', '   '], NOW);
  assert.equal(ids.length, 1, 'blank/whitespace-only entries are dropped, not turned into empty tags');

  const [tag] = await db.all<{ name: string; slug: string }>(
    'SELECT name, slug FROM tags WHERE id = ?1',
    [ids[0]],
  );
  assert.equal(tag.name, 'เศรษฐกิจ', 'the stored name is trimmed but not otherwise altered');
  assert.ok(/[฀-๿]/.test(tag.slug), 'the Thai-aware slug keeps the script rather than stripping it to empty');
});

test('updatePostBundle resolves typed tags end-to-end: reuse across saves, drop what is no longer listed', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: POST_ID,
    lang: 'en',
    slug: 'typed-tags-proof',
    title: 'Typed tags proof',
    bodyMarkdown: '# Body',
  }, NOW);

  const afterFirstSave = await updatePostBundle(db, POST_ID, {
    draft: {
      expectedDraftVersion: 1,
      lang: 'en',
      slug: 'typed-tags-proof',
      title: 'Typed tags proof',
      bodyMarkdown: '# Body',
    },
    categoryIds: [],
    tagIds: ['cms', 'cloudflare'],
    sources: [],
  }, NOW + 1);
  assert.equal(afterFirstSave.draft_version, 2);
  const taxonomyAfterFirst = await getPostTaxonomy(db, POST_ID);
  assert.deepEqual(taxonomyAfterFirst.tags.map((t) => t.slug).sort(), ['cloudflare', 'cms']);
  const cmsTagId = taxonomyAfterFirst.tags.find((t) => t.slug === 'cms')!.id;

  // Re-save with "cms" kept and "cloudflare" dropped in favour of a new tag.
  const afterSecondSave = await updatePostBundle(db, POST_ID, {
    draft: {
      expectedDraftVersion: 2,
      lang: 'en',
      slug: 'typed-tags-proof',
      title: 'Typed tags proof',
      bodyMarkdown: '# Body',
    },
    categoryIds: [],
    tagIds: ['cms', 'sqlite'],
    sources: [],
  }, NOW + 2);
  assert.equal(afterSecondSave.draft_version, 3);
  const taxonomyAfterSecond = await getPostTaxonomy(db, POST_ID);
  assert.deepEqual(taxonomyAfterSecond.tags.map((t) => t.slug).sort(), ['cms', 'sqlite']);
  assert.equal(
    taxonomyAfterSecond.tags.find((t) => t.slug === 'cms')!.id,
    cmsTagId,
    'the same typed tag resolves to the same underlying row across separate saves',
  );
});
