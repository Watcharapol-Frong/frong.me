import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { Check, GripVertical, Link2, Plus, Trash2, Wand2, X } from 'lucide-react';
import type { Language, TaxonomySnapshot } from '@/lib/cms/contracts.ts';
import { slugify } from '@/lib/slugify';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/*                                                                     */
/* The editor is deliberately transport-agnostic: it never talks to D1 */
/* or any endpoint. Everything it needs arrives as props, and every    */
/* mutation leaves through `onChange` / `onSave`. The DAL can be wired  */
/* in later without touching this file.                                */
/* ------------------------------------------------------------------ */

/** A source row while it is being edited. `id` is local-only, for React keys. */
export interface EditorSource {
  id: string;
  label: string;
  url: string;
  publisher: string;
}

/** One language's worth of a draft. Mirrors `UpdatePostDraftInput` plus taxonomy. */
export interface ArticleTranslationDraft {
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  categoryIds: string[];
  tagIds: string[];
  sources: EditorSource[];
}

export type ArticleDraft = Record<Language, ArticleTranslationDraft>;

/** Taxonomy options, keyed by language — categories and tags are per-language rows. */
export type TaxonomyOptions = Record<Language, TaxonomySnapshot[]>;

export interface ArticleEditorProps {
  /** Partial seed; anything omitted falls back to an empty draft. */
  initialDraft?: Partial<Record<Language, Partial<ArticleTranslationDraft>>>;
  categories?: TaxonomyOptions;
  tags?: TaxonomyOptions;
  initialLang?: Language;
  /** Fired on every keystroke with the full draft for the edited language. */
  onChange?: (lang: Language, translation: ArticleTranslationDraft, draft: ArticleDraft) => void;
  /** Persistence hook. Rejecting surfaces the error in the header. */
  onSave?: (draft: ArticleDraft) => void | Promise<void>;
  /** Swap in a real markdown pipeline; the built-in renderer is preview-only. */
  renderMarkdown?: (markdown: string) => ReactNode;
  className?: string;
}

const LANGUAGES: readonly { id: Language; label: string; native: string }[] = [
  { id: 'th', label: 'TH', native: 'ไทย' },
  { id: 'en', label: 'EN', native: 'English' },
];

/** DAL slug rule (see `lib/cms/validation.ts`): lowercase latin, hyphen-separated. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ------------------------------------------------------------------ */
/* Mock state                                                          */
/* ------------------------------------------------------------------ */

export const MOCK_CATEGORIES: TaxonomyOptions = {
  th: [
    { id: 'cat-macro-th', slug: 'macro', name: 'เศรษฐกิจมหภาค' },
    { id: 'cat-policy-th', slug: 'policy', name: 'นโยบายสาธารณะ' },
    { id: 'cat-markets-th', slug: 'markets', name: 'ตลาดทุน' },
  ],
  en: [
    { id: 'cat-macro-en', slug: 'macro', name: 'Macroeconomics' },
    { id: 'cat-policy-en', slug: 'policy', name: 'Public Policy' },
    { id: 'cat-markets-en', slug: 'markets', name: 'Markets' },
  ],
};

export const MOCK_TAGS: TaxonomyOptions = {
  th: [
    { id: 'tag-bot-th', slug: 'bank-of-thailand', name: 'ธนาคารแห่งประเทศไทย' },
    { id: 'tag-inflation-th', slug: 'inflation', name: 'เงินเฟ้อ' },
    { id: 'tag-data-th', slug: 'data', name: 'ข้อมูล' },
    { id: 'tag-longread-th', slug: 'long-read', name: 'อ่านยาว' },
  ],
  en: [
    { id: 'tag-bot-en', slug: 'bank-of-thailand', name: 'Bank of Thailand' },
    { id: 'tag-inflation-en', slug: 'inflation', name: 'Inflation' },
    { id: 'tag-data-en', slug: 'data', name: 'Data' },
    { id: 'tag-longread-en', slug: 'long-read', name: 'Long read' },
  ],
};

export const MOCK_DRAFT: ArticleDraft = {
  th: {
    slug: 'thai-inflation-2026',
    title: 'อ่านตัวเลขเงินเฟ้อไทย ปี 2569',
    excerpt: 'ทำไมเงินเฟ้อทั่วไปกับเงินเฟ้อพื้นฐานถึงเล่าคนละเรื่อง',
    bodyMarkdown: [
      '## บทนำ',
      '',
      'ตัวเลข **เงินเฟ้อทั่วไป** ที่รายงานรายเดือนไม่ได้บอกทั้งหมด',
      'บทความนี้แยกองค์ประกอบของตะกร้าราคาออกเป็นสามส่วน',
      '',
      '1. หมวดอาหารสด',
      '2. หมวดพลังงาน',
      '3. หมวดพื้นฐาน',
      '',
      '> ความผันผวนส่วนใหญ่มาจากสองหมวดแรก',
    ].join('\n'),
    categoryIds: ['cat-macro-th'],
    tagIds: ['tag-inflation-th', 'tag-bot-th'],
    sources: [
      {
        id: 'src-th-1',
        label: 'ดัชนีราคาผู้บริโภค',
        url: 'https://www.price.moc.go.th/',
        publisher: 'กระทรวงพาณิชย์',
      },
    ],
  },
  en: {
    slug: 'thai-inflation-2026',
    title: 'Reading Thai Inflation in 2026',
    excerpt: 'Why headline and core inflation tell two different stories.',
    bodyMarkdown: [
      '## Introduction',
      '',
      'The monthly **headline inflation** print hides more than it reveals.',
      'This piece splits the basket into three parts.',
      '',
      '1. Fresh food',
      '2. Energy',
      '3. Core',
      '',
      '> Most of the volatility comes from the first two.',
    ].join('\n'),
    categoryIds: ['cat-macro-en'],
    tagIds: ['tag-inflation-en', 'tag-bot-en'],
    sources: [
      {
        id: 'src-en-1',
        label: 'Consumer Price Index',
        url: 'https://www.price.moc.go.th/',
        publisher: 'Ministry of Commerce',
      },
    ],
  },
};

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

function seedDraft(initial: ArticleEditorProps['initialDraft']): ArticleDraft {
  return {
    th: { ...emptyTranslation(), ...(initial?.th ?? {}) },
    en: { ...emptyTranslation(), ...(initial?.en ?? {}) },
  };
}

let sourceSeq = 0;
function nextSourceId(): string {
  sourceSeq += 1;
  return `src-local-${sourceSeq}`;
}

/* ------------------------------------------------------------------ */
/* Preview renderer                                                    */
/*                                                                     */
/* Intentionally small and node-based (no dangerouslySetInnerHTML), so */
/* the preview stays safe without pulling in a markdown dependency.    */
/* Pass `renderMarkdown` to swap in the real build-time pipeline.      */
/* ------------------------------------------------------------------ */

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_PATTERN).filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={key} className="bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>
      );
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4 decoration-border hover:decoration-foreground"
        >
          {link[1]}
        </a>
      );
    }

    return <span key={key}>{token}</span>;
  });
}

function renderMarkdownPreview(markdown: string): ReactNode {
  const lines = markdown.split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let fence: { lang: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p key={key} className="my-4 leading-[1.85]">
        {renderInline(paragraph.join(' '), key)}
      </p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const key = `l-${blocks.length}`;
    const items = list.items.map((item, index) => (
      <li key={`${key}-${index}`} className="my-1 leading-[1.85]">
        {renderInline(item, `${key}-${index}`)}
      </li>
    ));
    blocks.push(
      list.ordered
        ? <ol key={key} className="my-4 list-decimal space-y-1 pl-6">{items}</ol>
        : <ul key={key} className="my-4 list-disc space-y-1 pl-6">{items}</ul>
    );
    list = null;
  };

  const flushQuote = () => {
    if (quote.length === 0) return;
    const key = `q-${blocks.length}`;
    blocks.push(
      <blockquote key={key} className="my-6 border-l-2 border-border pl-5 text-muted-foreground italic">
        {renderInline(quote.join(' '), key)}
      </blockquote>
    );
    quote = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      if (fence) {
        blocks.push(
          <pre
            key={`c-${blocks.length}`}
            className="my-6 overflow-x-auto border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed"
          >
            <code>{fence.lines.join('\n')}</code>
          </pre>
        );
        fence = null;
      } else {
        flushAll();
        fence = { lang: fenceMatch[1], lines: [] };
      }
      continue;
    }

    if (fence) {
      fence.lines.push(line);
      continue;
    }

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll();
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-10 border-border" />);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const depth = heading[1].length;
      const key = `h-${blocks.length}`;
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[depth - 1];
      const size = ['text-3xl', 'text-2xl', 'text-xl', 'text-lg'][depth - 1];
      blocks.push(
        <Tag key={key} className={cn('font-serif font-medium tracking-tight', size, depth === 1 ? 'mt-8 mb-4' : 'mt-8 mb-3')}>
          {renderInline(heading[2], key)}
        </Tag>
      );
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const bulleted = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ordered || bulleted) {
      flushParagraph();
      flushQuote();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((ordered ?? bulleted)![1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();
  if (fence) {
    blocks.push(
      <pre key={`c-${blocks.length}`} className="my-6 overflow-x-auto border border-border bg-muted/40 p-4 font-mono text-xs">
        <code>{fence.lines.join('\n')}</code>
      </pre>
    );
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </span>
      {hint ? <span className="text-[0.7rem] tabular-nums text-muted-foreground/70">{hint}</span> : null}
    </div>
  );
}

const inputClass =
  'w-full border-b border-border bg-transparent py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground';

function TaxonomyPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: TaxonomySnapshot[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section>
      <FieldLabel hint={`${selected.length}/${options.length}`}>{label}</FieldLabel>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">No {label.toLowerCase()} defined yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const active = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onToggle(option.id)}
                aria-pressed={active}
                title={`/${option.slug}`}
                className={cn(
                  'inline-flex items-center gap-1 border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                )}
              >
                {active ? <Check className="h-3 w-3" aria-hidden /> : null}
                {option.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SourcesManager({
  sources,
  onChange,
}: {
  sources: EditorSource[];
  onChange: (next: EditorSource[]) => void;
}) {
  const patch = (index: number, field: keyof EditorSource, value: string) => {
    onChange(sources.map((source, i) => (i === index ? { ...source, [field]: value } : source)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sources.length) return;
    const next = [...sources];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section>
      <FieldLabel hint={`${sources.length}`}>Sources</FieldLabel>

      <ol className="space-y-3">
        {sources.map((source, index) => {
          const invalidUrl = source.url.length > 0 && !/^https?:\/\/\S+$/.test(source.url);
          return (
            <li key={source.id} className="group border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] tabular-nums text-muted-foreground">
                  <GripVertical className="h-3 w-3" aria-hidden />
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move source ${index + 1} up`}
                    className="px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === sources.length - 1}
                    aria-label={`Move source ${index + 1} down`}
                    className="px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(sources.filter((_, i) => i !== index))}
                    aria-label={`Remove source ${index + 1}`}
                    className="px-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>

              <input
                value={source.label}
                onChange={(event) => patch(index, 'label', event.target.value)}
                placeholder="Label"
                aria-label={`Source ${index + 1} label`}
                className={cn(inputClass, 'py-1.5')}
              />
              <div className="mt-1 flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                <input
                  value={source.url}
                  onChange={(event) => patch(index, 'url', event.target.value)}
                  placeholder="https://"
                  inputMode="url"
                  aria-label={`Source ${index + 1} URL`}
                  aria-invalid={invalidUrl}
                  className={cn(inputClass, 'py-1.5 font-mono text-xs', invalidUrl && 'border-destructive')}
                />
              </div>
              <input
                value={source.publisher}
                onChange={(event) => patch(index, 'publisher', event.target.value)}
                placeholder="Publisher (optional)"
                aria-label={`Source ${index + 1} publisher`}
                className={cn(inputClass, 'mt-1 py-1.5 text-xs')}
              />
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() =>
          onChange([...sources, { id: nextSourceId(), label: '', url: '', publisher: '' }])
        }
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add source
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

export default function ArticleEditor({
  initialDraft = MOCK_DRAFT,
  categories = MOCK_CATEGORIES,
  tags = MOCK_TAGS,
  initialLang = 'th',
  onChange,
  onSave,
  renderMarkdown = renderMarkdownPreview,
  className,
}: ArticleEditorProps) {
  const [draft, setDraft] = useState<ArticleDraft>(() => seedDraft(initialDraft));
  const [lang, setLang] = useState<Language>(initialLang);
  const [showMeta, setShowMeta] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  /** Which pane currently drives the scroll, so echoed events don't fight. */
  const scrollOwner = useRef<'editor' | 'preview' | null>(null);
  const scrollRelease = useRef<number | null>(null);

  const translation = draft[lang];

  const patch = useCallback(
    (changes: Partial<ArticleTranslationDraft>) => {
      setDraft((current) => {
        const next: ArticleDraft = { ...current, [lang]: { ...current[lang], ...changes } };
        onChangeRef.current?.(lang, next[lang], next);
        return next;
      });
      setDirty(true);
      setSaveError(null);
    },
    [lang]
  );

  /* --- scroll sync ------------------------------------------------- */

  const syncScroll = useCallback((from: 'editor' | 'preview') => {
    const source = from === 'editor' ? editorRef.current : previewRef.current;
    const target = from === 'editor' ? previewRef.current : editorRef.current;
    if (!source || !target) return;
    if (scrollOwner.current && scrollOwner.current !== from) return;

    scrollOwner.current = from;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange > 0 && targetRange > 0) {
      target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    }

    if (scrollRelease.current !== null) window.clearTimeout(scrollRelease.current);
    scrollRelease.current = window.setTimeout(() => {
      scrollOwner.current = null;
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (scrollRelease.current !== null) window.clearTimeout(scrollRelease.current);
    },
    []
  );

  const handleEditorScroll = (_event: UIEvent<HTMLTextAreaElement>) => syncScroll('editor');
  const handlePreviewScroll = (_event: UIEvent<HTMLDivElement>) => syncScroll('preview');

  /* --- derived ----------------------------------------------------- */

  const preview = useMemo(
    () => renderMarkdown(translation.bodyMarkdown),
    [renderMarkdown, translation.bodyMarkdown]
  );

  const stats = useMemo(() => {
    const words = translation.bodyMarkdown.trim().split(/\s+/).filter(Boolean).length;
    return { words, minutes: Math.max(1, Math.round(words / 220)) };
  }, [translation.bodyMarkdown]);

  const slugInvalid = translation.slug.length > 0 && !SLUG_PATTERN.test(translation.slug);
  const missing = [
    !translation.title.trim() && 'title',
    !translation.slug.trim() && 'slug',
    !translation.bodyMarkdown.trim() && 'body',
  ].filter(Boolean) as string[];

  const handleSave = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      setDirty(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (field: 'categoryIds' | 'tagIds') => (id: string) => {
    const current = translation[field];
    patch({
      [field]: current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    });
  };

  return (
    <div className={cn('flex h-dvh flex-col bg-background text-foreground', className)}>
      {/* Header ------------------------------------------------------ */}
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border px-6 py-3">
        <div
          role="tablist"
          aria-label="Editing language"
          className="flex items-center gap-1 border border-border p-0.5"
        >
          {LANGUAGES.map((option) => (
            <button
              key={option.id}
              role="tab"
              type="button"
              aria-selected={lang === option.id}
              onClick={() => setLang(option.id)}
              className={cn(
                'px-3 py-1 text-xs font-medium tracking-[0.1em] transition-colors',
                lang === option.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="min-w-0 flex-1 truncate font-serif text-lg tracking-tight">
          {translation.title || <span className="text-muted-foreground/60">Untitled</span>}
        </p>

        <div className="flex items-center gap-4 text-[0.7rem] tabular-nums text-muted-foreground">
          <span>{stats.words} words</span>
          <span>{stats.minutes} min</span>
          <span className={cn(dirty ? 'text-foreground' : 'text-muted-foreground/60')}>
            {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowMeta((value) => !value)}
          className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {showMeta ? 'Focus' : 'Details'}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={!onSave || saving || missing.length > 0}
          title={missing.length > 0 ? `Missing ${missing.join(', ')}` : undefined}
          className="border border-foreground px-4 py-1.5 text-xs tracking-[0.1em] uppercase transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          Save draft
        </button>
      </header>

      {saveError ? (
        <p role="alert" className="shrink-0 border-b border-destructive/40 bg-destructive/5 px-6 py-2 text-xs text-destructive">
          {saveError}
        </p>
      ) : null}

      {/* Body -------------------------------------------------------- */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Markdown pane */}
        <section className="flex min-h-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <textarea
            ref={editorRef}
            value={translation.bodyMarkdown}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              patch({ bodyMarkdown: event.target.value })
            }
            onScroll={handleEditorScroll}
            spellCheck={false}
            aria-label={`Markdown body (${lang})`}
            placeholder="Write in Markdown…"
            className="h-full w-full resize-none overflow-y-auto bg-transparent px-8 py-10 font-mono text-[13px] leading-[1.85] text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </section>

        {/* Preview pane */}
        <section className="flex min-h-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div
            ref={previewRef}
            onScroll={handlePreviewScroll}
            aria-live="off"
            className="h-full overflow-y-auto px-8 py-10"
          >
            <article className="mx-auto max-w-[36rem] font-sans text-[15px]">
              <h1 className="mb-2 font-serif text-3xl font-medium tracking-tight">
                {translation.title || <span className="text-muted-foreground/50">Untitled</span>}
              </h1>
              {translation.excerpt ? (
                <p className="mb-8 border-b border-border pb-6 text-muted-foreground italic">
                  {translation.excerpt}
                </p>
              ) : (
                <div className="mb-8 border-b border-border pb-6" />
              )}
              {preview}
            </article>
          </div>
        </section>

        {/* Metadata pane */}
        {showMeta ? (
          <aside className="w-full shrink-0 overflow-y-auto px-6 py-8 lg:w-80 xl:w-96">
            <div className="space-y-8">
              <section>
                <FieldLabel hint={`${translation.title.length}`}>Title</FieldLabel>
                <input
                  value={translation.title}
                  onChange={(event) => patch({ title: event.target.value })}
                  placeholder="Headline"
                  className={inputClass}
                />
              </section>

              <section>
                <FieldLabel hint={slugInvalid ? 'a–z 0–9 -' : undefined}>Slug</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    value={translation.slug}
                    onChange={(event) => patch({ slug: event.target.value })}
                    placeholder="article-slug"
                    aria-invalid={slugInvalid}
                    className={cn(inputClass, 'font-mono text-xs', slugInvalid && 'border-destructive')}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ slug: slugify(translation.title) })}
                    title="Generate from title (latin characters only)"
                    aria-label="Generate slug from title"
                    className="shrink-0 border border-border p-1.5 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                {slugInvalid ? (
                  <p className="mt-1 text-[0.7rem] text-destructive">
                    Slugs must be lowercase latin words joined by hyphens.
                  </p>
                ) : null}
              </section>

              <section>
                <FieldLabel hint={`${translation.excerpt.length}`}>Excerpt</FieldLabel>
                <textarea
                  value={translation.excerpt}
                  onChange={(event) => patch({ excerpt: event.target.value })}
                  rows={3}
                  placeholder="One or two sentences."
                  className={cn(inputClass, 'resize-none leading-relaxed')}
                />
              </section>

              <TaxonomyPicker
                label="Categories"
                options={categories[lang] ?? []}
                selected={translation.categoryIds}
                onToggle={toggle('categoryIds')}
              />

              <TaxonomyPicker
                label="Tags"
                options={tags[lang] ?? []}
                selected={translation.tagIds}
                onToggle={toggle('tagIds')}
              />

              <SourcesManager
                sources={translation.sources}
                onChange={(sources) => patch({ sources })}
              />

              <footer className="border-t border-border pt-4 text-[0.7rem] leading-relaxed text-muted-foreground/70">
                Editing <span className="text-foreground">{LANGUAGES.find((l) => l.id === lang)?.native}</span>.
                Metadata, taxonomy and sources are stored per language.
                {missing.length > 0 ? (
                  <span className="mt-2 flex items-center gap-1 text-destructive">
                    <X className="h-3 w-3" aria-hidden />
                    Missing {missing.join(', ')}
                  </span>
                ) : null}
              </footer>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
