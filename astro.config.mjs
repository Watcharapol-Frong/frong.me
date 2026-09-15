// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://frong.me',
  output: 'static',
  session: false,
  adapter: cloudflare({
    prerenderEnvironment: 'workerd',
    imageService: 'compile',
  }),
  integrations: [
    react(),
    // The Earth admin routes are authenticated tooling, not public pages: keep
    // them out of the sitemap. `page` is the full URL, e.g.
    // "https://frong.me/earth/".
    sitemap({
      filter: (page) => !page.includes('/earth'),
    }),
  ],

  image: {
    dangerouslyProcessSVG: true,
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
});
