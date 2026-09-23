import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewArticleBasics } from '../../src/lib/cms/seo-review.ts';

test('draft checks use the actual fields and keep unrelated links optional', () => {
  const checks = reviewArticleBasics({
    title: '  ',
    excerpt: '',
    bodyMarkdown: 'A'.repeat(501) + '\n![ ](https://example.com/photo.jpg)',
  });
  assert.deepEqual(checks.map(({ label, status }) => [label, status]), [
    ['Article title', 'suggestion'],
    ['Short summary', 'suggestion'],
    ['Section headings', 'suggestion'],
    ['Image descriptions', 'suggestion'],
    ['Related reading', 'optional'],
  ]);
});

test('Thai article with a heading, image description, and relevant link is ready', () => {
  const checks = reviewArticleBasics({
    title: 'สิ่งที่ได้เรียนรู้จากโปรเจกต์',
    excerpt: 'เล่าวิธีทำและสิ่งที่พบ',
    bodyMarkdown: '## จุดเริ่มต้น\n' + 'เรื่องราว '.repeat(100)
      + '\n![แผนภาพ](https://example.com/chart.jpg)'
      + '\n[อ่านเรื่องที่เกี่ยวข้อง](/articles/related-project)',
  });
  assert.deepEqual(checks.map(({ label, status }) => [label, status]), [
    ['Article title', 'ready'],
    ['Short summary', 'ready'],
    ['Section headings', 'ready'],
  ]);
});
