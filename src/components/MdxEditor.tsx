import React, { useEffect, useMemo, useRef } from "react";
import {
  MDXEditor,
  MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  frontmatterPlugin,
  codeBlockPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useNotesStore } from "../store/useNotesStore";
import { themes } from "../themes";
import { NoteWikilinkOption } from "../types";

export type { NoteWikilinkOption };

export interface MdxEditorProps {
  content: string;
  onChange?: (val: string) => void;
  readonly?: boolean;
  className?: string;
  notes?: NoteWikilinkOption[];
  onOpenWikilink?: (noteTitle: string) => void;
  autoFocus?: boolean;
}

export const MdxEditor: React.FC<MdxEditorProps> = ({
  content,
  onChange,
  readonly = false,
  className = "",
  autoFocus = false,
}) => {
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const lastContentRef = useRef(content);
  const isInternalChangeRef = useRef(false);

  const theme = useNotesStore((s) => s.theme);
  const isDark = useMemo(() => {
    const found = themes.find((t) => t.id === theme);
    return found ? found.mode === "dark" : true;
  }, [theme]);

  // Sync external changes (e.g. switching notes or external disk update)
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    if (content !== lastContentRef.current) {
      lastContentRef.current = content;
      editorRef.current?.setMarkdown(content || "");
    }
  }, [content]);

  const handleMarkdownChange = (
    newMarkdown: string,
    initialNormalize: boolean,
  ) => {
    if (initialNormalize) return;
    isInternalChangeRef.current = true;
    lastContentRef.current = newMarkdown;
    onChange?.(newMarkdown);
  };

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      frontmatterPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
    ],
    [],
  );

  return (
    <div
      className={`mdx-editor-wrapper ${isDark ? "dark-theme" : ""} ${className}`.trim()}
    >
      <MDXEditor
        ref={editorRef}
        markdown={content || ""}
        onChange={handleMarkdownChange}
        readOnly={readonly}
        autoFocus={autoFocus}
        plugins={plugins}
        contentEditableClassName="mdx-editor-content"
      />
    </div>
  );
};

export default MdxEditor;
