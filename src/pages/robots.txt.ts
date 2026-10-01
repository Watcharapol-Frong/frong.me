import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '../lib/search-policy.ts';

export const prerender = false;

export const GET: APIRoute = ({ url }) => new Response(buildRobotsTxt(url), {
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=60, s-maxage=300',
  },
});
