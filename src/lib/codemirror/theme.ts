import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const codeHighlightStyle = HighlightStyle.define([
  {
    tag: tags.comment,
    color: "var(--code-comment, #94a3b8)",
    fontStyle: "italic",
  },
  {
    tag: tags.lineComment,
    color: "var(--code-comment, #94a3b8)",
    fontStyle: "italic",
  },
  {
    tag: tags.blockComment,
    color: "var(--code-comment, #94a3b8)",
    fontStyle: "italic",
  },
  {
    tag: tags.keyword,
    color: "var(--code-keyword, #38bdf8)",
    fontWeight: "600",
  },
  { tag: tags.string, color: "var(--code-string, #4ade80)" },
  { tag: tags.number, color: "var(--accent, #f43f5e)" },
  { tag: tags.bool, color: "var(--accent, #f43f5e)" },
  { tag: tags.operator, color: "var(--code-keyword, #38bdf8)" },
  {
    tag: tags.function(tags.variableName),
    color: "var(--code-title, #00e5ff)",
  },
  { tag: tags.propertyName, color: "var(--code-title, #00e5ff)" },
  { tag: tags.typeName, color: "var(--code-title, #00e5ff)" },
  {
    tag: tags.definition(tags.variableName),
    color: "var(--code-title, #00e5ff)",
  },
  {
    tag: tags.standard(tags.variableName),
    color: "var(--code-title, #00e5ff)",
  },
  {
    tag: tags.special(tags.variableName),
    color: "var(--code-keyword, #38bdf8)",
  },
  { tag: tags.className, color: "var(--code-title, #00e5ff)" },
  { tag: tags.macroName, color: "var(--code-keyword, #38bdf8)" },
  { tag: tags.labelName, color: "var(--code-title, #00e5ff)" },
  { tag: tags.modifier, color: "var(--code-keyword, #38bdf8)" },
  { tag: tags.literal, color: "var(--code-string, #4ade80)" },
  { tag: tags.atom, color: "var(--code-title, #00e5ff)" },
  { tag: tags.heading, color: "var(--text-primary)", fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.link, color: "var(--forest)", textDecoration: "underline" },
]);

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--editor-font-size, 15.5px)",
    lineHeight: "var(--editor-line-height, 1.8)",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "auto",
    color: "var(--text-primary)",
  },
  ".cm-content": {
    padding: "0",
    maxWidth: "100%",
    caretColor: "var(--caret)",
    color: "var(--text-primary)",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-line": {
    padding: "1px 0",
    color: "var(--text-primary)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--caret) !important",
    borderLeftWidth: "2px !important",
  },
  "&.cm-focused .cm-cursor, &.cm-focused .cm-dropCursor": {
    borderLeftColor: "var(--caret) !important",
  },
  "&.cm-in-codeblock .cm-cursor, &.cm-in-codeblock .cm-dropCursor": {
    borderLeftColor: "var(--code-caret, #38bdf8) !important",
  },
  "&.cm-in-codeblock .cm-content": {
    caretColor: "var(--code-caret, #38bdf8) !important",
  },
  "&.cm-in-codeblock .cm-selectionBackground, &.cm-in-codeblock ::selection": {
    color: "#ffffff !important",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection-bg) !important",
    color: "var(--selection-text) !important",
  },

  /* Headings */
  ".cm-heading": {
    fontWeight: "700",
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  ".cm-h1": {
    fontSize: "1.9em",
    lineHeight: "1.3",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border-subtle)",
    paddingBottom: "4px",
  },
  ".cm-h2": {
    fontSize: "1.5em",
    lineHeight: "1.35",
    color: "var(--text-primary)",
  },
  ".cm-h3": {
    fontSize: "1.25em",
    lineHeight: "1.4",
    color: "var(--text-primary)",
  },
  ".cm-h4": {
    fontSize: "1.1em",
    color: "var(--text-primary)",
  },
  ".cm-h5": {
    fontSize: "1em",
    color: "var(--text-primary)",
  },
  ".cm-h6": {
    fontSize: "0.95em",
    color: "var(--text-secondary)",
  },

  /* Inline Formatting */
  ".cm-bold": {
    fontWeight: "700",
    color: "var(--text-primary)",
  },
  ".cm-italic": {
    fontStyle: "italic",
    color: "var(--text-primary)",
  },
  ".cm-strikethrough": {
    textDecoration: "line-through",
    color: "var(--text-muted)",
  },
  ".cm-inline-code": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.88em",
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--inline-code-bg)",
    color: "var(--inline-code-text, var(--accent))",
    border: "1px solid var(--inline-code-border, var(--border-subtle))",
    fontWeight: "500",
  },
  ".cm-link": {
    color: "var(--forest)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  ".cm-blockquote": {
    borderLeft: "3px solid var(--forest)",
    paddingLeft: "12px",
    color: "var(--text-secondary)",
    fontStyle: "italic",
    backgroundColor: "color-mix(in srgb, var(--forest) 6%, transparent)",
    borderRadius: "0 6px 6px 0",
    paddingTop: "2px",
    paddingBottom: "2px",
  },
  ".cm-bullet-mark": {
    color: "var(--forest)",
    fontWeight: "700",
    display: "inline-block",
    width: "1ch",
    textAlign: "center",
  },
  ".cm-task-checkbox": {
    cursor: "pointer",
    accentColor: "var(--forest)",
    marginRight: "6px",
    transform: "scale(1.1)",
  },

  /* Fenced Code Blocks - Continuous High-Contrast Terminal Block */
  ".cm-codeblock-line": {
    backgroundColor: "var(--code-bg) !important",
    color: "var(--code-text) !important",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    paddingLeft: "16px !important",
    paddingRight: "16px !important",
    borderLeft: "1px solid var(--code-border, var(--border-subtle))",
    borderRight: "1px solid var(--code-border, var(--border-subtle))",
    margin: "0 !important",
    borderRadius: "0",
  },
  ".cm-codeblock-first": {
    position: "relative",
    borderTop: "1px solid var(--code-border, var(--border-subtle))",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px",
    paddingTop: "10px !important",
    paddingRight: "80px !important",
    margin: "0 !important",
  },
  ".cm-codeblock-last": {
    borderBottom: "1px solid var(--code-border, var(--border-subtle))",
    borderBottomLeftRadius: "8px",
    borderBottomRightRadius: "8px",
    paddingBottom: "10px !important",
    margin: "0 !important",
  },
  ".cm-codeblock-fence": {
    color: "var(--code-comment) !important",
    opacity: "0.7",
    fontFamily: "var(--font-mono)",
  },
  ".cm-codeblock-info": {
    color: "var(--code-keyword) !important",
    fontWeight: "600",
    fontFamily: "var(--font-mono)",
  },
  ".cm-codeblock-copy-btn": {
    position: "absolute",
    right: "10px",
    top: "6px",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "3px 8px",
    fontSize: "11px",
    fontWeight: "550",
    fontFamily: "var(--font-sans)",
    color: "var(--code-comment)",
    backgroundColor: "color-mix(in srgb, var(--surface) 80%, transparent)",
    border: "1px solid var(--code-border, var(--border-subtle))",
    borderRadius: "5px",
    cursor: "pointer",
    userSelect: "none",
    zIndex: "5",
    transition: "all 0.15s ease",
    lineHeight: "1.2",
  },
  ".cm-codeblock-copy-btn:hover": {
    color: "var(--code-text) !important",
    backgroundColor: "color-mix(in srgb, var(--forest) 20%, var(--surface))",
    borderColor: "var(--forest)",
  },
  ".cm-codeblock-copy-btn.is-copied": {
    color: "#10b981 !important",
    borderColor: "#10b981 !important",
    backgroundColor:
      "color-mix(in srgb, #10b981 18%, var(--surface)) !important",
  },

  /* Elevated In-Place Table Widget */
  ".cm-table-wrapper": {
    width: "100%",
    padding: "10px 0",
    margin: "0",
    boxSizing: "border-box",
  },
  ".cm-table-container": {
    width: "100%",
    margin: "0",
    overflowX: "auto",
    border: "1px solid var(--border-tab-hover)",
    borderRadius: "8px",
    backgroundColor: "var(--surface-muted)",
    boxShadow: "0 4px 18px var(--shadow), 0 1px 3px rgba(0, 0, 0, 0.12)",
    transition: "border-color 0.15s ease",
  },
  ".cm-table-container:focus-within": {
    borderColor: "var(--forest)",
    boxShadow: "0 0 0 1px var(--forest), 0 4px 18px var(--shadow)",
  },
  ".cm-table-toolbar": {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "6px",
    padding: "6px 10px",
    backgroundColor:
      "color-mix(in srgb, var(--surface) 90%, var(--surface-muted))",
    borderBottom: "1px solid var(--border-subtle)",
  },
  ".cm-table-btn": {
    fontSize: "11px",
    fontWeight: "550",
    padding: "3px 8px",
    borderRadius: "4px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--surface-muted)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "all 0.12s ease",
  },
  ".cm-table-btn:hover": {
    backgroundColor: "var(--forest)",
    color: "#ffffff",
    borderColor: "var(--forest)",
  },
  ".cm-table": {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0",
    backgroundColor: "var(--surface-muted)",
  },
  ".cm-table th.cm-table-cell": {
    backgroundColor:
      "color-mix(in srgb, var(--forest) 12%, var(--surface-muted))",
    color: "var(--forest)",
    minWidth: "100px",
    fontWeight: "650",
    fontSize: "13px",
    letterSpacing: "0.03em",
    padding: "10px 14px",
    borderBottom:
      "2px solid color-mix(in srgb, var(--forest) 45%, var(--border-tab-hover))",
    borderRight: "1px solid var(--border-subtle)",
    textAlign: "left",
    outline: "none",
  },
  ".cm-table th.cm-table-cell:focus, .cm-table td.cm-table-cell:focus": {
    backgroundColor:
      "color-mix(in srgb, var(--forest) 18%, var(--surface-muted)) !important",
    boxShadow: "inset 0 0 0 2px var(--forest)",
  },
  ".cm-table th:last-child": {
    borderRight: "none",
  },
  ".cm-table td.cm-table-cell": {
    backgroundColor: "var(--surface-muted)",
    color: "var(--text-primary)",
    padding: "9px 14px",
    borderBottom: "1px solid var(--border-subtle)",
    borderRight: "1px solid var(--border-subtle)",
    fontSize: "13.5px",
    lineHeight: "1.5",
    outline: "none",
    transition: "background-color 0.1s ease",
  },
  ".cm-table td:last-child": {
    borderRight: "none",
  },
  ".cm-table tr:last-child td": {
    borderBottom: "none",
  },
  ".cm-table tbody tr:nth-child(even) td": {
    backgroundColor:
      "color-mix(in srgb, var(--surface) 80%, var(--surface-muted))",
  },
  ".cm-table tbody tr:hover td": {
    backgroundColor: "color-mix(in srgb, var(--forest) 8%, var(--hover))",
  },
  ".cm-table-inline-code": {
    backgroundColor: "var(--inline-code-bg)",
    border: "1px solid var(--inline-code-border, var(--border-subtle))",
    color: "var(--inline-code-text, var(--accent))",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "0.88em",
    fontFamily: "var(--font-mono)",
    fontWeight: "500",
  },
  ".cm-table-link": {
    color: "var(--forest)",
    textDecoration: "underline",
  },
});
