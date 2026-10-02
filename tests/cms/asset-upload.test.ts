import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, HEAD } from '../../src/pages/media/assets/[...key].ts';
import { extractImageMetadata } from '../../src/lib/cms/assets/metadata.ts';
import { buildAssetKey } from '../../src/lib/cms/assets/r2.ts';
import { createAsset } from '../../src/server/cms/repositories/assets.ts';
import { POST } from '../../src/pages/earth/api/assets/upload.ts';
import { createCmsDbFixture } from './fixture.ts';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'));

function fixture(origin = 'https://example.test') {
  const { binding, db } = createCmsDbFixture();
  const objects = new Map<string, Uint8Array>();
  let failWrite = false;
  const bucket = {
    put: async (key: string, bytes: Uint8Array) => {
      if (failWrite) throw new Error('Test storage write failure');
      objects.set(key, bytes);
    },
    get: async (key: string) => {
      const bytes = objects.get(key);
      return bytes ? { body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) } : null;
    },
  };
  const locals = { env: { DB: binding, MEDIA_BUCKET: bucket } };
  async function upload(name = 'photo.png') {
    const form = new FormData();
    form.set('file', new File([PNG], name, { type: 'image/png' }));
    return POST({ request: new Request(`${origin}/earth/api/assets/upload`, { method: 'POST', body: form }), locals } as never) as Promise<Response>;
  }
  async function read(url: string, method = 'GET') {
    const key = decodeURIComponent(new URL(url).pathname.slice('/media/assets/'.length));
    return (method === 'HEAD' ? HEAD : GET)({ params: { key }, locals, request: new Request(url, { method }) } as never) as Promise<Response>;
  }
  return { binding, db, objects, upload, read, failWrites: () => { failWrite = true; } };
}

test('uploading the same image after removing it from editor reuses the asset', async () => {
  const f = fixture();
  try {
    const first = await f.upload();
    assert.equal(first.status, 201);
    const original = await first.json();
    // Removing a Markdown image only removes its reference, not the stored file.
    const second = await f.upload();
    assert.ok(second.ok, `retry returned ${second.status}: ${await second.clone().text()}`);
    assert.deepEqual(await second.json(), original);
    assert.equal((await f.db.all('SELECT * FROM assets')).length, 1);
    assert.equal(f.objects.size, 1);
    assert.ok(original.url.startsWith('https://example.test/media/assets/'));
    const delivered = await f.read(original.url);
    assert.equal(delivered.status, 200);
    assert.equal(delivered.headers.get('content-type'), 'image/png');
    assert.equal(delivered.headers.get('x-content-type-options'), 'nosniff');
    assert.match(delivered.headers.get('cache-control')!, /immutable/);
    assert.deepEqual(new Uint8Array(await delivered.arrayBuffer()), PNG);
    const head = await f.read(original.url, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    f.objects.clear();
    assert.equal((await f.read(original.url)).status, 404);
    const repaired = await f.upload();
    assert.deepEqual(await repaired.json(), original);
    assert.equal((await f.read(original.url)).status, 200);
  } finally { f.binding.close(); }
});

test('concurrent duplicate uploads keep one public asset identity', async () => {
  const f = fixture();
  try {
    const responses = await Promise.all([f.upload(), f.upload(), f.upload()]);
    assert.ok(responses.every(response => response.ok));
    const values = await Promise.all(responses.map(response => response.json()));
    assert.ok(values.every(value => value.id === values[0].id));
    assert.equal((await f.db.all('SELECT * FROM assets')).length, 1);
  } finally { f.binding.close(); }
});

test('retry completes an interrupted private registration without replacing its ID', async () => {
  const f = fixture();
  try {
    const metadata = await extractImageMetadata(PNG);
    const key = buildAssetKey(metadata.sha256, 'photo.png');
    await createAsset(f.db, { id: 'asset_interrupted', mediaKind: 'photo', privateR2Key: key, ...metadata });
    const url = `https://example.test/media/${key}`;
    f.objects.set(key, PNG);
    assert.equal((await f.read(url)).status, 404);
    const response = await f.upload();
    assert.equal(response.status, 201);
    assert.equal((await response.json()).id, 'asset_interrupted');
    assert.equal((await f.read(url)).status, 200);
  } finally { f.binding.close(); }
});

test('media delivery separates environments and rejects unknown or unsafe keys', async () => {
  const local = fixture('https://local.example.test');
  const production = fixture('https://production.example.test');
  try {
    const upload = await local.upload();
    const asset = await upload.json();
    assert.equal(new URL(asset.url).origin, 'https://local.example.test');
    assert.equal((await local.read(asset.url)).status, 200);
    assert.equal((await production.read(asset.url)).status, 404);
    for (const suffix of ['invalid/photo.png', `${'a'.repeat(64)}/photo.png`, `${'a'.repeat(64)}/nested/photo.png`]) {
      const response = await local.read(`https://local.example.test/media/assets/${suffix}`);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  } finally { local.binding.close(); production.binding.close(); }
});

test('failed storage writes do not register a public asset', async () => {
  const f = fixture();
  try {
    f.failWrites();
    assert.equal((await f.upload()).status, 500);
    assert.equal((await f.db.all('SELECT * FROM assets')).length, 0);
  } finally { f.binding.close(); }
});
