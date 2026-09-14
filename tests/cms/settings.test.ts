import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import {
  getSiteSettings,
  updateSiteSettings,
  SITE_SETTINGS_DEFAULTS,
} from '../../src/server/cms/repositories/settings.ts';
import { parseUpdateSiteSettingsInput, CmsValidationError } from '../../src/lib/cms/validation.ts';

const NOW = 1_789_400_000_000;

test('getSiteSettings returns defaults when the table is empty', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  assert.deepEqual(await getSiteSettings(db), SITE_SETTINGS_DEFAULTS);
});

test('updateSiteSettings persists a partial update without touching other fields', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const afterFirst = await updateSiteSettings(db, { ownerName: 'Test Owner' }, NOW);
  assert.equal(afterFirst.ownerName, 'Test Owner');
  assert.equal(afterFirst.ownerHandle, SITE_SETTINGS_DEFAULTS.ownerHandle, 'untouched field keeps its default');

  const afterSecond = await updateSiteSettings(db, { defaultFont: 'jetbrains-mono' }, NOW + 1);
  assert.equal(afterSecond.ownerName, 'Test Owner', 'a later, unrelated update does not revert the earlier one');
  assert.equal(afterSecond.defaultFont, 'jetbrains-mono');

  const reread = await getSiteSettings(db);
  assert.deepEqual(reread, afterSecond);
});

test('updateSiteSettings overwrites an existing key rather than duplicating rows', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await updateSiteSettings(db, { ownerHandle: 'first' }, NOW);
  const result = await updateSiteSettings(db, { ownerHandle: 'second' }, NOW + 1);
  assert.equal(result.ownerHandle, 'second');

  const rows = await db.all<{ key: string }>('SELECT key FROM site_settings WHERE key = ?1', ['owner_handle']);
  assert.equal(rows.length, 1, 'ON CONFLICT updates the existing row instead of inserting a duplicate');
});

test('parseUpdateSiteSettingsInput accepts a valid partial payload and rejects invalid enum values', () => {
  const parsed = parseUpdateSiteSettingsInput({ ownerName: 'Jane', defaultFont: 'crimson-pro' });
  assert.deepEqual(parsed, { ownerName: 'Jane', defaultFont: 'crimson-pro' });

  assert.deepEqual(parseUpdateSiteSettingsInput({}), {}, 'an empty object is a valid no-op update');

  assert.throws(
    () => parseUpdateSiteSettingsInput({ defaultFont: 'comic-sans' }),
    (err: unknown) => err instanceof CmsValidationError && err.field === 'settings.defaultFont',
  );
  assert.throws(
    () => parseUpdateSiteSettingsInput({ defaultAiProvider: 'chatgpt' }),
    (err: unknown) => err instanceof CmsValidationError && err.field === 'settings.defaultAiProvider',
  );
  assert.throws(
    () => parseUpdateSiteSettingsInput({ unknownField: 'x' }),
    (err: unknown) => err instanceof CmsValidationError,
  );
});
