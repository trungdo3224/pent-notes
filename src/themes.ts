export const THEME_STORAGE_KEY = 'pentnotes.theme.v1';

export const themes = [
  {
    id: 'midnight',
    name: 'Cyber Cyan',
    mode: 'dark',
    description: 'Electric cyan and neon magenta on sleek slate dark.',
    colors: ['#0b0d13', '#10131c', '#00e5ff', '#f43f5e'],
  },
  {
    id: 'evergreen',
    name: 'Terminal Green',
    mode: 'dark',
    description: 'Crisp hacker emerald and mint on sleek slate dark.',
    colors: ['#0b0d13', '#10131c', '#10b981', '#06b6d4'],
  },
  {
    id: 'ember',
    name: 'Flame Ember',
    mode: 'dark',
    description: 'Warm flame orange and coral rose on sleek slate dark.',
    colors: ['#0b0d13', '#10131c', '#f97316', '#f43f5e'],
  },
  {
    id: 'parchment',
    name: 'Solar Amber',
    mode: 'light',
    description: 'Solar amber and deep cobalt on crisp minimalist white.',
    colors: ['#f8fafc', '#ffffff', '#ea580c', '#0284c7'],
  },
  {
    id: 'glacier',
    name: 'Glacier Blue',
    mode: 'light',
    description: 'Oceanic sapphire and teal on crisp minimalist white.',
    colors: ['#f8fafc', '#ffffff', '#0284c7', '#0d9488'],
  },
  {
    id: 'rosewood',
    name: 'Prism Berry',
    mode: 'light',
    description: 'Vivid berry fuchsia and violet on crisp minimalist white.',
    colors: ['#f8fafc', '#ffffff', '#be185d', '#6366f1'],
  },
] as const;

export type ThemeId = (typeof themes)[number]['id'];

export function initialTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const found = themes.find((t) => t.id === raw);
      if (found) return found.id;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'midnight';
}

export function applyTheme(id: ThemeId): void {
  const theme = themes.find((item) => item.id === id) ?? themes[0];
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.mode;
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Ignore storage write errors
  }
}

