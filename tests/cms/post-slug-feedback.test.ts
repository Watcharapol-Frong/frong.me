import assert from 'node:assert/strict';
import test from 'node:test';
import { postSlugFeedback } from '../../src/lib/cms/client/post-slug-feedback.ts';

test('article URL feedback explains invalid manual slugs before a save request', () => {
  assert.match(postSlugFeedback('ชื่อบทความ') ?? '', /lowercase English letters/);
  assert.match(postSlugFeedback('My First Article') ?? '', /lowercase English letters/);
  assert.match(postSlugFeedback('') ?? '', /Add an English URL name/);
  assert.equal(postSlugFeedback('my-first-article'), null);
  assert.equal(postSlugFeedback('a'.repeat(121)) === null, false);
});
