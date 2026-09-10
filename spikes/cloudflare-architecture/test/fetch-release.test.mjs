import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRelease, validatePublicSnapshot } from '../scripts/fetch-release.mjs';

test('sends a parameterized, authenticated D1 HTTP query and returns the public snapshot', async () => {
  let captured;
  const snapshot = { release_id: 'rel_20260910_spike001', articles: [] };
  const mockFetch = async (url, init) => {
    captured = { url, init };
    return Response.json({
      success: true,
      result: [{ success: true, results: [{ manifest_json: JSON.stringify(snapshot), manifest_sha256: 'a'.repeat(64) }] }],
    });
  };
  const result = await fetchRelease(
    {
      accountId: 'account',
      databaseId: 'database',
      apiToken: 'read-only-token',
      releaseId: snapshot.release_id,
      apiBaseUrl: 'https://api.example.test/client/v4/',
    },
    mockFetch,
  );
  assert.equal(captured.url, 'https://api.example.test/client/v4/accounts/account/d1/database/database/query');
  assert.equal(captured.init.headers.authorization, 'Bearer read-only-token');
  const body = JSON.parse(captured.init.body);
  assert.match(body.sql, /WHERE release_id = \?/);
  assert.deepEqual(body.params, [snapshot.release_id]);
  assert.deepEqual(result, { snapshot, manifestSha256: 'a'.repeat(64) });
});

test('fails closed on HTTP/API errors and private snapshot keys', async () => {
  const options = {
    accountId: 'account', databaseId: 'database', apiToken: 'token', releaseId: 'rel_20260910_spike001',
  };
  await assert.rejects(fetchRelease(options, async () => new Response('', { status: 403 })), /returned 403/);
  assert.throws(
    () => validatePublicSnapshot({ release_id: options.releaseId, articles: [], internal_notes: 'no' }, options.releaseId),
    /forbidden key/,
  );
});
