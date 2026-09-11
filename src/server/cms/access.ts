import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';

export const ACCESS_JWKS_TTL_MS = 5 * 60 * 1000;

export interface AccessEnvironment {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ENABLE_ACCESS_DEV_BYPASS?: string;
}

export class AccessVerificationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? 'Unauthorized' : 'Forbidden');
    this.name = 'AccessVerificationError';
    this.status = status;
  }
}

const remoteJwks = new Map<string, JWTVerifyGetKey>();

function required(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new AccessVerificationError(403);
  return normalized;
}

function accessOrigin(teamDomain: string): string {
  let url: URL;
  try {
    const value = required(teamDomain);
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new AccessVerificationError(403);
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith('.cloudflareaccess.com')
  ) {
    throw new AccessVerificationError(403);
  }

  return url.origin;
}

function getRemoteJwks(origin: string): JWTVerifyGetKey {
  const certsUrl = `${origin}/cdn-cgi/access/certs`;
  let jwks = remoteJwks.get(certsUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(certsUrl), {
      cacheMaxAge: ACCESS_JWKS_TTL_MS,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
    remoteJwks.set(certsUrl, jwks);
  }
  return jwks;
}

/**
 * Verifies a Cloudflare Access assertion with jose. jose validates the
 * signature and registered time claims; audience and issuer are constrained
 * here to this Access application and team.
 */
export async function verifyAccessJwt(
  assertion: string,
  environment: AccessEnvironment,
  jwks?: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const origin = accessOrigin(required(environment.CF_ACCESS_TEAM_DOMAIN));
  const audience = required(environment.CF_ACCESS_AUD);

  try {
    const result = await jwtVerify(assertion, jwks ?? getRemoteJwks(origin), {
      algorithms: ['RS256'],
      audience,
      issuer: origin,
    });
    return result.payload;
  } catch (error) {
    if (error instanceof AccessVerificationError) throw error;
    throw new AccessVerificationError(403);
  }
}

