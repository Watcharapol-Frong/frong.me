import assert from 'node:assert/strict';
import test from 'node:test';

import { PUT as putProviderConfig } from '../../src/pages/earth/api/ai/providers/[provider].ts';
import { getAiProviderConfigForUse } from '../../src/server/cms/repositories/ai-provider-configs.ts';
import { createCmsDbFixture } from './fixture.ts';

function context(binding: unknown, request: Request, params: Record<string, string>, fetcher?: typeof fetch) {
  return {
    request,
    params,
    locals: { env: { DB: binding, fetcher } },
  } as never;
}

function jsonRequest(body: unknown): Request {
  return new Request('https://cms.test/earth/api/ai/providers/gemini', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('PUT rejects a newly-typed key the provider itself refuses, without persisting it', async () => {
  const { binding, db } = createCmsDbFixture();

  const badFetcher = async () => new Response('invalid key', { status: 400 });
  const response = await putProviderConfig(context(
    binding,
    jsonRequest({ apiKey: 'bad-key', models: [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }] }),
    { provider: 'gemini' },
    badFetcher,
  ));

  assert.equal(response.status, 502);
  const stored = await getAiProviderConfigForUse(db, 'gemini');
  assert.equal(stored, null, 'a key that fails validation must never be written to D1');

  binding.close();
});

test('PUT saves a newly-typed key once the provider confirms it works', async () => {
  const { binding, db } = createCmsDbFixture();

  const goodFetcher = async () => new Response(JSON.stringify({ models: [] }), { status: 200 });
  const response = await putProviderConfig(context(
    binding,
    jsonRequest({ apiKey: 'good-key', models: [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }] }),
    { provider: 'gemini' },
    goodFetcher,
  ));

  assert.equal(response.status, 200);
  const stored = await getAiProviderConfigForUse(db, 'gemini');
  assert.equal(stored?.apiKey, 'good-key');

  binding.close();
});

test('PUT skips validation entirely when apiKey is omitted (an unrelated models-only update)', async () => {
  const { binding, db } = createCmsDbFixture();

  await putProviderConfig(context(
    binding,
    jsonRequest({ apiKey: 'good-key', models: [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }] }),
    { provider: 'gemini' },
    async () => new Response(JSON.stringify({ models: [] }), { status: 200 }),
  ));

  const neverCalled = async (): Promise<Response> => {
    throw new Error('validateProviderApiKey must not run when apiKey is omitted');
  };
  const response = await putProviderConfig(context(
    binding,
    jsonRequest({ models: [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }, { id: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro' }] }),
    { provider: 'gemini' },
    neverCalled,
  ));

  assert.equal(response.status, 200);
  const stored = await getAiProviderConfigForUse(db, 'gemini');
  assert.equal(stored?.apiKey, 'good-key', 'the previously saved key must survive a models-only update');

  binding.close();
});
