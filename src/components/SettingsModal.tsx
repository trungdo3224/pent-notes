import React from "react";
import {
  Check,
  Columns,
  Compass,
  FileCode2,
  LayoutTemplate,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Type,
  X,
} from "lucide-react";
import { useEscapeKey } from "../hooks/useDomInteractions";
import { MONO_FONT_OPTIONS, SANS_FONT_OPTIONS } from "../lib/fontSettings";
import { useNotesStore } from "../store/useNotesStore";
import { ThemeId, themes } from "../themes";

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  useEscapeKey(true, onClose);

  const theme = useNotesStore((s) => s.theme);
  const chooseTheme = useNotesStore((s) => s.chooseTheme);
  const fontSettings = useNotesStore((s) => s.fontSettings);
  const updateFontSettings = useNotesStore((s) => s.updateFontSettings);
  const resetFontSettings = useNotesStore((s) => s.resetFontSettings);
  const activeTab = useNotesStore((s) => s.settingsActiveTab);
  const setActiveTab = useNotesStore((s) => s.setSettingsActiveTab);
  const isNavbarCollapsed = useNotesStore((s) => s.isNavbarCollapsed);
  const toggleNavbar = useNotesStore((s) => s.toggleNavbar);
  const isSidebarCollapsed = useNotesStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const isRightSidebarCollapsed = useNotesStore(
    (s) => s.isRightSidebarCollapsed,
  );
  const toggleRightSidebar = useNotesStore((s) => s.toggleRightSidebar);
  const resetLayoutWidths = useNotesStore((s) => s.resetLayoutWidths);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleFontSizeChange = (delta: number) => {
    const next = Math.min(24, Math.max(12, fontSettings.fontSize + delta));
    updateFontSettings({ fontSize: next });
  };

  const activeSans =
    SANS_FONT_OPTIONS.find((f) => f.id === fontSettings.sansFontId) ??
    SANS_FONT_OPTIONS[0];
  const activeMono =
    MONO_FONT_OPTIONS.find((f) => f.id === fontSettings.monoFontId) ??
    MONO_FONT_OPTIONS[0];

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Application Settings"
      >
        {/* Header */}
        <div className="settings-modal-header">
          <div className="settings-header-title">
            <div className="settings-header-icon-wrap">
              <Settings size={18} strokeWidth={2} />
            </div>
            <div>
              <h2>Settings</h2>
              <span className="settings-header-subtitle">
                {activeTab === "theme" && "Themes & Color Accents"}
                {activeTab === "fonts" && "Typography, Sizing & Line Spacing"}
                {activeTab === "layout" && "Workspace Layout & Panes"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body Container: Left Nav & Right Content */}
        <div className="settings-modal-body">
          {/* Left Navigation */}
          <aside
            className="settings-sidebar-nav"
            aria-label="Settings categories"
          >
            <button
              type="button"
              className={`settings-nav-item ${activeTab === "theme" ? "is-active" : ""}`}
              onClick={() => setActiveTab("theme")}
            >
              <Palette size={16} strokeWidth={1.8} />
              <span>Theme</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === "fonts" ? "is-active" : ""}`}
              onClick={() => setActiveTab("fonts")}
            >
              <Type size={16} strokeWidth={1.8} />
              <span>Fonts</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === "layout" ? "is-active" : ""}`}
              onClick={() => setActiveTab("layout")}
            >
              <LayoutTemplate size={16} strokeWidth={1.8} />
              <span>Layout</span>
            </button>
          </aside>

          {/* Right Content Panel */}
          <main className="settings-content-panel">
            {/* TAB 1: THEMES */}
            {activeTab === "theme" && (
              <div className="settings-tab-pane">
                <div className="settings-pane-intro">
                  <h3>Color Atmosphere</h3>
                  <p>
                    Minimalist, high-readability workspaces with vibrant theme
                    color accents.
                  </p>
                </div>

                {(["dark", "light"] as const).map((mode) => (
                  <section
                    className="theme-group"
                    key={mode}
                    aria-label={`${mode === "dark" ? "Dark" : "Light"} themes`}
                  >
                    <h4>
                      {mode === "dark" ? <Moon size={14} /> : <Sun size={14} />}
                      <span>
                        {mode === "dark" ? "Dark Minimal" : "Light Minimal"}
                      </span>
                    </h4>

                    <div className="theme-options">
                      {themes
                        .filter((option) => option.mode === mode)
                        .map((option) => (
                          <button
                            type="button"
                            className={`theme-option ${theme === option.id ? "selected" : ""}`}
                            key={option.id}
                            aria-pressed={theme === option.id}
                            onClick={() => chooseTheme(option.id as ThemeId)}
                          >
                            <div
                              className="theme-card-preview"
                              style={{ backgroundColor: option.colors[0] }}
                            >
                              <div className="theme-swatches">
                                <span
                                  className="theme-swatch-dot"
                                  style={{
                                    backgroundColor: option.colors[2],
                                    boxShadow: `0 0 10px ${option.colors[2]}40`,
                                  }}
                                  title={`Primary accent: ${option.colors[2]}`}
                                />
                                <span
                                  className="theme-swatch-dot"
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

                            <span className="theme-description">
                              {option.description}
                            </span>
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* TAB 2: FONTS */}
            {activeTab === "fonts" && (
              <div className="settings-tab-pane">
                <div className="settings-pane-intro">
                  <div className="settings-intro-row">
                    <div>
                      <h3>Typography & Readability</h3>
                      <p>
                        Configure typography for the Markdown note editor and
                        code blocks.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="settings-reset-btn"
                      onClick={resetFontSettings}
                      title="Reset font settings to default"
                    >
                      <RotateCcw size={13} strokeWidth={2} />
                      <span>Reset to Defaults</span>
                    </button>
                  </div>
                </div>

                {/* Font Size & Spacing Controls */}
                <div className="settings-card-group">
                  <div className="settings-card">
                    <div className="settings-card-header">
                      <div>
                        <h4>Editor Font Size</h4>
                        <p className="settings-card-desc">
                          Controls the base text size across the Markdown editor
                          and the Notebook canvas.
                        </p>
                      </div>
                      <div className="settings-font-size-val">
                        <span>{fontSettings.fontSize}px</span>
                      </div>
                    </div>

                    <div className="settings-slider-row">
                      <button
                        type="button"
                        className="settings-step-btn"
                        onClick={() => handleFontSizeChange(-1)}
                        disabled={fontSettings.fontSize <= 12}
                        title="Decrease font size"
                        aria-label="Decrease font size"
                      >
                        <Minus size={14} />
                      </button>

                      <input
                        type="range"
                        min={12}
                        max={24}
                        step={1}
                        value={fontSettings.fontSize}
                        onChange={(e) =>
                          updateFontSettings({
                            fontSize: parseInt(e.target.value, 10),
                          })
                        }
                        className="settings-slider"
                        aria-label="Editor font size slider"
                      />

                      <button
                        type="button"
                        className="settings-step-btn"
                        onClick={() => handleFontSizeChange(1)}
                        disabled={fontSettings.fontSize >= 24}
                        title="Increase font size"
                        aria-label="Increase font size"
                      >
                        <Plus size={14} />
                      </button>

                      <div className="settings-preset-pills">
                        {[13, 14, 15, 16, 18, 20].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            className={`preset-pill ${fontSettings.fontSize === sz ? "is-active" : ""}`}
                            onClick={() => updateFontSettings({ fontSize: sz })}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="settings-card">
                    <div className="settings-card-header">
                      <div>
                        <h4>Line Spacing</h4>
                        <p className="settings-card-desc">
                          Vertical line height between text lines for
                          comfortable reading.
                        </p>
                      </div>
                    </div>

                    <div className="settings-line-height-options">
                      {[
                        { label: "Compact", value: 1.4, desc: "1.4× height" },
                        {
                          label: "Balanced (Default)",
                          value: 1.65,
                          desc: "1.65× height",
                        },
                        { label: "Relaxed", value: 1.85, desc: "1.85× height" },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={`line-height-btn ${fontSettings.lineHeight === item.value ? "is-active" : ""}`}
                          onClick={() =>
                            updateFontSettings({ lineHeight: item.value })
                          }
                        >
                          <span className="line-height-name">{item.label}</span>
                          <span className="line-height-desc">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Primary Font Family Selection */}
                <div className="settings-section">
                  <div className="settings-section-title">
                    <Type size={15} strokeWidth={2} />
                    <span>Editor & UI Font Family</span>
                  </div>

                  <div className="font-options-grid">
                    {SANS_FONT_OPTIONS.map((opt) => {
                      const isSelected = fontSettings.sansFontId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`font-option-card ${isSelected ? "is-selected" : ""}`}
                          onClick={() =>
                            updateFontSettings({ sansFontId: opt.id })
                          }
                          style={{ fontFamily: opt.family }}
                        >
                          <div className="font-card-top">
                            <span className="font-name">{opt.name}</span>
                            {isSelected && (
                              <Check size={15} className="font-check-icon" />
                            )}
                          </div>
                          <span
                            className="font-sample"
                            style={{ fontFamily: opt.family }}
                          >
                            The quick brown fox jumps over 123
                          </span>
                          <span className="font-desc">{opt.preview}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Monospace Code Font Family Selection */}
                <div className="settings-section">
                  <div className="settings-section-title">
                    <FileCode2 size={15} strokeWidth={2} />
                    <span>Monospace & Code Font Family</span>
                  </div>

                  <div className="font-options-grid">
                    {MONO_FONT_OPTIONS.map((opt) => {
                      const isSelected = fontSettings.monoFontId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`font-option-card ${isSelected ? "is-selected" : ""}`}
                          onClick={() =>
                            updateFontSettings({ monoFontId: opt.id })
                          }
                        >
                          <div className="font-card-top">
                            <span className="font-name">{opt.name}</span>
                            {isSelected && (
                              <Check size={15} className="font-check-icon" />
                            )}
                          </div>
                          <code
                            className="font-sample-code"
                            style={{ fontFamily: opt.family }}
                          >
                            {opt.preview}
                          </code>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Interactive Typography Preview */}
                <div className="settings-section">
                  <div className="settings-section-title">
                    <Compass size={15} strokeWidth={2} />
                    <span>Live Typography Preview</span>
                  </div>

                  <div
                    className="font-live-preview-box"
                    style={{
                      fontFamily: activeSans.family,
                      fontSize: `${fontSettings.fontSize}px`,
                      lineHeight: fontSettings.lineHeight,
                    }}
                  >
                    <h3 className="preview-heading">
                      # Vulnerability Assessment & Findings
                    </h3>
                    <p className="preview-paragraph">
                      During reconnaissance on the target surface, identified
                      endpoint{" "}
                      <code
                        className="preview-inline-code"
                        style={{ fontFamily: activeMono.family }}
                      >
                        /api/v1/auth/token
                      </code>{" "}
                      exhibiting potential blind SQL injection in parameter
                      handling. Notes and evidence are synchronized locally.
                    </p>

                    <div
                      className="preview-code-block"
                      style={{ fontFamily: activeMono.family }}
                    >
                      <span className="code-kw">import</span> requests{"\n"}
                      <span className="code-var">resp</span> = requests.get(
                      <span className="code-str">"https://target/api"</span>,
                      headers=&#123;
                      <span className="code-str">"X-Audit"</span>:{" "}
                      <span className="code-str">"true"</span>
                      &#125;)
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LAYOUT */}
            {activeTab === "layout" && (
              <div className="settings-tab-pane">
                <div className="settings-pane-intro">
                  <div className="settings-intro-row">
                    <div>
                      <h3>Workspace & Layout</h3>
                      <p>
                        Toggle workspace panels and reset sidebar widths to
                        their default dimensions.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="settings-reset-btn"
                      onClick={resetLayoutWidths}
                      title="Reset sidebar widths to default"
                    >
                      <RotateCcw size={13} strokeWidth={2} />
                      <span>Reset Panel Widths</span>
                    </button>
                  </div>
                </div>

                <div className="layout-preview-mockup">
                  <button
                    type="button"
                    className="layout-mock-item"
                    onClick={toggleNavbar}
                  >
                    <div className="mock-item-left">
                      <LayoutTemplate size={16} strokeWidth={1.8} />
                      <div>
                        <span className="mock-title">Slim Top Navbar</span>
                        <span className="mock-subtitle">
                          Collapse header bar into a single-line folder strip
                          (Ctrl+Shift+\)
                        </span>
                      </div>
                    </div>
                    <span
                      className={`mock-pill ${isNavbarCollapsed ? "is-active" : ""}`}
                    >
                      {isNavbarCollapsed ? "Slim" : "Expanded"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="layout-mock-item"
                    onClick={toggleSidebar}
                  >
                    <div className="mock-item-left">
                      <Columns size={16} strokeWidth={1.8} />
                      <div>
                        <span className="mock-title">Left File Explorer</span>
                        <span className="mock-subtitle">
                          Show folder tree and notes sidebar (Ctrl+\)
                        </span>
                      </div>
                    </div>
                    <span
                      className={`mock-pill ${!isSidebarCollapsed ? "is-active" : ""}`}
                    >
                      {isSidebarCollapsed ? "Hidden" : "Visible"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="layout-mock-item"
                    onClick={toggleRightSidebar}
                  >
                    <div className="mock-item-left">
                      <Compass size={16} strokeWidth={1.8} />
                      <div>
                        <span className="mock-title">
                          Right Catalog & Outline
                        </span>
                        <span className="mock-subtitle">
                          Show table of contents, tags, and note statistics
                          (Ctrl+])
                        </span>
                      </div>
                    </div>
                    <span
                      className={`mock-pill ${!isRightSidebarCollapsed ? "is-active" : ""}`}
                    >
                      {isRightSidebarCollapsed ? "Hidden" : "Visible"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
