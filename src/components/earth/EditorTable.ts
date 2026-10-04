import { Fragment } from '@tiptap/pm/model';
import { Table, TableCell, TableHeader, TableRow, TableView } from '@tiptap/extension-table';
import type { MarkdownTable } from '../../lib/cms/markdown/table';
import { parseTablePayload, TABLE_FENCE } from '../../lib/cms/markdown/table';

/** The package's default serializer falls back to raw HTML and loses headerless tables. */
const EditorTable = Table.extend({
  addNodeView() {
    return ({ node, editor, view, getPos }) => {
      const tableView = new TableView(node, 140, view);
      const scroll = document.createElement('div');
      scroll.className = 'editor-table-scroll';
      scroll.appendChild(tableView.table);
      const toolbar = document.createElement('div');
      toolbar.className = 'rich-table-toolbar';
      toolbar.contentEditable = 'false';
      toolbar.setAttribute('role', 'group');
      toolbar.setAttribute('aria-label', 'Table controls');
      const more = document.createElement('details');
      more.className = 'rich-table-more';
      const summary = document.createElement('summary');
      summary.textContent = '⋯';
      summary.setAttribute('aria-label', 'More table controls');
      more.appendChild(summary);
      const menu = document.createElement('div');
      menu.className = 'rich-table-more-menu';
      more.appendChild(menu);
      const actions = [
        ['+ Row', () => editor.chain().focus().addRowAfter().run()],
        ['+ Column', () => editor.chain().focus().addColumnAfter().run()],
        ['Row above', () => editor.chain().focus().addRowBefore().run()],
        ['Column left', () => editor.chain().focus().addColumnBefore().run()],
        ['Delete row', () => editor.chain().focus().deleteRow().run()],
        ['Delete column', () => editor.chain().focus().deleteColumn().run()],
        ['Header row', () => editor.chain().focus().toggleHeaderRow().run()],
        ['Delete table', () => editor.chain().focus().deleteTable().run()],
      ] as const;
      actions.forEach(([label, command], index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => { command(); more.open = false; });
        (index < 2 ? toolbar : menu).appendChild(button);
      });
      toolbar.appendChild(more);
      const dimensions = document.createElement('span');
      dimensions.setAttribute('aria-live', 'polite');
      toolbar.appendChild(dimensions);
      toolbar.addEventListener('mousedown', event => event.preventDefault());
      tableView.dom.replaceChildren(toolbar, scroll);
      const sync = () => {
        const position = getPos();
        const { from, to } = editor.state.selection;
        const active = typeof position === 'number' && from > position
          && to < position + tableView.node.nodeSize;
        toolbar.hidden = !active;
        if (!active) more.open = false;
        dimensions.textContent = `${tableView.node.childCount} rows × ${tableView.node.firstChild?.childCount ?? 0} columns`;
      };
      editor.on('selectionUpdate', sync);
      editor.on('update', sync);
      sync();
      return {
        dom: tableView.dom,
        contentDOM: tableView.contentDOM,
        update(updated) { const accepted = tableView.update(updated); if (accepted) sync(); return accepted; },
        ignoreMutation: mutation => tableView.ignoreMutation(mutation),
        stopEvent: event => toolbar.contains(event.target as globalThis.Node),
        destroy() { editor.off('selectionUpdate', sync); editor.off('update', sync); },
      };
    };
  },

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
