/**
 * Earth admin shell.
 *
 * `PostList`, `ArticleEditor`, and `ReleaseDashboard` are deliberately
 * transport-agnostic: they hold no I/O and receive every value as props. This
 * shell is the seam where they meet `lib/cms/client/api.ts` — it owns the
 * loaded data, the editing session, and the conversion between each component's
 * view model and the wire contract.
 *
 * The three views live in one island rather than three `client:load` islands
 * because they share state: editing a post depends on which row the list
 * selected, and publishing has to refresh the list it just changed. Astro
 * islands cannot share React state, so the page mounts this component and it
 * renders the other three.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { Language } from '@/lib/cms/contracts.ts';
import {
  CmsApiError,
  beginRelease,
  buildBeginReleaseInput,
  buildRollbackReleaseInput,
  createPost,
  describeConflict,
  getPost,
  getRelease,
  getReleaseOverview,
  listPosts,
  newCmsId,
  updatePostDraft,
  type CmsConflict,
  type PostDetail,
  type PostSourceDto,
  type PostSummary,
  type ReleaseOverview,
  type TaxonomyCatalog,
} from '@/lib/cms/client/api.ts';
import { cn } from '@/lib/utils';
import PostList, { type PostListItem } from './PostList';
import ArticleEditor, {
  type ArticleDraft,
  type ArticleTranslationDraft,
  type TaxonomyOptions,
} from './ArticleEditor';
import ReleaseDashboard, {
  type PublishRequest,
  type ReleaseSummary as DashboardRelease,
} from './ReleaseDashboard';

type TabId = 'posts' | 'editor' | 'releases';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'editor', label: 'Editor' },
  { id: 'releases', label: 'Releases' },
];

const LANGUAGES: readonly Language[] = ['th', 'en'];

/** `ID_PATTERN` in `validation.ts`. Editor-local ids are minted when they fail it. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/;

/**
 * One post row per language, tracked while the editor is open. `draftVersion`
 * is the optimistic-concurrency token: every save sends the version it loaded,
 * and the server bumps it, so the value here must be replaced from each
 * response rather than incremented locally.
 */
interface EditorSession {
  /** Remounts the editor when a different post is opened. */
  key: string;
  translationGroupId: string | null;
  posts: Partial<Record<Language, { id: string; draftVersion: number }>>;
  /** Partial: a language the article does not have yet stays empty in the editor. */
  initialDraft: Partial<Record<Language, ArticleTranslationDraft>>;
  initialLang: Language;
}

interface Notice {
  tone: 'info' | 'error';
  text: string;
}

/* ------------------------------------------------------------------ */
/* View-model conversion                                               */
/* ------------------------------------------------------------------ */

function toListItem(post: PostSummary): PostListItem {
  return {
    id: post.id,
    lang: post.lang,
    translationGroupId: post.translationGroupId,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    lifecycle: post.lifecycle,
    draftVersion: post.draftVersion,
    updatedAt: post.updatedAt,
    ...(post.hasUnpublishedChanges === undefined
      ? {}
      : { hasUnpublishedChanges: post.hasUnpublishedChanges }),
  };
}

function toTranslationDraft(detail: PostDetail): ArticleTranslationDraft {
  return {
    slug: detail.slug,
    title: detail.title,
    excerpt: detail.excerpt ?? '',
    bodyMarkdown: detail.bodyMarkdown,
    categoryIds: [...detail.categoryIds],
    tagIds: [...detail.tagIds],
    sources: detail.sources.map((source) => ({
      id: source.id,
      label: source.label,
      url: source.url,
      publisher: source.publisher ?? '',
    })),
  };
}

function toTaxonomyOptions(catalog: TaxonomyCatalog): {
  categories: TaxonomyOptions;
  tags: TaxonomyOptions;
} {
  return {
    categories: { th: catalog.categories.th, en: catalog.categories.en },
    tags: { th: catalog.tags.th, en: catalog.tags.en },
  };
}

/** Sources the API will accept: HTTPS only, non-empty label, valid identifier. */
function toSourceDtos(translation: ArticleTranslationDraft): PostSourceDto[] {
  return translation.sources
    .filter((source) => source.label.trim() && source.url.trim())
    .map((source) => ({
      id: ID_PATTERN.test(source.id) ? source.id : newCmsId('src'),
      label: source.label.trim(),
      url: source.url.trim(),
      publisher: source.publisher.trim() || null,
      accessedAt: null,
    }));
}

/** A language pane the author never filled in must not create an empty post. */
function isBlank(translation: ArticleTranslationDraft): boolean {
  return (
    !translation.title.trim() && !translation.slug.trim() && !translation.bodyMarkdown.trim()
  );
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof CmsApiError) {
    return error.requiresReauthentication
      ? 'The admin session expired. Reload the page to sign in again.'
      : error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export default function EarthAdminShell() {
  const [tab, setTab] = useState<TabId>('posts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyCatalog>({
    categories: { th: [], en: [] },
    tags: { th: [], en: [] },
  });
  const [overview, setOverview] = useState<ReleaseOverview | null>(null);
  const [session, setSession] = useState<EditorSession | null>(null);

  /** Guards against a slow response overwriting newer state after unmount. */
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [postPage, releaseOverview] = await Promise.all([
        listPosts(),
        getReleaseOverview(),
      ]);
      if (!mounted.current) return;
      setPosts(postPage.posts);
      setTaxonomy(postPage.taxonomy);
      setOverview(releaseOverview);
      setLoadError(null);
    } catch (error) {
      if (!mounted.current) return;
      setLoadError(errorText(error, 'The admin data could not be loaded.'));
    } finally {
      if (!mounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const postsById = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const listItems = useMemo(() => posts.map(toListItem), [posts]);
  const taxonomyOptions = useMemo(() => toTaxonomyOptions(taxonomy), [taxonomy]);

  /* -------------------------------------------------------------- */
  /* Editing                                                         */
  /* -------------------------------------------------------------- */

  const openPost = useCallback(async (item: PostListItem) => {
    setNotice(null);
    try {
      // A translation pair shares one editor: load the sibling row too.
      const sibling = item.translationGroupId
        ? posts.find(
            (post) =>
              post.id !== item.id
              && post.translationGroupId === item.translationGroupId
              && post.lang !== item.lang,
          )
        : undefined;

      const details = await Promise.all(
        [item.id, sibling?.id].filter((id): id is string => Boolean(id)).map((id) => getPost(id)),
      );
      if (!mounted.current) return;

      const initialDraft: Partial<Record<Language, ArticleTranslationDraft>> = {};
      const sessionPosts: EditorSession['posts'] = {};
      for (const detail of details) {
        initialDraft[detail.lang] = toTranslationDraft(detail);
        sessionPosts[detail.lang] = { id: detail.id, draftVersion: detail.draftVersion };
      }

      setSession({
        key: `${item.id}:${details.map((detail) => detail.draftVersion).join('-')}`,
        translationGroupId: item.translationGroupId,
        posts: sessionPosts,
        initialDraft,
        initialLang: item.lang,
      });
      setTab('editor');
    } catch (error) {
      if (!mounted.current) return;
      setNotice({ tone: 'error', text: errorText(error, 'The post could not be opened.') });
    }
  }, [posts]);

  const startNewPost = useCallback(() => {
    setNotice(null);
    setSession({
      key: `new:${newCmsId('post')}`,
      // Both languages of a new article belong to one translation group.
      translationGroupId: newCmsId('grp'),
      posts: {},
      initialDraft: {
        th: emptyTranslation(),
        en: emptyTranslation(),
      },
      initialLang: 'th',
    });
    setTab('editor');
  }, []);

  /**
   * Persist both language panes.
   *
   * Each language is a separate `posts` row, so a save is one request per
   * non-empty pane: create when the row does not exist yet, otherwise a
   * version-guarded update. A conflict on either pane rejects the whole save so
   * the editor keeps the author's text and shows why it stopped.
   */
  const saveDraft = useCallback(async (draft: ArticleDraft) => {
    const current = session;
    if (!current) throw new Error('No post is open.');

    const nextSession: EditorSession['posts'] = { ...current.posts };
    const conflicts: CmsConflict[] = [];
    let saved = 0;

    for (const lang of LANGUAGES) {
      const translation = draft[lang];
      const existing = current.posts[lang];
      if (isBlank(translation) && !existing) continue;

      const excerpt = translation.excerpt.trim() || null;
      const shared = {
        lang,
        slug: translation.slug.trim(),
        title: translation.title.trim(),
        bodyMarkdown: translation.bodyMarkdown,
      };

      if (!existing) {
        // `createPost` takes the post row only; taxonomy and sources are
        // attached by the guarded update below, which runs for new and
        // existing rows alike.
        const created = await createPost({
          id: newCmsId('post'),
          ...shared,
          ...(current.translationGroupId ? { translationGroupId: current.translationGroupId } : {}),
          ...(excerpt ? { excerpt } : {}),
        });
        if (!created.ok) {
          conflicts.push(created.conflict);
          continue;
        }
        nextSession[lang] = { id: created.data.id, draftVersion: created.data.draftVersion };
        saved += 1;
      }

      const target = nextSession[lang];
      if (!target) continue;

      const updated = await updatePostDraft(target.id, {
        draft: {
          expectedDraftVersion: target.draftVersion,
          ...shared,
          translationGroupId: current.translationGroupId,
          excerpt,
        },
        categoryIds: translation.categoryIds,
        tagIds: translation.tagIds,
        sources: toSourceDtos(translation),
      });

      if (!updated.ok) {
        conflicts.push(updated.conflict);
        continue;
      }
      nextSession[lang] = { id: updated.data.id, draftVersion: updated.data.draftVersion };
      saved += 1;
    }

    if (mounted.current) {
      setSession((previous) => (previous ? { ...previous, posts: nextSession } : previous));
      void load(true);
    }

    if (conflicts.length > 0) {
      // Thrown so `ArticleEditor` keeps the unsaved text and shows the reason.
      throw new Error(conflicts.map(describeConflict).join(' '));
    }
    if (saved > 0 && mounted.current) {
      setNotice({ tone: 'info', text: `Saved ${saved} language ${saved === 1 ? 'version' : 'versions'}.` });
    }
  }, [session, load]);

  /* -------------------------------------------------------------- */
  /* Releases                                                        */
  /* -------------------------------------------------------------- */

  const publish = useCallback(async (request: PublishRequest) => {
    if (!overview) throw new Error('Release state has not loaded yet.');
    if (request.entries.length === 0) throw new Error('There is nothing to publish.');
    if (request.entries.length > 1) {
      // `releases.trigger_post_id` and `revisionSnapshot` are both singular.
      throw new Error('One release publishes one post. Publish the changes one at a time.');
    }

    const entry = request.entries[0]!;
    const post = postsById.get(entry.postId);
    if (!post && entry.change !== 'removed') {
      throw new Error(`Post ${entry.postId} is no longer loaded. Refresh and try again.`);
    }

    const input = await buildBeginReleaseInput({
      triggerKind: entry.change === 'removed' ? 'withdraw' : 'publish',
      liveManifest: overview.liveManifest,
      baseReleaseId: request.baseReleaseId,
      change: {
        postId: entry.postId,
        lang: entry.lang,
        slug: entry.slug,
        kind: entry.change,
        ...(post ? { expectedDraftVersion: post.draftVersion } : {}),
      },
    });

    const result = await beginRelease(input);
    if (!result.ok) throw new Error(describeConflict(result.conflict));
    if (mounted.current) {
      setNotice({ tone: 'info', text: `Release ${result.data.id} queued.` });
      void load(true);
    }
  }, [overview, postsById, load]);

  const rollback = useCallback(async (releaseId: string) => {
    if (!overview) throw new Error('Release state has not loaded yet.');
    // Rollback replays a manifest that already built; it cuts no new revision.
    const detail = await getRelease(releaseId);
    const input = await buildRollbackReleaseInput(detail.manifest, overview.liveReleaseId);
    const result = await beginRelease(input);
    if (!result.ok) throw new Error(describeConflict(result.conflict));
    if (mounted.current) {
      setNotice({ tone: 'info', text: `Rollback to ${releaseId} queued as ${result.data.id}.` });
      void load(true);
    }
  }, [overview, load]);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  const dashboardReleases: DashboardRelease[] = overview?.releases ?? [];

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="text-xs uppercase tracking-[0.14em]">Loading admin data</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border px-6 py-3">
        <span className="font-serif text-lg tracking-tight">Earth</span>

        <nav role="tablist" aria-label="Admin sections" className="flex items-center gap-1 border border-border p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              disabled={entry.id === 'editor' && !session}
              className={cn(
                'px-3 py-1 text-xs font-medium uppercase tracking-[0.1em] transition-colors',
                tab === entry.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
                'disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:text-muted-foreground/40',
              )}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {overview?.liveReleaseId ? (
            <span className="hidden font-mono text-[0.7rem] text-muted-foreground sm:inline">
              live {overview.liveReleaseId}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1 text-xs uppercase tracking-[0.1em] transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {loadError ? (
        <p role="alert" className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/5 px-6 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {loadError}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className={cn(
            'border-b px-6 py-2 text-xs',
            notice.tone === 'error'
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-border text-muted-foreground',
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'posts' ? (
          <PostList
            posts={listItems}
            onEdit={(item) => void openPost(item)}
            onCreate={startNewPost}
            className="h-full"
          />
        ) : null}

        {tab === 'editor' && session ? (
          <ArticleEditor
            key={session.key}
            initialDraft={session.initialDraft}
            initialLang={session.initialLang}
            categories={taxonomyOptions.categories}
            tags={taxonomyOptions.tags}
            onSave={saveDraft}
            className="h-full"
          />
        ) : null}

        {tab === 'releases' ? (
          <ReleaseDashboard
            liveReleaseId={overview?.liveReleaseId ?? null}
            releases={dashboardReleases}
            pendingDiff={overview?.pendingDiff ?? { baseReleaseId: null, entries: [], unchangedCount: 0 }}
            onPublish={publish}
            onRollback={rollback}
            className="h-full"
          />
        ) : null}
      </main>
    </div>
  );
}

function emptyTranslation(): ArticleTranslationDraft {
  return {
    slug: '',
    title: '',
    excerpt: '',
    bodyMarkdown: '',
    categoryIds: [],
    tagIds: [],
    sources: [],
  };
}
