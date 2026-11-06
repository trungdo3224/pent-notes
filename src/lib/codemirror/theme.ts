import { EditorView } from "@codemirror/view";

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
  },
  ".cm-content": {
    padding: "0",
    maxWidth: "100%",
    caretColor: "var(--caret)",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-line": {
    padding: "1px 0",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--caret)",
    borderLeftWidth: "2px",
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
    marginBottom: "4px",
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
    padding: "2px 5px",
    borderRadius: "4px",
    backgroundColor: "var(--inline-code-bg, rgba(255, 255, 255, 0.08))",
    color: "var(--accent)",
    border: "1px solid var(--border-subtle)",
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
  },
  ".cm-bullet-mark": {
    color: "var(--forest)",
    fontWeight: "700",
    marginRight: "6px",
  },
  ".cm-task-checkbox": {
    cursor: "pointer",
    accentColor: "var(--forest)",
    marginRight: "6px",
    transform: "scale(1.1)",
  },
  ".cm-code-block": {
    fontFamily: "var(--font-mono)",
    backgroundColor: "var(--code-bg, rgba(0, 0, 0, 0.25))",
    borderRadius: "6px",
    padding: "4px 8px",
    border: "1px solid var(--border-subtle)",
  },

  /* Elevated In-Place Table Widget */
  ".cm-table-container": {
    width: "100%",
    margin: "1.4em 0",
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
    backgroundColor: "var(--code-bg, rgba(0, 0, 0, 0.25))",
    border: "1px solid var(--border-subtle)",
    color: "var(--accent)",
    padding: "2px 5px",
    borderRadius: "4px",
    fontSize: "0.88em",
  },
  ".cm-table-link": {
    color: "var(--forest)",
    textDecoration: "underline",
  },
});
