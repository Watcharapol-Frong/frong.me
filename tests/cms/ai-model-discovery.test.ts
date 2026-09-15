import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import { discoverProviderModels, generateAiResult, validateProviderApiKey } from '../../src/server/cms/ai.ts';
import { updateAiProviderConfig } from '../../src/server/cms/repositories/ai-provider-configs.ts';
import { CmsBadRequestError, CmsError } from '../../src/server/cms/errors.ts';

test('discoverProviderModels lists Gemini models that support generateContent, filtering out ones that do not', async () => {
  let capturedUrl = '';
  const fetcher = async (url: Parameters<typeof fetch>[0]) => {
    capturedUrl = String(url);
    return new Response(
      JSON.stringify({
        models: [
          { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', displayName: 'Embedding 001', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
      { status: 200 },
    );
  };

  const models = await discoverProviderModels('gemini', 'test-key', fetcher);
  assert.deepEqual(models, [
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', vendor: 'google', short: 'Gemini 3.5 Flash', capability: 'text' },
  ]);
  assert.match(capturedUrl, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?key=test-key/);
});

test('discoverProviderModels requires an API key for Gemini', async () => {
  await assert.rejects(
    () => discoverProviderModels('gemini', null, async () => new Response('{}')),
    (err: unknown) => err instanceof CmsBadRequestError,
  );
});

test('discoverProviderModels lists OpenRouter models without needing a key, deriving vendor and capability', async () => {
  let capturedUrl = '';
  const fetcher = async (url: Parameters<typeof fetch>[0]) => {
    capturedUrl = String(url);
    return new Response(
      JSON.stringify({
        data: [
          { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', architecture: { modality: 'text->text' } },
          { id: '~google/gemini-2.5-flash-image', name: 'Google: Gemini 2.5 Flash Image', architecture: { modality: 'text+image->image' } },
        ],
      }),
      { status: 200 },
    );
  };
  const models = await discoverProviderModels('openrouter', null, fetcher);
  assert.deepEqual(models, [
    { id: 'openai/gpt-4o-mini', label: 'OpenAI: GPT-4o Mini', vendor: 'openai', short: 'GPT-4o Mini', capability: 'text' },
    { id: '~google/gemini-2.5-flash-image', label: 'Google: Gemini 2.5 Flash Image', vendor: 'google', short: 'Gemini 2.5 Flash Image', capability: 'text-image' },
  ]);
  assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/models');
});

test('discoverProviderModels refuses Cloudflare, which has no live discovery', async () => {
  await assert.rejects(
    () => discoverProviderModels('cloudflare', null, async () => new Response('{}')),
    (err: unknown) => err instanceof CmsBadRequestError,
  );
});

test('generateAiResult prefers a D1-saved provider key over the env var fallback', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await updateAiProviderConfig(db, 'gemini', { apiKey: 'db-key', models: [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }] });

  let capturedUrl = '';
  const env = {
    GEMINI_API_KEY: 'env-key',
    fetcher: async (url: Parameters<typeof fetch>[0]) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    },
  };

  await generateAiResult({ task: 'auto-excerpt', provider: 'gemini', title: 'T', description: 'D', bodyText: 'B' }, env, db);
  assert.match(capturedUrl, /key=db-key$/, 'the D1-saved key must win over the env var');
});

test('generateAiResult falls back to the env var key when D1 has no config for that provider', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  let capturedUrl = '';
  const env = {
    GEMINI_API_KEY: 'env-key',
    fetcher: async (url: Parameters<typeof fetch>[0]) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    },
  };

  await generateAiResult({ task: 'auto-excerpt', provider: 'gemini', title: 'T', description: 'D', bodyText: 'B' }, env, db);
  assert.match(capturedUrl, /key=env-key$/);
});

test('validateProviderApiKey rejects a Gemini key ListModels itself refuses', async () => {
  const fetcher = async () => new Response('invalid key', { status: 400 });
  await assert.rejects(
    () => validateProviderApiKey('gemini', 'bad-key', fetcher),
    (err: unknown) => err instanceof CmsError,
  );
});

test('validateProviderApiKey accepts a Gemini key ListModels accepts', async () => {
  const fetcher = async () => new Response(JSON.stringify({ models: [] }), { status: 200 });
  await assert.doesNotReject(() => validateProviderApiKey('gemini', 'good-key', fetcher));
});

test('validateProviderApiKey checks OpenRouter via its auth/key endpoint, not the public models list', async () => {
  let capturedUrl = '';
  let capturedAuth: string | null = null;
  const okFetcher = async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    capturedUrl = String(url);
    capturedAuth = new Headers(init?.headers).get('authorization');
    return new Response(JSON.stringify({ data: { label: 'test key' } }), { status: 200 });
  };
  await validateProviderApiKey('openrouter', 'or-key', okFetcher);
  assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/auth/key');
  assert.equal(capturedAuth, 'Bearer or-key');

  const rejectFetcher = async () => new Response('unauthorized', { status: 401 });
  await assert.rejects(
    () => validateProviderApiKey('openrouter', 'bad-key', rejectFetcher),
    (err: unknown) => err instanceof CmsError,
  );
});

test('validateProviderApiKey is a no-op for Cloudflare, which has no key concept', async () => {
  await assert.doesNotReject(() => validateProviderApiKey('cloudflare', 'anything', async () => {
    throw new Error('must not be called');
  }));
});
