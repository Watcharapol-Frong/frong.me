import type { APIRoute } from 'astro';

import { parseCmsIdentifier, parseConfirmReleaseInput } from '../../../../../lib/cms/validation.ts';
import {
  databaseFromLocals,
  privateJson,
  readJsonRequest,
  releaseRowToSummary,
} from '../../../../../server/cms/api.ts';
import { cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import {
  confirmReleaseLive,
  countVisibleReleaseItems,
} from '../../../../../server/cms/repositories/releases.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const releaseId = parseCmsIdentifier(params.id, 'params.id');
    const input = parseConfirmReleaseInput(await readJsonRequest(request));
    const db = databaseFromLocals(locals);
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
