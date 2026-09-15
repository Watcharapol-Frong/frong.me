import type { APIRoute } from 'astro';

import { discoverProviderModels, resolveAiEnvironment } from '../../../../../../server/cms/ai.ts';
import { resolveCmsDatabase, privateJson, readJsonRequest } from '../../../../../../server/cms/api.ts';
import { CmsBadRequestError, cmsErrorResponse } from '../../../../../../server/cms/errors.ts';
import { getAiProviderConfigForUse } from '../../../../../../server/cms/repositories/ai-provider-configs.ts';
import { AI_PROVIDER_CONFIG_LIMITS, AI_PROVIDERS, type AiProvider } from '../../../../../../types/ai.ts';

export const prerender = false;

function parseProvider(raw: string | undefined): AiProvider {
  if (!raw || !(AI_PROVIDERS as readonly string[]).includes(raw)) {
    throw new CmsBadRequestError('Unknown provider');
  }
  return raw as AiProvider;
}

/**
 * Lists a provider's live models. The request may include an `apiKey` the
 * author just typed but hasn't saved yet (so they can test before
 * committing); when omitted, falls back to whatever key is already stored.
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const provider = parseProvider(params.provider);
    const body = await readJsonRequest(request).catch(() => ({}));
    const candidateKey = typeof (body as Record<string, unknown>)?.apiKey === 'string'
      ? ((body as Record<string, unknown>).apiKey as string)
      : undefined;
    if (candidateKey !== undefined && candidateKey.length > AI_PROVIDER_CONFIG_LIMITS.MAX_API_KEY_LENGTH) {
      throw new CmsBadRequestError('Invalid apiKey');
    }

    const db = await resolveCmsDatabase(locals);
    let apiKey = candidateKey?.trim() || null;
    if (!apiKey) {
      const stored = await getAiProviderConfigForUse(db, provider);
      apiKey = stored?.apiKey ?? null;
    }

    const env = await resolveAiEnvironment(locals);
    const models = await discoverProviderModels(provider, apiKey, env.fetcher);
    return privateJson({ models });
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
