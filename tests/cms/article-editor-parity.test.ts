import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderMarkdown } from '../../src/lib/cms/markdown/render.ts';

const editor = readFileSync(new URL('../../src/pages/earth/editor.astro', import.meta.url), 'utf8');
const publicStyles = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
const publicPage = readFileSync(new URL('../../src/pages/articles/[slug].astro', import.meta.url), 'utf8');

test('a saved divider becomes a horizontal rule between article paragraphs', () => {
  const { html } = renderMarkdown('Before\n\n---\n\nAfter');
  assert.match(html, /<p>Before<\/p>\s*<hr \/>\s*<p>After<\/p>/);
});

test('public articles give divider a visible border', () => {
  assert.ok(publicPage.includes('class="article-content prose '), 'public article must opt into the divider style');
  assert.ok(/\.article-content\s+hr\s*\{[^}]*border-top:\s*1px\s+solid\s+hsl\(var\(--muted-foreground\)\)/.test(publicStyles));
});

test('Zen article body matches public prose font, size, rhythm and divider', () => {
  assert.ok(/body\.zen-mode\s+\.body-input\s+\.ProseMirror\s*\{[^}]*font-family:\s*'Inter'[^}]*font-size:\s*16px[^}]*line-height:\s*1\.75/s.test(editor));
  assert.ok(/body\.zen-mode\s+\.body-input\s+\.ProseMirror\s+hr\s*\{[^}]*border-top:\s*1px\s+solid\s+#737373/.test(editor));
  assert.ok(/body\.zen-mode\s+\.body-input\s+\.ProseMirror\s+ol,[^}]*ul\s*\{[^}]*padding-inline-start:\s*1\.625em/.test(editor));
});
