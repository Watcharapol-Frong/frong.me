/** Lossless table payload inside Markdown; raw HTML remains disabled. */
export interface MarkdownTableCell {
  header: boolean;
  paragraphs: string[][];
}
export type MarkdownTable = MarkdownTableCell[][];

export const TABLE_FENCE = 'earth-table';

export function parseTablePayload(payload: string): MarkdownTable | null {
  try {
    const rows: unknown = JSON.parse(payload);
    if (!Array.isArray(rows) || !rows.length) return null;
    const width = Array.isArray(rows[0]) ? rows[0].length : 0;
    if (!width) return null;
    if (!rows.every(row => Array.isArray(row) && row.length === width && row.every(cell =>
      cell && typeof cell.header === 'boolean' && Array.isArray(cell.paragraphs) && cell.paragraphs.length > 0
      && cell.paragraphs.every((paragraph: unknown) => Array.isArray(paragraph) && paragraph.length > 0
        && paragraph.every(line => typeof line === 'string'))))) return null;
    return rows as MarkdownTable;
  } catch { return null; }
}

/** Split GFM rows without treating escaped pipes as column separators. */
export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (const character of line.trim()) {
    const slashes = current.match(/\\+$/)?.[0].length ?? 0;
    if (character === '|' && slashes % 2 === 0) {
      cells.push(current.trim());
      current = '';
    } else current += character;
  }
  cells.push(current.trim());
  if (line.trim().startsWith('|')) cells.shift();
  if (line.trim().endsWith('|') && cells.at(-1) === '') cells.pop();
  return cells;
}

export function isTableStart(line: string, next = ''): boolean {
  if (!line.includes('|') || !next.includes('|')) return false;
  const cells = splitTableRow(line);
  const separators = splitTableRow(next);
  return cells.length > 0 && cells.length === separators.length
    && separators.every(cell => /^:?-{3,}:?$/.test(cell));
}
