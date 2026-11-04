export interface FontOption {
  id: string;
  name: string;
  family: string;
  category: 'sans' | 'serif' | 'mono';
  preview: string;
}

export const SANS_FONT_OPTIONS: FontOption[] = [
  {
    id: 'system',
    name: 'System Default',
    family:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
    category: 'sans',
    preview: 'Clean modern system UI font',
  },
  {
    id: 'inter',
    name: 'Inter',
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    category: 'sans',
    preview: 'Crafted for screen readability & technical UI',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    family: "'Roboto', 'Segoe UI', Arial, sans-serif",
    category: 'sans',
    preview: 'Geometric yet friendly modern curves',
  },
  {
    id: 'segoe',
    name: 'Segoe UI',
    family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    category: 'sans',
    preview: 'Fluent typography for desktop applications',
  },
  {
    id: 'merriweather',
    name: 'Merriweather / Serif',
    family: "'Merriweather', Georgia, 'Times New Roman', serif",
    category: 'serif',
    preview: 'Elegant editorial serif for distraction-free reading',
  },
  {
    id: 'jetbrains-all',
    name: 'JetBrains Mono (Full Monospace)',
    family: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
    category: 'mono',
    preview: 'Code-first monospaced layout for all text',
  },
];

export const MONO_FONT_OPTIONS: FontOption[] = [
  {
    id: 'jetbrains',
    name: 'JetBrains Mono',
    family: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
    category: 'mono',
    preview: 'const audit = (target: string) => true;',
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    family: "'Fira Code', 'JetBrains Mono', Consolas, monospace",
    category: 'mono',
    preview: 'fn connect() -> Result<(), Error> { ok() }',
  },
  {
    id: 'cascadia',
    name: 'Cascadia Code',
    family: "'Cascadia Code', Consolas, 'JetBrains Mono', monospace",
    category: 'mono',
    preview: 'SELECT * FROM pent_logs WHERE status = 200;',
  },
  {
    id: 'consolas',
    name: 'Consolas',
    family: "Consolas, 'Courier New', monospace",
    category: 'mono',
    preview: 'printf("payload: %s\\n", buffer);',
  },
];

export interface FontSettings {
  sansFontId: string;
  monoFontId: string;
  fontSize: number; // in pixels, default 16
  lineHeight: number; // ratio, e.g. 1.4, 1.65, 1.85
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  sansFontId: 'system',
  monoFontId: 'jetbrains',
  fontSize: 16,
  lineHeight: 1.65,
};

export const FONT_SETTINGS_STORAGE_KEY = 'pentnotes.fonts.v1';

export function initialFontSettings(): FontSettings {
  try {
    const raw = localStorage.getItem(FONT_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_FONT_SETTINGS,
        ...parsed,
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_FONT_SETTINGS;
}

export function saveFontSettings(settings: FontSettings): void {
  try {
    localStorage.setItem(FONT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write errors
  }
}

export function applyFontSettings(settings: FontSettings): void {
  if (typeof document === 'undefined') return;

  const sans =
    SANS_FONT_OPTIONS.find((f) => f.id === settings.sansFontId) ?? SANS_FONT_OPTIONS[0];
  const mono =
    MONO_FONT_OPTIONS.find((f) => f.id === settings.monoFontId) ?? MONO_FONT_OPTIONS[0];

  document.documentElement.style.setProperty('--font-sans', sans.family);
  document.documentElement.style.setProperty('--font-mono', mono.family);
  document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--editor-line-height', String(settings.lineHeight));
}

