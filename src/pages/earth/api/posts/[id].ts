import type { APIRoute } from 'astro';

import {
  parseArchivePostInput,
  parseCmsIdentifier,
  parseUpdatePostBundleInput,
  parseUpdatePostDraftInput,
} from '../../../../lib/cms/validation.ts';
import {
  databaseFromLocals,
  postDetailDto,
  privateJson,
  readJsonRequest,
} from '../../../../server/cms/api.ts';
import { CmsConflictError, cmsErrorResponse } from '../../../../server/cms/errors.ts';
import { listPostAssetDetails } from '../../../../server/cms/repositories/assets.ts';
import {
  archivePost,
  getPostDraft,
  updatePostDraft,
  updatePostBundle,
} from '../../../../server/cms/repositories/posts.ts';
import {
  getPostTaxonomy,
  listPostSources,
} from '../../../../server/cms/repositories/taxonomy.ts';

export const prerender = false;

async function loadPostDetail(db: ReturnType<typeof databaseFromLocals>, postId: string) {
  const post = await getPostDraft(db, postId);
  const [taxonomy, sources, assets] = await Promise.all([
    getPostTaxonomy(db, postId),
    listPostSources(db, postId),
    listPostAssetDetails(db, postId),
  ]);
  return postDetailDto(post, taxonomy.categories, taxonomy.tags, sources, assets);
}

function postId(params: Record<string, string | undefined>): string {
  return parseCmsIdentifier(params.id, 'params.id');
}

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const db = databaseFromLocals(locals);
    return privateJson(await loadPostDetail(db, postId(params)));
  } catch (error) {
    return cmsErrorResponse(error);
  }
};

async function updateResponse(
  request: Request,
  locals: unknown,
  params: Record<string, string | undefined>,
  bundled: boolean,
): Promise<Response> {
  let db: ReturnType<typeof databaseFromLocals> | undefined;
  let id: string | undefined;
  try {
    db = databaseFromLocals(locals);
    id = postId(params);
    const json = await readJsonRequest(request);
    if (bundled) {
      const input = parseUpdatePostBundleInput(json);
      await updatePostBundle(db, id, input);
    } else {
      const input = parseUpdatePostDraftInput(json);
      await updatePostDraft(db, id, input);
    }
    return privateJson(await loadPostDetail(db, id));
  } catch (error) {
    if (db && id && error instanceof CmsConflictError && error.code === 'DRAFT_VERSION_CONFLICT') {
      try {
        const current = await getPostDraft(db, id);
        return cmsErrorResponse(new CmsConflictError(error.message, error.code, {
          details: { ...error.details, currentDraftVersion: current.draft_version },
        }));
      } catch {
        // Preserve the original conflict when the current row cannot be read.
      }
    }
    return cmsErrorResponse(error);
  }
}

export const PUT: APIRoute = ({ request, locals, params }) =>
  updateResponse(request, locals, params, true);
export const PATCH: APIRoute = ({ request, locals, params }) =>
  updateResponse(request, locals, params, false);

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  let db: ReturnType<typeof databaseFromLocals> | undefined;
  let id: string | undefined;
  try {
    db = databaseFromLocals(locals);
    id = postId(params);
    const input = parseArchivePostInput(await readJsonRequest(request));
    await archivePost(db, id, input.expectedDraftVersion);
    return privateJson(await loadPostDetail(db, id));
  } catch (error) {
    if (db && id && error instanceof CmsConflictError && error.code === 'DRAFT_VERSION_CONFLICT') {
      try {
        const current = await getPostDraft(db, id);
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
