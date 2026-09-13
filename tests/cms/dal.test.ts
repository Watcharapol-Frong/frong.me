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

