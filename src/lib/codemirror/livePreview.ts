import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Facet, Range, StateField } from "@codemirror/state";
import { TableWidget } from "./tableWidget";
import {
  ImageWidget,
  parseImageMarkdown,
  resolveImageUrl,
} from "./imageWidget";

export const activeFilePathFacet = Facet.define<
  string | undefined,
  string | undefined
>({
  combine: (values) => values[0] ?? undefined,
});

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-bullet-mark";
    span.textContent = "•";
    return span;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;

    input.addEventListener("change", (e) => {
      e.preventDefault();
      const newMarker = input.checked ? "[x]" : "[ ]";
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newMarker },
      });
    });

    return input;
  }
}

class CodeBlockCopyWidget extends WidgetType {
  constructor(readonly codeText: string) {
    super();
  }

  eq(other: CodeBlockCopyWidget): boolean {
    return other.codeText === this.codeText;
  }

  ignoreEvent(): boolean {
    return true;
  }

  coordsAt(): null {
    return null;
  }

  toDOM(): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-codeblock-copy-btn";
    btn.title = "Copy code to clipboard";
    btn.setAttribute("aria-label", "Copy code");

    const copySvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
    const checkSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    btn.innerHTML = `${copySvg}<span>Copy</span>`;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const textToCopy =
        (btn as { __codeText?: string }).__codeText ?? this.codeText;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            btn.innerHTML = `${checkSvg}<span>Copied!</span>`;
            btn.classList.add("is-copied");
            setTimeout(() => {
              btn.innerHTML = `${copySvg}<span>Copy</span>`;
              btn.classList.remove("is-copied");
            }, 2000);
          })
          .catch((err) => {
            console.error("Failed to copy code block:", err);
          });
      }
    });

    return btn;
  }

  updateDOM(dom: HTMLElement): boolean {
    (dom as { __codeText?: string }).__codeText = this.codeText;
    return true;
  }
}

function extractCodeBlockText(
  state: EditorState,
  startLineNum: number,
  endLineNum: number,
): string {
  if (endLineNum > startLineNum + 1) {
    const codeStart = state.doc.line(startLineNum + 1).from;
    const codeEnd = state.doc.line(endLineNum - 1).to;
    return state.sliceDoc(codeStart, codeEnd);
  }
  return "";
}

function isCursorInRange(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  for (const r of state.selection.ranges) {
    if (r.from <= to && r.to >= from) return true;
  }
  return false;
}

function isCursorOnLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  for (const r of state.selection.ranges) {
    if (r.from <= line.to && r.to >= line.from) return true;
  }
  return false;
}

const emptyReplace = Decoration.replace({});

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const activeFilePath = state.facet(activeFilePathFacet);

  syntaxTree(state)
    .cursor()
    .iterate((node) => {
      const { name, from, to } = node;

      // 1. Tables: Always keep table in styled view with in-place cell editing
      if (name === "Table") {
        const lineFrom = state.doc.lineAt(from).from;
        const lineTo = state.doc.lineAt(to).to;
        const rawText = state.sliceDoc(lineFrom, lineTo);
        decorations.push(
          Decoration.replace({
            widget: new TableWidget(rawText, lineFrom, lineTo),
            block: true,
          }).range(lineFrom, lineTo),
        );
        return false;
      }

      // 2. Headings (ATXHeading1 to ATXHeading6)
      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = name.slice(-1);
        const cursorOnHeading = isCursorOnLine(state, from);

        if (!cursorOnHeading) {
          const markMatch = state.sliceDoc(from, to).match(/^#+\s*/);
          const markLen = markMatch ? markMatch[0].length : Number(level) + 1;
          const markEnd = Math.min(from + markLen, to);

          if (markEnd > from) {
            decorations.push(emptyReplace.range(from, markEnd));
          }
          if (to > markEnd) {
            decorations.push(
              Decoration.mark({ class: `cm-heading cm-h${level}` }).range(
                markEnd,
                to,
              ),
            );
          }
        } else {
          decorations.push(
            Decoration.mark({ class: `cm-heading cm-h${level}` }).range(
              from,
              to,
            ),
          );
        }
        return false;
      }

      // 3. Strong Emphasis (**bold**)
      if (name === "StrongEmphasis") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from > 4) {
          decorations.push(emptyReplace.range(from, from + 2));
          decorations.push(
            Decoration.mark({ class: "cm-bold" }).range(from + 2, to - 2),
          );
          decorations.push(emptyReplace.range(to - 2, to));
        } else if (to > from) {
          decorations.push(
            Decoration.mark({ class: "cm-bold" }).range(from, to),
          );
        }
        return false;
      }

      // 4. Emphasis (*italic*)
      if (name === "Emphasis") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from > 2) {
          decorations.push(emptyReplace.range(from, from + 1));
          decorations.push(
            Decoration.mark({ class: "cm-italic" }).range(from + 1, to - 1),
          );
          decorations.push(emptyReplace.range(to - 1, to));
        } else if (to > from) {
          decorations.push(
            Decoration.mark({ class: "cm-italic" }).range(from, to),
          );
        }
        return false;
      }

      // 5. Strikethrough (~~del~~)
      if (name === "Strikethrough") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from > 4) {
          decorations.push(emptyReplace.range(from, from + 2));
          decorations.push(
            Decoration.mark({ class: "cm-strikethrough" }).range(
              from + 2,
              to - 2,
            ),
          );
          decorations.push(emptyReplace.range(to - 2, to));
        } else if (to > from) {
          decorations.push(
            Decoration.mark({ class: "cm-strikethrough" }).range(from, to),
          );
        }
        return false;
      }

      // 6. InlineCode (`code`)
      if (name === "InlineCode") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from > 2) {
          decorations.push(emptyReplace.range(from, from + 1));
          decorations.push(
            Decoration.mark({ class: "cm-inline-code" }).range(
              from + 1,
              to - 1,
            ),
          );
          decorations.push(emptyReplace.range(to - 1, to));
        } else if (to > from) {
          decorations.push(
            Decoration.mark({ class: "cm-inline-code" }).range(from, to),
          );
        }
        return false;
      }

      // 7. Links: [text](url)
      if (name === "Link") {
        const cursorInside = isCursorInRange(state, from, to);
        const linkText = state.sliceDoc(from, to);
        const match = linkText.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

        if (!cursorInside && match) {
          const label = match[1];
          const labelStart = from + 1;
          const labelEnd = labelStart + label.length;

          if (labelStart > from) {
            decorations.push(emptyReplace.range(from, labelStart));
          }
          if (labelEnd > labelStart) {
            decorations.push(
              Decoration.mark({ class: "cm-link" }).range(labelStart, labelEnd),
            );
          }
          if (to > labelEnd) {
            decorations.push(emptyReplace.range(labelEnd, to));
          }
        } else if (to > from) {
          decorations.push(
            Decoration.mark({ class: "cm-link" }).range(from, to),
          );
        }
        return false;
      }

      // 8. Images: ![alt](url) or ![alt|width](url)
      if (name === "Image") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside) {
          const rawText = state.sliceDoc(from, to);
          const parsed = parseImageMarkdown(rawText);
          if (parsed && parsed.url) {
            const line = state.doc.lineAt(from);
            const isBlock = line.text.trim() === rawText.trim();
            const resolvedUrl = resolveImageUrl(parsed.url, activeFilePath);
            decorations.push(
              Decoration.replace({
                widget: new ImageWidget(
                  rawText,
                  parsed.url,
                  resolvedUrl,
                  parsed.alt,
                  parsed.title,
                  parsed.width,
                  parsed.height,
                  from,
                  to,
                  isBlock,
                ),
              }).range(from, to),
            );
          }
        }
        return false;
      }

      // 9. TaskMarker: [ ] or [x]
      if (name === "TaskMarker") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside) {
          const markerText = state.sliceDoc(from, to).toLowerCase();
          const isChecked = markerText.includes("x");
          decorations.push(
            Decoration.replace({
              widget: new CheckboxWidget(isChecked, from),
            }).range(from, to),
          );
        }
        return false;
      }

      // 10. Bullet List Markers (-, *, +)
      if (name === "ListMark") {
        const markText = state.sliceDoc(from, to);
        if (
          (markText === "-" || markText === "*" || markText === "+") &&
          !isCursorOnLine(state, from)
        ) {
          decorations.push(
            Decoration.replace({ widget: new BulletWidget() }).range(from, to),
          );
        }
        return false;
      }

      // 11. Blockquotes
      if (name === "Blockquote" && to > from) {
        decorations.push(
          Decoration.mark({ class: "cm-blockquote" }).range(from, to),
        );
      }

      // 12. Fenced Code Blocks: Continuous terminal block with Copy button
      if (name === "FencedCode") {
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(to);
        for (let l = startLine.number; l <= endLine.number; l++) {
          const line = state.doc.line(l);
          let cls = "cm-codeblock-line";
          if (l === startLine.number) cls += " cm-codeblock-first";
          if (l === endLine.number) cls += " cm-codeblock-last";
          decorations.push(Decoration.line({ class: cls }).range(line.from));
        }

        const codeText = extractCodeBlockText(
          state,
          startLine.number,
          endLine.number,
        );
        decorations.push(
          Decoration.widget({
            widget: new CodeBlockCopyWidget(codeText),
            side: 1,
          }).range(startLine.to),
        );
        return true;
      }

      if (name === "CodeMark" && to > from) {
        decorations.push(
          Decoration.mark({ class: "cm-codeblock-fence" }).range(from, to),
        );
        return false;
      }

      if (name === "CodeInfo" && to > from) {
        decorations.push(
          Decoration.mark({ class: "cm-codeblock-info" }).range(from, to),
        );
        return false;
      }
    });

  return Decoration.set(decorations, true);
}

export const livePreviewField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const codeBlockCursorPlugin = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.checkCodeBlock(view);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged) {
        this.checkCodeBlock(update.view);
      }
    }
    checkCodeBlock(view: EditorView) {
      const pos = view.state.selection.main.head;
      const node = syntaxTree(view.state).resolveInner(pos, 1);
      let inCode = false;
      let cur: typeof node | null = node;
      while (cur) {
        if (cur.name === "FencedCode" || cur.name === "CodeBlock") {
          inCode = true;
          break;
        }
        cur = cur.parent;
      }
      view.dom.classList.toggle("cm-in-codeblock", inCode);
    }
  },
);
