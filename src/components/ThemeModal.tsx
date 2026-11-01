import React from 'react';
import { Check, Moon, Sun, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useDomInteractions';
import { ThemeId, themes } from '../themes';

interface ThemeModalProps {
  theme: ThemeId;
  onChoose: (theme: ThemeId) => void;
  onClose: () => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({ theme, onChoose, onClose }) => {
  useEscapeKey(true, onClose);

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
          <h2>Themes & Accents</h2>
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
          Minimalist, high-readability workspaces with vibrant theme color accents.
        </p>

        {(['dark', 'light'] as const).map((mode) => (
          <section
            className="theme-group"
            key={mode}
            aria-label={`${mode === 'dark' ? 'Dark' : 'Light'} themes`}
          >
            <h3>
              {mode === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
              <span>{mode === 'dark' ? 'Dark Minimal' : 'Light Minimal'}</span>
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
                    <div
                      className="theme-card-preview"
                      style={{
                        backgroundColor: option.colors[0],
                      }}
                    >
                      <div className="theme-swatches">
                        <span
                          className="theme-swatch-dot is-primary"
                          style={{
                            backgroundColor: option.colors[2],
                            boxShadow: `0 0 10px ${option.colors[2]}40`,
                          }}
                          title={`Primary accent: ${option.colors[2]}`}
                        />
                        <span
                          className="theme-swatch-dot is-secondary"
                          style={{
                            backgroundColor: option.colors[3],
                            boxShadow: `0 0 8px ${option.colors[3]}30`,
                          }}
                          title={`Secondary accent: ${option.colors[3]}`}
                        />
                      </div>
                      <div className="theme-preview-strip">
                        <span
                          className="theme-preview-pill"
                          style={{
                            backgroundColor: `${option.colors[2]}22`,
                            color: option.colors[2],
                            border: `1px solid ${option.colors[2]}44`,
                          }}
                        >
                          Accent
                        </span>
                      </div>
                    </div>

                    <div className="theme-option-title">
                      <span>{option.name}</span>
                      {theme === option.id && <Check size={16} />}
                    </div>

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
