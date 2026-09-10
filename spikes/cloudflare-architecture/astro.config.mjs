import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cms-staging.frong.me',
  output: 'static',
  session: false,
  adapter: cloudflare({
    configPath: process.env.CMS_WRANGLER_CONFIG,
    prerenderEnvironment: 'workerd',
    imageService: 'compile',
  }),
});
