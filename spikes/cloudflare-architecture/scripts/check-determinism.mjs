import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);

async function runBuild() {
  await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`astro build exited ${code}`))));
  });
}

async function hashTree(directory) {
  const hash = createHash('sha256');
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        hash.update(relative(directory, path));
        hash.update(await readFile(path));
      }
    }
  }
  await visit(directory);
  return hash.digest('hex');
}

const publicOutputPath = fileURLToPath(new URL('../dist/client', import.meta.url));

await runBuild();
const first = await hashTree(publicOutputPath);
await runBuild();
const second = await hashTree(publicOutputPath);
if (first !== second) throw new Error(`Build output changed: ${first} != ${second}`);
console.log(`Deterministic public-output SHA-256: ${first}`);
