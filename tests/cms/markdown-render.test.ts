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

test('strikethrough and highlight render correctly (the editor\'s bubble menu emits both)', () => {
  const { html } = renderMarkdown('This is ~~struck~~ and this is ==highlighted==.');
  assert.match(html, /<del>struck<\/del>/);
  assert.match(html, /<mark>highlighted<\/mark>/);
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
  assert.match(html, /<blockquote><p>quoted text<\/p><\/blockquote>/);
  assert.match(html, /<hr \/>/);
});

test('multiline blockquotes stay together and preserve paragraph and hard line breaks', () => {
  const { html } = renderMarkdown('> first line\n> second line\n>\n> final paragraph\n> hard break  \n> continues');
  assert.match(
    html,
    /<blockquote><p>first line second line<\/p><p>final paragraph hard break<br \/>continues<\/p><\/blockquote>/,
  );
  assert.equal((html.match(/<blockquote>/g) ?? []).length, 1);
});

test('a @[youtube] token on its own line becomes a privacy-preserving embed', () => {
  const { html } = renderMarkdown('Before\n\n@[youtube](dQw4w9WgXcQ)\n\nAfter');
  assert.match(html, /<div class="video-embed"><iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /<p>Before<\/p>/);
  assert.match(html, /<p>After<\/p>/);
});

test('paragraphs distinguish soft wraps, hard breaks and paragraph boundaries', () => {
  assert.equal(renderMarkdown('first\nsecond\n\nthird  \nfourth').html,
    '<p>first second</p>\n<p>third<br />fourth</p>');
  assert.equal(renderMarkdown('first\\\r\nsecond\n## Heading\nnext').html,
    '<p>first<br />second</p>\n<h2 id="heading">Heading</h2>\n<p>next</p>');
  assert.equal(renderMarkdown('escaped\\\\\nnext\n\nfinal\\').html,
    '<p>escaped&#92; next</p>\n<p>final\\</p>');
  assert.equal(renderMarkdown('**first\\\nsecond**').html,
    '<p><strong>first<br />second</strong></p>');
});

test('numbered list continuations stay in their item and stop before the next block', () => {
  assert.equal(renderMarkdown('10. first\\\n    second\n11. next\n\n---\n\nAfter').html,
    '<ol>\n<li>first<br />second</li>\n<li>next</li>\n</ol>\n<hr />\n<p>After</p>');
  assert.equal(renderMarkdown('- first\n  continuation\n- second').html,
    '<ul>\n<li>first continuation</li>\n<li>second</li>\n</ul>');
});

test('Markdown escapes stay literal while code preserves its backslashes and markup characters', () => {
  assert.equal(renderMarkdown('\\*literal\\* and `\\*code\\* <script>`').html,
    '<p>&#42;literal&#42; and <code>\\*code\\* &lt;script&gt;</code></p>');
  assert.equal(renderMarkdown('```txt\nline\\\nnext\n```').html,
    '<pre><code class="language-txt">line\\\nnext</code></pre>');
});

test('quote backslash breaks preserve formatting and do not consume escaped or final backslashes', () => {
  assert.equal(
    renderMarkdown('> **กาแฟ**\\\n> จำนวนคงเหลือ = 12').html,
    '<blockquote><p><strong>กาแฟ</strong><br />จำนวนคงเหลือ = 12</p></blockquote>',
  );
  assert.equal(renderMarkdown('> escaped\\\\\n> next').html, '<blockquote><p>escaped&#92; next</p></blockquote>');
  assert.equal(renderMarkdown('> final\\').html, '<blockquote><p>final\\</p></blockquote>');
  assert.equal(
    renderMarkdown('> first\\\n> second\n>\n> final paragraph').html,
    '<blockquote><p>first<br />second</p><p>final paragraph</p></blockquote>',
  );
});

test('a malformed or hostile youtube token stays inert text instead of building a src', () => {
  const attempts = [
    '@[youtube](short)',
    '@[youtube](https://evil.example/x)',
    '@[youtube]("onload=alert(1))',
    '@[youtube](dQw4w9WgXcQ) trailing words',
  ];
  for (const source of attempts) {
    const { html } = renderMarkdown(source);
    assert.ok(!html.includes('<iframe'), `must not emit an iframe for: ${source}`);
  }
});

test('GFM tables render escaped pipes and inline marks without swallowing neighboring blocks', () => {
  const result = renderMarkdown('Intro\n| Name | Value |\n| --- | --- |\n| **Thai** | a\\|b |\n\n## After');
  assert.match(result.html, /^<p>Intro<\/p>\n<div class="article-table-scroll"/);
  assert.match(result.html, /<th scope="col"><p>Name<\/p><\/th>/);
  assert.match(result.html, /<td><p><strong>Thai<\/strong><\/p><\/td>/);
  assert.match(result.html, /a&#124;b/);
  assert.match(result.html, /<h2 id="after">After<\/h2>$/);
});

test('invalid table payloads remain escaped code and never pass raw HTML through', () => {
  for (const payload of ['not json', '[]', '[[{"header":true,"markdown":"x"}],[]]', '[[{"header":"onclick","markdown":"<script>x</script>"}]]']) {
    const html = renderMarkdown('```earth-table\n' + payload + '\n```').html;
    assert.match(html, /^<pre><code/);
    assert.doesNotMatch(html, /<table|<script>/);
  }
});
