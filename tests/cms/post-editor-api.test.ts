import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPostEditorApi,
  PostEditorPublishError,
  type PostEditorDraft,
} from '../../src/lib/cms/client/post-editor-api.ts';
import type { CmsClientOptions, PostDetail } from '../../src/lib/cms/client/api.ts';

const POST: PostDetail = {
  id: 'post_editor0001',
  lang: 'th',
  translationGroupId: null,
  slug: 'editor-proof',
  title: 'Editor proof',
  excerpt: 'Draft excerpt',
  lifecycle: 'draft',
  draftVersion: 1,
  updatedAt: 1789140000000,
  publishedAt: null,
  bodyMarkdown: '# Draft',
  categoryIds: ['cat_existing01'],
  tagIds: [],
  sources: [],
};

const DRAFT: PostEditorDraft = {
  id: POST.id,
  lang: 'th',
  slug: POST.slug,
  title: POST.title,
  excerpt: POST.excerpt ?? '',
  bodyMarkdown: POST.bodyMarkdown,
  tagIds: ['tag_editor001'],
  status: 'draft',
};

interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

function client(
  responder: (request: RecordedRequest, index: number) => { status?: number; body: unknown },
): { api: ReturnType<typeof createPostEditorApi>; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init = {}) => {
    const request = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const response = responder(request, requests.length - 1);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const options: CmsClientOptions = { fetch: fetchImpl };
  return { api: createPostEditorApi(options), requests };
}

test('PostEditor fetches an existing post from the same-origin detail route', async () => {
  const { api, requests } = client(() => ({ body: POST }));
  const loaded = await api.fetch(POST.id);

  assert.equal(loaded.id, POST.id);
  assert.equal(requests[0]?.url, `/earth/api/posts/${POST.id}`);
  assert.equal(requests[0]?.method, 'GET');
});

test('PostEditor creates with POST then applies tag ids through versioned PUT', async () => {
  const tagged = { ...POST, draftVersion: 2, tagIds: DRAFT.tagIds };
  const { api, requests } = client((_request, index) => ({
    status: index === 0 ? 201 : 200,
    body: index === 0 ? POST : tagged,
  }));

  const saved = await api.save(DRAFT, null);
  assert.equal(saved.draftVersion, 2);
  assert.deepEqual(requests.map(({ url, method }) => ({ url, method })), [
    { url: '/earth/api/posts', method: 'POST' },
    { url: `/earth/api/posts/${POST.id}`, method: 'PUT' },
  ]);
  assert.equal(requests[0]?.headers.get('content-type'), 'application/json');
  assert.deepEqual(requests[0]?.body, {
    id: POST.id,
    lang: 'th',
    slug: POST.slug,
    title: POST.title,
    excerpt: POST.excerpt,
    bodyMarkdown: POST.bodyMarkdown,
  });
  assert.deepEqual((requests[1]?.body as any).tagIds, ['tag_editor001']);
  assert.equal((requests[1]?.body as any).draft.expectedDraftVersion, 1);
  assert.equal('status' in (requests[0]?.body as object), false, 'strict posts payload excludes UI status');
});

test('PostEditor updates the loaded draft with the server draft version and preserved relations', async () => {
  const updated = { ...POST, draftVersion: 2, title: 'Updated title', tagIds: DRAFT.tagIds };
  const { api, requests } = client(() => ({ body: updated }));
  await api.save({ ...DRAFT, title: 'Updated title' }, POST);

  const body = requests[0]?.body as any;
  assert.equal(requests[0]?.method, 'PUT');
  assert.equal(body.draft.expectedDraftVersion, 1);
  assert.equal(body.draft.title, 'Updated title');
  assert.deepEqual(body.categoryIds, POST.categoryIds);
  assert.deepEqual(body.sources, POST.sources);
  assert.deepEqual(body.tagIds, DRAFT.tagIds);
  assert.equal('status' in body.draft, false);
});

test('PostEditor publish intent saves the draft and flips it live directly', async () => {
  const saved = { ...POST, draftVersion: 2, tagIds: DRAFT.tagIds };
  const published = { ...saved, lifecycle: 'active', publishedAt: 1789140000000 };
  const { api, requests } = client((request) => {
    if (request.method === 'PUT') return { body: saved };
    if (request.url === `/earth/api/posts/${POST.id}/publish`) {
      return { body: published };
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });

  const result = await api.publish({ ...DRAFT, status: 'published' }, POST);
  assert.equal(result.post.lifecycle, 'active');
  assert.deepEqual(requests.map(({ url, method }) => ({ url, method })), [
    { url: `/earth/api/posts/${POST.id}`, method: 'PUT' },
    { url: `/earth/api/posts/${POST.id}/publish`, method: 'POST' },
  ]);
  const publishBody = requests[1]?.body as any;
  assert.equal(publishBody.expectedDraftVersion, 2);
});

test('a publish failure carries the newly saved draft version for a safe retry', async () => {
  const saved = { ...POST, draftVersion: 2 };
  const { api } = client((request) => {
    if (request.method === 'PUT') return { body: saved };
    return {
      status: 409,
      body: {
        error: {
          code: 'DRAFT_VERSION_CONFLICT',
          message: 'The post draft changed after it was loaded, or it is already published/archived',
          details: { currentDraftVersion: 3 },
        },
      },
    };
  });

  await assert.rejects(
    () => api.publish({ ...DRAFT, tagIds: [], status: 'published' }, POST),
    (error: unknown) => {
      assert.ok(error instanceof PostEditorPublishError);
      assert.equal(error.post.draftVersion, 2);
      assert.match(error.message, /draft changed after it was loaded/);
      return true;
    },
  );
});
