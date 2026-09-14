import type { Language, PostLifecycle } from '../contracts.ts';
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
  coverUrl: string;
  coverCrop: { x: number; y: number; zoom: number } | null;
}

export interface PostEditorPublishResult {
  post: PostDetail;
}

/** Publish failed after the draft may already have been saved successfully. */
export class PostEditorPublishError extends Error {
  readonly post: PostDetail;
  /** Set when the failure was a 409 that reported the server's current version. */
  readonly currentDraftVersion?: number;
  /** Set when the 409 also reported the row's current lifecycle (see {@link PostEditorConflictError}). */
  readonly currentLifecycle?: PostLifecycle;

  constructor(message: string, post: PostDetail, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'PostEditorPublishError';
    this.post = post;
    this.currentDraftVersion = options.cause instanceof PostEditorConflictError
      ? options.cause.currentDraftVersion
      : undefined;
    this.currentLifecycle = options.cause instanceof PostEditorConflictError
      ? options.cause.currentLifecycle
      : undefined;
  }
}

/**
 * A 409 from the server. Carries the server's current draft version (when it
 * reported one) so the caller can advance its in-memory `currentPost` before
 * the next explicit save — without that, every retry keeps resending the
 * same stale `expectedDraftVersion` and conflicts forever, even when the
 * mismatch was caused by the editor's own earlier request landing but its
 * response getting lost, not by a genuine concurrent edit.
 *
 * Deliberately does not auto-retry: doing so would resend the same in-memory
 * title/body under the corrected version number with no visible signal,
 * which would silently overwrite a real concurrent edit if that's what
 * actually caused the conflict. Surfacing the version bump only sets up the
 * next explicit user-triggered save to succeed.
 */
export class PostEditorConflictError extends Error {
  readonly currentDraftVersion?: number;
  /**
   * The row's current lifecycle, when publish/unpublish reported one. Present
   * only for those two actions, each of which matches exactly one lifecycle
   * server-side — its presence means the mismatch is a lifecycle guard, not
   * a stale version, so no retry at any version can succeed.
   */
  readonly currentLifecycle?: PostLifecycle;

  constructor(
    message: string,
    currentDraftVersion: number | undefined,
    options: { cause?: unknown; currentLifecycle?: PostLifecycle } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'PostEditorConflictError';
    this.currentDraftVersion = currentDraftVersion;
    this.currentLifecycle = options.currentLifecycle;
  }
}

export interface PostEditorApi {
  fetch(postId: string): Promise<PostDetail>;
  save(draft: PostEditorDraft, current: PostDetail | null): Promise<PostDetail>;
  publish(draft: PostEditorDraft, current: PostDetail | null): Promise<PostEditorPublishResult>;
  unpublish(current: PostDetail): Promise<PostDetail>;
}

function conflictError(result: { ok: false; conflict: Parameters<typeof describeConflict>[0] }): PostEditorConflictError {
  return new PostEditorConflictError(describeConflict(result.conflict), result.conflict.currentDraftVersion, {
    currentLifecycle: result.conflict.currentLifecycle,
  });
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
          coverImageUrl: draft.coverUrl.trim() || null,
          coverCrop: draft.coverUrl.trim() ? draft.coverCrop : null,
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
        ...(draft.coverUrl.trim() ? { coverImageUrl: draft.coverUrl.trim() } : {}),
        ...(draft.coverUrl.trim() && draft.coverCrop ? { coverCrop: draft.coverCrop } : {}),
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
