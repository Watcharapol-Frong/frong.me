import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const homepage = readFileSync(new URL('../../src/pages/index.astro', import.meta.url), 'utf8');
const island = readFileSync(new URL('../../src/components/HomeIsland.tsx', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../../src/components/Navbar.tsx', import.meta.url), 'utf8');
const metadata = readFileSync(new URL('../../src/components/earth/MetadataForm.astro', import.meta.url), 'utf8');

test('homepage keeps fixed primary topics and filters existing tags through More', () => {
  assert.match(homepage, /PRIMARY_TOPICS/);
  assert.match(homepage, /primaryTopic:\s*card\.primaryTopic/);
  assert.doesNotMatch(homepage, /flatMap\(\(article\) => article\.tags\)/);
  assert.match(island, /article\.primaryTopic === selectedTopic/);
  assert.match(island, /if \(selectedTag\)/);
  assert.match(island, /article\.tags\.some/);
  assert.match(navbar, /<MoreMenu tags=\{tags\}/);
});

test('Earth metadata keeps primary topic and free-form tags as separate controls', () => {
  assert.match(metadata, />Primary topic</);
  assert.match(metadata, /value=\{topic\.value\}/);
  assert.match(metadata, /role="combobox"/);
  assert.match(metadata, /role="listbox"/);
});
