import React, { useEffect, useLayoutEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  placeholder as placeholderExt,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { livePreviewField } from "../lib/codemirror/livePreview";
import { editorTheme } from "../lib/codemirror/theme";

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  className = "",
  placeholder = "Start writing markdown...",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const startState = EditorState.create({
      doc: value || "",
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        placeholderExt(placeholder),
        livePreviewField,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            isInternalChangeRef.current = true;
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Mount once per key

  // Sync external value updates (e.g. note switching or disk sync)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    const currentDoc = view.state.doc.toString();
    const targetValue = value || "";
    if (currentDoc !== targetValue) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: targetValue },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`cm-markdown-editor ${className}`.trim()}
      style={{
        width: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    />
  );
};

export default MarkdownEditor;
