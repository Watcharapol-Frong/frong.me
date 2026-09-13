import assert from 'node:assert/strict';
import test from 'node:test';

import { renderMarkdown, slugifyHeading } from '../../src/lib/cms/markdown/render.ts';

test('renders headings with unicode-aware (Thai-safe) slugs and collects a TOC', () => {
  const { html, headings } = renderMarkdown('# หัวข้อหลัก\n\n## Section One\n\nBody text.');
  assert.equal(headings.length, 2);
  assert.equal(headings[0].depth, 1);
  assert.equal(headings[0].text, 'หัวข้อหลัก');
  assert.notEqual(headings[0].slug, 'section', 'Thai text must not collapse to the ASCII-stripped fallback');
  assert.match(html, /<h1 id="[^"]+">หัวข้อหลัก<\/h1>/);
  assert.match(html, /<h2 id="section-one">Section One<\/h2>/);
});

test('slugifyHeading keeps Thai characters and hyphenates the rest', () => {
  assert.equal(slugifyHeading('Hello World'), 'hello-world');
  assert.equal(slugifyHeading('   '), 'section');
  const thai = slugifyHeading('สถาปัตยกรรม CMS');
  assert.ok(/[฀-๿]/.test(thai), 'must retain Thai script rather than stripping it');
});

test('duplicate headings get de-duplicated slugs', () => {
  const { headings } = renderMarkdown('## Intro\n\n## Intro');
  assert.deepEqual(headings.map((h) => h.slug), ['intro', 'intro-1']);
});

test('bold, italic, inline code, and links render correctly', () => {
  const { html } = renderMarkdown('This is **bold**, *italic*, `code`, and a [link](https://example.com).');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">link<\/a>/);
});

test('never emits raw HTML from the source — everything is escaped first', () => {
  const { html } = renderMarkdown('<script>alert(1)</script> and an "quoted" & ampersand.');
  assert.ok(!html.includes('<script>'), 'a literal <script> tag must never survive into the output');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&amp; ampersand/);
});

test('rejects unsafe link/image schemes, keeping only http(s), mailto, and same-origin paths', () => {
  const { html } = renderMarkdown('[bad](javascript:alert(1)) and ![bad](javascript:alert(1))');
  assert.ok(!html.includes('javascript:'), 'a javascript: URL must never reach the output');
  assert.match(html, /href="#"/);
  assert.match(html, /src="#"/);
});

test('fenced code blocks preserve content and escape it', () => {
  const { html } = renderMarkdown('```ts\nconst x = 1 < 2;\n```');
  assert.match(html, /<pre><code class="language-ts">const x = 1 &lt; 2;<\/code><\/pre>/);
});

test('lists group consecutive items and close on a blank line or type change', () => {
  const { html } = renderMarkdown('- one\n- two\n\n1. first\n2. second');
  assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n<li>first<\/li>\n<li>second<\/li>\n<\/ol>/);
});

test('blockquotes and horizontal rules render as their own elements', () => {
  const { html } = renderMarkdown('> quoted text\n\n---');
  assert.match(html, /<blockquote>quoted text<\/blockquote>/);
  assert.match(html, /<hr \/>/);
});
