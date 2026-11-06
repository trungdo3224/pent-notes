import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Range, StateField } from "@codemirror/state";
import { TableWidget } from "./tableWidget";

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
          // Find the HeaderMark (# marks + following space)
          const markMatch = state.sliceDoc(from, to).match(/^#+\s*/);
          const markLen = markMatch ? markMatch[0].length : Number(level) + 1;
          const markEnd = Math.min(from + markLen, to);

          // Hide # mark and style the heading text
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
          // Cursor on line: reveal # marks with subtle styling, style whole heading
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
        if (!cursorInside && to - from >= 4) {
          decorations.push(emptyReplace.range(from, from + 2));
          decorations.push(
            Decoration.mark({ class: "cm-bold" }).range(from + 2, to - 2),
          );
          decorations.push(emptyReplace.range(to - 2, to));
        } else {
          decorations.push(
            Decoration.mark({ class: "cm-bold" }).range(from, to),
          );
        }
        return false;
      }

      // 4. Emphasis (*italic*)
      if (name === "Emphasis") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from >= 2) {
          decorations.push(emptyReplace.range(from, from + 1));
          decorations.push(
            Decoration.mark({ class: "cm-italic" }).range(from + 1, to - 1),
          );
          decorations.push(emptyReplace.range(to - 1, to));
        } else {
          decorations.push(
            Decoration.mark({ class: "cm-italic" }).range(from, to),
          );
        }
        return false;
      }

      // 5. Strikethrough (~~del~~)
      if (name === "Strikethrough") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from >= 4) {
          decorations.push(emptyReplace.range(from, from + 2));
          decorations.push(
            Decoration.mark({ class: "cm-strikethrough" }).range(
              from + 2,
              to - 2,
            ),
          );
          decorations.push(emptyReplace.range(to - 2, to));
        } else {
          decorations.push(
            Decoration.mark({ class: "cm-strikethrough" }).range(from, to),
          );
        }
        return false;
      }

      // 6. InlineCode (`code`)
      if (name === "InlineCode") {
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside && to - from >= 2) {
          decorations.push(emptyReplace.range(from, from + 1));
          decorations.push(
            Decoration.mark({ class: "cm-inline-code" }).range(
              from + 1,
              to - 1,
            ),
          );
          decorations.push(emptyReplace.range(to - 1, to));
        } else {
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

          decorations.push(emptyReplace.range(from, labelStart));
          decorations.push(
            Decoration.mark({ class: "cm-link" }).range(labelStart, labelEnd),
          );
          decorations.push(emptyReplace.range(labelEnd, to));
        } else {
          decorations.push(
            Decoration.mark({ class: "cm-link" }).range(from, to),
          );
        }
        return false;
      }

      // 8. TaskMarker: [ ] or [x]
      if (name === "TaskMarker") {
        const markerText = state.sliceDoc(from, to).toLowerCase();
        const isChecked = markerText.includes("x");
        decorations.push(
          Decoration.replace({
            widget: new CheckboxWidget(isChecked, from),
          }).range(from, to),
        );
        return false;
      }

      // 9. Bullet List Markers (-, *, +)
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

      // 10. Blockquotes
      if (name === "Blockquote") {
        decorations.push(
          Decoration.mark({ class: "cm-blockquote" }).range(from, to),
        );
      }

      // 11. Fenced Code Blocks: Style full lines as continuous terminal block
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
        decorations.push(
          Decoration.mark({ class: "cm-codeblock-text" }).range(from, to),
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
