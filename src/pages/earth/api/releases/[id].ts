import type { APIRoute } from 'astro';

import { parseCmsIdentifier, parseReleaseManifest } from '../../../../lib/cms/validation.ts';
import { resolveCmsDatabase, privateJson, releaseRowToSummary } from '../../../../server/cms/api.ts';
import { cmsErrorResponse } from '../../../../server/cms/errors.ts';
import { countVisibleReleaseItems, getRelease } from '../../../../server/cms/repositories/releases.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const releaseId = parseCmsIdentifier(params.id, 'params.id');
    const db = await resolveCmsDatabase(locals);
    const release = await getRelease(db, releaseId);
    const manifest = parseReleaseManifest(JSON.parse(release.manifest_json) as unknown);
    const counts = await countVisibleReleaseItems(db, [releaseId]);
    return privateJson({
      release: releaseRowToSummary(release, counts.get(releaseId) ?? 0),
      manifest,
    });
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
