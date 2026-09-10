// @ts-check
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import sanity from '@sanity/astro';

const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } = loadEnv(
  process.env.NODE_ENV ?? 'development',
  process.cwd(),
  ''
);
const hasLegacySanity = Boolean(PUBLIC_SANITY_PROJECT_ID);

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
    ...(hasLegacySanity
      ? [sanity({
          projectId: PUBLIC_SANITY_PROJECT_ID,
          dataset: PUBLIC_SANITY_DATASET || 'production',
          useCdn: false,
          studioBasePath: '/admin',
        })]
      : []),
  ],

  image: {
    dangerouslyProcessSVG: true,
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        ...(!hasLegacySanity
          ? { 'sanity:client': fileURLToPath(new URL('./src/lib/sanityClientFallback.ts', import.meta.url)) }
          : {}),
      },
    },
  }
});
