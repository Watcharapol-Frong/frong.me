import type { APIRoute } from 'astro';

import { resolveCmsDatabase, privateJson } from '../../../../../server/cms/api.ts';
import { cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import { getAiProviderConfigs } from '../../../../../server/cms/repositories/ai-provider-configs.ts';

export const prerender = false;

/** Lists every provider's BYOK config (masked — `hasApiKey`, never the key itself). */
export const GET: APIRoute = async ({ locals }) => {
  try {
    const configs = await getAiProviderConfigs(await resolveCmsDatabase(locals));
    return privateJson(configs);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
