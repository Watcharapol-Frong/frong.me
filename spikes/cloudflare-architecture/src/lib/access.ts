import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export class AccessDenied extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AccessDenied';
    this.status = status;
  }
}

type AccessConfig = Pick<
  Env,
  'CF_ACCESS_TEAM_DOMAIN' | 'CF_ACCESS_AUD' | 'CF_ACCESS_ALLOWED_EMAIL'
>;

type VerifyJwt = (
  token: string,
  jwks: ReturnType<typeof createRemoteJWKSet>,
  options: {
    issuer: string;
    audience: string;
    algorithms: string[];
  },
) => Promise<{ payload: JWTPayload }>;

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new AccessDenied(`Server auth configuration is missing: ${name}`, 503);
  return value.trim();
}

function normalizeTeamDomain(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.cloudflareaccess.com') ||
    url.pathname !== '/'
  ) {
    throw new AccessDenied('Server auth configuration has an invalid team domain', 503);
  }
  return url.origin;
}

export async function verifyAccessRequest(
  request: Request,
  config: AccessConfig,
  verifyJwt: VerifyJwt = jwtVerify,
) {
  const teamDomain = normalizeTeamDomain(
    required(config.CF_ACCESS_TEAM_DOMAIN, 'CF_ACCESS_TEAM_DOMAIN'),
  );
  const audience = required(config.CF_ACCESS_AUD, 'CF_ACCESS_AUD');
  const allowedEmail = required(
    config.CF_ACCESS_ALLOWED_EMAIL,
    'CF_ACCESS_ALLOWED_EMAIL',
  ).toLowerCase();
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new AccessDenied('Missing Cloudflare Access token');

  let payload: JWTPayload;
  try {
    const result = await verifyJwt(
      token,
      createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)),
      { issuer: teamDomain, audience, algorithms: ['RS256'] },
    );
    payload = result.payload;
  } catch {
    throw new AccessDenied('Invalid Cloudflare Access token');
  }

  if (payload.type !== 'app') throw new AccessDenied('Invalid Cloudflare Access token type', 403);
  if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== allowedEmail) {
    throw new AccessDenied('Owner authorization required', 403);
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new AccessDenied('Invalid Cloudflare Access subject', 403);
  }

  return { email: payload.email.toLowerCase(), subject: payload.sub };
}

export function assertMutationOrigin(request: Request, configuredOrigin: string | undefined) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const allowedOrigin = required(configuredOrigin, 'CMS_SITE_ORIGIN');
  if (request.headers.get('origin') !== allowedOrigin) {
    throw new AccessDenied('Invalid request origin', 403);
  }
}
