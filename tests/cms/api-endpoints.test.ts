import assert from 'node:assert/strict';
import test from 'node:test';

import { GET as listPosts, POST as createPost } from '../../src/pages/earth/api/posts/index.ts';
import {
  DELETE as deletePost,
  GET as getPost,
  PATCH as patchPost,
  PUT as putPost,
} from '../../src/pages/earth/api/posts/[id].ts';
import { POST as attachPostAsset } from '../../src/pages/earth/api/posts/[id]/assets.ts';
import { POST as publishPost } from '../../src/pages/earth/api/posts/[id]/publish.ts';
import { POST as unpublishPost } from '../../src/pages/earth/api/posts/[id]/unpublish.ts';
import { createAsset, addPostAssetUsage } from '../../src/server/cms/repositories/assets.ts';
import { replacePostSources, replacePostTaxonomy, upsertCategory, upsertTag } from '../../src/server/cms/repositories/taxonomy.ts';
import { createCmsDbFixture } from './fixture.ts';

const NOW = 1_789_000_000_000;
const POST_ID = 'post_api_000001';

function context(binding: unknown, request: Request, params: Record<string, string> = {}) {
  return {
    request,
    params,
    locals: { env: { DB: binding } },
  } as never;
}

function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
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

test('asset attach endpoint uses optimistic locking and returns the post DTO', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(context(binding, jsonRequest('https://cms.test/earth/api/posts', 'POST', {
    id: POST_ID,
    lang: 'en',
    slug: 'asset-route-proof',
    title: 'Asset route proof',
    bodyMarkdown: '# Asset',
  })));
  await createAsset(db, {
    id: 'asset_route_0001',
    mediaKind: 'illustration',
    privateR2Key: 'draft/asset-route.png',
    originalName: 'asset-route.png',
    mimeType: 'image/png',
    width: 1200,
    height: 630,
    byteSize: 4096,
    sha256: 'b'.repeat(64),
  }, NOW);

  const attached = await attachPostAsset(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}/assets`, 'POST', {
      id: 'usage_route_001',
      assetId: 'asset_route_0001',
      role: 'cover',
      altText: 'Route-attached illustration',
      expectedDraftVersion: 1,
    }),
    { id: POST_ID },
  ));
  const attachedBody = await body(attached);
  assert.equal(attached.status, 200);
  assert.equal(attachedBody.draftVersion, 2);
  assert.equal(attachedBody.assets[0].assetId, 'asset_route_0001');
  assert.equal(attachedBody.assets[0].alt, 'Route-attached illustration');
  assert.equal(attachedBody.assets[0].asset_id, undefined);
  assert.equal(attached.headers.get('cache-control'), 'no-store');

  const stale = await attachPostAsset(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}/assets`, 'POST', {
      id: 'usage_route_002',
      assetId: 'asset_route_0001',
      role: 'body',
      altText: 'Stale attachment',
      expectedDraftVersion: 1,
    }),
    { id: POST_ID },
  ));
  const staleBody = await body(stale);
  assert.equal(stale.status, 409);
  assert.equal(staleBody.error.code, 'DRAFT_VERSION_CONFLICT');
  assert.equal(staleBody.error.details.currentDraftVersion, 2);
});

test('publish and unpublish endpoints flip a post live directly, no release step', async (t) => {
  const { binding } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(context(binding, jsonRequest('https://cms.test/earth/api/posts', 'POST', {
    id: POST_ID,
    lang: 'en',
    slug: 'direct-publish-proof',
    title: 'Direct publish proof',
    bodyMarkdown: '# Direct SSR',
  })));

  const published = await publishPost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}/publish`, 'POST', {
      expectedDraftVersion: 1,
    }),
    { id: POST_ID },
  ));
  const publishedBody = await body(published);
  assert.equal(published.status, 200);
  assert.equal(publishedBody.lifecycle, 'active');
  assert.ok(typeof publishedBody.publishedAt === 'number');
  assert.equal(published.headers.get('cache-control'), 'no-store');

  const republish = await publishPost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}/publish`, 'POST', {
      expectedDraftVersion: 1,
    }),
    { id: POST_ID },
  ));
  assert.equal(republish.status, 409, 'publishing an already-active post is a conflict, not a no-op');

  const unpublished = await unpublishPost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}/unpublish`, 'POST', {
      expectedDraftVersion: 1,
    }),
    { id: POST_ID },
  ));
  const unpublishedBody = await body(unpublished);
  assert.equal(unpublished.status, 200);
  assert.equal(unpublishedBody.lifecycle, 'draft');
  assert.ok(typeof unpublishedBody.publishedAt === 'number', 'first-publish timestamp is retained across unpublish');

  const republished = await publishPost(context(
    binding,
    jsonRequest(`https://cms.test/earth/api/posts/${POST_ID}/publish`, 'POST', {
      expectedDraftVersion: 1,
    }),
    { id: POST_ID },
  ));
  assert.equal(republished.status, 200, 'a draft can be republished after being unpublished');
});

