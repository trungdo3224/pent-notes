import {
  autocompletion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

export interface NoteWikilinkOption {
  id: string;
  title: string;
  folderPath?: string;
}

/**
 * Creates an autocomplete extension for Obsidian-style [[wikilinks]].
 * Triggered whenever the user types `[[`.
 */
export function createWikilinkCompletion(
  getNotes: () => NoteWikilinkOption[]
) {
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const match = context.matchBefore(/\[\[([^\]]*)$/);
        if (!match) return null;

        const query = match.text.slice(2).trim().toLowerCase();
        const allNotes = getNotes();
        const matched = query
          ? allNotes.filter((n) => n.title.toLowerCase().includes(query))
          : allNotes;

        return {
          from: match.from + 2,
          to: context.pos,
          options: matched.map((note) => ({
            label: note.title.trim() || 'Untitled',
            detail: note.folderPath,
            apply: (view, _completion, from, to) => {
              const fullText = view.state.doc.sliceString(to, to + 2);
              const suffix = fullText.startsWith(']]') ? '' : ']]';
              const textToInsert = `${note.title.trim() || 'Untitled'}${suffix}`;
              view.dispatch({
                changes: { from, to, insert: textToInsert },
                selection: { anchor: from + textToInsert.length },
              });
            },
          })),
          filter: false,
        };
      },
    ],
  });
}

/**
 * MatchDecorator that identifies [[wikilinks]] in text and applies styling.
 */
const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
  decoration: (match) => {
    const target = match[1].trim();
    const alias = match[2]?.trim() || target;
    return Decoration.mark({
      class: 'cm-wikilink',
      attributes: {
        'data-target': target,
        'data-alias': alias,
        title: `Open note: ${target}`,
      },
    });
  },
});

export const wikilinkViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = wikilinkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = wikilinkMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

