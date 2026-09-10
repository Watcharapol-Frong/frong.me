import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ locals }) =>
  Response.json(
    { authenticated: true, owner: locals.owner?.email },
    { headers: { 'cache-control': 'no-store' } },
  );

export const POST: APIRoute = ({ locals }) =>
  Response.json(
    { accepted: true, owner: locals.owner?.email },
    { headers: { 'cache-control': 'no-store' } },
  );
