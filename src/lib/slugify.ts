// Deterministic so that the heading component and the table of contents derive
// the same id from the same text without sharing state.
function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    // ฀-๿ keeps Thai; stripping it left Thai headings with an empty id,
    // which broke every table-of-contents link on Thai articles.
    .replace(/[^a-z0-9฀-๿\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || `section-${hashText(text)}`;
}

interface TextNode {
  text?: string;
  children?: TextNode[];
}

// A formatted heading (bold, link, italic) nests its text one or more levels
// deeper instead of exposing it on the child directly, so collect it by walking.
export function nodeText(node: TextNode | TextNode[] | undefined): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node.text === "string") return node.text;
  return nodeText(node.children);
}

interface PortableTextBlock extends TextNode {
  _type: string;
  style?: string;
}

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

const STYLE_DEPTH: Record<string, number> = { h2: 2, h3: 3 };

export function extractHeadings(body: PortableTextBlock[] = []): Heading[] {
  return body
    .filter((block) => block._type === "block" && block.style && STYLE_DEPTH[block.style])
    .map((block) => {
      const text = nodeText(block.children);
      return {
        depth: STYLE_DEPTH[block.style as string],
        slug: slugify(text),
        text,
      };
    });
}
