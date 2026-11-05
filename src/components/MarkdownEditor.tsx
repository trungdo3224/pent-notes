import React, { useEffect, useMemo, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
} from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { livePreviewPlugin } from "../lib/codemirror/livePreview";
import {
  obsidianEditorTheme,
  obsidianHighlightStyle,
} from "../lib/codemirror/obsidianTheme";
import { smartListKeymap } from "../lib/codemirror/smartLists";
import {
  createWikilinkCompletion,
  NoteWikilinkOption,
  wikilinkViewPlugin,
} from "../lib/codemirror/wikilinks";

export interface MarkdownEditorProps {
  content: string;
  onChange?: (val: string) => void;
  readonly?: boolean;
  className?: string;
  notes?: NoteWikilinkOption[];
  onOpenWikilink?: (noteTitle: string) => void;
  autoFocus?: boolean;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  content,
  onChange,
  readonly = false,
  className = "",
  notes = [],
  onOpenWikilink,
  autoFocus = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalChangeRef = useRef(false);
  const lastContentRef = useRef(content);
  const onOpenWikilinkRef = useRef(onOpenWikilink);
  const notesRef = useRef(notes);

  onOpenWikilinkRef.current = onOpenWikilink;
  notesRef.current = notes;

  const readonlyCompartment = useMemo(() => new Compartment(), []);

  useEffect(() => {
    if (!containerRef.current) return;

    lastContentRef.current = content;

    const startState = EditorState.create({
      doc: content || "",
      extensions: [
        obsidianEditorTheme,
        obsidianHighlightStyle,
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          extensions: [GFM],
        }),
        EditorView.lineWrapping,
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        livePreviewPlugin,
        wikilinkViewPlugin,
        createWikilinkCompletion(() => notesRef.current),
        keymap.of([
          ...smartListKeymap,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        readonlyCompartment.of(EditorState.readOnly.of(readonly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextVal = update.state.doc.toString();
            isInternalChangeRef.current = true;
            lastContentRef.current = nextVal;
            onChange?.(nextVal);
          }
        }),
        EditorView.domEventHandlers({
          click(event) {
            const target = event.target as HTMLElement | null;
            const wikilinkEl = target?.closest(".cm-wikilink");
            if (wikilinkEl) {
              const noteTarget = wikilinkEl.getAttribute("data-target");
              if (noteTarget && onOpenWikilinkRef.current) {
                event.preventDefault();
                event.stopPropagation();
                onOpenWikilinkRef.current(noteTarget);
                return true;
              }
            }
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (autoFocus) {
      view.focus();
    }

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  // Update editor content when external content changes (e.g. switching notes)
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    const view = viewRef.current;
    if (view && content !== lastContentRef.current) {
      lastContentRef.current = content;
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content || "",
        },
      });
    }
  }, [content]);

  // Dynamically update readonly mode
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: readonlyCompartment.reconfigure(
          EditorState.readOnly.of(readonly),
        ),
      });
    }
  }, [readonly, readonlyCompartment]);

  return (
    <div
      ref={containerRef}
      className={`obsidian-editor-wrapper ${className}`.trim()}
    />
  );
};
