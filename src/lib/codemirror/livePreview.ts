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
 * Horizontal rule widget for Obsidian Live Preview.
 */
class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('div');
    hr.className = 'cm-live-hr';
    return hr;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Embedded image widget for Obsidian Live Preview.
 */
class ImageWidget extends WidgetType {
  constructor(readonly url: string, readonly alt: string) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return this.url === other.url && this.alt === other.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-live-image-wrap';

    const img = document.createElement('img');
    let resolvedUrl = this.url;
    if (
      typeof window !== 'undefined' &&
      window.electronAPI?.fs?.getRawUrl &&
      !resolvedUrl.startsWith('http://') &&
      !resolvedUrl.startsWith('https://') &&
      !resolvedUrl.startsWith('data:') &&
      !resolvedUrl.startsWith('pent-file://')
    ) {
      resolvedUrl = window.electronAPI.fs.getRawUrl(resolvedUrl);
    }
    img.src = resolvedUrl;
    img.alt = this.alt || 'Note Image';
    img.className = 'cm-live-image';
    img.loading = 'lazy';

    img.onerror = () => {
      wrap.innerHTML = `<span class="cm-live-image-error">🖼️ [Image not found: ${this.alt || this.url}]</span>`;
    };

    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Builds Obsidian Live Preview decorations across the document.
 */
function buildLivePreviewDecos(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const { doc, selection } = view.state;
  const cursorLine = doc.lineAt(selection.main.head).number;
  const selFrom = selection.main.from;
  const selTo = selection.main.to;

  function isCursorInRange(from: number, to: number): boolean {
    return selTo >= from && selFrom <= to;
  }

  const occupied: Array<{ from: number; to: number }> = [];

  function canPlace(from: number, to: number): boolean {
    if (from >= to) return false;
    for (const r of occupied) {
      if (Math.max(from, r.from) < Math.min(to, r.to)) {
        return false;
      }
    }
    return true;
  }

  function addReplace(from: number, to: number, widget?: WidgetType) {
    if (!canPlace(from, to)) return;
    occupied.push({ from, to });
    decos.push(
      Decoration.replace(widget ? { widget } : {}).range(from, to)
    );
  }

  let inCodeFence = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const isCurrentLine = i === cursorLine;

    // 1. Fenced Code Blocks (``` ... ```)
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

    // 2. Horizontal Rule (---, ***, ___)
    if (/^(---|___|\*\*\*)\s*$/.test(text)) {
      decos.push(Decoration.line({ class: 'cm-hr-line' }).range(line.from));
      if (!isCurrentLine && canPlace(line.from, line.to)) {
        addReplace(line.from, line.to, new HrWidget());
        continue;
      }
    }

    // 3. Headings (# Heading ... ###### Heading)
    const headingMatch = text.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      decos.push(
        Decoration.line({
          class: `cm-heading-line cm-heading-${level}`,
        }).range(line.from)
      );

      const markerEnd = line.from + headingMatch[0].length;
      if (!isCurrentLine) {
        // In Live Preview, hide the leading `# ` when not editing this line
        addReplace(line.from, markerEnd);
      } else {
        decos.push(
          Decoration.mark({ class: 'cm-heading-marker-dim' }).range(line.from, markerEnd)
        );
      }
    }

    // 4. Blockquotes (> Quote)
    if (text.startsWith('>')) {
      decos.push(Decoration.line({ class: 'cm-blockquote-line' }).range(line.from));
      const bqMatch = text.match(/^>\s?/);
      if (bqMatch && !isCurrentLine) {
        addReplace(line.from, line.from + bqMatch[0].length);
      }
    }

    // 5. Tables (| col | col |)
    if (text.trim().startsWith('|') && text.trim().endsWith('|')) {
      const isDelimiter = /^\|\s*[-:]+[-| :]*\|$/.test(text.trim());
      decos.push(
        Decoration.line({
          class: `cm-table-line ${isDelimiter ? 'cm-table-sep' : ''}`,
        }).range(line.from)
      );
    }

    // 6. Interactive Task Checkboxes (- [ ] or - [x])
    const taskMatch = text.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+)/);
    if (taskMatch) {
      const checked = taskMatch[2].toLowerCase() === 'x';
      const bracketOpenPos = line.from + taskMatch[1].length - 1;
      const bracketClosePos = line.from + taskMatch[1].length + 2;
      const stateCharPos = line.from + taskMatch[1].length;

      addReplace(bracketOpenPos, bracketClosePos, new CheckboxWidget(checked, stateCharPos));
    }

    // 7. Embedded Images (![alt](url))
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(text)) !== null) {
      const matchStart = line.from + imgMatch.index;
      const matchEnd = matchStart + imgMatch[0].length;
      const altText = imgMatch[1];
      const imgUrl = imgMatch[2];

      if (!isCursorInRange(matchStart, matchEnd)) {
        addReplace(matchStart, matchEnd, new ImageWidget(imgUrl, altText));
      }
    }

    // 8. Markdown Links ([text](url)) - excludes images
    const linkRegex = /(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(text)) !== null) {
      const matchStart = line.from + linkMatch.index;
      const matchEnd = matchStart + linkMatch[0].length;
      const anchorStart = matchStart + 1;
      const anchorEnd = anchorStart + linkMatch[1].length;
      const urlPartStart = anchorEnd;
      const urlPartEnd = matchEnd;

      if (!isCursorInRange(matchStart, matchEnd)) {
        addReplace(matchStart, anchorStart); // hide '['
        if (canPlace(anchorStart, anchorEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-link' }).range(anchorStart, anchorEnd)
          );
        }
        addReplace(urlPartStart, urlPartEnd); // hide '](url)'
      } else {
        if (canPlace(anchorStart, anchorEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-link' }).range(anchorStart, anchorEnd)
          );
        }
      }
    }

    // 9. Inline Code (`code`)
    const codeRegex = /(?<!`)`([^`\n]+)`(?!`)/g;
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codeRegex.exec(text)) !== null) {
      const matchStart = line.from + codeMatch.index;
      const matchEnd = matchStart + codeMatch[0].length;
      const innerStart = matchStart + 1;
      const innerEnd = matchEnd - 1;

      if (!isCursorInRange(matchStart, matchEnd)) {
        addReplace(matchStart, innerStart); // hide leading backtick
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-code' }).range(innerStart, innerEnd)
          );
        }
        addReplace(innerEnd, matchEnd); // hide trailing backtick
      } else {
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-code' }).range(innerStart, innerEnd)
          );
        }
      }
    }

    // 10. Inline Bold (**text** or __text__)
    const boldRegex = /(\*\*|__)([^*\n_]+)\1/g;
    let boldMatch: RegExpExecArray | null;
    while ((boldMatch = boldRegex.exec(text)) !== null) {
      const matchStart = line.from + boldMatch.index;
      const matchEnd = matchStart + boldMatch[0].length;
      const innerStart = matchStart + 2;
      const innerEnd = matchEnd - 2;

      if (!isCursorInRange(matchStart, matchEnd)) {
        addReplace(matchStart, innerStart); // hide leading **
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-bold' }).range(innerStart, innerEnd)
          );
        }
        addReplace(innerEnd, matchEnd); // hide trailing **
      } else {
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-bold' }).range(innerStart, innerEnd)
          );
        }
      }
    }

    // 11. Inline Italic (*text* or _text_)
    const italicRegex = /(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g;
    let italicMatch: RegExpExecArray | null;
    while ((italicMatch = italicRegex.exec(text)) !== null) {
      const matchStart = line.from + italicMatch.index;
      const matchEnd = matchStart + italicMatch[0].length;
      const innerStart = matchStart + 1;
      const innerEnd = matchEnd - 1;

      if (!isCursorInRange(matchStart, matchEnd)) {
        addReplace(matchStart, innerStart); // hide leading *
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-italic' }).range(innerStart, innerEnd)
          );
        }
        addReplace(innerEnd, matchEnd); // hide trailing *
      } else {
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-italic' }).range(innerStart, innerEnd)
          );
        }
      }
    }

    // 12. Inline Strikethrough (~~text~~)
    const strikeRegex = /~~([^~\n]+)~~/g;
    let strikeMatch: RegExpExecArray | null;
    while ((strikeMatch = strikeRegex.exec(text)) !== null) {
      const matchStart = line.from + strikeMatch.index;
      const matchEnd = matchStart + strikeMatch[0].length;
      const innerStart = matchStart + 2;
      const innerEnd = matchEnd - 2;

      if (!isCursorInRange(matchStart, matchEnd)) {
        addReplace(matchStart, innerStart); // hide leading ~~
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-strike' }).range(innerStart, innerEnd)
          );
        }
        addReplace(innerEnd, matchEnd); // hide trailing ~~
      } else {
        if (canPlace(innerStart, innerEnd)) {
          decos.push(
            Decoration.mark({ class: 'cm-live-strike' }).range(innerStart, innerEnd)
          );
        }
      }
    }
  }

  // CodeMirror requires decorations to be strictly sorted by from, then to
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
