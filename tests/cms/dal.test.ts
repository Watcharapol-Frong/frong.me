import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import {
  createPost,
  getPostDraft,
  updatePostDraft,
} from '../../src/server/cms/repositories/posts.ts';
import {
  getPostTaxonomy,
  replacePostTaxonomy,
  replacePostSources,
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

