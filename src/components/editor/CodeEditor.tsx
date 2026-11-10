import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { codeHighlightStyle } from "../../lib/codemirror/theme";

interface CodeEditorProps {
  value: string;
  onChange: (val: string) => void;
  filePath?: string;
  className?: string;
  placeholder?: string;
}

const TWO_SPACE_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "yaml",
  "yml",
  "html",
  "css",
  "scss",
  "xml",
]);

function getIndentString(filePath?: string): string {
  if (!filePath) return "    ";
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext && TWO_SPACE_EXTENSIONS.has(ext) ? "  " : "    ";
}

const codeEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--bg-editor, #0c1017)",
    color: "var(--text-primary, #e2e8f0)",
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
    fontSize: "var(--code-font-size, 13.5px)",
    lineHeight: "1.65",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "14px 0 40px 0",
    caretColor: "var(--caret, #38bdf8)",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-line": {
    padding: "0 18px 0 12px",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--caret, #38bdf8) !important",
    borderLeftWidth: "2px !important",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-editor, #0c1017)",
    color: "var(--text-muted, #64748b)",
    borderRight: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
    userSelect: "none",
  },
  ".cm-gutterElement": {
    padding: "0 10px 0 14px !important",
    fontSize: "12px",
    fontFamily: "inherit",
    minWidth: "28px",
    textAlign: "right",
    opacity: "0.55",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--accent, #38bdf8) !important",
    opacity: "1",
    fontWeight: "600",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--cm-active-line, rgba(255, 255, 255, 0.035))",
  },
  ".cm-selectionMatch": {
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    borderRadius: "2px",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection, rgba(56, 189, 248, 0.28)) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(56, 189, 248, 0.25)",
    outline: "1px solid rgba(56, 189, 248, 0.55)",
    borderRadius: "2px",
  },
  ".cm-nonmatchingBracket": {
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    outline: "1px solid rgba(239, 68, 68, 0.55)",
  },
});

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  filePath,
  className = "",
  placeholder = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const filePathRef = useRef(filePath);

  const languageCompartmentRef = useRef<Compartment>(new Compartment());
  const indentCompartmentRef = useRef<Compartment>(new Compartment());

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    filePathRef.current = filePath;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const currentFilePath = filePathRef.current;
    const initialIndent = getIndentString(currentFilePath);

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        indentCompartmentRef.current.of(indentUnit.of(initialIndent)),
        syntaxHighlighting(codeHighlightStyle, { fallback: true }),
        codeEditorTheme,
        placeholderExt(placeholder),
        languageCompartmentRef.current.of([]),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            isInternalChangeRef.current = true;
            onChangeRef.current(update.state.doc.toString());
            Promise.resolve().then(() => {
              isInternalChangeRef.current = false;
            });
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });
    viewRef.current = view;

    // Load language grammar dynamically
    if (currentFilePath) {
      const desc = LanguageDescription.matchFilename(
        languages,
        currentFilePath,
      );
      if (desc) {
        void desc.load().then((support) => {
          if (viewRef.current && support) {
            viewRef.current.dispatch({
              effects: languageCompartmentRef.current.reconfigure(support),
            });
          }
        });
      }
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update language grammar & indentation if filePath changes
  useEffect(() => {
    if (!viewRef.current) return;

    const indentStr = getIndentString(filePath);
    viewRef.current.dispatch({
      effects: indentCompartmentRef.current.reconfigure(
        indentUnit.of(indentStr),
      ),
    });

    if (filePath) {
      const desc = LanguageDescription.matchFilename(languages, filePath);
      if (desc) {
        void desc.load().then((support) => {
          if (viewRef.current && support) {
            viewRef.current.dispatch({
              effects: languageCompartmentRef.current.reconfigure(support),
            });
          }
        });
      } else {
        viewRef.current.dispatch({
          effects: languageCompartmentRef.current.reconfigure([]),
        });
      }
    } else {
      viewRef.current.dispatch({
        effects: languageCompartmentRef.current.reconfigure([]),
      });
    }
  }, [filePath]);

  // Synchronize external value updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view || isInternalChangeRef.current) return;

    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`code-editor-wrapper ${className}`}
      style={{ height: "100%", width: "100%" }}
    />
  );
};
