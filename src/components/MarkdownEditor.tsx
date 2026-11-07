import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
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
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  activeFilePathFacet,
  codeBlockCursorPlugin,
  livePreviewField,
} from "../lib/codemirror/livePreview";
import { createImageDropPasteExtension } from "../lib/codemirror/imageDropPaste";
import { codeHighlightStyle, editorTheme } from "../lib/codemirror/theme";

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  filePath?: string;
}

interface MarkdownEditorElement extends HTMLDivElement {
  __cmView?: EditorView;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  className = "",
  placeholder = "Start writing markdown...",
  filePath,
}) => {
  const containerRef = useRef<MarkdownEditorElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const filePathRef = useRef(filePath);
  const filePathCompartmentRef = useRef<Compartment | null>(null);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    filePathRef.current = filePath;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const filePathCompartment = new Compartment();
    filePathCompartmentRef.current = filePathCompartment;

    const startState = EditorState.create({
      doc: value || "",
      extensions: [
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          extensions: [GFM],
        }),
        syntaxHighlighting(codeHighlightStyle),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        placeholderExt(placeholder),
        filePathCompartment.of(activeFilePathFacet.of(filePath)),
        livePreviewField,
        codeBlockCursorPlugin,
        createImageDropPasteExtension({
          getFilePath: () => filePathRef.current,
        }),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            isInternalChangeRef.current = true;
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const containerEl = containerRef.current;
    const view = new EditorView({
      state: startState,
      parent: containerEl,
    });

    containerEl.__cmView = view;
    viewRef.current = view;

    return () => {
      delete containerEl.__cmView;
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Mount once per key

  // Sync filePath changes
  useEffect(() => {
    const view = viewRef.current;
    const compartment = filePathCompartmentRef.current;
    if (!view || !compartment) return;

    view.dispatch({
      effects: compartment.reconfigure(activeFilePathFacet.of(filePath)),
    });
  }, [filePath]);

  // Sync external value updates (e.g. note switching or disk sync)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    const targetValue = value || "";
    if (currentDoc === targetValue) {
      isInternalChangeRef.current = false;
      return;
    }

    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: targetValue },
      selection: {
        anchor: Math.min(view.state.selection.main.anchor, targetValue.length),
      },
    });
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
