import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { AccessDenied, assertMutationOrigin, verifyAccessRequest } from './lib/access';

function privateJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (path !== '/earth' && !path.startsWith('/earth/')) return next();

  try {
    context.locals.owner = await verifyAccessRequest(context.request, env);
    assertMutationOrigin(context.request, env.CMS_SITE_ORIGIN);
    const response = await next();
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-content-type-options', 'nosniff');
    return response;
  } catch (error) {
    if (error instanceof AccessDenied) return privateJson(error.message, error.status);
    return privateJson('Authentication failed', 401);
  }
});
