import assert from 'node:assert/strict';
import test from 'node:test';

import { GET as listPosts, POST as createPost } from '../../src/pages/earth/api/posts/index.ts';
import {
  DELETE as deletePost,
  GET as getPost,
  PATCH as patchPost,
  PUT as putPost,
} from '../../src/pages/earth/api/posts/[id].ts';
import {
  GET as listReleases,
  POST as createRelease,
} from '../../src/pages/earth/api/releases/index.ts';
import { POST as confirmRelease } from '../../src/pages/earth/api/releases/[id]/confirm.ts';
import { canonicalReleaseManifest, startReleaseAttempt, transitionRelease, transitionReleaseAttempt } from '../../src/server/cms/repositories/releases.ts';
import { createAsset, addPostAssetUsage } from '../../src/server/cms/repositories/assets.ts';
import { replacePostSources, replacePostTaxonomy, upsertCategory, upsertTag } from '../../src/server/cms/repositories/taxonomy.ts';
import { createCmsDbFixture } from './fixture.ts';

const NOW = 1_789_000_000_000;
const POST_ID = 'post_api_000001';

function context(binding: unknown, request: Request, params: Record<string, string> = {}) {
  return {
    request,
    params,
    locals: { runtime: { env: { DB: binding } } },
  } as never;
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<any> {
  return response.json();
}

test('posts endpoints validate requests and return camelCase list DTOs', async (t) => {
  const { binding } = createCmsDbFixture();
  t.after(() => binding.close());

  const invalid = await createPost(context(
    binding,
    jsonRequest('https://cms.test/earth/api/posts', 'POST', {
      id: POST_ID,
      lang: 'fr',
      slug: 'api-proof',
      title: 'Invalid',
    }),
  ));
  assert.equal(invalid.status, 400);
  assert.deepEqual((await body(invalid)).error.code, 'BAD_REQUEST');

  const created = await createPost(context(
    binding,
    jsonRequest('https://cms.test/earth/api/posts', 'POST', {
      id: POST_ID,
      lang: 'en',
      slug: 'api-proof',
      title: 'API proof',
      excerpt: 'Strict endpoint DTO',
      bodyMarkdown: '# API',
    }),
  ));
  assert.equal(created.status, 201);
  const createdBody = await body(created);
  assert.equal(createdBody.draftVersion, 1);
  assert.equal(createdBody.draft_version, undefined);
  assert.equal(created.headers.get('cache-control'), 'no-store');

  const listed = await listPosts(context(
    binding,
    new Request('https://cms.test/earth/api/posts?lang=en&lifecycle_state=draft&search=proof'),
  ));
  assert.equal(listed.status, 200);
  const listedBody = await body(listed);
  assert.equal(listedBody.posts.length, 1);
  assert.equal(listedBody.posts[0].title, 'API proof');
  assert.equal(listedBody.posts[0].updated_at, undefined);

  const badQuery = await listPosts(context(
    binding,
    new Request('https://cms.test/earth/api/posts?lifecycle_state=deleted'),
  ));
  assert.equal(badQuery.status, 400);
  assert.equal((await body(badQuery)).error.details.field, 'query.lifecycle_state');
});

test('post detail, update conflict, and archive endpoints preserve the draft contract', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(context(binding, jsonRequest('https://cms.test/earth/api/posts', 'POST', {
    id: POST_ID,
    lang: 'th',
    slug: 'editor-proof',
    title: 'Editor proof',
    bodyMarkdown: '# Draft',
  })));
  const setupNow = Date.now();
  await upsertCategory(db, {
    id: 'category_api_01', lang: 'th', slug: 'analysis', name: 'Analysis',
  }, setupNow);
  await upsertTag(db, {
    id: 'tag_api_000001', lang: 'th', slug: 'api', name: 'API',
  }, setupNow);
  await replacePostTaxonomy(db, POST_ID, ['category_api_01'], ['tag_api_000001'], 1, Date.now());
  await replacePostSources(db, POST_ID, [{
    id: 'source_api_0001',
    label: 'Primary source',
    url: 'https://example.test/source',
    accessedAt: setupNow,
  }], 2, Date.now());
  await createAsset(db, {
    id: 'asset_api_00001',
    mediaKind: 'chart',
    privateR2Key: 'draft/chart.png',
    originalName: 'chart.png',
    mimeType: 'image/png',
    width: 1600,
    height: 900,
    byteSize: 2048,
    sha256: 'a'.repeat(64),
  }, setupNow);
  await addPostAssetUsage(db, {
    id: 'usage_api_00001',
    postId: POST_ID,
    assetId: 'asset_api_00001',
    role: 'body',
    altText: 'API chart',
    expectedDraftVersion: 3,
  }, Date.now());

  const detail = await getPost(context(
    binding,
    new Request(`https://cms.test/earth/api/posts/${POST_ID}`),
    { id: POST_ID },
  ));
  const detailBody = await body(detail);
  assert.equal(detail.status, 200);
  assert.deepEqual(detailBody.categoryIds, ['category_api_01']);
  assert.deepEqual(detailBody.tagIds, ['tag_api_000001']);
  assert.equal(detailBody.sources[0].accessedAt, setupNow);
  assert.equal(detailBody.assets[0].mediaKind, 'chart');
  assert.equal(detailBody.assets[0].private_r2_key, undefined);

  const updatePayload = {
    expectedDraftVersion: 4,
    lang: 'th',
    slug: 'editor-proof',
    title: 'Editor proof updated',
    bodyMarkdown: '# Updated',
  };
  const updated = await putPost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}`, 'PUT', {
      draft: updatePayload,
      categoryIds: ['category_api_01'],
      tagIds: ['tag_api_000001'],
      sources: [{
        id: 'source_api_0001',
        label: 'Primary source updated',
        url: 'https://example.test/source',
        publisher: null,
        accessedAt: setupNow,
      }],
    }),
    { id: POST_ID },
  ));
  assert.equal(updated.status, 200);
  const updatedBody = await body(updated);
  assert.equal(updatedBody.draftVersion, 5);
  assert.equal(updatedBody.sources[0].label, 'Primary source updated');

  const stale = await patchPost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}`, 'PATCH', updatePayload),
    { id: POST_ID },
  ));
  const staleBody = await body(stale);
  assert.equal(stale.status, 409);
  assert.equal(staleBody.error.code, 'DRAFT_VERSION_CONFLICT');
  assert.equal(staleBody.error.details.currentDraftVersion, 5);

  const archived = await deletePost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}`, 'DELETE', {
      expectedDraftVersion: 5,
    }),
    { id: POST_ID },
  ));
  assert.equal(archived.status, 200);
  assert.equal((await body(archived)).lifecycle, 'archived');
});

test('release endpoints snapshot a draft, list state, and confirm live atomically', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(context(binding, jsonRequest('https://cms.test/earth/api/posts', 'POST', {
    id: POST_ID,
    lang: 'en',
    slug: 'release-proof',
    title: 'Release proof',
    bodyMarkdown: '# Release',
  })));

  const releaseId = 'release_api_0001';
  const revisionId = 'revision_api_001';
  const manifest = {
    schemaVersion: 1 as const,
    releaseId,
    generatedAt: new Date(NOW).toISOString(),
    articles: [{
      postId: POST_ID,
      revisionId,
      lang: 'en' as const,
      slug: 'release-proof',
      visible: true,
    }],
  };
  const canonical = await canonicalReleaseManifest(manifest);
  const releaseInput = {
    id: releaseId,
    triggerKind: 'publish',
    triggerPostId: POST_ID,
    idempotencyKey: 'api_release_key_01',
    manifest,
    manifestSha256: canonical.sha256,
    revisionSnapshot: {
      revisionId,
      postId: POST_ID,
      expectedDraftVersion: 1,
      publishedAt: NOW,
    },
  };
  const created = await createRelease(context(
    binding,
    jsonRequest('https://cms.test/earth/api/releases', 'POST', releaseInput),
  ));
  assert.equal(created.status, 201);
  assert.equal((await body(created)).status, 'queued');

  const dashboard = await listReleases(context(
    binding,
    new Request('https://cms.test/earth/api/releases'),
  ));
  const dashboardBody = await body(dashboard);
  assert.equal(dashboardBody.liveReleaseId, null);
  assert.equal(dashboardBody.activeRelease.id, releaseId);
  assert.equal(dashboardBody.releases[0].itemCount, 1);
  assert.equal(dashboardBody.releases[0].manifest_json, undefined);

  const attemptId = 'attempt_api_001';
  await startReleaseAttempt(db, { id: attemptId, releaseId, attemptNumber: 1, now: Date.now() });
  await transitionRelease(db, releaseId, 'queued', 'building', { now: Date.now() });
  await transitionReleaseAttempt(db, attemptId, 'dispatching', 'building', { now: Date.now() });
  await transitionRelease(db, releaseId, 'building', 'deploying', { now: Date.now() });
  await transitionReleaseAttempt(db, attemptId, 'building', 'deploying', { now: Date.now() });

  const confirmed = await confirmRelease(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/releases/${releaseId}/confirm`, 'POST', {
      attemptId,
      providerDeploymentId: 'deployment-api-001',
    }),
    { id: releaseId },
  ));
  const confirmedBody = await body(confirmed);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmedBody.liveReleaseId, releaseId);
  assert.equal(confirmedBody.release.status, 'live');

  const repeated = await createRelease(context(
    binding,
    jsonRequest('https://cms.test/earth/api/releases', 'POST', releaseInput),
  ));
  assert.equal(repeated.status, 201);
  assert.equal((await body(repeated)).id, releaseId);
});
