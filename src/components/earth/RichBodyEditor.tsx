/**
 * The writing surface, rewritten from a plain `<textarea>` into a real
 * WYSIWYG block editor (TipTap/ProseMirror) — images and YouTube embeds
 * render inline as you type, Notion/WordPress-style, instead of showing raw
 * `![alt](url)` / `@[youtube](id)` markdown text.
 *
 * Markdown stays the wire format end to end: `tiptap-markdown` serializes
 * the rich doc back to the exact Markdown dialect `src/lib/cms/markdown/render.ts`
 * expects, so the server, autosave, and the public reader route need no
 * changes. A hidden `<textarea data-earth-field="body">` mirrors that
 * markdown on every edit so PostEditor.astro's existing vanilla-JS (autosave,
 * word/char counts, save/publish payload, AI panel context) keeps reading it
 * exactly as before — only the WRITE paths (emoji/image/video insertion, the
 * "/" menu, Ctrl+B, AI "Accept"/"Generate outline") were re-pointed at the
 * `bodyEditor` bridge this component attaches to its wrapper element.
 */
import { useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { ReactNodeViewProps } from '@tiptap/react';
import { Editor, Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Italic from '@tiptap/extension-italic';
import Code from '@tiptap/extension-code';
import Strike from '@tiptap/extension-strike';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import Suggestion from '@tiptap/suggestion';
import { Extension } from '@tiptap/core';
import markdownItMark from 'markdown-it-mark';

/**
 * StarterKit's Bold/Italic/Code/Strike marks default to Mod-B/I/E/S — this
 * app already binds Ctrl+I (image), Ctrl+E (emoji), and Ctrl+S (save) at the
 * document level for the whole editor page, so those three would otherwise
 * fire twice with conflicting effects (e.g. Ctrl+S would both save *and*
 * strike the selection). Bold's Mod-B has no such collision, so it's the
 * only one of the four left with its native shortcut. The marks themselves
 * (and their `*text*` / `` `text` `` / `~~text~~` input rules) still work —
 * italic/code/strike have no bound shortcut, reachable instead through the
 * selection toolbar (`SelectionToolbar`, below) that appears over a
 * highlighted selection.
 */
const ItalicNoShortcut = Italic.extend({ addKeyboardShortcuts: () => ({}) });
const CodeNoShortcut = Code.extend({ addKeyboardShortcuts: () => ({}) });
const StrikeNoShortcut = Strike.extend({ addKeyboardShortcuts: () => ({}) });

/**
 * `tiptap-markdown` uses ProseMirror's inline image serializer even though
 * TipTap configures Image as a block node. Without closing the block, an
 * immediately following divider is saved as `![...](...)---` and reopens as
 * literal `---` text. Preserve the package's Markdown syntax, then terminate
 * the image block so the next block keeps its meaning across a round trip.
 */
const BlockImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const alt = state.esc(node.attrs.alt || '');
          const src = node.attrs.src.replace(/[()]/g, '\\$&');
          const title = node.attrs.title
            ? ` "${node.attrs.title.replace(/"/g, '\\"')}"`
            : '';
          state.write(`![${alt}](${src}${title})`);
          state.closeBlock(node);
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});

/**
 * Highlight mark, serialized to `==text==` — a common Markdown-flavor
 * convention (Obsidian, many other editors) that `markdown-it-mark` both
 * renders and parses. Not part of `@tiptap/extension-highlight`, which has
 * no markdown wiring at all; built directly rather than pulling in that
 * package only to leave its serialization unimplemented.
 */
const Highlight = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      toggleHighlight: () => ({ commands }: any) => commands.toggleMark(this.name),
    } as any;
  },
  addStorage() {
    return {
      markdown: {
        serialize: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
        parse: {
          setup(markdownit: any) {
            markdownit.use(markdownItMark);
          },
        },
      },
    };
  },
});

/* ------------------------------------------------------------------ */
/* YouTube embed: a block node whose markdown is our own shortcode      */
/* `@[youtube](id)`, not tiptap-markdown's default HTML passthrough —   */
/* the public renderer only ever recognizes that exact syntax.          */
/* ------------------------------------------------------------------ */

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function youtubeMarkdownItPlugin(md: any) {
  // Registered before 'lheading' (setext heading), not just 'paragraph': a
  // "@[youtube](id)" line immediately followed by a "---" divider — a very
  // normal way to write one — would otherwise be consumed by CommonMark's
  // setext-heading rule first (a paragraph directly followed by `---`
  // becomes an <h2> using that paragraph's text), which runs *before*
  // 'paragraph' in markdown-it's default order and would win the line.
  md.block.ruler.before(
    'lheading',
    'youtube_embed',
    (state: any, startLine: number, _endLine: number, silent: boolean) => {
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const line = state.src.slice(pos, max).trim();
      const match = line.match(/^@\[youtube\]\(([A-Za-z0-9_-]{11})\)$/);
      if (!match) return false;
      if (silent) return true;
      const token = state.push('youtube_embed', '', 0);
      token.attrs = [['videoId', match[1]]];
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    },
    { alt: [] },
  );
  md.renderer.rules.youtube_embed = (tokens: any[], idx: number) => {
    const id = tokens[idx].attrs.find(([k]: [string, string]) => k === 'videoId')[1];
    return `<div data-youtube-embed="${id}"></div>\n`;
  };
}

function YoutubeEmbedView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="video-embed" data-youtube-embed={node.attrs.videoId} contentEditable={false}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${node.attrs.videoId}`}
        // The editor page's own referrer policy would otherwise strip the
        // referrer YouTube's player needs to configure itself, surfacing as
        // "Error 153" — same fix as render.ts's public-page renderer.
        referrerPolicy="strict-origin-when-cross-origin"
        title="YouTube video"
        loading="lazy"
        frameBorder={0}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </NodeViewWrapper>
  );
}

const YoutubeEmbed = Node.create({
  name: 'youtubeEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { videoId: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-youtube-embed]',
        getAttrs: (el) => ({ videoId: (el as HTMLElement).getAttribute('data-youtube-embed') }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-youtube-embed': HTMLAttributes.videoId })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YoutubeEmbedView);
  },

  addCommands() {
    return {
      setYoutubeEmbed:
        (videoId: string) =>
        ({ commands }: any) =>
          YOUTUBE_ID_PATTERN.test(videoId)
            ? commands.insertContent({ type: this.name, attrs: { videoId } })
            : false,
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`@[youtube](${node.attrs.videoId})`);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            youtubeMarkdownItPlugin(markdownit);
          },
        },
      },
    };
  },
});

/* ------------------------------------------------------------------ */
/* Slash command menu — "/" at the start of a line, Notion-style.       */
/* ------------------------------------------------------------------ */

export interface SlashCommandItem {
  id: string;
  label: string;
  hint: string;
  icon: string;
  keywords: string[];
  run: (editor: Editor, range: { from: number; to: number }) => void;
}

const SLASH_ITEMS: SlashCommandItem[] = [
  { id: 'h1', label: 'Heading 1', hint: '#', icon: 'H1', keywords: ['heading1', 'h1', 'title'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', hint: '##', icon: 'H2', keywords: ['heading2', 'h2', 'subheading'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', hint: '###', icon: 'H3', keywords: ['heading3', 'h3'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { id: 'bullet', label: 'Bulleted list', hint: '-', icon: '•', keywords: ['bulletedlist', 'bullet', 'list', 'ul'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { id: 'numbered', label: 'Numbered list', hint: '1.', icon: '1.', keywords: ['numberedlist', 'numbered', 'ordered', 'ol'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { id: 'quote', label: 'Quote', hint: '>', icon: '❝', keywords: ['quote', 'blockquote'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { id: 'divider', label: 'Divider', hint: '---', icon: '—', keywords: ['divider', 'hr', 'rule', 'line'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { id: 'code', label: 'Code block', hint: '```', icon: '{ }', keywords: ['code', 'codeblock', 'snippet'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { id: 'image', label: 'Image', hint: 'Upload a file', icon: '🖼', keywords: ['image', 'picture', 'photo', 'upload'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent('earth:open-image-modal'));
    } },
  { id: 'youtube', label: 'YouTube', hint: 'Embed a video', icon: '▶', keywords: ['youtube', 'video', 'embed'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent('earth:open-video-modal'));
    } },
];

/**
 * TipTap v3's `@tiptap/suggestion` restructured its render lifecycle around
 * Floating UI (`props.mount(element)` handles positioning/auto-update) and,
 * critically, `onKeyDown` only ever receives `{ view, event, range }` — no
 * `items` or `command` there, unlike `onStart`/`onUpdate`. Both must be
 * captured into closure state on start/update so onKeyDown can act on them.
 */
const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    const editor = this.editor;
    let selectedIndex = 0;
    let currentItems: SlashCommandItem[] = [];
    let activeCommand: ((item: SlashCommandItem) => void) | null = null;
    let menuEl: HTMLElement | null = null;
    let unmount: (() => void) | null = null;

    function renderItems(items: SlashCommandItem[], command: (item: SlashCommandItem) => void) {
      currentItems = items;
      activeCommand = command;
      if (!menuEl) return;
      menuEl.innerHTML = '';
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'slash-empty';
        empty.textContent = 'No matching command';
        menuEl.appendChild(empty);
        return;
      }
      items.forEach((item, index) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'slash-item';
        if (index === selectedIndex) el.dataset.selected = 'true';
        el.innerHTML = `
          <span class="slash-item-icon">${item.icon}</span>
          <span class="slash-item-text">
            <span class="slash-item-label">${item.label}</span>
            <br />
            <span class="slash-item-hint">${item.hint}</span>
          </span>
        `;
        el.addEventListener('mousedown', (event) => {
          event.preventDefault();
          command(item);
        });
        menuEl!.appendChild(el);
      });
    }

    function highlight() {
      menuEl?.querySelectorAll('.slash-item').forEach((el, index) => {
        if (index === selectedIndex) el.setAttribute('data-selected', 'true');
        else el.removeAttribute('data-selected');
      });
      const child = menuEl?.children[selectedIndex];
      if (child) (child as HTMLElement).scrollIntoView({ block: 'nearest' });
    }

    return [
      Suggestion({
        editor,
        char: '/',
        startOfLine: true,
        items: ({ query }: { query: string }) => {
          const needle = query.toLowerCase();
          return needle
            ? SLASH_ITEMS.filter((item) => item.keywords.some((k) => k.startsWith(needle)))
            : SLASH_ITEMS;
        },
        // The plugin-level `command` runs when SuggestionProps.command(item)
        // is called (from a menu click, or from onKeyDown below via the
        // captured `activeCommand` reference) — `props` here is that item.
        command: ({ editor: ed, range, props }: any) => {
          (props as SlashCommandItem).run(ed, range);
        },
        render: () => ({
          onStart: (props: any) => {
            menuEl = document.createElement('div');
            menuEl.className = 'slash-menu';
            selectedIndex = 0;
            renderItems(props.items, props.command);
            unmount = props.mount(menuEl);
          },
          onUpdate: (props: any) => {
            selectedIndex = 0;
            renderItems(props.items, props.command);
          },
          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
              unmount?.();
              menuEl = null;
              return false; // let the plugin's own default Escape handling close the suggestion
            }
            if (props.event.key === 'ArrowDown') {
              selectedIndex = currentItems.length === 0 ? 0 : (selectedIndex + 1) % currentItems.length;
              highlight();
              return true;
            }
            if (props.event.key === 'ArrowUp') {
              selectedIndex = currentItems.length === 0 ? 0 : (selectedIndex - 1 + currentItems.length) % currentItems.length;
              highlight();
              return true;
            }
            if (props.event.key === 'Enter' || props.event.key === 'Tab') {
              if (currentItems.length === 0) return true;
              activeCommand?.(currentItems[selectedIndex]);
              return true;
            }
            return false;
          },
          onExit: () => {
            unmount?.();
            menuEl = null;
          },
        }),
      }),
    ];
  },
});

/* ------------------------------------------------------------------ */
/* The bridge exposed to the surrounding vanilla-JS editor script.      */
/* ------------------------------------------------------------------ */

export interface BodyEditorBridge {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  focus(): void;
  isFocused(): boolean;
  toggleBold(): void;
  insertImage(url: string, alt?: string): void;
  insertYoutube(videoId: string): void;
  /** ProseMirror positions, not string indices — pass straight back to replaceRange, don't do arithmetic on them. */
  getSelection(): { from: number; to: number; text: string };
  replaceRange(from: number, to: number, markdown: string): void;
  replaceSelection(markdown: string): void;
  appendMarkdown(markdown: string): void;
}

/* ------------------------------------------------------------------ */
/* Selection toolbar: a small Notion-style bubble that appears over a    */
/* text selection — deliberately kept to the essentials the editor's    */
/* own markdown dialect already supports (bold/italic/highlight, plus   */
/* turning the current block into a heading or back to a paragraph) —   */
/* this is also how existing text gets *changed* to a heading, since    */
/* the "# " input rule only fires while typing a fresh line.            */
/* ------------------------------------------------------------------ */

const HEADING_LEVELS = [1, 2, 3] as const;

function SelectionToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor.isActive('bold'),
      isItalic: ctx.editor.isActive('italic'),
      isHighlight: ctx.editor.isActive('highlight'),
      activeHeading: HEADING_LEVELS.find((level) => ctx.editor.isActive('heading', { level })) ?? null,
    }),
  });

  return (
    <BubbleMenu editor={editor} className="rich-bubble-menu">
      <button
        type="button"
        className="rich-bubble-btn"
        data-active={state.isBold}
        title="Bold (Ctrl+B)"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className="rich-bubble-btn"
        data-active={state.isItalic}
        title="Italic"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>i</em>
      </button>
      <button
        type="button"
        className="rich-bubble-btn"
        data-active={state.isHighlight}
        title="Highlight"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (editor.chain().focus() as any).toggleHighlight().run()}
      >
        <span className="rich-bubble-highlight-icon">H</span>
      </button>
      <span className="rich-bubble-divider" />
      {HEADING_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          className="rich-bubble-btn"
          data-active={state.activeHeading === level}
          title={`Heading ${level} — click again to turn back into text`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        >
          H{level}
        </button>
      ))}
      <button
        type="button"
        className="rich-bubble-btn"
        data-active={state.activeHeading === null}
        title="Normal text"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        ¶
      </button>
    </BubbleMenu>
  );
}

interface RichBodyEditorProps {
  initial?: string;
  placeholder?: string;
}

export function createRichBodyEditorExtensions(placeholder?: string) {
  return [
    StarterKit.configure({ link: { openOnClick: false }, italic: false, code: false, strike: false }),
    ItalicNoShortcut,
    CodeNoShortcut,
    StrikeNoShortcut,
    Highlight,
    BlockImage,
    YoutubeEmbed,
    SlashCommand,
    Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
    Markdown.configure({ html: false, bulletListMarker: '-', tightLists: true }),
  ];
}

export default function RichBodyEditor({ initial = '', placeholder }: RichBodyEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEmpty, setIsEmpty] = useState(!initial.trim());

  const editor = useEditor({
    extensions: createRichBodyEditorExtensions(placeholder),
    content: initial,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const markdown = ed.storage.markdown.getMarkdown();
      setIsEmpty(ed.isEmpty);
      const textarea = hiddenTextareaRef.current;
      if (textarea && textarea.value !== markdown) {
        textarea.value = markdown;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  });

  // The bridge: attached to the wrapper element so PostEditor.astro's and
  // AiPanel.astro's plain <script> blocks — separate Astro islands, no
  // shared module scope — can reach this editor imperatively.
  useEffect(() => {
    if (!editor || !wrapperRef.current) return;
    const bridge: BodyEditorBridge = {
      getMarkdown: () => editor.storage.markdown.getMarkdown(),
      setMarkdown: (markdown) => {
        editor.commands.setContent(markdown, { emitUpdate: true });
      },
      focus: () => editor.chain().focus().run(),
      isFocused: () => editor.isFocused,
      toggleBold: () => editor.chain().focus().toggleBold().run(),
      insertImage: (url, alt) => editor.chain().focus().setImage({ src: url, alt: alt ?? '' }).run(),
      insertYoutube: (videoId) => (editor.commands as any).setYoutubeEmbed(videoId),
      getSelection: () => {
        const { from, to } = editor.state.selection;
        return { from, to, text: editor.state.doc.textBetween(from, to, '\n') };
      },
      // tiptap-markdown patches insertContentAt itself to run `markdown`
      // through its parser first, same as setContent — so block content
      // (headings, lists, ...) comes through as real nodes, not escaped text.
      replaceRange: (from, to, markdown) => {
        editor.chain().focus().insertContentAt({ from, to }, markdown).run();
      },
      replaceSelection: (markdown) => {
        const { from, to } = editor.state.selection;
        editor.chain().focus().insertContentAt({ from, to }, markdown).run();
      },
      appendMarkdown: (markdown) => {
        const end = editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(end, markdown).run();
      },
    };
    (wrapperRef.current as unknown as { bodyEditor: BodyEditorBridge }).bodyEditor = bridge;
    // Initial mirror sync so a fresh load (no edits yet) still has the
    // hidden textarea populated for word counts etc.
    if (hiddenTextareaRef.current) hiddenTextareaRef.current.value = editor.storage.markdown.getMarkdown();
    // PostEditor.astro's boot() awaits this before loading fetched/backup
    // content into the editor — a plain script and a React island share no
    // module scope, so this is the handoff.
    document.dispatchEvent(new CustomEvent('earth:body-editor-ready'));
  }, [editor]);

  return (
    <div ref={wrapperRef} className="rich-body-editor" data-earth-body-editor data-empty={isEmpty}>
      {editor && <SelectionToolbar editor={editor} />}
      <EditorContent editor={editor} className="body-input" />
      <textarea data-earth-field="body" hidden defaultValue={initial} ref={hiddenTextareaRef} />
    </div>
  );
}
