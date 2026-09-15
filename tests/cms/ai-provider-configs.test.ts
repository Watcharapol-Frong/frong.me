import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import {
  getAiProviderConfigs,
  getAiProviderConfigForUse,
  updateAiProviderConfig,
} from '../../src/server/cms/repositories/ai-provider-configs.ts';
import { CmsBadRequestError } from '../../src/server/cms/errors.ts';

const NOW = 1_789_400_000_000;

test('getAiProviderConfigs returns nothing when no provider has been configured', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  assert.deepEqual(await getAiProviderConfigs(db), []);
});

test('updateAiProviderConfig saves a key and models, masking the key on the public read', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const saved = await updateAiProviderConfig(
    db,
    'gemini',
    { apiKey: 'secret-key-123', models: [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }] },
    NOW,
  );
  assert.equal(saved.provider, 'gemini');
  assert.equal(saved.hasApiKey, true);
  assert.deepEqual(saved.models, [
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', vendor: 'google', short: 'Gemini 3.5 Flash', capability: 'text' },
  ]);
  assert.equal((saved as unknown as { apiKey?: string }).apiKey, undefined, 'the public shape never carries the real key');

  const configs = await getAiProviderConfigs(db);
  assert.equal(configs.length, 1);
  assert.equal(configs[0].hasApiKey, true);

  const forUse = await getAiProviderConfigForUse(db, 'gemini');
  assert.equal(forUse?.apiKey, 'secret-key-123', 'only the internal accessor reads the real key back');
});

test('updateAiProviderConfig with apiKey undefined leaves a previously saved key untouched', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await updateAiProviderConfig(db, 'openrouter', { apiKey: 'first-key', models: [{ id: 'a', label: 'A' }] }, NOW);
  const updated = await updateAiProviderConfig(db, 'openrouter', { models: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, NOW + 1);

  assert.equal(updated.hasApiKey, true);
  assert.deepEqual(updated.models, [
    { id: 'a', label: 'A', vendor: 'a', short: 'A', capability: 'text' },
    { id: 'b', label: 'B', vendor: 'b', short: 'B', capability: 'text' },
  ]);

  const forUse = await getAiProviderConfigForUse(db, 'openrouter');
  assert.equal(forUse?.apiKey, 'first-key', 'omitting apiKey in the update must not clear the stored key');
});

test('updateAiProviderConfig with apiKey null clears a previously saved key', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await updateAiProviderConfig(db, 'openrouter', { apiKey: 'first-key', models: [{ id: 'a', label: 'A' }] }, NOW);
  const cleared = await updateAiProviderConfig(db, 'openrouter', { apiKey: null, models: [{ id: 'a', label: 'A' }] }, NOW + 1);

  assert.equal(cleared.hasApiKey, false);
  const forUse = await getAiProviderConfigForUse(db, 'openrouter');
  assert.equal(forUse?.apiKey, null);
});

test('updateAiProviderConfig rejects an unknown provider', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await assert.rejects(
    () => updateAiProviderConfig(db, 'chatgpt' as never, { models: [{ id: 'a', label: 'A' }] }, NOW),
    (err: unknown) => err instanceof CmsBadRequestError,
  );
});

test('updateAiProviderConfig enforces the 1-5 model count', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await assert.rejects(
    () => updateAiProviderConfig(db, 'cloudflare', { models: [] }, NOW),
    (err: unknown) => err instanceof CmsBadRequestError,
    'zero models must be rejected',
  );

  const sixModels = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, label: `Model ${i}` }));
  await assert.rejects(
    () => updateAiProviderConfig(db, 'cloudflare', { models: sixModels }, NOW),
    (err: unknown) => err instanceof CmsBadRequestError,
    'more than 5 models must be rejected',
  );

  const fiveModels = sixModels.slice(0, 5);
  const saved = await updateAiProviderConfig(db, 'cloudflare', { models: fiveModels }, NOW);
  assert.equal(saved.models.length, 5);
});

test('updateAiProviderConfig rejects duplicate model ids', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await assert.rejects(
    () => updateAiProviderConfig(db, 'cloudflare', { models: [{ id: 'a', label: 'A' }, { id: 'a', label: 'A again' }] }, NOW),
    (err: unknown) => err instanceof CmsBadRequestError,
  );
});

test('updateAiProviderConfig persists across repeated saves to the same provider without duplicating rows', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await updateAiProviderConfig(db, 'gemini', { models: [{ id: 'a', label: 'A' }] }, NOW);
  await updateAiProviderConfig(db, 'gemini', { models: [{ id: 'b', label: 'B' }] }, NOW + 1);

  const rows = await db.all<{ provider: string }>('SELECT provider FROM ai_provider_configs WHERE provider = ?1', ['gemini']);
  assert.equal(rows.length, 1, 'ON CONFLICT updates the existing row instead of inserting a duplicate');
});
