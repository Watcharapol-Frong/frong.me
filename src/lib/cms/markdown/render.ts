/**
 * Minimal Markdown -> HTML renderer for public article bodies and the Zen
 * Editor's preview.
 *
 * Deliberately dependency-free and hand-rolled rather than a full CommonMark
 * implementation, matching the CMS's existing "Web-standard APIs only" style
 * (see `src/lib/cms/assets/r2.ts`) so it runs identically in the browser
 * (editor preview) and in workerd (public routes) with no bundler surprises.
 *
 * Sanitization model: every character of user text is HTML-escaped before
 * any tag is emitted, and the renderer never passes raw HTML through — it
 * only ever emits the tags it constructs itself. There is no raw-HTML
 * Markdown extension.
 *
 * Heading slugs are Unicode-aware (Thai included): unlike `src/lib/slugify.ts`
 * (which strips non-ASCII and exists for other historical reasons), this
 * keeps Thai characters intact, lowercases ASCII, collapses whitespace to
 * hyphens, and de-duplicates collisions within one document.
 */

export interface RenderedHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface RenderedMarkdown {
  html: string;
  headings: RenderedHeading[];
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Unicode-aware slug: keeps letters/digits from any script, hyphenates the
 * rest. `\p{M}` (combining marks) must stay alongside `\p{L}`/`\p{N}` here —
 * Thai vowel signs and tone marks (e.g. the ่ in ปรัชญา) are combining
 * characters, not letters, so without it they get hyphenated out and split
 * an intact word into single-consonant fragments (ปรัชญา -> "ปร-ชญา").
 */
export function slugifyHeading(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'section';
}

function dedupeSlug(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

const ALLOWED_URL_PATTERN = /^(https?:\/\/|mailto:|\/|#)/i;

function safeUrl(url: string): string {
  return ALLOWED_URL_PATTERN.test(url) ? url : '#';
}

/** Bold, italic, inline code, links, and images within one line of already-escaped text. */
function renderInline(escapedLine: string): string {
  return escapedLine
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) =>
      `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) =>
      `<a href="${safeUrl(url)}"${/^https?:\/\//i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * `@[youtube](<id>)` on its own line. The id pattern is the whole allow-list:
 * only YouTube's 11-character id alphabet reaches the emitted URL, so nothing
 * from the author can break out of the src attribute. `youtube-nocookie.com`
 * keeps a reader's visit out of YouTube's ad profile until they press play.
 */
const YOUTUBE_PATTERN = /^@\[youtube\]\(([A-Za-z0-9_-]{11})\)$/;

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+(.*)$/;
const UNORDERED_ITEM_PATTERN = /^[-*]\s+(.*)$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
/**
 * Opening fence: the language id is the first token, anything after a space
 * is a free-text label some authors add ("```code block test") and isn't
 * meant to drive highlighting, so it's ignored rather than rejecting the
 * whole line as not a fence.
 */
const FENCE_OPEN_PATTERN = /^```(\S*)/;
/** Closing fence: strict, since a bare ``` alone must end the block, not start a new label-less one. */
const FENCE_CLOSE_PATTERN = /^```\s*$/;
const HR_PATTERN = /^(-{3,}|\*{3,}|_{3,})$/;

export function renderMarkdown(markdown: string): RenderedMarkdown {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  const headings: RenderedHeading[] = [];
  const slugSeen = new Map<string, number>();

  let listType: 'ul' | 'ol' | null = null;
  let inFence = false;
  let fenceLang = '';
  const fenceLines: string[] = [];

  function flushFence() {
    html.push(
      `<pre><code${fenceLang ? ` class="language-${escapeHtml(fenceLang)}"` : ''}>${fenceLines.map(escapeHtml).join('\n')}</code></pre>`,
    );
    fenceLines.length = 0;
    fenceLang = '';
    inFence = false;
  }

  function closeList() {
    if (listType) {
      html.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  }

  function openList(type: 'ul' | 'ol') {
    if (listType !== type) {
      closeList();
      html.push(type === 'ul' ? '<ul>' : '<ol>');
      listType = type;
    }
  }

  for (const rawLine of lines) {
    if (inFence) {
      if (FENCE_CLOSE_PATTERN.test(rawLine)) {
        flushFence();
        continue;
      }
      // A closing ``` typed onto the same line as the last bit of content
      // (no newline before it) still ends the block, rather than getting
      // swallowed as literal code and never rendering as a block at all.
      const glued = rawLine.match(/^(.*\S)```\s*$/);
      if (glued) {
        fenceLines.push(glued[1]);
        flushFence();
        continue;
      }
      fenceLines.push(rawLine);
      continue;
    }

    const fenceStart = rawLine.match(FENCE_OPEN_PATTERN);
    if (fenceStart) {
      closeList();
      inFence = true;
      fenceLang = fenceStart[1] ?? '';
      continue;
    }

    if (rawLine.trim() === '') {
      closeList();
      continue;
    }

    if (HR_PATTERN.test(rawLine.trim())) {
      closeList();
      html.push('<hr />');
      continue;
    }

    const youtube = rawLine.trim().match(YOUTUBE_PATTERN);
    if (youtube) {
      closeList();
      html.push(
        `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${youtube[1]}"`
        // A page-level `same-origin` referrer policy (e.g. the Earth admin
        // pages) would otherwise strip the referrer YouTube's player needs
        // to configure itself, surfacing as a generic "Error 153".
        + ' referrerpolicy="strict-origin-when-cross-origin"'
        + ' title="YouTube video" loading="lazy" frameborder="0"'
        + ' allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"'
        + ' allowfullscreen></iframe></div>',
      );
      continue;
    }

    const heading = rawLine.match(HEADING_PATTERN);
    if (heading) {
      closeList();
      const depth = heading[1].length;
      const text = heading[2].trim();
      const slug = dedupeSlug(slugifyHeading(text), slugSeen);
      headings.push({ depth, slug, text });
      html.push(`<h${depth} id="${slug}">${renderInline(escapeHtml(text))}</h${depth}>`);
      continue;
    }

    const quote = rawLine.match(BLOCKQUOTE_PATTERN);
    if (quote) {
      closeList();
      html.push(`<blockquote>${renderInline(escapeHtml(quote[1]))}</blockquote>`);
      continue;
    }

    const unordered = rawLine.match(UNORDERED_ITEM_PATTERN);
    if (unordered) {
      openList('ul');
      html.push(`<li>${renderInline(escapeHtml(unordered[1]))}</li>`);
      continue;
    }

    const ordered = rawLine.match(ORDERED_ITEM_PATTERN);
    if (ordered) {
      openList('ol');
      html.push(`<li>${renderInline(escapeHtml(ordered[1]))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(escapeHtml(rawLine))}</p>`);
  }

  closeList();
  if (inFence) {
    // An unterminated fence still renders rather than swallowing the tail.
    flushFence();
  }

  return { html: html.join('\n'), headings };
}
