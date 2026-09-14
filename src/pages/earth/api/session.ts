import type { APIRoute } from 'astro';

import { verifyAccessJwt, type AccessEnvironment } from '../../../server/cms/access.ts';
import { privateJson } from '../../../server/cms/api.ts';
import { resolveRuntimeEnv } from '../../../server/cms/runtime-env.ts';

export const prerender = false;

/**
 * Reports who the Access JWT says is signed in, for the Settings panel.
 * Independent of the earth middleware's own verification (redundant, but
 * cheap — JWKS is TTL-cached) rather than threading the payload through
 * `locals`, so this stays a self-contained, low-risk addition.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return privateJson({ email: null });

  try {
    const environment = await resolveRuntimeEnv<AccessEnvironment>(locals);
    const payload = await verifyAccessJwt(assertion, environment);
    const email = typeof payload.email === 'string' ? payload.email : null;
    return privateJson({ email });
  } catch {
    return privateJson({ email: null });
  }
};
