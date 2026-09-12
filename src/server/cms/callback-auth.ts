import { CmsServiceUnavailableError, CmsUnauthorizedError } from './errors.ts';

export interface ReleaseCallbackEnvironment {
  RELEASE_CALLBACK_SECRET?: string;
}

const CALLBACK_SECRET_HEADER = 'X-Release-Callback-Secret';

function isConfiguredSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length > 0;
}

async function secretsMatch(actual: string | null, expected: string): Promise<boolean> {
  if (typeof actual !== 'string' || actual.length === 0) return false;
  const encoder = new TextEncoder();
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/**
 * Every /earth/* route already sits behind the Cloudflare Access JWT middleware.
 * This adds a second, independent secret for release-attempt callbacks specifically,
 * so a workflow's Access service-token credentials cannot alone confirm or fail a
 * deployment attempt if they were ever reused or scoped more broadly than intended.
 */
export async function verifyReleaseCallbackSecret(
  request: Request,
  env: ReleaseCallbackEnvironment,
): Promise<void> {
  if (!isConfiguredSecret(env.RELEASE_CALLBACK_SECRET)) {
    throw new CmsServiceUnavailableError('Release callback is not configured');
  }
  const provided = request.headers.get(CALLBACK_SECRET_HEADER);
  const authenticated = await secretsMatch(provided, env.RELEASE_CALLBACK_SECRET);
  if (!authenticated) {
    throw new CmsUnauthorizedError('Release callback secret is missing or incorrect');
  }
}
