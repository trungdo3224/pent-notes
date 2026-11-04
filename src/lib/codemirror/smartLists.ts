import { Command, EditorView, KeyBinding } from '@codemirror/view';

/**
 * Regex matching list items:
 * Group 1: Indentation
 * Group 2: Bullet (- | * | +) or Number (1.)
 * Group 3: Optional task checkbox ([ ] | [x])
 */
const LIST_ITEM_REGEX = /^(\s*)([-*+]|\d+\.)(\s+(?:\[[ xX]\]\s+)?)(.*)$/;

/**
 * Handles Enter key on Markdown lists like Obsidian.
 */
export const handleSmartListEnter: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;

  const line = state.doc.lineAt(from);
  const match = line.text.match(LIST_ITEM_REGEX);
  if (!match) return false;

  const [_, indent, marker, spacing, content] = match;
  const prefixLength = indent.length + marker.length + spacing.length;

  // If the list item is empty (user pressed Enter on an empty bullet):
  // Clear the bullet marker and exit list.
  if (!content.trim() && from >= line.from + prefixLength) {
    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: '',
      },
      selection: { anchor: line.from },
    });
    return true;
  }

  // If cursor is before or within the bullet marker, default to normal Enter
  if (from < line.from + prefixLength) {
    return false;
  }

  let nextMarker = marker;
  // If numeric list, increment number
  const numMatch = marker.match(/^(\d+)\.$/);
  if (numMatch) {
    const nextNum = parseInt(numMatch[1], 10) + 1;
    nextMarker = `${nextNum}.`;
  }

  // If task list, next task defaults to unchecked [ ]
  let nextSpacing = spacing;
  if (/\[[ xX]\]/.test(spacing)) {
    nextSpacing = ' [ ] ';
  }

  const nextPrefix = `\n${indent}${nextMarker}${nextSpacing}`;
  view.dispatch({
    changes: { from, to, insert: nextPrefix },
    selection: { anchor: from + nextPrefix.length },
  });
  return true;
};

/**
 * Handles Tab to indent list item by 2 spaces.
 */
export const handleSmartListIndent: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  if (!LIST_ITEM_REGEX.test(line.text)) return false;

  view.dispatch({
    changes: { from: line.from, to: line.from, insert: '  ' },
    selection: { anchor: from + 2 },
  });
  return true;
};

/**
 * Handles Shift-Tab to outdent list item by up to 2 spaces.
 */
export const handleSmartListOutdent: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  if (!LIST_ITEM_REGEX.test(line.text)) return false;

  const spacesToRemove = line.text.startsWith('  ') ? 2 : line.text.startsWith(' ') ? 1 : 0;
  if (spacesToRemove === 0) return false;

  view.dispatch({
    changes: { from: line.from, to: line.from + spacesToRemove, insert: '' },
    selection: { anchor: Math.max(line.from, from - spacesToRemove) },
  });
  return true;
};

export const smartListKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: handleSmartListEnter },
  { key: 'Tab', run: handleSmartListIndent },
  { key: 'Shift-Tab', run: handleSmartListOutdent },
];

