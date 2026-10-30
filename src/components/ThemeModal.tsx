import React, { useEffect } from 'react';
import { Check, Moon, Sun, X } from 'lucide-react';
import { ThemeId, themes } from '../themes';

interface ThemeModalProps {
  theme: ThemeId;
  onChoose: (theme: ThemeId) => void;
  onClose: () => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({ theme, onChoose, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal theme-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Find your atmosphere."
      >
        <div className="modal-heading">
          <h2>Find your atmosphere.</h2>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-description">
          A different mood for your notes. Choose a palette; it will be here next time.
        </p>

        {(['light', 'dark'] as const).map((mode) => (
          <section
            className="theme-group"
            key={mode}
            aria-label={`${mode === 'light' ? 'Light' : 'Dark'} themes`}
          >
            <h3>
              {mode === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              <span>{mode === 'light' ? 'Light' : 'Dark'}</span>
            </h3>
            <div className="theme-options">
              {themes
                .filter((option) => option.mode === mode)
                .map((option) => (
                  <button
                    type="button"
                    className={`theme-option ${theme === option.id ? 'selected' : ''}`}
                    key={option.id}
                    aria-pressed={theme === option.id}
                    onClick={() => onChoose(option.id)}
                  >
                    <span
                      className="theme-preview"
                      aria-hidden="true"
                      style={{
                        background: option.colors[0],
                        color: option.colors[2],
                      }}
                    >
                      <span
                        className="theme-preview-sidebar"
                        style={{ background: option.colors[1] }}
                      />
                      <span className="theme-preview-content">
                        <span />
                        <span />
                        <span />
                        <i style={{ background: option.colors[2] }} />
                        <i style={{ background: option.colors[3] }} />
                      </span>
                    </span>
                    <span className="theme-option-title">
                      {option.name}
                      {theme === option.id && <Check size={16} />}
                    </span>
                    <span className="theme-description">{option.description}</span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

