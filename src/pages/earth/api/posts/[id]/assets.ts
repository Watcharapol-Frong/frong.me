import type { APIRoute } from 'astro';

import { parseAttachPostAssetInput, parseCmsIdentifier } from '../../../../../lib/cms/validation.ts';
import {
  databaseFromLocals,
  postDetailDto,
  privateJson,
  readJsonRequest,
} from '../../../../../server/cms/api.ts';
import { CmsConflictError, cmsErrorResponse } from '../../../../../server/cms/errors.ts';
import {
  addPostAssetUsage,
  listPostAssetDetails,
} from '../../../../../server/cms/repositories/assets.ts';
import { getPostDraft } from '../../../../../server/cms/repositories/posts.ts';
import {
  getPostTaxonomy,
  listPostSources,
} from '../../../../../server/cms/repositories/taxonomy.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, params }) => {
  let db: ReturnType<typeof databaseFromLocals> | undefined;
  let postId: string | undefined;
  try {
    db = databaseFromLocals(locals);
    postId = parseCmsIdentifier(params.id, 'params.id');
    const input = parseAttachPostAssetInput(await readJsonRequest(request));
    await addPostAssetUsage(db, { ...input, postId });
    const post = await getPostDraft(db, postId);
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
          details: { ...error.details, currentDraftVersion: current.draft_version },
        }));
      } catch {
        // Preserve the original conflict when the current row cannot be read.
      }
    }
    return cmsErrorResponse(error);
  }
};
