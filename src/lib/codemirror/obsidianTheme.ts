import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Obsidian-style CodeMirror theme integrating with pent-notes CSS custom properties.
 */
export const obsidianEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text, #d1d9e6)',
    backgroundColor: 'transparent',
    fontSize: 'var(--editor-font-size, 16px)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
    lineHeight: 'var(--editor-line-height, 1.65)',
  },
  '.cm-content': {
    padding: '0 0 120px 0',
    caretColor: 'var(--caret, #00e5ff)',
    minHeight: '200px',
  },
  '.cm-line': {
    padding: '1.5px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--caret, #00e5ff)',
    borderLeftWidth: '2.5px',
    boxShadow: '0 0 6px var(--glow, rgba(0, 229, 255, 0.4))',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--caret, #00e5ff)',
  },
  '.cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection-bg, rgba(0, 229, 255, 0.3)) !important',
    color: 'var(--selection-text, #ffffff) !important',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--selection-bg, rgba(0, 229, 255, 0.3)) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted, #8b9bb4)',
    borderRight: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
    paddingRight: '8px',
    userSelect: 'none',
  },
  '.cm-activeLineGutter': {
    color: 'var(--forest, #00e5ff)',
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface, #1b212d) !important',
    border: '1px solid var(--line-strong, #364258) !important',
    borderRadius: '8px !important',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.5) !important',
    color: 'var(--ink, #f8fafc) !important',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif',
    fontSize: '13.5px',
    maxHeight: '260px',
    padding: '4px',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '6px 10px',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--hover, #242c3d) !important',
    color: 'var(--forest, #00e5ff) !important',
  },
  '.cm-tooltip-autocomplete .cm-completionDetail': {
    fontStyle: 'normal',
    color: 'var(--muted, #8b9bb4)',
    fontSize: '12px',
    marginLeft: '12px',
  },
});

export const obsidianHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: tags.heading1,
      fontSize: '1.85em',
      fontWeight: '700',
      color: 'var(--heading, #f1f5f9)',
    },
    {
      tag: tags.heading2,
      fontSize: '1.45em',
      fontWeight: '650',
      color: 'var(--heading, #f1f5f9)',
    },
    {
      tag: tags.heading3,
      fontSize: '1.25em',
      fontWeight: '600',
      color: 'var(--heading, #f1f5f9)',
    },
    {
      tag: tags.heading4,
      fontSize: '1.12em',
      fontWeight: '600',
      color: 'var(--heading, #f1f5f9)',
    },
    {
      tag: tags.heading5,
      fontSize: '1.05em',
      fontWeight: '600',
      color: 'var(--heading, #f1f5f9)',
    },
    {
      tag: tags.heading6,
      fontSize: '1.0em',
      fontWeight: '600',
      color: 'var(--muted, #8b9bb4)',
    },
    { tag: tags.strong, fontWeight: '700', color: 'var(--ink, #f8fafc)' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    {
      tag: tags.link,
      color: 'var(--forest, #00e5ff)',
      textDecoration: 'underline',
    },
    {
      tag: tags.monospace,
      fontFamily:
        'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)',
      color: 'var(--accent, #f43f5e)',
      backgroundColor: 'var(--inline-code-bg, #232a3a)',
      borderRadius: '4px',
      padding: '1px 5px',
      fontSize: '0.88em',
    },
    { tag: tags.keyword, color: 'var(--code-keyword, #38bdf8)' },
    { tag: tags.string, color: 'var(--code-string, #4ade80)' },
    { tag: tags.comment, color: 'var(--code-comment, #6e8098)', fontStyle: 'italic' },
    { tag: tags.number, color: 'var(--folder-contrast, #f97316)' },
    { tag: tags.variableName, color: 'var(--ink, #f8fafc)' },
  ])
);

