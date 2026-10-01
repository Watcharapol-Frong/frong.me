import { defineMiddleware } from 'astro:middleware';
import { createEarthMiddleware } from './server/cms/access-guard';
import { applySearchHeaders } from './server/search-policy';

const guardEarth = createEarthMiddleware({
  isDev: import.meta.env.DEV === true,
});

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await guardEarth(context, next);
  return applySearchHeaders(context.url, response);
});
