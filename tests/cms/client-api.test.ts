import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CmsApiError,
  buildBeginReleaseInput,
  canonicalManifest,
  createPost,
  describeConflict,
  getReleaseOverview,
  listPosts,
  updatePostDraft,
  type CmsClientOptions,
} from '../../src/lib/cms/client/api.ts';
import { canonicalReleaseManifest } from '../../src/server/cms/repositories/releases.ts';
import { parseBeginReleaseInput } from '../../src/lib/cms/validation.ts';
import type { ReleaseManifest } from '../../src/lib/cms/contracts.ts';

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
    body: { error: 'RELEASE_BUSY', message: 'Another release is already active' },
  });

  const result = await createPost(
    { id: 'post_bbbbbbbb', lang: 'en', slug: 'inflation', title: 'Inflation' },
    options,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.conflict.code, 'RELEASE_BUSY');
  assert.match(describeConflict(result.conflict), /in-flight release/);
});

test('non-conflict failures throw CmsApiError carrying the server code', async () => {
  const { options } = stubFetch({
    status: 422,
    body: { error: { code: 'INVARIANT_VIOLATION', message: 'All referenced assets must be promoted' } },
  });

  await assert.rejects(
    () => getReleaseOverview(options),
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

test('client canonicalization matches the server hash byte for byte', async () => {
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    releaseId: 'rel_cccccccc',
    generatedAt: '2026-09-10T00:00:00.000Z',
    articles: [
      { postId: 'post_zzzzzzzz', revisionId: 'rev_zzzzzzzz', lang: 'en', slug: 'z', visible: true },
      { postId: 'post_aaaaaaaa', revisionId: 'rev_aaaaaaaa', lang: 'th', slug: 'a', visible: true },
    ],
  };

  const client = await canonicalManifest(manifest);
  const server = await canonicalReleaseManifest(manifest);

  assert.equal(client.json, server.json);
  assert.equal(client.sha256, server.sha256);
  // Canonical order is by postId, so the hash does not depend on input order.
  assert.equal(client.manifest.articles[0]?.postId, 'post_aaaaaaaa');
});

test('a publish carries the live routes forward and snapshots one revision', async () => {
  const liveManifest: ReleaseManifest = {
    schemaVersion: 1,
    releaseId: 'rel_dddddddd',
    generatedAt: '2026-09-01T00:00:00.000Z',
    articles: [
      { postId: 'post_kept0001', revisionId: 'rev_kept0001', lang: 'th', slug: 'kept', visible: true },
      { postId: 'post_aaaaaaaa', revisionId: 'rev_old00001', lang: 'th', slug: 'old', visible: true },
    ],
  };

  const input = await buildBeginReleaseInput({
    triggerKind: 'publish',
    liveManifest,
    baseReleaseId: 'rel_dddddddd',
    change: {
      postId: 'post_aaaaaaaa',
      lang: 'th',
      slug: 'thai-inflation',
      kind: 'updated',
      expectedDraftVersion: 4,
    },
    now: () => 1789030800000,
  });

  // The server re-derives the hash and rejects a mismatch, so it must be exact.
  const server = await canonicalReleaseManifest(input.manifest);
  assert.equal(input.manifestSha256, server.sha256);

  // The route being republished points at the new revision, not the old one.
  const republished = input.manifest.articles.find((article) => article.postId === 'post_aaaaaaaa');
  assert.equal(republished?.slug, 'thai-inflation');
  assert.notEqual(republished?.revisionId, 'rev_old00001');
  assert.equal(republished?.revisionId, input.revisionSnapshot?.revisionId);
  assert.equal(input.revisionSnapshot?.expectedDraftVersion, 4);

  // Untouched routes survive the release unchanged.
  const kept = input.manifest.articles.find((article) => article.postId === 'post_kept0001');
  assert.equal(kept?.revisionId, 'rev_kept0001');

  // And the whole payload satisfies the server-side parser.
  assert.deepEqual(parseBeginReleaseInput(input), input);
});

test('a withdrawal drops the route and snapshots no revision', async () => {
  const liveManifest: ReleaseManifest = {
    schemaVersion: 1,
    releaseId: 'rel_dddddddd',
    generatedAt: '2026-09-01T00:00:00.000Z',
    articles: [
      { postId: 'post_kept0001', revisionId: 'rev_kept0001', lang: 'th', slug: 'kept', visible: true },
      { postId: 'post_aaaaaaaa', revisionId: 'rev_old00001', lang: 'th', slug: 'old', visible: true },
    ],
  };

  const input = await buildBeginReleaseInput({
    triggerKind: 'withdraw',
    liveManifest,
    baseReleaseId: 'rel_dddddddd',
    change: { postId: 'post_aaaaaaaa', lang: 'th', slug: 'old', kind: 'removed' },
    now: () => 1789030800000,
  });

  assert.equal(input.revisionSnapshot, undefined);
  assert.deepEqual(
    input.manifest.articles.map((article) => article.postId),
    ['post_kept0001'],
  );
});

test('publishing without a draft version is refused before any request', async () => {
  await assert.rejects(
    () =>
      buildBeginReleaseInput({
        triggerKind: 'publish',
        liveManifest: null,
        baseReleaseId: null,
        change: { postId: 'post_aaaaaaaa', lang: 'th', slug: 'a', kind: 'added' },
      }),
    (error: unknown) => error instanceof CmsApiError && error.code === 'BAD_REQUEST',
  );
});
