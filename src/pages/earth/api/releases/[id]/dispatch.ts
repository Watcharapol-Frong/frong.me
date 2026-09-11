import type { APIRoute } from 'astro';

import { parseCmsIdentifier, parseDispatchReleaseInput } from '../../../../../lib/cms/validation.ts';
import {
  databaseFromLocals,
  privateJson,
  readJsonRequest,
  releaseAttemptDto,
  releaseRowToSummary,
  type CmsApiLocals,
} from '../../../../../server/cms/api.ts';
import { dispatchRelease } from '../../../../../server/cms/dispatch.ts';
import { cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import { countVisibleReleaseItems } from '../../../../../server/cms/repositories/releases.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const releaseId = parseCmsIdentifier(params.id, 'params.id');
    const input = parseDispatchReleaseInput(await readJsonRequest(request));
    const db = databaseFromLocals(locals);
    const env = (locals as CmsApiLocals).runtime?.env ?? (locals as CmsApiLocals).env ?? {};
    const dispatched = await dispatchRelease(db, releaseId, input, env);
    const counts = await countVisibleReleaseItems(db, [releaseId]);
    return privateJson({
      release: releaseRowToSummary(dispatched.release, counts.get(releaseId) ?? 0),
      attempt: releaseAttemptDto(dispatched.attempt),
    }, 202);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
