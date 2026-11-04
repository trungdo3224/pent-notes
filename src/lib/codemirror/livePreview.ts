import { Range } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/**
 * Interactive task checkbox widget for Obsidian Live Preview.
 */
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-task-widget';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-task-checkbox';
    input.setAttribute('aria-label', this.checked ? 'Completed task' : 'Incomplete task');

    input.addEventListener('click', (e) => {
      e.stopPropagation();
      const newChar = input.checked ? 'x' : ' ';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 1, insert: newChar },
      });
    });

    wrap.appendChild(input);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Builds Live Preview decorations across visible document lines.
 */
function buildLivePreviewDecos(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const { doc, selection } = view.state;
  const cursorLine = doc.lineAt(selection.main.head).number;

  let inCodeFence = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const isCurrentLine = i === cursorLine;

    // Fenced code blocks
    if (/^```/.test(text.trim())) {
      inCodeFence = !inCodeFence;
      decos.push(
        Decoration.line({ class: 'cm-codeblock-line cm-codeblock-fence' }).range(line.from)
      );
      continue;
    }
    if (inCodeFence) {
      decos.push(Decoration.line({ class: 'cm-codeblock-line' }).range(line.from));
      continue;
    }

    // Task Checkboxes (- [ ] or - [x])
    const taskMatch = text.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+)/);
    if (taskMatch) {
      const checked = taskMatch[2].toLowerCase() === 'x';
      const bracketOpenPos = line.from + taskMatch[1].length - 1;
      const bracketClosePos = line.from + taskMatch[1].length + 2;
      const stateCharPos = line.from + taskMatch[1].length;

      decos.push(
        Decoration.replace({
          widget: new CheckboxWidget(checked, stateCharPos),
        }).range(bracketOpenPos, bracketClosePos)
      );
    }

    // Headings (# Heading)
    const headingMatch = text.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      decos.push(
        Decoration.line({
          class: `cm-heading-line cm-heading-${level}`,
        }).range(line.from)
      );

      // In Live Preview, dim the leading hashes if not actively editing this line
      if (!isCurrentLine) {
        decos.push(
          Decoration.mark({
            class: 'cm-heading-marker-dim',
          }).range(line.from, line.from + headingMatch[0].length)
        );
      }
    }

    // Blockquote (> Quote)
    if (text.startsWith('>')) {
      decos.push(Decoration.line({ class: 'cm-blockquote-line' }).range(line.from));
    }

    // Horizontal rule (--- or ***)
    if (/^(---|___|\*\*\*)\s*$/.test(text)) {
      decos.push(Decoration.line({ class: 'cm-hr-line' }).range(line.from));
    }
  }

  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(decos, true);
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecos(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreviewDecos(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
