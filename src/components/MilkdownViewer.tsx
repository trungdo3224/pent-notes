import React, { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import { replaceAll } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

/**
 * Normalizes copied HTML from external websites (such as PortSwigger, GitHub, StackOverflow)
 * where multi-line code snippets are rendered inside <code> tags without a <pre> wrapper.
 * By wrapping multi-line <code> blocks in <pre>, ProseMirror parses them as multi-line
 * code_blocks rather than flattening them into a single-line inline code mark.
 */
function normalizePastedHTML(html: string): string {
  if (!html) return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let modified = false;
    const codeElements = Array.from(doc.querySelectorAll("code"));

    codeElements.forEach((codeEl) => {
      // Skip if already wrapped in a <pre> tag
      if (codeEl.closest("pre")) return;

      const hasBr = codeEl.querySelector("br") !== null;
      const text = codeEl.textContent || "";
      const hasNewline = /[\r\n]/.test(text);

      if (hasBr || hasNewline) {
        const pre = doc.createElement("pre");

        // Extract language from class if available (e.g. class="hljs language-sql" or "language-sql")
        const classNames = codeEl.className || "";
        const langMatch = classNames.match(/(?:lang|language)-(\w+)/);
        if (langMatch) {
          pre.setAttribute("data-language", langMatch[1]);
        }

        // Convert any <br> tags into newlines for preformatted block
        codeEl.querySelectorAll("br").forEach((br) => {
          br.replaceWith(doc.createTextNode("\n"));
        });

        codeEl.parentNode?.replaceChild(pre, codeEl);
        pre.appendChild(codeEl);
        modified = true;
      }
    });

    return modified ? doc.body.innerHTML : html;
  } catch (err) {
    console.error("Failed to normalize pasted HTML:", err);
    return html;
  }
}

interface MilkdownViewerProps {
  content: string;
  onChange?: (markdown: string) => void;
  readonly?: boolean;
  className?: string;
}

export const MilkdownViewer: React.FC<MilkdownViewerProps> = ({
  content,
  onChange,
  readonly = false,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isInternalChangeRef = useRef(false);
  const lastContentRef = useRef(content);
  const isReadyRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    isReadyRef.current = false;
    lastContentRef.current = content;

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: content || "",
    });

    if (readonly) {
      crepe.setReadonly(true);
    }

    if (onChange) {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (!isMounted) return;
          isInternalChangeRef.current = true;
          lastContentRef.current = markdown;
          onChange(markdown);
        });
      });
    }

    // Configure paste transformations to preserve multi-line code from web pages
    crepe.editor.config((ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        transformPastedHTML: (html, view) => {
          const prevTransform = prev.transformPastedHTML;
          const baseHtml = prevTransform ? prevTransform(html, view) : html;
          return normalizePastedHTML(baseHtml);
        },
      }));
    });

    crepe
      .create()
      .then(() => {
        if (!isMounted) {
          void crepe.destroy();
          return;
        }
        crepeRef.current = crepe;
        isReadyRef.current = true;
        // If content changed while mounting
        if (lastContentRef.current !== content) {
          crepe.editor?.action(replaceAll(content || "", false));
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Milkdown Crepe:", err);
      });

    return () => {
      isMounted = false;
      isReadyRef.current = false;
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, []);

  // Update editor content when external content changes (for same note)
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    if (
      isReadyRef.current &&
      crepeRef.current &&
      content !== lastContentRef.current
    ) {
      lastContentRef.current = content;
      crepeRef.current.editor?.action(replaceAll(content || "", false));
    }
  }, [content]);

  // Sync readonly mode if it changes
  useEffect(() => {
    if (isReadyRef.current && crepeRef.current) {
      crepeRef.current.setReadonly(readonly);
    }
  }, [readonly]);

  return <div ref={containerRef} className={`milkdown-wrapper ${className}`} />;
};
