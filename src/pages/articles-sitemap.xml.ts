import type { APIRoute } from 'astro';

import { resolveCmsDatabase } from '../server/cms/api.ts';
import { listPublishedSitemapEntries } from '../server/cms/repositories/public.ts';

export const prerender = false;

const SITE_ORIGIN = 'https://frong.me';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

export const GET: APIRoute = async ({ locals }) => {
  const db = await resolveCmsDatabase(locals);
  const posts = await listPublishedSitemapEntries(db);
  const urls = posts.map(({ slug, updated_at }) => {
    const url = new URL(`/articles/${encodeURIComponent(slug)}`, SITE_ORIGIN);
    return `  <url><loc>${escapeXml(url.toString())}</loc><lastmod>${new Date(updated_at).toISOString()}</lastmod></url>`;
  });

  return new Response([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n'), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=900',
    },
  });
};
