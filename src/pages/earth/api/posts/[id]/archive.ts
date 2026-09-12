import type { APIRoute } from 'astro';

import { parseArchivePostInput, parseCmsIdentifier } from '../../../../../lib/cms/validation.ts';
import { resolveCmsDatabase, type CmsDatabase, postDetailDto, privateJson, readJsonRequest } from '../../../../../server/cms/api.ts';
import { CmsConflictError, cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import { listPostAssetDetails } from '../../../../../server/cms/repositories/assets.ts';
import { archivePost, getPostDraft } from '../../../../../server/cms/repositories/posts.ts';
import { getPostTaxonomy, listPostSources } from '../../../../../server/cms/repositories/taxonomy.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, params }) => {
  let db: CmsDatabase | undefined;
  let postId: string | undefined;
  try {
    db = await resolveCmsDatabase(locals);
    postId = parseCmsIdentifier(params.id, 'params.id');
    const { expectedDraftVersion } = parseArchivePostInput(await readJsonRequest(request));
    const post = await archivePost(db, postId, expectedDraftVersion);
    const [taxonomy, sources, assets] = await Promise.all([
      getPostTaxonomy(db, postId),
      listPostSources(db, postId),
      listPostAssetDetails(db, postId),
    ]);
    return privateJson(postDetailDto(post, taxonomy.categories, taxonomy.tags, sources, assets));
  } catch (error) {
    if (db && postId && error instanceof CmsConflictError && error.code === 'DRAFT_VERSION_CONFLICT') {
      try {
        const current = await getPostDraft(db, postId);
        return cmsErrorResponse(new CmsConflictError(error.message, error.code, {
          details: { currentDraftVersion: current.draft_version, expectedDraftVersion: undefined },
        }));
      } catch {
        // Preserve the original conflict when the current row cannot be read.
      }
    }
    return cmsErrorResponse(error);
  }
};
