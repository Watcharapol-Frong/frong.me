import type { APIRoute } from 'astro';

import { parseCreatePostInput, parsePostListQuery } from '../../../../lib/cms/validation.ts';
import { resolveCmsDatabase, postRowToListDto, privateJson, readJsonRequest } from '../../../../server/cms/api.ts';
import { cmsErrorResponse } from '../../../../server/cms/errors.ts';
import { createPostDraft, listPostDrafts } from '../../../../server/cms/repositories/posts.ts';
import { listCategories, listTags } from '../../../../server/cms/repositories/taxonomy.ts';
import { postDetailDto } from '../../../../server/cms/api.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const query = parsePostListQuery(new URL(request.url).searchParams);
    const db = await resolveCmsDatabase(locals);
    const [posts, categories, tags] = await Promise.all([
      listPostDrafts(db, query),
      listCategories(db),
      listTags(db),
    ]);
    return privateJson({
      posts: posts.map(postRowToListDto),
      taxonomy: {
        categories: {
          th: categories.filter((term) => term.lang === 'th').map(({ id, slug, name }) => ({ id, slug, name })),
          en: categories.filter((term) => term.lang === 'en').map(({ id, slug, name }) => ({ id, slug, name })),
        },
        tags: {
          th: tags.filter((term) => term.lang === 'th').map(({ id, slug, name }) => ({ id, slug, name })),
          en: tags.filter((term) => term.lang === 'en').map(({ id, slug, name }) => ({ id, slug, name })),
        },
      },
    });
  } catch (error) {
    return cmsErrorResponse(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const input = parseCreatePostInput(await readJsonRequest(request));
    const post = await createPostDraft(await resolveCmsDatabase(locals), input);
    return privateJson(postDetailDto(post, [], [], [], []), 201);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
