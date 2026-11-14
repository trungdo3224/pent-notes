import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { forceParsing, LanguageDescription } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitChatMarkdownBlocks } from "../../components/OllamaChatbox";
import {
  extractHeadings,
  extractTags,
  resolveWorkspaceConnections,
  scrollToHeading,
} from "../../lib/catalogUtils";
import {
  codeBlockCursorPlugin,
  livePreviewField,
} from "../../lib/codemirror/livePreview";
import { ImageWidget } from "../../lib/codemirror/imageWidget";
import { editorTheme } from "../../lib/codemirror/theme";
import { TopLevelFolder } from "../../types";

function mountMarkdownView(
  doc: string,
  cursorPos = 0,
): {
  view: EditorView;
  host: HTMLDivElement;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const mdLanguageDesc = LanguageDescription.of({
    name: "markdown",
    alias: ["md", "mdx"],
    support: markdown({ base: markdownLanguage, extensions: [GFM] }),
  });

  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursorPos },
      extensions: [
        markdown({
          base: markdownLanguage,
          codeLanguages: [mdLanguageDesc],
          extensions: [GFM],
        }),
        livePreviewField,
        codeBlockCursorPlugin,
        editorTheme,
      ],
    }),
    parent: host,
  });

  // Ensure initial syntax parsing completes even under heavy parallel worker CPU load
  forceParsing(view, doc.length, 5000);

  return { view, host };
}

describe("Markdown viewer code-block handling", () => {
  const mounted: Array<{ view: EditorView; host: HTMLDivElement }> = [];

  afterEach(() => {
    while (mounted.length > 0) {
      const item = mounted.pop()!;
      item.view.destroy();
      item.host.remove();
    }
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the last line of an unclosed fenced code block visible and copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const doc = "Intro paragraph\n\n```python\nprint(1)\nprint(2)";
    const mountedView = mountMarkdownView(doc, 0);
    mounted.push(mountedView);
    const { view, host } = mountedView;

    const codeLines = Array.from(host.querySelectorAll(".cm-codeblock-line"));
    expect(codeLines.length).toBe(3);
    expect(codeLines[0]).toHaveClass("cm-codeblock-fence-collapsed");
    expect(codeLines[2]).toHaveClass("cm-codeblock-last");
    expect(codeLines[2]).not.toHaveClass("cm-codeblock-fence-collapsed");
    expect(codeLines[2].textContent).toBe("print(2)");

    const copyBtn = host.querySelector(
      ".cm-codeblock-copy-btn",
    ) as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();
    expect(copyBtn.textContent).toBe("Python");
    copyBtn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("print(1)\nprint(2)");

    // Single-line unclosed code block also retains its line & copies cleanly
    const singleDoc = "Top\n\n```bash\nwhoami";
    const singleMounted = mountMarkdownView(singleDoc, 0);
    mounted.push(singleMounted);
    const singleLines = Array.from(
      singleMounted.host.querySelectorAll(".cm-codeblock-line"),
    );
    expect(singleLines[1].textContent).toBe("whoami");
    expect(singleLines[1]).not.toHaveClass("cm-codeblock-fence-collapsed");

    const singleBtn = singleMounted.host.querySelector(
      ".cm-codeblock-copy-btn",
    ) as HTMLButtonElement;
    singleBtn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenLastCalledWith("whoami");
    expect(view.state.doc.toString()).toBe(doc);

    expect(view.dom.classList.contains("cm-in-codeblock")).toBe(false);
    view.dispatch({ selection: { anchor: doc.indexOf("print(1)") } });
    expect(view.dom.classList.contains("cm-in-codeblock")).toBe(true);
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.classList.contains("cm-in-codeblock")).toBe(false);
  });

  it("does not render inner markdown widgets inside ```markdown blocks or italicize blockquote code blocks", async () => {
    const mdBlockDoc = [
      "```markdown",
      "# Nested Heading",
      "| Col A | Col B |",
      "| ----- | ----- |",
      "| val1  | val2  |",
      "- [ ] unchecked task",
      "```",
    ].join("\n");

    const cursorInsideHeading = mdBlockDoc.indexOf("Nested");
    const mdMounted = mountMarkdownView(mdBlockDoc, cursorInsideHeading);
    mounted.push(mdMounted);

    expect(mdMounted.host.querySelector(".cm-table")).toBeNull();
    expect(mdMounted.host.querySelector(".cm-heading")).toBeNull();
    expect(mdMounted.host.querySelector(".cm-task-checkbox")).toBeNull();
    expect(mdMounted.view.dom.classList.contains("cm-in-codeblock")).toBe(true);

    // Blockquoted fenced code block extracts language cleanly & isolates blockquote italic mark
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const bqDoc = [
      "> Quoted intro",
      ">",
      "> ```ts",
      "> const x = 1;",
      "> ```",
    ].join("\n");
    const bqMounted = mountMarkdownView(bqDoc, bqDoc.indexOf("const x"));
    mounted.push(bqMounted);

    const bqCopyBtn = bqMounted.host.querySelector(
      ".cm-codeblock-copy-btn",
    ) as HTMLButtonElement;
    expect(bqCopyBtn.textContent).toBe("Ts");
    bqCopyBtn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("const x = 1;");

    const codeLines = Array.from(
      bqMounted.host.querySelectorAll(".cm-codeblock-line"),
    );
    expect(codeLines.some((el) => el.querySelector(".cm-blockquote"))).toBe(
      false,
    );
  });

  it("escapes HTML in language labels and refreshes the label on info string updates", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const doc = "```ts <img src=x onerror=alert(1)>\nlet a = 1;\n```";
    const { view, host } = mountMarkdownView(doc, doc.length);
    mounted.push({ view, host });

    const btn = host.querySelector(
      ".cm-codeblock-copy-btn",
    ) as HTMLButtonElement;
    expect(btn.querySelector("img")).toBeNull();
    expect(btn.textContent).toBe("Ts <img src=x onerror=alert(1)>");

    // Edit info string while maintaining widget DOM reuse or replacement
    const infoEnd = doc.indexOf("\n");
    view.dispatch({
      changes: { from: 3, to: infoEnd, insert: "rust" },
    });

    const updatedBtn = host.querySelector(
      ".cm-codeblock-copy-btn",
    ) as HTMLButtonElement;
    expect(updatedBtn.textContent).toBe("Rust");

    updatedBtn.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(updatedBtn).toHaveClass("is-copied");
    await vi.advanceTimersByTimeAsync(1800);
    expect(updatedBtn.textContent).toBe("Rust");
  });

  it("styles indented CodeBlock nodes and supports multi-backtick InlineCode", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const doc = [
      "Before ``use `backtick` safely`` after",
      "",
      "    const a = 1;",
      "    const b = 2;",
    ].join("\n");

    const { view, host } = mountMarkdownView(doc, 0);
    mounted.push({ view, host });

    const firstLine = host.querySelector(".cm-line")!;
    expect(firstLine.textContent).toBe("Before use `backtick` safely after");
    expect(host.querySelector(".cm-inline-code")?.textContent).toBe(
      "use `backtick` safely",
    );

    const codeLines = Array.from(host.querySelectorAll(".cm-codeblock-line"));
    expect(codeLines).toHaveLength(2);
    expect(codeLines[0]).toHaveClass("cm-codeblock-first");
    expect(codeLines[1]).toHaveClass("cm-codeblock-last");

    const copyBtn = host.querySelector(
      ".cm-codeblock-copy-btn",
    ) as HTMLButtonElement;
    expect(copyBtn.textContent).toBe("Copy");
    copyBtn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nconst b = 2;");
  });

  it("uses theme token CSS variables for code block surfaces and selection", () => {
    const mountedView = mountMarkdownView("```js\nconst x = 1;\n```", 0);
    mounted.push(mountedView);

    const cssText = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent || "")
      .join("\n");

    expect(cssText).toContain("var(--code-bg)");
    expect(cssText).toContain("var(--code-border");
    expect(cssText).toContain("var(--selection-text)");
    expect(cssText).not.toContain("color-mix(in srgb, #000000 24%");
  });

  it("skips tilde fences, nested fences, and inline code in catalog extractors & heading scroll", () => {
    const noteBody = [
      "# Real Top Heading",
      "",
      "Using inline `#fake-inline-tag` and `[[FakeInlineLink]]` with #real-tag and [[Target Note]].",
      "",
      "~~~bash",
      "# Fake Tilde Heading",
      "#fake-tilde-tag",
      "[[FakeTildeLink]]",
      "~~~",
      "",
      "````markdown",
      "# Fake Four-Backtick Heading",
      "```python",
      "# Fake Nested Fence Comment",
      "```",
      "# Still Inside Outer Four-Backtick Block",
      "#fake-nested-tag",
      "````",
      "",
      "## Config",
    ].join("\n");

    const headings = extractHeadings(noteBody);
    expect(headings.map((h) => h.text)).toEqual(["Real Top Heading", "Config"]);

    const tags = extractTags(noteBody);
    expect(tags.map((t) => t.tag)).toEqual(["real-tag"]);

    const folders: TopLevelFolder[] = [
      {
        id: "f-1",
        name: "Notes",
        items: [
          {
            id: "n-main",
            type: "note",
            title: "Main",
            content: noteBody,
            updatedAt: "2026-03-01",
          },
          {
            id: "n-target",
            type: "note",
            title: "Target Note",
            content: "",
            updatedAt: "2026-03-01",
          },
          {
            id: "n-fake-tilde",
            type: "note",
            title: "FakeTildeLink",
            content: "",
            updatedAt: "2026-03-01",
          },
          {
            id: "n-fake-inline",
            type: "note",
            title: "FakeInlineLink",
            content: "",
            updatedAt: "2026-03-01",
          },
        ],
      },
    ];
    const connections = resolveWorkspaceConnections(folders, "n-main");
    expect(connections.linkedNotes.map((n) => n.note.id)).toEqual(["n-target"]);

    // Verify scrollToHeading skips fenced `# Config` comment and picks the real heading below
    const editorPane = document.createElement("div");
    editorPane.className = "editor-pane";
    const scrollContainer = document.createElement("div");
    scrollContainer.className = "editor-scroll-container";
    scrollContainer.scrollTo = vi.fn();
    const cmContainer = document.createElement("div") as HTMLDivElement & {
      __cmView?: EditorView;
    };
    cmContainer.className = "cm-markdown-editor";
    scrollContainer.appendChild(cmContainer);
    editorPane.appendChild(scrollContainer);
    document.body.appendChild(editorPane);

    const docForScroll = "```bash\n# Config\n```\n\n## Config";
    const scrollView = new EditorView({
      state: EditorState.create({ doc: docForScroll }),
      parent: cmContainer,
    });
    cmContainer.__cmView = scrollView;
    const domAtPosSpy = vi.spyOn(scrollView, "domAtPos");

    expect(scrollToHeading("Config", 2, 5)).toBe(true);
    const realHeadingPos = scrollView.state.doc.line(5).from;
    expect(domAtPosSpy).toHaveBeenCalledWith(realHeadingPos);
    scrollView.destroy();
  });

  it("preserves untagged chat code block first lines, indentation, tilde fences, and 4-backtick fences", () => {
    const untagged = splitChatMarkdownBlocks(
      "Run these commands:\n```\nwhoami\nid\n```\nDone",
    );
    expect(untagged).toEqual([
      { kind: "text", text: "Run these commands:" },
      { kind: "code", lang: "", code: "whoami\nid" },
      { kind: "text", text: "Done" },
    ]);

    const indentedWithMeta = splitChatMarkdownBlocks(
      "```python title='example'\n    def greet():\n        return 'hi'\n```",
    );
    expect(indentedWithMeta).toEqual([
      {
        kind: "code",
        lang: "python",
        code: "    def greet():\n        return 'hi'",
      },
    ]);

    const nestedAndTilde = splitChatMarkdownBlocks(
      "````markdown\n```js\nconst a = 1;\n```\n````\n~~~\necho ok\n~~~",
    );
    expect(nestedAndTilde).toEqual([
      { kind: "code", lang: "markdown", code: "```js\nconst a = 1;\n```" },
      { kind: "code", lang: "", code: "echo ok" },
    ]);
  });

  it("avoids unmeasured vertical line margins and keeps TableWidget/ImageWidget heights synced", () => {
    const doc = [
      "Top line",
      "",
      "| A | B |",
      "| --- | --- |",
      "| one | two |",
      "",
      "After table",
      "",
      "---",
      "",
      "```ts",
      "const a = 1;",
      "```",
    ].join("\n");

    const mountedView = mountMarkdownView(doc, 0);
    mounted.push(mountedView);
    const { view, host } = mountedView;

    // 1. CSS emitted for .cm-codeblock-first/.cm-codeblock-last/.cm-hr-line has zero margin
    const cssText = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent || "")
      .join("\n");
    expect(cssText).not.toMatch(/\.cm-hr-line[^{]*\{[^}]*margin:\s*18px/);
    expect(cssText).not.toMatch(
      /\.cm-codeblock-first[^{]*\{[^}]*margin:\s*6px/,
    );
    expect(cssText).not.toMatch(
      /\.cm-codeblock-last[^{]*\{[^}]*margin:\s*0 0 6px/,
    );
    expect(cssText).not.toContain("cm-in-codeblock .cm-content");
    expect(cssText).toContain("line-height: 1.55");

    // 2. Editing text before the table preserves the table DOM wrapper & syncs dataset offsets
    const initialWrapper = host.querySelector(
      ".cm-table-wrapper",
    ) as HTMLElement;
    expect(initialWrapper).toBeTruthy();
    const initialFrom = Number(initialWrapper.dataset.from);

    view.dispatch({ changes: { from: 0, to: 0, insert: "Prefix " } });
    const updatedWrapper = host.querySelector(
      ".cm-table-wrapper",
    ) as HTMLElement;
    expect(updatedWrapper).toBe(initialWrapper);
    expect(Number(updatedWrapper.dataset.from)).toBe(initialFrom + 7);

    // 3. Blurring an unmodified compact table cell does not rewrite document text
    const dispatchSpy = vi.spyOn(view, "dispatch");
    const firstTd = updatedWrapper.querySelector(
      "td.cm-table-cell",
    ) as HTMLElement;
    firstTd.focus();
    firstTd.dispatchEvent(new FocusEvent("blur", { relatedTarget: null }));
    expect(dispatchSpy).not.toHaveBeenCalled();

    // 4. Editing a table cell and blurring commits updated markdown
    firstTd.textContent = "updated";
    firstTd.dispatchEvent(new Event("input", { bubbles: true }));
    firstTd.dispatchEvent(new FocusEvent("blur", { relatedTarget: null }));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toContain("| updated | two |");

    // 5. ImageWidget triggers requestMeasure on image load and error
    const requestMeasureSpy = vi.spyOn(view, "requestMeasure");
    const imgWidget = new ImageWidget(
      "![alt](pic.png)",
      "pic.png",
      "https://example.com/pic.png",
      "alt",
      "",
      "",
      "",
      0,
      15,
      true,
    );
    const figure = imgWidget.toDOM(view);
    const imgEl = figure.querySelector("img") as HTMLImageElement;
    imgEl.dispatchEvent(new Event("load"));
    imgEl.dispatchEvent(new Event("error"));
    expect(requestMeasureSpy).toHaveBeenCalledTimes(2);
  });
});
