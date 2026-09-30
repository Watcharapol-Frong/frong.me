import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { createPostEditorApi, PostEditorConflictError, PostEditorPublishError, PostEditorSaveError } from '../../src/lib/cms/client/post-editor-api.ts';
import { postSlugFeedback } from '../../src/lib/cms/client/post-slug-feedback.ts';
import * as tags from '../../src/lib/cms/client/tag-picker.ts';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const source = readFileSync(new URL('../../src/components/earth/PostEditor.astro', import.meta.url), 'utf8');
const script = source.split('<script>')[1].split('</script>')[0].replace(/import[\s\S]*?from ['"][^'"]+['"];\s*/g, '');
// Execute the shipped Astro script against DOM/API boundaries, not a copied model.
const code = stripTypeScriptTypes(script);
const old = { id: 'post_previous001', lang: 'th', title: 'Published old post', slug: 'old-post', excerpt: '', tagIds: [], primaryTopic: null, status: 'published', bodyMarkdown: 'Old body', coverUrl: '', coverCrop: null };

async function editor(backup = old, options: { id?: string; url?: string; backupKey?: string; failLoad?: boolean } = {}) {
  const dom = new JSDOM(`<form data-earth-editor data-earth-post-id="${options.id ?? 'new'}" data-earth-storage-key="earth:draft:${options.id ?? 'new'}">
    ${['id', 'lang', 'title', 'slug', 'tags', 'coverUrl', 'status'].map(name => `<input data-earth-field="${name}">`).join('')}
    <textarea data-earth-field="excerpt"></textarea><textarea data-earth-field="body"></textarea>
    <div data-earth-backup-notice hidden><button type="button" data-earth-action="restore-backup">Restore</button><button type="button" data-earth-action="discard-backup">Discard</button></div><div data-earth-body-editor></div><span data-earth-save-status></span>
    <button type="button" data-earth-action="save-draft">Save</button>
  </form>`, { url: options.url ?? 'https://example.com/earth/editor', runScripts: 'outside-only' });
  const { window } = dom;
  let markdown = '';
  window.document.querySelector('[data-earth-body-editor]').bodyEditor = {
    getMarkdown: () => markdown,
    setMarkdown: (value: string) => { markdown = value; window.document.querySelector('[data-earth-field="body"]').value = value; },
  };
  window.localStorage.setItem(options.backupKey ?? `earth:draft:${options.id ?? 'new'}`, JSON.stringify(backup));
  const requests: any[] = [];
  Object.assign(window, tags, {
    newCmsId: () => 'post_fresh00001', postSlugFeedback, PostEditorConflictError, PostEditorPublishError, PostEditorSaveError,
    getSettings: async () => ({ defaultFont: 'google-sans' }),
    createPostEditorApi: () => createPostEditorApi({ fetch: async (url, init) => {
      requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (options.failLoad) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Post not found' } }), { status: 404 });
      return new Response(JSON.stringify({ ...old, ...requests.at(-1).body, lifecycle: options.id ? 'active' : 'draft', draftVersion: 1, updatedAt: 1, publishedAt: null, translationGroupId: null, coverImageUrl: null, categoryIds: [], sources: [], tagNames: [] }), { status: 201, headers: { 'content-type': 'application/json' } });
    } }),
  });
  window.eval(code);
  await new Promise(resolve => setImmediate(resolve));
  return { window, requests, setMarkdown: (value: string) => { markdown = value; }, close: () => window.close() };
}

test('Create starts blank despite a previous published article in the legacy browser backup', async () => {
  const e = await editor();
  try {
    assert.equal(e.window.document.querySelector('[data-earth-field="title"]').value, '');
    assert.notEqual(e.window.document.querySelector('[data-earth-field="id"]').value, old.id);
  } finally { e.close(); }
});

test('saving a new article sends the fresh identity and current rich-editor Markdown', async () => {
  const e = await editor();
  try {
    e.window.document.querySelector('[data-earth-field="title"]').value = 'New article';
    e.window.document.querySelector('[data-earth-field="slug"]').value = 'new-article';
    e.setMarkdown('เนื้อหาใหม่'); // Deliberately leave the hidden mirror stale.
    e.window.document.querySelector('[data-earth-action="save-draft"]').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.requests[0].method, 'POST');
    assert.equal(e.requests[0].body.id, 'post_fresh00001');
    assert.equal(e.requests[0].body.bodyMarkdown, 'เนื้อหาใหม่');
    assert.equal(new URL(e.window.location.href).searchParams.get('id'), 'post_fresh00001');
    assert.equal(new URL(e.window.location.href).searchParams.has('new'), false);
  } finally { e.close(); }
});


test('reloading an unsaved session offers recovery without silently filling Create', async () => {
  const e = await editor({ ...old, id: 'post_fresh00001', status: 'draft' }, { url: 'https://example.com/earth/editor?new=post_fresh00001', backupKey: 'earth:draft:post_fresh00001' });
  try {
    assert.equal(e.window.document.querySelector('[data-earth-field="title"]').value, '');
    assert.equal(e.window.document.querySelector('[data-earth-backup-notice]').hidden, false);
    e.window.document.querySelector('[data-earth-action="restore-backup"]').click();
    assert.equal(e.window.document.querySelector('[data-earth-field="title"]').value, old.title);
    assert.equal(e.window.document.querySelector('[data-earth-field="id"]').value, 'post_fresh00001');
    assert.notEqual(e.window.document.querySelector('[data-earth-field="status"]').value, 'active');
  } finally { e.close(); }
});

test('a published article loads database content first and restoring changes preserves Published', async () => {
  const e = await editor({ ...old, title: 'Unsaved edit', status: 'draft' }, { id: old.id, url: `https://example.com/earth/editor?id=${old.id}` });
  try {
    assert.equal(e.window.document.querySelector('[data-earth-field="title"]').value, old.title);
    assert.equal(e.window.document.querySelector('[data-earth-field="status"]').value, 'active');
    e.window.document.querySelector('[data-earth-action="restore-backup"]').click();
    assert.equal(e.window.document.querySelector('[data-earth-field="title"]').value, 'Unsaved edit');
    assert.equal(e.window.document.querySelector('[data-earth-field="status"]').value, 'active');
  } finally { e.close(); }
});

test('a failed existing-post load cannot fall through into Create', async () => {
  const e = await editor(old, { id: old.id, failLoad: true });
  try {
    e.window.document.querySelector('[data-earth-field="title"]').value = 'New title';
    e.window.document.querySelector('[data-earth-field="slug"]').value = 'new-title';
    e.window.document.querySelector('[data-earth-action="save-draft"]').click();
    assert.deepEqual(e.requests.map(request => request.method ?? 'GET'), ['GET']);
  } finally { e.close(); }
});


test('legacy unsaved content can be recovered explicitly without importing its old identity or status', async () => {
  const e = await editor();
  try {
    e.window.document.querySelector('[data-earth-action="restore-backup"]').click();
    assert.equal(e.window.document.querySelector('[data-earth-field="title"]').value, old.title);
    assert.equal(e.window.document.querySelector('[data-earth-field="id"]').value, 'post_fresh00001');
    assert.notEqual(e.window.document.querySelector('[data-earth-field="status"]').value, 'active');
    e.window.document.querySelector('[data-earth-field="slug"]').value = 'recovered-as-new';
    e.window.document.querySelector('[data-earth-action="save-draft"]').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.requests[0].body.id, 'post_fresh00001');
    assert.equal(new URL(e.window.location.href).searchParams.get('id'), 'post_fresh00001', e.window.document.querySelector('[data-earth-save-status]').textContent);
    assert.equal(e.window.localStorage.getItem('earth:draft:new'), null);
  } finally { e.close(); }
});
