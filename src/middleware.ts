import { defineMiddleware } from 'astro:middleware';
import { createEarthMiddleware } from './server/cms/access-guard';

export const onRequest = defineMiddleware(createEarthMiddleware({
  isDev: import.meta.env.DEV === true,
}));
