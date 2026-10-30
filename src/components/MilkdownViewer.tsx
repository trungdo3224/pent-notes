import React, { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

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
  className = '',
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
      defaultValue: content || '',
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
          crepe.editor?.action(replaceAll(content || '', false));
        }
      })
      .catch((err) => {
        console.error('Failed to initialize Milkdown Crepe:', err);
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
    if (isReadyRef.current && crepeRef.current && content !== lastContentRef.current) {
      lastContentRef.current = content;
      crepeRef.current.editor?.action(replaceAll(content || '', false));
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

export default MilkdownViewer;

