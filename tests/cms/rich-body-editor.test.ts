import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { Editor } from '@tiptap/core';

import { createRichBodyEditorExtensions } from '../../src/components/earth/RichBodyEditor.tsx';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getSelection = dom.window.getSelection.bind(dom.window);

function createEditor(content = '') {
  return new Editor({
    extensions: createRichBodyEditorExtensions(),
    content,
  });
}

test('an image followed by a saved divider reopens as an image and horizontal rule', () => {
  const beforeSave = createEditor();
  beforeSave.commands.setContent({
    type: 'doc',
    content: [
      { type: 'image', attrs: { src: 'https://example.com/cover.jpg', alt: 'Cover' } },
      { type: 'horizontalRule' },
    ],
  });

  const savedMarkdown = beforeSave.storage.markdown.getMarkdown();
  const afterReopen = createEditor();
  afterReopen.commands.setContent(savedMarkdown, { emitUpdate: true });

  assert.deepEqual(
    afterReopen.getJSON().content?.map((node) => node.type),
    ['image', 'horizontalRule', 'paragraph'],
  );
  assert.doesNotMatch(afterReopen.getText(), /^---$/m);

  beforeSave.destroy();
  afterReopen.destroy();
});
