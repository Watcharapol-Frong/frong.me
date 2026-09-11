import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'astro/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, '../..'),
  srcDir: resolve(__dirname, './e2e-src'),
  outDir: resolve(__dirname, '../../dist'),
  site: 'https://frong.me',
  output: 'static',
});

