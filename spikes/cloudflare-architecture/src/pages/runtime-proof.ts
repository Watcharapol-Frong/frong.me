import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const row = await env.DB.prepare('SELECT ? AS runtime, ? AS binding')
    .bind('workerd', 'D1')
    .first<{ runtime: string; binding: string }>();

  return Response.json(row, {
    headers: { 'cache-control': 'no-store' },
  });
};
