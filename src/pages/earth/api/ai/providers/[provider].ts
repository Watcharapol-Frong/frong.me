import type { APIRoute } from 'astro';

import { resolveCmsDatabase, privateJson, readJsonRequest } from '../../../../../server/cms/api.ts';
import { CmsBadRequestError, cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import { resolveAiEnvironment, validateProviderApiKey } from '../../../../../server/cms/ai.ts';
import { updateAiProviderConfig } from '../../../../../server/cms/repositories/ai-provider-configs.ts';
import {
  AI_PROVIDER_CONFIG_LIMITS,
  AI_PROVIDERS,
  type AiConfiguredModel,
  type AiProvider,
  type UpdateAiProviderConfigInput,
} from '../../../../../types/ai.ts';

export const prerender = false;

function parseProvider(raw: string | undefined): AiProvider {
  if (!raw || !(AI_PROVIDERS as readonly string[]).includes(raw)) {
    throw new CmsBadRequestError('Unknown provider');
  }
  return raw as AiProvider;
}

function parseUpdateInput(raw: unknown): UpdateAiProviderConfigInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CmsBadRequestError('Request body must be a JSON object');
  }
  const body = raw as Record<string, unknown>;

  let apiKey: string | null | undefined;
  if ('apiKey' in body && body.apiKey !== undefined) {
    if (body.apiKey !== null) {
      if (typeof body.apiKey !== 'string' || body.apiKey.length > AI_PROVIDER_CONFIG_LIMITS.MAX_API_KEY_LENGTH) {
        throw new CmsBadRequestError('Invalid apiKey');
      }
    }
    apiKey = body.apiKey;
  }

  if (!Array.isArray(body.models)) {
    throw new CmsBadRequestError('models must be an array');
  }

  return { apiKey, models: body.models as AiConfiguredModel[] };
}

/** Saves one provider's BYOK config: its API key (if changed) and its chosen 1-5 models. */
export const PUT: APIRoute = async ({ request, locals, params }) => {
  try {
    const provider = parseProvider(params.provider);
    const input = parseUpdateInput(await readJsonRequest(request));

    // A newly-typed key is verified against the provider before it's ever
    // persisted, so a typo or a revoked key is caught here rather than
    // silently saved and only discovered later, mid-generation, in the editor.
    if (input.apiKey) {
      const env = await resolveAiEnvironment(locals);
      await validateProviderApiKey(provider, input.apiKey, env.fetcher);
    }

    const db = await resolveCmsDatabase(locals);
    const config = await updateAiProviderConfig(db, provider, input);
    return privateJson(config);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
