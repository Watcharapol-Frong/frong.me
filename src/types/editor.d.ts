import type { MarkdownStorage } from 'tiptap-markdown';

// tiptap-markdown exposes its storage type but does not augment TipTap v3.
declare module '@tiptap/core' {
  interface Storage {
    markdown: MarkdownStorage;
  }
}
