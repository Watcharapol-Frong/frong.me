import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCreateTag,
  matchingTagSuggestions,
  normalizeSelectedTags,
} from '../../src/lib/cms/client/tag-picker.ts';

const catalog = ['AI', 'Visualization', 'Visual Storytelling', 'Power BI'];

test('tag picker matches case-insensitively and excludes selected tags', () => {
  assert.deepEqual(
    matchingTagSuggestions(catalog, ['Visual Storytelling'], 'VISU'),
    ['Visualization'],
  );
});

test('tag picker reuses canonical spelling and removes case-only duplicates', () => {
  assert.deepEqual(normalizeSelectedTags([' ai ', 'AI', 'power bi'], catalog), ['AI', 'Power BI']);
});

test('tag picker allows new names only while below the two-tag limit', () => {
  assert.equal(canCreateTag(catalog, ['AI'], 'Research'), true);
  assert.equal(canCreateTag(catalog, ['AI'], ' ai '), false);
  assert.equal(canCreateTag(catalog, ['AI', 'Power BI'], 'Research'), false);
});
