import type { APIRoute } from 'astro';

import { parseCmsIdentifier, parseConfirmReleaseInput } from '../../../../../lib/cms/validation.ts';
import {
  databaseFromLocals,
  privateJson,
  readJsonRequest,
  releaseRowToSummary,
} from '../../../../../server/cms/api.ts';
import { CmsStateTransitionError, cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import {
  confirmReleaseLive,
  countVisibleReleaseItems,
  getRelease,
  getReleaseAttempt,
  transitionRelease,
  transitionReleaseAttempt,
} from '../../../../../server/cms/repositories/releases.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const releaseId = parseCmsIdentifier(params.id, 'params.id');
    const input = parseConfirmReleaseInput(await readJsonRequest(request));
    const db = databaseFromLocals(locals);
    const [currentRelease, currentAttempt] = await Promise.all([
      getRelease(db, releaseId),
      getReleaseAttempt(db, input.attemptId),
    ]);
    if (currentAttempt.release_id !== releaseId) {
      throw new CmsStateTransitionError('Release attempt does not belong to this release');
    }
    if (currentRelease.status === 'building' && currentAttempt.status === 'building') {
      await transitionReleaseAttempt(db, input.attemptId, 'building', 'deploying');
      await transitionRelease(db, releaseId, 'building', 'deploying');
    }
    const release = await confirmReleaseLive(db, { releaseId, ...input });
    const counts = await countVisibleReleaseItems(db, [release.id]);
    return privateJson({
      liveReleaseId: release.id,
      release: releaseRowToSummary(release, counts.get(release.id) ?? 0),
    });
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
