import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CmsApiError,
  createPost,
  describeConflict,
  listPosts,
  updatePostDraft,
  type CmsClientOptions,
} from '../../src/lib/cms/client/api.ts';

interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

/** Fetch stub that records the request and replays a canned response. */
function stubFetch(
  response: { status: number; body: unknown; contentType?: string },
): { options: CmsClientOptions; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const request = init ?? {};
    requests.push({
      url: String(input),
      method: request.method ?? 'GET',
      headers: new Headers(request.headers),
      body: typeof request.body === 'string' ? JSON.parse(request.body) : undefined,
    });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': response.contentType ?? 'application/json' },
    });
  };
  return { options: { fetch: fetchImpl }, requests };
}

const POST_DETAIL = {
  id: 'post_aaaaaaaa',
  lang: 'th',
  translationGroupId: null,
  slug: 'thai-inflation',
  title: 'เงินเฟ้อไทย',
  excerpt: null,
  lifecycle: 'draft',
  draftVersion: 4,
  updatedAt: 1789030800000,
  bodyMarkdown: '## บทนำ',
  categoryIds: ['cat_macro_th'],
  tagIds: [],
  sources: [],
};

test('listPosts sends only the allowed query parameters', async () => {
  const { options, requests } = stubFetch({
    status: 200,
    body: { posts: [], taxonomy: { categories: { th: [], en: [] }, tags: { th: [], en: [] } } },
  });

  await listPosts({ lang: 'th', lifecycle: 'draft', search: '  inflation  ' }, options);

  // `parsePostListQuery` rejects unknown parameters and expects `lifecycle_state`.
  assert.equal(requests[0]?.url, '/earth/api/posts?lang=th&lifecycle_state=draft&search=inflation');
  assert.equal(requests[0]?.method, 'GET');
});

test('listPosts omits the query string when no filter is set', async () => {
  const { options, requests } = stubFetch({
    status: 200,
    body: { posts: [], taxonomy: { categories: { th: [], en: [] }, tags: { th: [], en: [] } } },
  });

  await listPosts({}, options);

  assert.equal(requests[0]?.url, '/earth/api/posts');
});

test('a draft update sends the version-guarded envelope', async () => {
  const { options, requests } = stubFetch({ status: 200, body: POST_DETAIL });

  const result = await updatePostDraft(
    'post_aaaaaaaa',
    {
      draft: {
        expectedDraftVersion: 4,
        lang: 'th',
        translationGroupId: null,
        slug: 'thai-inflation',
        title: 'เงินเฟ้อไทย',
        excerpt: null,
        bodyMarkdown: '## บทนำ',
      },
      categoryIds: ['cat_macro_th'],
      tagIds: [],
      sources: [],
    },
    options,
  );

  assert.equal(result.ok, true);
  assert.equal(requests[0]?.method, 'PUT');
  assert.equal(requests[0]?.headers.get('content-type'), 'application/json');
  const body = requests[0]?.body as { draft: { expectedDraftVersion: number } };
  assert.equal(body.draft.expectedDraftVersion, 4);
});

test('a 409 returns a structured conflict instead of throwing', async () => {
  const { options } = stubFetch({
    status: 409,
    body: {
      error: {
        code: 'DRAFT_VERSION_CONFLICT',
        message: 'The post draft changed after it was loaded',
        details: { expectedDraftVersion: 4, currentDraftVersion: 6 },
      },
    },
  });

  const result = await updatePostDraft(
    'post_aaaaaaaa',
    {
      draft: {
        expectedDraftVersion: 4,
        lang: 'th',
        translationGroupId: null,
        slug: 'thai-inflation',
        title: 'เงินเฟ้อไทย',
        excerpt: null,
        bodyMarkdown: '## บทนำ',
      },
      categoryIds: [],
      tagIds: [],
      sources: [],
    },
    options,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.conflict.code, 'DRAFT_VERSION_CONFLICT');
  assert.equal(result.conflict.currentDraftVersion, 6);
  assert.equal(result.conflict.expectedDraftVersion, 4);
  assert.match(describeConflict(result.conflict), /draft version 6/);
});

test('the flat error envelope is still understood', async () => {
  const { options } = stubFetch({
    status: 409,
    body: { error: 'DATABASE_BUSY', message: 'The database is busy, please retry' },
  });

  const result = await createPost(
    { id: 'post_bbbbbbbb', lang: 'en', slug: 'inflation', title: 'Inflation' },
    options,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.conflict.code, 'DATABASE_BUSY');
  assert.match(describeConflict(result.conflict), /Retry the request/);
});

test('non-conflict failures throw CmsApiError carrying the server code', async () => {
  const { options } = stubFetch({
    status: 422,
    body: { error: { code: 'INVARIANT_VIOLATION', message: 'All referenced assets must be promoted' } },
  });

  await assert.rejects(
    () => listPosts({}, options),
    (error: unknown) => {
      assert.ok(error instanceof CmsApiError);
      assert.equal(error.code, 'INVARIANT_VIOLATION');
      assert.equal(error.status, 422);
      assert.equal(error.requiresReauthentication, false);
      return true;
    },
  );
});

test('an Access login page is reported as an expired session', async () => {
  const { options } = stubFetch({
    status: 200,
    body: '<!doctype html><title>Sign in</title>',
    contentType: 'text/html; charset=utf-8',
  });

  await assert.rejects(
    () => listPosts({}, options),
    (error: unknown) => {
      assert.ok(error instanceof CmsApiError);
      assert.equal(error.code, 'SESSION_EXPIRED');
      assert.equal(error.requiresReauthentication, true);
      return true;
    },
  );
});

test('a response that breaks the contract fails loudly', async () => {
  const { options } = stubFetch({ status: 200, body: { posts: [{ id: 'post_aaaaaaaa' }] } });

  await assert.rejects(
    () => listPosts({}, options),
    (error: unknown) => {
      assert.ok(error instanceof CmsApiError);
      assert.equal(error.code, 'INVALID_RESPONSE');
      return true;
    },
  );
});

