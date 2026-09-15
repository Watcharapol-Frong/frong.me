import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('the application has no retired CMS or separate AI deployment entry point', () => {
  for (const path of [
    'sanity.config.ts', 'sanity/schemaTypes/index.ts',
    'ai-worker/package.json', 'ai-worker/wrangler.jsonc',
    '.github/workflows/sanity-backup.yml', 'scripts/migrate-to-sanity.mjs',
    'src/server/cms/types/ai.ts',
  ]) assert.equal(existsSync(join(root, path)), false, path);
  assert.doesNotMatch(read('astro.config.mjs'), /sanity|studioBasePath/);
});

test('required tools are direct dependencies without the retired Sanity dependency tree', () => {
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(manifest.dependencies.sanity, undefined);
  assert.equal(manifest.dependencies['@sanity/astro'], undefined);
  for (const name of ['typescript', 'jsonc-parser', '@types/markdown-it', '@types/node']) {
    assert.ok(manifest.devDependencies[name], name);
  }
  assert.equal(Object.keys(lock.packages).some((path) => /node_modules\/(?:@sanity\/|sanity(?:\/|$))/.test(path)), false);
});

test('application source never imports archives, Sanity or a standalone AI Worker', () => {
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.(?:ts|tsx|js|mjs|astro)$/.test(entry.name)) {
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /(?:from\s*|import\s*\()?['"][^'"]*(?:@sanity|sanity:|ai-worker\/|archive\/)/, path);
        assert.doesNotMatch(source, /AI_WORKER_URL|AI_WORKER_SECRET|ai-assistant-worker\.frongbook/, path);
      }
    }
  }
  inspect(join(root, 'src'));
});

test('historical exports retain their original bytes after relocation', () => {
  const hashes = {
    'production-2026-09-01.tar.gz': 'ec84513bc87212ab581c941d606aeb22bcc9fe594624d3d72c8914de31901380',
    'production-2026-09-07.tar.gz': '788a9fbc9754ee62c1161a9b180ff463fb59021f22c3fbe2976e7aab7ba78daf',
    'production-2026-09-14.tar.gz': 'c1f493c8a9ccac2ed3b4164c072e729276479f9d855d2414f3eac9f6a95e2820',
  };
  for (const [name, hash] of Object.entries(hashes)) {
    const bytes = readFileSync(join(root, 'archive/sanity', name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  }
});

test('operational Access verification is read-only and targets existing routes', () => {
  const script = read('scripts/build/verify-access-staging.mjs');
  assert.doesNotMatch(script, /\/earth\/api\/releases|RELEASE_CALLBACK_SECRET|createCallbackProbe/);
  assert.doesNotMatch(script, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.match(script, /\/earth\/api\/posts/);
});
