import type { APIRoute } from 'astro';

import { parseUpdateSiteSettingsInput } from '../../../lib/cms/validation.ts';
import { resolveCmsDatabase, privateJson, readJsonRequest } from '../../../server/cms/api.ts';
import { cmsErrorResponse } from '../../../server/cms/errors.ts';
import { getSiteSettings, updateSiteSettings } from '../../../server/cms/repositories/settings.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const settings = await getSiteSettings(await resolveCmsDatabase(locals));
    return privateJson(settings);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const input = parseUpdateSiteSettingsInput(await readJsonRequest(request));
    const settings = await updateSiteSettings(await resolveCmsDatabase(locals), input);
    return privateJson(settings);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
