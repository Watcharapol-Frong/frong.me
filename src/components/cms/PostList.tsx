import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import type {
  EpochMilliseconds,
  Language,
  PostLifecycle,
  PostRow,
} from '@/lib/cms/contracts.ts';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/*                                                                     */
/* The list is fed a camelCase view model, never a raw `PostRow` —     */
/* database rows are not public artifacts (see contracts.ts). Use      */
/* `postRowToListItem` at the DAL boundary to convert.                 */
/* ------------------------------------------------------------------ */

export interface PostListItem {
  id: string;
  lang: Language;
  translationGroupId: string | null;
  slug: string;
  title: string;
  excerpt: string | null;
  lifecycle: PostLifecycle;
  draftVersion: number;
  updatedAt: EpochMilliseconds;
  /** Draft edits exist that no release has picked up yet. Caller derives this. */
  hasUnpublishedChanges?: boolean;
}

export type LanguageFilter = Language | 'all';
export type LifecycleFilter = PostLifecycle | 'all';
export type PostSortKey = 'updatedAt' | 'title';

export interface PostListProps {
  posts?: PostListItem[];
  initialLang?: LanguageFilter;
  initialLifecycle?: LifecycleFilter;
  initialQuery?: string;
  /** Fired by the row's Edit action and by activating a row with Enter/Space. */
  onEdit?: (post: PostListItem) => void;
  /** Omit to hide the "New post" affordance. */
  onCreate?: () => void;
  className?: string;
}

export function postRowToListItem(row: PostRow): PostListItem {
  return {
    id: row.id,
    lang: row.lang,
    translationGroupId: row.translation_group_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    lifecycle: row.lifecycle,
    draftVersion: row.draft_version,
    updatedAt: row.updated_at,
  };
}

const LANGUAGE_FILTERS: readonly { id: LanguageFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'th', label: 'TH' },
  { id: 'en', label: 'EN' },
];

const LIFECYCLE_FILTERS: readonly { id: LifecycleFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
];

const LIFECYCLE_STYLE: Record<PostLifecycle, string> = {
  draft: 'border-border text-muted-foreground',
  active: 'border-foreground text-foreground',
  archived: 'border-border text-muted-foreground/60 line-through decoration-1',
};

/** Fixed locale + UTC so server and client markup agree during hydration. */
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(value: EpochMilliseconds): string {
  return DATE_FORMAT.format(new Date(value));
}

/* ------------------------------------------------------------------ */
/* Mock state                                                          */
/* ------------------------------------------------------------------ */

export const MOCK_POSTS: PostListItem[] = [
  {
    id: 'post_th_00000001',
    lang: 'th',
    translationGroupId: 'grp_architecture_2026',
    slug: 'cloudflare-cms-architecture',
    title: 'สถาปัตยกรรม CMS บน Cloudflare สำหรับเว็บพอร์ตโฟลิโอ',
    excerpt: 'การออกแบบระบบบริหารจัดการเนื้อหาแบบไฮบริดบน Cloudflare D1 และ R2',
    lifecycle: 'active',
    draftVersion: 4,
    updatedAt: 1789030800000,
    hasUnpublishedChanges: true,
  },
  {
    id: 'post_en_00000001',
    lang: 'en',
    translationGroupId: 'grp_architecture_2026',
    slug: 'cloudflare-cms-architecture',
    title: 'A Cloudflare CMS Architecture for a Portfolio Site',
    excerpt: 'Designing a hybrid content system on Cloudflare D1 and R2.',
    lifecycle: 'active',
    draftVersion: 3,
    updatedAt: 1789027200000,
  },
  {
    id: 'post_th_00000002',
    lang: 'th',
    translationGroupId: 'grp_inflation_2026',
    slug: 'thai-inflation-2026',
    title: 'อ่านตัวเลขเงินเฟ้อไทย ปี 2569',
    excerpt: 'ทำไมเงินเฟ้อทั่วไปกับเงินเฟ้อพื้นฐานถึงเล่าคนละเรื่อง',
    lifecycle: 'draft',
    draftVersion: 2,
    updatedAt: 1788944400000,
    hasUnpublishedChanges: true,
  },
  {
    id: 'post_en_00000002',
    lang: 'en',
    translationGroupId: 'grp_inflation_2026',
    slug: 'thai-inflation-2026',
    title: 'Reading Thai Inflation in 2026',
    excerpt: 'Why headline and core inflation tell two different stories.',
    lifecycle: 'draft',
    draftVersion: 1,
    updatedAt: 1788858000000,
    hasUnpublishedChanges: true,
  },
  {
    id: 'post_en_00000003',
    lang: 'en',
    translationGroupId: null,
    slug: 'notes-on-immutable-releases',
    title: 'Notes on Immutable Releases',
    excerpt: 'Why a manifest beats a mutable "published" flag.',
    lifecycle: 'active',
    draftVersion: 7,
    updatedAt: 1788685200000,
  },
  {
    id: 'post_th_00000004',
    lang: 'th',
    translationGroupId: null,
    slug: 'sanity-migration-retro',
    title: 'บันทึกการย้ายออกจาก Sanity',
    excerpt: null,
    lifecycle: 'archived',
    draftVersion: 12,
    updatedAt: 1787475600000,
  },
];

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  counts,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </span>
      <div role="group" aria-label={label} className="flex items-center border border-border">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              'px-2.5 py-1 text-xs transition-colors',
              index > 0 && 'border-l border-border',
              value === option.id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
            {counts?.[option.id] !== undefined ? (
              <span className="ml-1.5 tabular-nums opacity-60">{counts[option.id]}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableHeader({
  children,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  children: ReactNode;
  sortKey: PostSortKey;
  activeKey: PostSortKey;
  direction: 'asc' | 'desc';
  onSort: (key: PostSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-2 text-left font-medium', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors',
          active ? 'text-foreground' : 'hover:text-foreground'
        )}
      >
        {children}
        {active ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export default function PostList({
  posts = MOCK_POSTS,
  initialLang = 'all',
  initialLifecycle = 'all',
  initialQuery = '',
  onEdit,
  onCreate,
  className,
}: PostListProps) {
  const [lang, setLang] = useState<LanguageFilter>(initialLang);
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>(initialLifecycle);
  const [query, setQuery] = useState(initialQuery);
  const [sortKey, setSortKey] = useState<PostSortKey>('updatedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  const langCounts = useMemo(() => {
    const counts: Partial<Record<LanguageFilter, number>> = { all: posts.length, th: 0, en: 0 };
    for (const post of posts) counts[post.lang] = (counts[post.lang] ?? 0) + 1;
    return counts;
  }, [posts]);

  const lifecycleCounts = useMemo(() => {
    const counts: Partial<Record<LifecycleFilter, number>> = {
      all: posts.length,
      draft: 0,
      active: 0,
      archived: 0,
    };
    for (const post of posts) counts[post.lifecycle] = (counts[post.lifecycle] ?? 0) + 1;
    return counts;
  }, [posts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = posts.filter((post) => {
      if (lang !== 'all' && post.lang !== lang) return false;
      if (lifecycle !== 'all' && post.lifecycle !== lifecycle) return false;
      if (needle === '') return true;
      return (
        post.title.toLowerCase().includes(needle) ||
        post.slug.toLowerCase().includes(needle) ||
        (post.excerpt ?? '').toLowerCase().includes(needle)
      );
    });

    const sign = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sortKey === 'title'
        ? sign * a.title.localeCompare(b.title, a.lang === 'th' ? 'th' : 'en')
        : sign * (a.updatedAt - b.updatedAt)
    );
  }, [posts, lang, lifecycle, query, sortKey, direction]);

  const handleSort = (key: PostSortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection(key === 'title' ? 'asc' : 'desc');
  };

  const filtersApplied = lang !== 'all' || lifecycle !== 'all' || query.trim() !== '';

  const resetFilters = () => {
    setLang('all');
    setLifecycle('all');
    setQuery('');
  };

  return (
    <section className={cn('flex flex-col bg-background text-foreground', className)}>
      {/* Toolbar --------------------------------------------------- */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-6 py-4">
        <h2 className="font-serif text-xl tracking-tight">Posts</h2>

        <div className="flex min-w-[14rem] flex-1 items-center gap-2 border-b border-border focus-within:border-foreground">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, slug or excerpt…"
            aria-label="Search posts"
            className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <FilterGroup label="Lang" options={LANGUAGE_FILTERS} value={lang} onChange={setLang} counts={langCounts} />
        <FilterGroup
          label="State"
          options={LIFECYCLE_FILTERS}
          value={lifecycle}
          onChange={setLifecycle}
          counts={lifecycleCounts}
        />

        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 border border-foreground px-3 py-1.5 text-xs uppercase tracking-[0.1em] transition-colors hover:bg-foreground hover:text-background"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New post
          </button>
        ) : null}
      </header>

      {/* Table ----------------------------------------------------- */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">
            Posts filtered by language and lifecycle, sorted by {sortKey === 'title' ? 'title' : 'last update'}
          </caption>
          <thead>
            <tr className="border-b border-border text-[0.7rem] text-muted-foreground">
              <SortableHeader sortKey="title" activeKey={sortKey} direction={direction} onSort={handleSort}>
                Title
              </SortableHeader>
              <th scope="col" className="px-4 py-2 text-left font-medium uppercase tracking-[0.14em]">
                Lang
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium uppercase tracking-[0.14em]">
                State
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium uppercase tracking-[0.14em]">
                Draft
              </th>
              <SortableHeader
                sortKey="updatedAt"
                activeKey={sortKey}
                direction={direction}
                onSort={handleSort}
                className="whitespace-nowrap"
              >
                Updated
              </SortableHeader>
              <th scope="col" className="px-4 py-2 text-right font-medium uppercase tracking-[0.14em]">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.map((post) => (
              <tr
                key={post.id}
                tabIndex={onEdit ? 0 : undefined}
                onDoubleClick={() => onEdit?.(post)}
                onKeyDown={(event) => {
                  if (!onEdit) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onEdit(post);
                  }
                }}
                className="group border-b border-border/60 outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40"
              >
                <td className="max-w-[24rem] px-4 py-3">
                  <span className="block truncate">
                    {post.title || <span className="text-muted-foreground/60">Untitled</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 font-mono text-[0.7rem] text-muted-foreground/70">
                    <span className="truncate">/{post.slug}</span>
                    {post.hasUnpublishedChanges ? (
                      <span
                        title="Draft edits not yet in a release"
                        className="shrink-0 border border-border px-1 font-sans not-italic tracking-wide"
                      >
                        unpublished
                      </span>
                    ) : null}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {post.lang}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block border px-2 py-0.5 text-[0.7rem] capitalize',
                      LIFECYCLE_STYLE[post.lifecycle]
                    )}
                  >
                    {post.lifecycle}
                  </span>
                </td>

                <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  v{post.draftVersion}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">
                  <time dateTime={new Date(post.updatedAt).toISOString()}>
                    {formatDate(post.updatedAt)}
                  </time>
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit?.(post)}
                    disabled={!onEdit}
                    aria-label={`Edit ${post.title || post.slug}`}
                    className="border border-transparent px-2.5 py-1 text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:border-border group-hover:text-foreground disabled:opacity-40 disabled:hover:border-transparent"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {posts.length === 0 ? 'No posts yet.' : 'No posts match these filters.'}
          </p>
          {filtersApplied ? (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <footer className="flex items-center justify-between border-t border-border px-6 py-3 text-[0.7rem] tabular-nums text-muted-foreground">
          <span>
            {visible.length} of {posts.length} posts
          </span>
          {filtersApplied ? (
            <button
              type="button"
              onClick={resetFilters}
              className="uppercase tracking-[0.14em] transition-colors hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}
        </footer>
      )}
    </section>
  );
}
