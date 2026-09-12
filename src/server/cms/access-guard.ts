import {
  AccessVerificationError,
  verifyAccessJwt,
  type AccessEnvironment,
} from './access';
import { resolveRuntimeEnv } from './runtime-env';

type VerifyAccessJwt = typeof verifyAccessJwt;

export interface EarthMiddlewareContext {
  url: URL;
  request: Request;
  locals: unknown;
}

export type EarthMiddlewareHandler = (
  context: EarthMiddlewareContext,
  next: () => Promise<Response>,
) => Promise<Response>;

export function isEarthRoute(pathname: string): boolean {
  return pathname === '/earth' || pathname.startsWith('/earth/');
}

export function isAccessDevBypassEnabled(
  isDev: boolean,
  configuredValue: string | undefined,
): boolean {
  return isDev === true && configuredValue === 'true';
}

function denied(status: 401 | 403): Response {
  return new Response(JSON.stringify({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

interface EarthMiddlewareOptions {
  isDev: boolean;
  verify?: VerifyAccessJwt;
}

export function createEarthMiddleware(options: EarthMiddlewareOptions): EarthMiddlewareHandler {
  const verify = options.verify ?? verifyAccessJwt;

  return async (context, next) => {
    if (!isEarthRoute(context.url.pathname)) return next();

    const environment = await resolveRuntimeEnv<AccessEnvironment>(context.locals);

    if (isAccessDevBypassEnabled(options.isDev, environment.ENABLE_ACCESS_DEV_BYPASS)) {
      return next();
    }

    const assertion = context.request.headers.get('Cf-Access-Jwt-Assertion');
    if (!assertion) return denied(401);

    try {
      await verify(assertion, environment);
      return next();
    } catch (error) {
      return denied(error instanceof AccessVerificationError ? error.status : 403);
    }
  };
}

