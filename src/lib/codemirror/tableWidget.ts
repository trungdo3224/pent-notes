import { EditorView, WidgetType } from "@codemirror/view";

interface TableCellData {
  text: string;
  align: "left" | "center" | "right" | "";
}

interface ParsedTableData {
  headers: TableCellData[];
  rows: TableCellData[][];
}

/**
 * Splits a markdown table row by pipes while honoring escaped pipes (\|).
 */
function splitPipes(line: string): string[] {
  let content = line.trim();
  if (content.startsWith("|")) content = content.slice(1);
  if (content.endsWith("|")) content = content.slice(0, -1);

  const parts: string[] = [];
  let current = "";
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === "|") {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Parses markdown pipe table text into headers, alignments, and data rows.
 */
function parseMarkdownTable(rawText: string): ParsedTableData | null {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes("|"));

  if (lines.length < 2) return null;

  const headerCells = splitPipes(lines[0]);
  const delimiterCells = splitPipes(lines[1]);

  // Validate delimiter line (e.g. :---, ---:, :---:, ---)
  const isDelimiter = delimiterCells.every((c) =>
    /^:?-+:?$/.test(c.replace(/\s+/g, "")),
  );
  if (!isDelimiter) return null;

  const alignments: Array<"left" | "center" | "right" | ""> =
    delimiterCells.map((c) => {
      const trimmed = c.trim();
      const leftColon = trimmed.startsWith(":");
      const rightColon = trimmed.endsWith(":");
      if (leftColon && rightColon) return "center";
      if (rightColon) return "right";
      if (leftColon) return "left";
      return "";
    });

  const headers: TableCellData[] = headerCells.map((text, i) => ({
    text,
    align: alignments[i] || "",
  }));

  const rows: TableCellData[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const rowCells = splitPipes(lines[i]);
    const row: TableCellData[] = headerCells.map((_, colIdx) => ({
      text: rowCells[colIdx] ?? "",
      align: alignments[colIdx] || "",
    }));
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Converts DOM tree inside a table cell back to markdown string.
 */
function domToCellMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").replace(/\|/g, "\\|");
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      return "<br>";
    }

    const inner = Array.from(el.childNodes).map(domToCellMarkdown).join("");

    if (tag === "strong" || tag === "b") {
      return `**${inner}**`;
    }
    if (tag === "em" || tag === "i") {
      return `*${inner}*`;
    }
    if (tag === "code") {
      return `\`${inner}\``;
    }
    if (tag === "del" || tag === "s") {
      return `~~${inner}~~`;
    }
    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      return href ? `[${inner}](${href})` : inner;
    }
    return inner;
  }
  return "";
}

/**
 * Serializes the current DOM table into standard GitHub Flavored Markdown table text.
 */
function serializeTableToMarkdown(container: HTMLElement): string {
  const table = container.querySelector<HTMLTableElement>("table.cm-table");
  if (!table) return "";

  const headers: string[] = [];
  const alignments: string[] = [];
  const rows: string[][] = [];

  const ths = Array.from(
    table.querySelectorAll<HTMLTableCellElement>("thead th.cm-table-cell"),
  );
  ths.forEach((th) => {
    headers.push(domToCellMarkdown(th).trim());
    const align = th.getAttribute("data-align") || "";
    if (align === "center") alignments.push(":---:");
    else if (align === "right") alignments.push("---:");
    else if (align === "left") alignments.push(":---");
    else alignments.push("---");
  });

  const trs = Array.from(
    table.querySelectorAll<HTMLTableRowElement>("tbody tr"),
  );
  trs.forEach((tr) => {
    const row: string[] = [];
    const tds = Array.from(
      tr.querySelectorAll<HTMLTableCellElement>("td.cm-table-cell"),
    );
    tds.forEach((td) => {
      row.push(domToCellMarkdown(td).trim());
    });
    while (row.length < headers.length) row.push("");
    rows.push(row.slice(0, headers.length));
  });

  const lines: string[] = [];
  lines.push("| " + headers.join(" | ") + " |");
  lines.push("| " + alignments.join(" | ") + " |");
  rows.forEach((r) => {
    lines.push("| " + r.join(" | ") + " |");
  });

  return lines.join("\n");
}

/**
 * Renders cell content into a target element, translating <br> tags into line breaks
 * and rendering inline markdown safely.
 */
function renderCellContent(raw: string, targetEl: HTMLElement): void {
  const lines = raw.split(/<br\s*\/?>/gi);

  lines.forEach((lineText, lineIdx) => {
    if (lineIdx > 0) {
      targetEl.appendChild(document.createElement("br"));
    }

    let remaining = lineText;

    while (remaining.length > 0) {
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        const codeEl = document.createElement("code");
        codeEl.className = "cm-table-inline-code";
        codeEl.textContent = codeMatch[1];
        targetEl.appendChild(codeEl);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
      if (boldMatch) {
        const boldEl = document.createElement("strong");
        boldEl.className = "cm-table-bold";
        boldEl.textContent = boldMatch[2];
        targetEl.appendChild(boldEl);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      const italicMatch = remaining.match(/^(\*|_)([^*_]+?)\1/);
      if (italicMatch) {
        const italicEl = document.createElement("em");
        italicEl.className = "cm-table-italic";
        italicEl.textContent = italicMatch[2];
        targetEl.appendChild(italicEl);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      const delMatch = remaining.match(/^~~(.+?)~~/);
      if (delMatch) {
        const delEl = document.createElement("del");
        delEl.className = "cm-table-del";
        delEl.textContent = delMatch[1];
        targetEl.appendChild(delEl);
        remaining = remaining.slice(delMatch[0].length);
        continue;
      }

      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const linkEl = document.createElement("a");
        linkEl.className = "cm-table-link";
        linkEl.href = linkMatch[2];
        linkEl.textContent = linkMatch[1];
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        targetEl.appendChild(linkEl);
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      if (remaining.startsWith("\\|")) {
        targetEl.appendChild(document.createTextNode("|"));
        remaining = remaining.slice(2);
        continue;
      }

      const nextTokenIdx = remaining.search(/[`*_~[\\]|<br/i);
      if (nextTokenIdx === -1) {
        targetEl.appendChild(document.createTextNode(remaining));
        break;
      } else if (nextTokenIdx === 0) {
        targetEl.appendChild(document.createTextNode(remaining[0]));
        remaining = remaining.slice(1);
      } else {
        targetEl.appendChild(
          document.createTextNode(remaining.slice(0, nextTokenIdx)),
        );
        remaining = remaining.slice(nextTokenIdx);
      }
    }
  });
}

interface TableWidgetElement extends HTMLDivElement {
  __resizeObserver?: ResizeObserver;
  __cleanupTimer?: () => void;
}

/**
 * Interactive In-Place Table Widget for CodeMirror 6.
 * Keeps the table in styled view permanently even during editing.
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly rawText: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return (
      other.rawText === this.rawText &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  get estimatedHeight(): number {
    const lines = this.rawText.split("\n").length;
    return Math.max(lines * 34 + 60, 90);
  }

  updateDOM(dom: HTMLElement, _view: EditorView, prev: TableWidget): boolean {
    // Preserve DOM while typing in a cell or when only upstream offsets shifted
    if (dom.contains(document.activeElement) || prev.rawText === this.rawText) {
      dom.dataset.from = String(this.from);
      dom.dataset.to = String(this.to);
      dom.dataset.rawText = this.rawText;
      const inner = dom.querySelector<HTMLElement>(".cm-table-container");
      if (inner) {
        inner.dataset.from = String(this.from);
        inner.dataset.to = String(this.to);
      }
      return true;
    }
    return false;
  }

  destroy(dom: HTMLElement): void {
    const el = dom as TableWidgetElement;
    if (el.__resizeObserver) {
      el.__resizeObserver.disconnect();
      delete el.__resizeObserver;
    }
    if (el.__cleanupTimer) {
      el.__cleanupTimer();
      delete el.__cleanupTimer;
    }
  }

  toDOM(view: EditorView): HTMLElement {
    const data = parseMarkdownTable(this.rawText);

    if (!data) {
      const fallback = document.createElement("pre");
      fallback.className = "cm-table-raw-fallback";
      fallback.textContent = this.rawText;
      return fallback;
    }

    const wrapper = document.createElement("div") as TableWidgetElement;
    wrapper.className = "cm-table-wrapper";
    wrapper.dataset.from = String(this.from);
    wrapper.dataset.to = String(this.to);
    wrapper.dataset.rawText = this.rawText;

    const container = document.createElement("div");
    container.className = "cm-table-container";
    container.dataset.from = String(this.from);
    container.dataset.to = String(this.to);
    wrapper.appendChild(container);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isDirty = false;

    const clearPendingSync = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };
    wrapper.__cleanupTimer = clearPendingSync;

    if (typeof ResizeObserver === "function") {
      let lastHeight = -1;
      const ro = new ResizeObserver((entries) => {
        const nextHeight =
          entries[0]?.contentRect.height ?? wrapper.offsetHeight;
        if (nextHeight !== lastHeight) {
          lastHeight = nextHeight;
          view.requestMeasure();
        }
      });
      ro.observe(wrapper);
      wrapper.__resizeObserver = ro;
    }

    const dispatchUpdate = () => {
      isDirty = false;
      const curFrom = Number(container.dataset.from);
      const curTo = Number(container.dataset.to);
      const newMarkdown = serializeTableToMarkdown(container);

      const latestRawText = wrapper.dataset.rawText ?? this.rawText;
      if (
        newMarkdown &&
        (newMarkdown !== latestRawText ||
          curTo !== curFrom + newMarkdown.length)
      ) {
        view.dispatch({
          changes: { from: curFrom, to: curTo, insert: newMarkdown },
        });
        container.dataset.to = String(curFrom + newMarkdown.length);
        wrapper.dataset.to = String(curFrom + newMarkdown.length);
        wrapper.dataset.rawText = newMarkdown;
      }
    };

    const scheduleSync = () => {
      clearPendingSync();
      debounceTimer = setTimeout(dispatchUpdate, 150);
    };

    // Toolbar with +R, -R, +C, -C
    const toolbar = document.createElement("div");
    toolbar.className = "cm-table-toolbar";

    const addRowBtn = document.createElement("button");
    addRowBtn.type = "button";
    addRowBtn.className = "cm-table-btn";
    addRowBtn.textContent = "+R";
    addRowBtn.title = "Add row (+R)";

    const delRowBtn = document.createElement("button");
    delRowBtn.type = "button";
    delRowBtn.className = "cm-table-btn";
    delRowBtn.textContent = "-R";
    delRowBtn.title = "Delete row (-R)";

    const addColBtn = document.createElement("button");
    addColBtn.type = "button";
    addColBtn.className = "cm-table-btn";
    addColBtn.textContent = "+C";
    addColBtn.title = "Add column (+C)";

    const delColBtn = document.createElement("button");
    delColBtn.type = "button";
    delColBtn.className = "cm-table-btn";
    delColBtn.textContent = "-C";
    delColBtn.title = "Delete column (-C)";

    toolbar.appendChild(addRowBtn);
    toolbar.appendChild(delRowBtn);
    toolbar.appendChild(addColBtn);
    toolbar.appendChild(delColBtn);
    container.appendChild(toolbar);

    const table = document.createElement("table");
    table.className = "cm-table";

    // Build thead
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");

    data.headers.forEach((h) => {
      const th = document.createElement("th");
      th.className = "cm-table-cell cm-table-th";
      th.contentEditable = "true";
      th.spellcheck = false;
      th.setAttribute("data-align", h.align);
      if (h.align) th.style.textAlign = h.align;
      renderCellContent(h.text, th);
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Build tbody
    const tbody = document.createElement("tbody");
    data.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.className = "cm-table-cell cm-table-td";
        td.contentEditable = "true";
        td.spellcheck = false;
        if (cell.align) td.style.textAlign = cell.align;
        renderCellContent(cell.text, td);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // In-table row addition
    const addNewRow = () => {
      const colCount = thead.querySelectorAll("th.cm-table-cell").length;
      const tr = document.createElement("tr");
      for (let i = 0; i < colCount; i++) {
        const td = document.createElement("td");
        td.className = "cm-table-cell cm-table-td";
        td.contentEditable = "true";
        td.spellcheck = false;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
      dispatchUpdate();
    };

    // In-table column addition
    const addNewColumn = () => {
      const th = document.createElement("th");
      th.className = "cm-table-cell cm-table-th";
      th.contentEditable = "true";
      th.spellcheck = false;
      th.textContent = "Header";
      thead.querySelector("tr")?.appendChild(th);

      tbody.querySelectorAll("tr").forEach((tr) => {
        const td = document.createElement("td");
        td.className = "cm-table-cell cm-table-td";
        td.contentEditable = "true";
        td.spellcheck = false;
        tr.appendChild(td);
      });
      dispatchUpdate();
    };

    // In-table row deletion
    const deleteLastRow = () => {
      const lastTr = tbody.querySelector("tr:last-child");
      if (lastTr && tbody.children.length > 1) {
        lastTr.remove();
        dispatchUpdate();
      }
    };

    // In-table column deletion
    const deleteLastColumn = () => {
      const ths = thead.querySelectorAll("th.cm-table-cell");
      if (ths.length > 1) {
        thead.querySelector("tr")?.lastElementChild?.remove();
        tbody.querySelectorAll("tr").forEach((tr) => {
          tr.lastElementChild?.remove();
        });
        dispatchUpdate();
      }
    };

    // Button event listeners
    addRowBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addNewRow();
    });

    delRowBtn.addEventListener("click", (e) => {
      e.preventDefault();
      deleteLastRow();
    });

    addColBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addNewColumn();
    });

    delColBtn.addEventListener("click", (e) => {
      e.preventDefault();
      deleteLastColumn();
    });

    // Content editing & input sync
    table.addEventListener("input", () => {
      isDirty = true;
      scheduleSync();
    });

    table.addEventListener(
      "blur",
      (e) => {
        if (!table.contains(e.relatedTarget as Node)) {
          clearPendingSync();
          if (isDirty) {
            dispatchUpdate();
          }
        }
      },
      true,
    );

    // Keyboard navigation (Tab, Enter, Shift+Enter)
    table.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const cells = Array.from(
          table.querySelectorAll<HTMLElement>(
            "th.cm-table-cell, td.cm-table-cell",
          ),
        );
        const currentIndex = cells.indexOf(
          document.activeElement as HTMLElement,
        );

        if (currentIndex !== -1) {
          if (e.shiftKey) {
            if (currentIndex > 0) {
              cells[currentIndex - 1].focus();
            }
          } else {
            if (currentIndex < cells.length - 1) {
              cells[currentIndex + 1].focus();
            } else {
              addNewRow();
              const updatedCells = Array.from(
                table.querySelectorAll<HTMLElement>(
                  "th.cm-table-cell, td.cm-table-cell",
                ),
              );
              updatedCells[currentIndex + 1]?.focus();
            }
          }
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const currentCell = document.activeElement as HTMLElement;
        const currentTr = currentCell?.closest("tr");

        if (currentTr) {
          const colIdx = Array.from(currentTr.children).indexOf(currentCell);
          const nextTr =
            currentTr.nextElementSibling as HTMLTableRowElement | null;

          if (nextTr) {
            (nextTr.children[colIdx] as HTMLElement)?.focus();
          } else {
            addNewRow();
            const updatedNextTr =
              currentTr.nextElementSibling as HTMLTableRowElement | null;
            (updatedNextTr?.children[colIdx] as HTMLElement)?.focus();
          }
        }
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      }
    });

    return wrapper;
  }
}
