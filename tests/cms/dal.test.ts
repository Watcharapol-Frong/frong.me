import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import {
  addPostAssetUsage,
  createAsset,
  promoteAsset,
} from '../../src/server/cms/repositories/assets.ts';
import {
  canonicalReleaseManifest,
  confirmReleaseLive,
  createRelease,
  createRevisionSnapshot,
  getLiveReleaseSnapshot,
  getRelease,
  getReleaseAttempt,
  getSiteState,
  startReleaseAttempt,
  transitionRelease,
  transitionReleaseAttempt,
} from '../../src/server/cms/repositories/releases.ts';
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
import {
  CmsConflictError,
  CmsInvariantError,
  CmsReleaseBusyError,
} from '../../src/server/cms/errors.ts';

const NOW = 1_788_998_400_000;
const POST_ID = 'post_00000001';
const REVISION_ID = 'revision_000001';

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

test('revision snapshot requires promoted assets and remains isolated from later drafts', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: POST_ID,
    lang: 'th',
    slug: 'immutable-proof',
    title: 'Published title',
    bodyMarkdown: '# Published body',
  }, NOW);
  await replacePostSources(db, POST_ID, [{
    id: 'source_00000001',
    label: 'Official dataset',
    url: 'https://data.example.test/dataset',
    publisher: 'Example Statistics Office',
    accessedAt: NOW,
  }], 1, NOW + 1);
  await createAsset(db, {
    id: 'asset_00000001',
    mediaKind: 'chart',
    privateR2Key: 'draft/chart.png',
    mimeType: 'image/png',
    width: 1600,
    height: 900,
    byteSize: 1024,
    sha256: 'a'.repeat(64),
  }, NOW);
  await addPostAssetUsage(db, {
    id: 'usage_00000001',
    postId: POST_ID,
    assetId: 'asset_00000001',
    role: 'body',
    altText: 'An analytical chart',
    expectedDraftVersion: 2,
  }, NOW + 2);

  await assert.rejects(
    createRevisionSnapshot(db, {
      revisionId: REVISION_ID,
      postId: POST_ID,
      expectedDraftVersion: 3,
      publishedAt: NOW + 3,
    }),
    (error: unknown) => error instanceof CmsInvariantError,
  );

  await promoteAsset(db, 'asset_00000001', 'articles/chart-v1.png', NOW + 3);
  const revision = await createRevisionSnapshot(db, {
    revisionId: REVISION_ID,
    postId: POST_ID,
    expectedDraftVersion: 3,
    publishedAt: NOW + 4,
  });
  assert.equal(revision.title, 'Published title');

  const manifest = {
    schemaVersion: 1 as const,
    releaseId: 'release_0000001',
    generatedAt: new Date(NOW + 4).toISOString(),
    articles: [{
      postId: POST_ID,
      revisionId: REVISION_ID,
      lang: 'th' as const,
      slug: 'immutable-proof',
      visible: true,
    }],
  };
  const canonical = await canonicalReleaseManifest(manifest);
  const release = await createRelease(db, {
    id: manifest.releaseId,
    triggerKind: 'publish',
    triggerPostId: POST_ID,
    idempotencyKey: 'publish_00000001',
    manifest,
    manifestSha256: canonical.sha256,
  }, NOW + 5);
  assert.equal(release.status, 'queued');
  const retriedRelease = await createRelease(db, {
    id: manifest.releaseId,
    triggerKind: 'publish',
    triggerPostId: POST_ID,
    idempotencyKey: 'publish_00000001',
    manifest,
    manifestSha256: canonical.sha256,
  }, NOW + 5);
  assert.equal(retriedRelease.id, release.id);

  const competingManifest = {
    ...manifest,
    releaseId: 'release_compete01',
  };
  const competingCanonical = await canonicalReleaseManifest(competingManifest);
  await assert.rejects(
    createRelease(db, {
      id: competingManifest.releaseId,
      triggerKind: 'publish',
      triggerPostId: POST_ID,
      idempotencyKey: 'publish_compete01',
      manifest: competingManifest,
      manifestSha256: competingCanonical.sha256,
    }, NOW + 5),
    (error: unknown) => error instanceof CmsReleaseBusyError,
  );

  await startReleaseAttempt(db, {
    id: 'attempt_0000001', releaseId: release.id, attemptNumber: 1, now: NOW + 6,
  });
  await transitionRelease(db, release.id, 'queued', 'building', { now: NOW + 7 });
  await transitionReleaseAttempt(db, 'attempt_0000001', 'dispatching', 'building', {
    workflowRunId: 'workflow-1', now: NOW + 7,
  });
  await transitionRelease(db, release.id, 'building', 'deploying', { now: NOW + 8 });
  await transitionReleaseAttempt(db, 'attempt_0000001', 'building', 'deploying', {
    now: NOW + 8,
  });
  await confirmReleaseLive(db, {
    releaseId: release.id,
    attemptId: 'attempt_0000001',
    providerDeploymentId: 'deployment-1',
    now: NOW + 9,
  });
  assert.equal((await getSiteState(db)).live_release_id, release.id);

  await updatePostDraft(db, POST_ID, {
    expectedDraftVersion: 3,
    lang: 'th',
    slug: 'immutable-proof',
    title: 'Unpublished draft title',
    bodyMarkdown: '# Unpublished draft body',
  }, NOW + 10);
  const snapshot = await getLiveReleaseSnapshot(db, 'https://assets.example.test/');
  assert.equal(snapshot?.articles[0]?.title, 'Published title');
  assert.equal(snapshot?.articles[0]?.assets[0]?.url, 'https://assets.example.test/articles/chart-v1.png');
  assert.equal(snapshot?.articles[0]?.sources[0]?.accessedAt, new Date(NOW).toISOString());
});

test('live confirmation uses atomic base-release compare-and-set', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: POST_ID,
    lang: 'en',
    slug: 'cas-proof',
    title: 'CAS proof',
    bodyMarkdown: '# CAS',
  }, NOW);
  await createRevisionSnapshot(db, {
    revisionId: REVISION_ID,
    postId: POST_ID,
    expectedDraftVersion: 1,
    publishedAt: NOW,
  });
  const manifest = {
    schemaVersion: 1 as const,
    releaseId: 'release_0000002',
    generatedAt: new Date(NOW).toISOString(),
    articles: [{
      postId: POST_ID,
      revisionId: REVISION_ID,
      lang: 'en' as const,
      slug: 'cas-proof',
      visible: true,
    }],
  };
  const canonical = await canonicalReleaseManifest(manifest);
  const baseManifest = await canonicalReleaseManifest({
    schemaVersion: 1,
    releaseId: 'release_base0001',
    generatedAt: new Date(NOW).toISOString(),
    articles: [],
  });
  await db.run(
    `INSERT INTO releases (
       id, status, trigger_kind, idempotency_key, manifest_json,
       manifest_sha256, created_at, updated_at, finished_at
     ) VALUES (?1, 'live', 'rollback', ?2, ?3, ?4, ?5, ?5, ?5)`,
    [
      'release_base0001',
      'base_00000000001',
      baseManifest.json,
      baseManifest.sha256,
      NOW,
    ],
  );
  await db.run(
    `UPDATE site_state SET live_release_id = ?1, updated_at = ?2 WHERE id = 1`,
    ['release_base0001', NOW],
  );
  await createRelease(db, {
    id: manifest.releaseId,
    triggerKind: 'publish',
    triggerPostId: POST_ID,
    baseReleaseId: 'release_base0001',
    idempotencyKey: 'publish_00000002',
    manifest,
    manifestSha256: canonical.sha256,
  }, NOW);
  await startReleaseAttempt(db, {
    id: 'attempt_0000002', releaseId: manifest.releaseId, attemptNumber: 1, now: NOW,
  });
  await transitionRelease(db, manifest.releaseId, 'queued', 'building', { now: NOW });
  await transitionReleaseAttempt(db, 'attempt_0000002', 'dispatching', 'building', { now: NOW });
  await transitionRelease(db, manifest.releaseId, 'building', 'deploying', { now: NOW });
  await transitionReleaseAttempt(db, 'attempt_0000002', 'building', 'deploying', { now: NOW });
  await db.run(
    `UPDATE site_state SET live_release_id = NULL, updated_at = ?1 WHERE id = 1`,
    [NOW + 1],
  );

  await assert.rejects(
    confirmReleaseLive(db, {
      releaseId: manifest.releaseId,
      attemptId: 'attempt_0000002',
      providerDeploymentId: 'deployment-stale',
      now: NOW + 1,
    }),
    (error: unknown) => error instanceof CmsConflictError,
  );
  assert.equal((await getRelease(db, manifest.releaseId)).status, 'deploying');
  assert.equal((await getReleaseAttempt(db, 'attempt_0000002')).status, 'deploying');
  assert.equal((await getSiteState(db)).live_release_id, null);
});
