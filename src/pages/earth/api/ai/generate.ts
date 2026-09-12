import type { APIRoute } from 'astro';

import { AI_LIMITS, type AiGenerateResponse } from '../../../../types/ai.ts';
import {
  AiProviderConfigError,
  AiProviderRequestError,
  generateAiResult,
  parseAiGenerateRequest,
  resolveAiEnvironment,
} from '../../../../server/cms/ai.ts';
import { mapCmsError } from '../../../../server/cms/errors.ts';

export const prerender = false;

const MAX_REQUEST_BYTES = AI_LIMITS.MAX_REQUEST_BYTES;

function aiJson(body: AiGenerateResponse, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const ALL: APIRoute = async () => {
  return aiJson({ error: 'Method not allowed' }, 405);
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    if (request.method !== 'POST') {
      return aiJson({ error: 'Method not allowed' }, 405);
    }

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return aiJson({ error: 'Content-Type must be application/json' }, 415);
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return aiJson({ error: 'Request body too large' }, 413);
    }

    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_REQUEST_BYTES) {
      return aiJson({ error: 'Request body too large' }, 413);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return aiJson({ error: 'Request body must be a JSON object' }, 400);
    }

    const input = parseAiGenerateRequest(parsed);
    const env = await resolveAiEnvironment(locals);
    const result = await generateAiResult(input, env);
    return aiJson({ result });
  } catch (error) {
    if (error instanceof AiProviderConfigError || error instanceof AiProviderRequestError) {
      return aiJson({ error: error.expose ? error.message : 'AI request failed' }, error.httpStatus);
    }
    const cmsError = mapCmsError(error, 'ai generate');
    return aiJson(
      {
        error: cmsError.expose ? cmsError.message : 'Internal server error',
      },
      cmsError.httpStatus,
    );
  }
};