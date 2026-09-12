import type { APIRoute } from 'astro';

import { parseCmsIdentifier, parseFailReleaseAttemptInput } from '../../../../../lib/cms/validation.ts';
import {
  resolveCmsDatabase,
  resolveCmsEnvironment,
  privateJson,
  readJsonRequest,
  releaseRowToSummary,
} from '../../../../../server/cms/api.ts';
import { verifyReleaseCallbackSecret } from '../../../../../server/cms/callback-auth.ts';
import { cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import {
  countVisibleReleaseItems,
  failReleaseAttempt,
} from '../../../../../server/cms/repositories/releases.ts';

export const prerender = false;

/**
 * The workflow-side counterpart to /confirm: reports that a dispatched deployment
 * attempt failed (build error, deploy rejection) so the release does not stay
 * stuck in building/deploying forever waiting for a callback that will never arrive.
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const env = await resolveCmsEnvironment(locals);
    await verifyReleaseCallbackSecret(request, env);
    const releaseId = parseCmsIdentifier(params.id, 'params.id');
    const input = parseFailReleaseAttemptInput(await readJsonRequest(request));
    const db = await resolveCmsDatabase(locals);
    const release = await failReleaseAttempt(db, { releaseId, ...input });
    const counts = await countVisibleReleaseItems(db, [release.id]);
    return privateJson({
      release: releaseRowToSummary(release, counts.get(release.id) ?? 0),
    });
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
