import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { act, createElement } from 'react';
import test from 'node:test';

import { Editor } from '@tiptap/core';
import { renderMarkdown } from '../../src/lib/cms/markdown/render.ts';


const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
// JSDOM has no layout engine; ProseMirror's caret scrolling needs these APIs.
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
globalThis.innerHeight = dom.window.innerHeight;
globalThis.getSelection = dom.window.getSelection.bind(dom.window);
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(0), 0) as unknown as number;
globalThis.cancelAnimationFrame = id => clearTimeout(id);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = await import('react-dom/client');
const { default: RichBodyEditor, createRichBodyEditorExtensions } = await import('../../src/components/earth/RichBodyEditor.tsx');

function createEditor(content = '') {
  return new Editor({
    extensions: createRichBodyEditorExtensions(),
    content,
  });
}

function typeText(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', handler => handler(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

test('typing Markdown link syntax converts the label to a real link and survives reopening', () => {
  const editor = createEditor();
  try {
    typeText(editor, '[Example](https://example.com)');
    assert.equal(editor.getText(), 'Example');
    assert.match(editor.getHTML(), /href="https:\/\/example.com"/);
    const saved = editor.storage.markdown.getMarkdown();
    assert.match(renderMarkdown(saved).html, /<a href="https:\/\/example.com"/);
    const reopened = createEditor(saved);
    try { assert.match(reopened.getHTML(), /href="https:\/\/example.com"/); }
    finally { reopened.destroy(); }
  } finally { editor.destroy(); }
});

test('unsafe Markdown link schemes and inline code do not become links', () => {
  for (const markdown of ['[bad](javascript:alert)', '`[Example](https://example.com)`']) {
    const editor = createEditor();
    try {
      typeText(editor, markdown);
      assert.doesNotMatch(editor.getHTML(), /<a /);
    } finally { editor.destroy(); }
  }
});

test('Command+K on macOS and Ctrl+K on Windows call the link editor and suppress browser shortcuts', () => {
  for (const [platform, modifier] of [['MacIntel', 'metaKey'], ['Win32', 'ctrlKey']]) {
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      const { JSDOM } = createRequire(import.meta.url)('jsdom');
      const dom = new JSDOM('<body></body>');
      Object.defineProperty(globalThis, 'navigator', { value: { platform: '${platform}', userAgent: '${platform}', maxTouchPoints: 0 }, configurable: true });
      Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser, Node: dom.window.Node });
      const { Editor } = await import('@tiptap/core');
      const { createRichBodyEditorExtensions } = await import('./src/components/earth/RichBodyEditor.tsx');
      let opened = 0;
      const editor = new Editor({ extensions: createRichBodyEditorExtensions(undefined, () => { opened++; }) });
      const event = new dom.window.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ${modifier}: true, bubbles: true, cancelable: true });
      editor.view.dom.dispatchEvent(event);
      assert.equal(opened, 1);
      assert.equal(event.defaultPrevented, true);
      editor.destroy();
    `], { cwd: process.cwd(), stdio: 'pipe' });
  }
});

test('link dialog applies, edits and removes a selected-text link without replacing the text', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(createElement(RichBodyEditor, { initial: 'Example' })); });
    const surface = host.querySelector('[data-earth-body-editor]') as any;
    // Use the actual ProseMirror view attached to the rendered editing surface.
    const view = (host.querySelector('.ProseMirror') as any).editor.view;
    const { TextSelection } = await import('@tiptap/pm/state');
    await act(async () => { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 8))); });
    async function shortcut() {
      await act(async () => { view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })); });
    }
    async function url(value: string) {
      const input = host.querySelector('input[placeholder="https://"]') as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    }
    async function click(label: string) {
      const button = Array.from(host.querySelectorAll('button')).find(button => button.textContent === label)!;
      await act(async () => { button.click(); });
    }
    await shortcut();
    assert.ok(host.querySelector('dialog[open]'));
    await url('https://example.com');
    await click('Apply');
    assert.equal(surface.bodyEditor.getMarkdown(), '[Example](https://example.com)');
    assert.equal((host.querySelector('[data-earth-field="body"]') as HTMLTextAreaElement).value, '[Example](https://example.com)');
    await shortcut();
    await url('javascript:alert(1)');
    await click('Apply');
    assert.ok(host.querySelector('[role="alert"]'));
    assert.equal(surface.bodyEditor.getMarkdown(), '[Example](https://example.com)');
    await url('https://example.org');
    await click('Apply');
    assert.equal(surface.bodyEditor.getMarkdown(), '[Example](https://example.org)');
    await shortcut();
    await click('Remove link');
    assert.equal(surface.bodyEditor.getMarkdown(), 'Example');
    await act(async () => { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8))); });
    await shortcut();
    await url('https://example.net');
    await click('Cancel');
    assert.equal(surface.bodyEditor.getMarkdown(), 'Example');
    await shortcut();
    await url('https://example.net');
    await act(async () => {
      const input = host.querySelector('input[placeholder="https://"]')!;
      input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    assert.equal(surface.bodyEditor.getMarkdown(), 'Example[https://example.net](https://example.net)');
    assert.match(renderMarkdown(surface.bodyEditor.getMarkdown()).html, /<a href="https:\/\/example.net"/);
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
  }
});

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
