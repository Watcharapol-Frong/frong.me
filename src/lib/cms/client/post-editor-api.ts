import type { Language } from '../contracts.ts';
import {
  createPost,
  describeConflict,
  getPost,
  publishPost,
  unpublishPost,
  updatePostDraft,
  type CmsClientOptions,
  type PostDetail,
} from './api.ts';

/** UI payload. `status` is an editor intent, not a field accepted by the strict posts API. */
export interface PostEditorDraft {
  id: string;
  lang: Language;
  title: string;
  slug: string;
  excerpt: string;
  tagIds: string[];
  status: 'draft' | 'published';
  bodyMarkdown: string;
}

export interface PostEditorPublishResult {
  post: PostDetail;
}

/** Publish failed after the draft may already have been saved successfully. */
export class PostEditorPublishError extends Error {
  readonly post: PostDetail;

  constructor(message: string, post: PostDetail, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'PostEditorPublishError';
    this.post = post;
  }
}

export interface PostEditorApi {
  fetch(postId: string): Promise<PostDetail>;
  save(draft: PostEditorDraft, current: PostDetail | null): Promise<PostDetail>;
  publish(draft: PostEditorDraft, current: PostDetail | null): Promise<PostEditorPublishResult>;
  unpublish(current: PostDetail): Promise<PostDetail>;
}

function conflictError(result: { ok: false; conflict: Parameters<typeof describeConflict>[0] }): Error {
  return new Error(describeConflict(result.conflict));
}

/**
 * Same-origin adapter for PostEditor. The shared client supplies JSON headers,
 * same-origin credentials, response validation, and structured conflict handling.
 */
export function createPostEditorApi(options?: CmsClientOptions): PostEditorApi {
  async function update(draft: PostEditorDraft, current: PostDetail): Promise<PostDetail> {
    const result = await updatePostDraft(
      current.id,
      {
        draft: {
          expectedDraftVersion: current.draftVersion,
          lang: draft.lang,
          translationGroupId: current.translationGroupId,
          slug: draft.slug,
          title: draft.title,
          excerpt: draft.excerpt || null,
          bodyMarkdown: draft.bodyMarkdown,
        },
        categoryIds: current.categoryIds,
        tagIds: draft.tagIds,
        sources: current.sources,
      },
      options,
    );
    if (!result.ok) throw conflictError(result);
    return result.data;
  }

  async function save(draft: PostEditorDraft, current: PostDetail | null): Promise<PostDetail> {
    if (current) return update(draft, current);

    const created = await createPost(
      {
        id: draft.id,
        lang: draft.lang,
        slug: draft.slug,
        title: draft.title,
        ...(draft.excerpt ? { excerpt: draft.excerpt } : {}),
        ...(draft.bodyMarkdown ? { bodyMarkdown: draft.bodyMarkdown } : {}),
      },
      options,
    );
    if (!created.ok) {
      // A POST may have reached D1 even if its response was lost. Reusing the
      // client-generated id lets a retry recover that row without duplicating it.
      try {
        return await update(draft, await getPost(draft.id, options));
      } catch {
        throw conflictError(created);
      }
    }

    // CreatePostInput intentionally contains no taxonomy. Apply selected tag
    // ids through the version-guarded PUT bundle after the row exists.
    return draft.tagIds.length > 0 ? update(draft, created.data) : created.data;
  }

  return {
    fetch: (postId) => getPost(postId, options),
    save,
    async publish(draft, current) {
      const post = await save({ ...draft, status: 'draft' }, current);
      try {
        const result = await publishPost(post.id, post.draftVersion, options);
        if (!result.ok) throw conflictError(result);
        return { post: result.data };
      } catch (cause) {
        throw new PostEditorPublishError(
          cause instanceof Error ? cause.message : 'The post could not be published.',
          post,
          { cause },
        );
      }
    },
    async unpublish(current) {
      const result = await unpublishPost(current.id, current.draftVersion, options);
      if (!result.ok) throw conflictError(result);
      return result.data;
    },
  };
}
