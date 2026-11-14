import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Facet, Range, StateField } from "@codemirror/state";
import { TableWidget } from "./tableWidget";
import {
  findLineImageMatches,
  ImageWidget,
  ParsedImageMarkdown,
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

interface CopyButtonElement extends HTMLButtonElement {
  __codeText?: string;
  __langLabel?: string;
  __copiedTimer?: ReturnType<typeof setTimeout>;
  __isCopied?: boolean;
}

function createCheckSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const polyline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline",
  );
  polyline.setAttribute("points", "20 6 9 17 4 12");
  svg.appendChild(polyline);
  return svg;
}

function setCopyButtonIdleLabel(btn: CopyButtonElement, label: string): void {
  const span = document.createElement("span");
  span.textContent = label;
  btn.replaceChildren(span);
}

class CodeBlockCopyWidget extends WidgetType {
  constructor(
    readonly codeText: string,
    readonly langLabel: string,
  ) {
    super();
  }

  eq(other: CodeBlockCopyWidget): boolean {
    return (
      other.codeText === this.codeText && other.langLabel === this.langLabel
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  coordsAt(): null {
    return null;
  }

  toDOM(): HTMLElement {
    const btn = document.createElement("button") as CopyButtonElement;
    btn.type = "button";
    btn.className = "cm-codeblock-copy-btn";
    btn.title = "Copy code to clipboard";
    btn.setAttribute("aria-label", "Copy code");

    btn.__codeText = this.codeText;
    btn.__langLabel = this.langLabel || "Copy";
    btn.__isCopied = false;
    setCopyButtonIdleLabel(btn, btn.__langLabel);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const textToCopy = btn.__codeText ?? this.codeText;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            if (btn.__copiedTimer) {
              clearTimeout(btn.__copiedTimer);
            }
            const labelSpan = document.createElement("span");
            labelSpan.textContent = "Copied";
            btn.replaceChildren(createCheckSvg(), labelSpan);
            btn.classList.add("is-copied");
            btn.__isCopied = true;

            btn.__copiedTimer = setTimeout(() => {
              btn.__isCopied = false;
              btn.__copiedTimer = undefined;
              setCopyButtonIdleLabel(btn, btn.__langLabel || "Copy");
              btn.classList.remove("is-copied");
            }, 1800);
          })
          .catch((err) => {
            console.error("Failed to copy code block:", err);
          });
      }
    });

    return btn;
  }

  updateDOM(dom: HTMLElement): boolean {
    const btn = dom as CopyButtonElement;
    btn.__codeText = this.codeText;
    btn.__langLabel = this.langLabel || "Copy";
    if (!btn.__isCopied) {
      setCopyButtonIdleLabel(btn, btn.__langLabel);
    }
    return true;
  }

  destroy(dom: HTMLElement): void {
    const btn = dom as CopyButtonElement;
    if (btn.__copiedTimer) {
      clearTimeout(btn.__copiedTimer);
      btn.__copiedTimer = undefined;
    }
  }
}

function getEffectiveEndLine(state: EditorState, from: number, to: number) {
  const effectiveTo =
    to > from && state.doc.lineAt(to).from === to ? to - 1 : to;
  return state.doc.lineAt(effectiveTo);
}

function extractCodeBlockText(
  state: EditorState,
  startLineNum: number,
  endLineNum: number,
  hasClosingFence: boolean,
  stripBlockquotePrefix: boolean,
): string {
  const lastCodeLineNum = hasClosingFence ? endLineNum - 1 : endLineNum;
  if (lastCodeLineNum < startLineNum + 1) {
    return "";
  }
  const codeStart = state.doc.line(startLineNum + 1).from;
  const codeEnd = state.doc.line(lastCodeLineNum).to;
  let text = state.sliceDoc(codeStart, codeEnd);
  if (stripBlockquotePrefix) {
    text = text
      .split("\n")
      .map((line) => line.replace(/^\s*(?:>\s?)+/, ""))
      .join("\n");
  }
  return text;
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

interface SpanRange {
  from: number;
  to: number;
}

type TreeSyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolve"]>;

function collectNestedCodeLineRanges(
  state: EditorState,
  root: TreeSyntaxNode,
  ranges: SpanRange[],
): void {
  let child = root.firstChild;
  while (child) {
    if (child.name === "FencedCode" || child.name === "CodeBlock") {
      const startLine = state.doc.lineAt(child.from);
      const endLine = getEffectiveEndLine(state, child.from, child.to);
      ranges.push({ from: startLine.from, to: endLine.to });
    } else {
      collectNestedCodeLineRanges(state, child, ranges);
    }
    child = child.nextSibling;
  }
}

function appendBlockquoteDecorations(
  decorations: Range<Decoration>[],
  state: EditorState,
  bqNode: TreeSyntaxNode,
): void {
  const codeRanges: SpanRange[] = [];
  collectNestedCodeLineRanges(state, bqNode, codeRanges);
  if (codeRanges.length === 0) {
    decorations.push(
      Decoration.mark({ class: "cm-blockquote" }).range(bqNode.from, bqNode.to),
    );
    return;
  }

  let pos = bqNode.from;
  for (const range of codeRanges) {
    if (range.from > pos) {
      decorations.push(
        Decoration.mark({ class: "cm-blockquote" }).range(pos, range.from),
      );
    }
    pos = Math.max(pos, range.to);
  }
  if (bqNode.to > pos) {
    decorations.push(
      Decoration.mark({ class: "cm-blockquote" }).range(pos, bqNode.to),
    );
  }
}

function appendCodeBlockLineDecorations(
  decorations: Range<Decoration>[],
  state: EditorState,
  startLineNum: number,
  endLineNum: number,
  collapseFirstFence: boolean,
  collapseLastFence: boolean,
): void {
  for (let l = startLineNum; l <= endLineNum; l++) {
    const line = state.doc.line(l);
    let cls = "cm-codeblock-line";
    if (l === startLineNum) {
      cls += " cm-codeblock-first";
      if (collapseFirstFence) cls += " cm-codeblock-fence-collapsed";
    }
    if (l === endLineNum) {
      cls += " cm-codeblock-last";
      if (collapseLastFence) cls += " cm-codeblock-fence-collapsed";
    }
    decorations.push(Decoration.line({ class: cls }).range(line.from));
  }
}

function overlapsAnyRange(
  from: number,
  to: number,
  ranges: SpanRange[],
): boolean {
  for (const r of ranges) {
    if (from < r.to && to > r.from) return true;
  }
  return false;
}

function appendImageDecoration(
  decorations: Range<Decoration>[],
  state: EditorState,
  from: number,
  to: number,
  parsed: ParsedImageMarkdown,
  activeFilePath?: string,
): void {
  const line = state.doc.lineAt(from);
  const isBlock = line.text.trim() === parsed.raw.trim();
  const resolvedUrl = resolveImageUrl(parsed.url, activeFilePath);
  decorations.push(
    Decoration.replace({
      widget: new ImageWidget(
        parsed.raw,
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

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const excludedRanges: SpanRange[] = [];
  const activeFilePath = state.facet(activeFilePathFacet);

  syntaxTree(state)
    .cursor()
    .iterate((node) => {
      const { name, from, to } = node;

      // 1. Tables: Always keep table in styled view with in-place cell editing
      if (name === "Table") {
        const lineFrom = state.doc.lineAt(from).from;
        const lineTo = state.doc.lineAt(to).to;
        excludedRanges.push({ from: lineFrom, to: lineTo });
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

      // 6. InlineCode (`code` or multi-backtick ``code ` here``)
      if (name === "InlineCode") {
        excludedRanges.push({ from, to });
        const cursorInside = isCursorInRange(state, from, to);
        const marks = node.node.getChildren("CodeMark");
        const openMark = marks[0];
        const closeMark = marks.length > 1 ? marks[marks.length - 1] : null;

        if (
          !cursorInside &&
          openMark &&
          closeMark &&
          closeMark.from >= openMark.to
        ) {
          if (openMark.to > openMark.from) {
            decorations.push(emptyReplace.range(openMark.from, openMark.to));
          }
          if (closeMark.from > openMark.to) {
            decorations.push(
              Decoration.mark({ class: "cm-inline-code" }).range(
                openMark.to,
                closeMark.from,
              ),
            );
          }
          if (closeMark.to > closeMark.from) {
            decorations.push(emptyReplace.range(closeMark.from, closeMark.to));
          }
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
        excludedRanges.push({ from, to });
        const cursorInside = isCursorInRange(state, from, to);
        if (!cursorInside) {
          const rawText = state.sliceDoc(from, to);
          const parsed = parseImageMarkdown(rawText);
          if (parsed && parsed.url) {
            appendImageDecoration(
              decorations,
              state,
              from,
              to,
              parsed,
              activeFilePath,
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

      // 11. Blockquotes (skip nested code blocks so code isn't italicized)
      if (name === "Blockquote" && to > from) {
        appendBlockquoteDecorations(decorations, state, node.node);
      }

      // 11b. HorizontalRule (---, ***, ___)
      if (name === "HorizontalRule") {
        const line = state.doc.lineAt(from);
        if (!isCursorOnLine(state, from)) {
          decorations.push(
            Decoration.line({ class: "cm-hr-line" }).range(line.from),
          );
          if (to > from) {
            decorations.push(emptyReplace.range(from, to));
          }
        }
        return false;
      }

      // 12. Fenced Code Blocks: Continuous terminal block with Copy button
      if (name === "FencedCode") {
        const startLine = state.doc.lineAt(from);
        const endLine = getEffectiveEndLine(state, from, to);
        const cursorInside = isCursorInRange(state, from, endLine.to);
        excludedRanges.push({ from: startLine.from, to: endLine.to });

        const codeMarks = node.node.getChildren("CodeMark");
        const openMark = codeMarks[0] ?? null;
        const candidateCloseMark =
          codeMarks.length > 1 ? codeMarks[codeMarks.length - 1] : null;
        const hasClosingFence = Boolean(
          candidateCloseMark &&
          endLine.number > startLine.number &&
          candidateCloseMark.from >= endLine.from,
        );
        const closeMark = hasClosingFence ? candidateCloseMark : null;

        const codeInfo = node.node.getChild("CodeInfo");
        const rawInfo = codeInfo
          ? state.sliceDoc(codeInfo.from, codeInfo.to).trim()
          : "";
        const langLabel = rawInfo
          ? rawInfo.charAt(0).toUpperCase() + rawInfo.slice(1)
          : "";

        appendCodeBlockLineDecorations(
          decorations,
          state,
          startLine.number,
          endLine.number,
          !cursorInside,
          !cursorInside && hasClosingFence,
        );

        const prefixBeforeOpen = openMark
          ? state.sliceDoc(startLine.from, openMark.from)
          : "";
        const isInBlockquote = /^\s*(?:>\s*)+$/.test(prefixBeforeOpen);

        const codeText = extractCodeBlockText(
          state,
          startLine.number,
          endLine.number,
          hasClosingFence,
          isInBlockquote,
        );
        decorations.push(
          Decoration.widget({
            widget: new CodeBlockCopyWidget(codeText, langLabel),
            side: 1,
          }).range(startLine.to),
        );

        if (!cursorInside) {
          if (startLine.to > startLine.from) {
            decorations.push(emptyReplace.range(startLine.from, startLine.to));
          }
          if (hasClosingFence && endLine.to > endLine.from) {
            decorations.push(emptyReplace.range(endLine.from, endLine.to));
          }
        } else {
          for (const mark of [openMark, closeMark]) {
            if (mark && mark.to > mark.from) {
              decorations.push(
                Decoration.mark({ class: "cm-codeblock-fence" }).range(
                  mark.from,
                  mark.to,
                ),
              );
            }
          }
          if (codeInfo && codeInfo.to > codeInfo.from) {
            decorations.push(
              Decoration.mark({ class: "cm-codeblock-info" }).range(
                codeInfo.from,
                codeInfo.to,
              ),
            );
          }
        }
        return false;
      }

      if (name === "CodeBlock") {
        const startLine = state.doc.lineAt(from);
        const endLine = getEffectiveEndLine(state, from, to);
        excludedRanges.push({ from: startLine.from, to: endLine.to });

        appendCodeBlockLineDecorations(
          decorations,
          state,
          startLine.number,
          endLine.number,
          false,
          false,
        );

        const codeText = state
          .sliceDoc(startLine.from, endLine.to)
          .split("\n")
          .map((line) => line.replace(/^(?:\t| {1,4})/, ""))
          .join("\n");
        decorations.push(
          Decoration.widget({
            widget: new CodeBlockCopyWidget(codeText, ""),
            side: 1,
          }).range(startLine.to),
        );
        return false;
      }
    });

  // 13. Obsidian WikiLink image embeds (![[image.png]]), HTML <img> tags, and markdown images with unencoded spaces
  for (let lineNum = 1; lineNum <= state.doc.lines; lineNum++) {
    const line = state.doc.line(lineNum);
    if (!line.text.includes("![") && !/<img\b/i.test(line.text)) continue;

    const matches = findLineImageMatches(line.text);
    for (const match of matches) {
      const from = line.from + match.fromOffset;
      const to = line.from + match.toOffset;
      if (overlapsAnyRange(from, to, excludedRanges)) continue;

      excludedRanges.push({ from, to });
      if (!isCursorInRange(state, from, to)) {
        appendImageDecoration(
          decorations,
          state,
          from,
          to,
          match.parsed,
          activeFilePath,
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

export const livePreviewField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.startState.facet(activeFilePathFacet) !==
        tr.state.facet(activeFilePathFacet) ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state)
    ) {
      return buildDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function hasCodeBlockAncestor(
  node: ReturnType<ReturnType<typeof syntaxTree>["resolve"]> | null,
): boolean {
  let cur = node;
  while (cur) {
    if (cur.name === "FencedCode" || cur.name === "CodeBlock") {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

function isCursorInCodeBlock(state: EditorState): boolean {
  const pos = state.selection.main.head;
  const tree = syntaxTree(state);
  return (
    hasCodeBlockAncestor(tree.resolve(pos, 1)) ||
    hasCodeBlockAncestor(tree.resolve(pos, -1))
  );
}

export const codeBlockCursorPlugin = EditorView.editorAttributes.of((view) =>
  isCursorInCodeBlock(view.state) ? { class: "cm-in-codeblock" } : null,
);
