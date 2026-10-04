import { Fragment } from '@tiptap/pm/model';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import type { MarkdownTable } from '../../lib/cms/markdown/table';
import { parseTablePayload, TABLE_FENCE } from '../../lib/cms/markdown/table';

/** The package's default serializer falls back to raw HTML and loses headerless tables. */
const EditorTable = Table.extend({
  addStorage() {
    return { markdown: {
      serialize(state: any, node: any) {
        const rows: MarkdownTable = [];
        node.forEach((row: any) => {
          const cells: MarkdownTable[number] = [];
          row.forEach((cell: any) => {
            const paragraphs: string[][] = [];
            cell.forEach((paragraph: any) => {
              const lines: string[] = [];
              let inline: any[] = [];
              const flush = () => {
                const isolated = new state.constructor({ ...state.nodes,
                  text: (output: any, text: any) => output.text(text.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
                }, state.marks, state.options);
                isolated.renderInline(paragraph.copy(Fragment.fromArray(inline)));
                lines.push(isolated.out);
                inline = [];
              };
              paragraph.forEach((child: any) => {
                if (child.type.name === 'hardBreak') flush();
                else inline.push(child);
              });
              flush();
              paragraphs.push(lines);
            });
            cells.push({ header: cell.type.name === 'tableHeader', paragraphs });
          });
          rows.push(cells);
        });
        state.write('```' + TABLE_FENCE + '\n' + JSON.stringify(rows) + '\n```');
        state.closeBlock(node);
      },
      parse: { setup(md: any) {
        // Install once: parsing is also called on every setContent/insertContentAt.
        if (md.__earthTable) return;
        md.__earthTable = true;
        const fence = md.renderer.rules.fence;
        md.renderer.rules.fence = (tokens: any[], index: number, ...args: any[]) => {
          const token = tokens[index];
          const rows = token.info.trim() === TABLE_FENCE ? parseTablePayload(token.content) : null;
          if (!rows) return fence(tokens, index, ...args);
          return '<table><tbody>' + rows.map(row => '<tr>' + row.map(cell => {
            const tag = cell.header ? 'th' : 'td';
            // Only paragraph/inline content is part of the editable cell schema.
            return `<${tag}>${cell.paragraphs.map(paragraph => '<p>' + paragraph.map(line => md.renderInline(line)).join('<br>') + '</p>').join('')}</${tag}>`;
          }).join('') + '</tr>').join('') + '</tbody></table>';
        };
      } },
    } };
  },
}).configure({ resizable: false, renderWrapper: true });

// Keep the simple-table scope explicit: no nested tables, merged cells or media blocks.
export const editorTableExtensions = [
  EditorTable,
  TableRow,
  TableCell.extend({ content: 'paragraph+' }),
  TableHeader.extend({ content: 'paragraph+' }),
];
