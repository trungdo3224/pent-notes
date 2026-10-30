export const THEME_STORAGE_KEY = 'pentnotes.theme.v1';

export const themes = [
  {
    id: 'parchment',
    name: 'Solar Flare',
    mode: 'light',
    description: 'Electric orange, cobalt, warm light.',
    colors: ['#fff7ed', '#ffedd7', '#a83d00', '#075bd8'],
  },
  {
    id: 'glacier',
    name: 'Ion Blue',
    mode: 'light',
    description: 'Cool white, ion blue, laser teal.',
    colors: ['#edf7ff', '#dcebff', '#0756c9', '#007679'],
  },
  {
    id: 'rosewood',
    name: 'Prism',
    mode: 'light',
    description: 'Iridescent pink, vivid fuchsia, blue.',
    colors: ['#fff0fa', '#f5dff1', '#a91976', '#075fc7'],
  },
  {
    id: 'midnight',
    name: 'Neon Grid',
    mode: 'dark',
    description: 'Deep navy, luminous cyan, hot pink.',
    colors: ['#070e1d', '#091326', '#28e5ff', '#ff56d9'],
  },
  {
    id: 'evergreen',
    name: 'Matrix',
    mode: 'dark',
    description: 'Near-black green, acid lime, mint.',
    colors: ['#060f0e', '#081714', '#90ff67', '#00e6ca'],
  },
  {
    id: 'ember',
    name: 'Afterburn',
    mode: 'dark',
    description: 'Black cherry, plasma orange, coral.',
    colors: ['#170a13', '#1b0c17', '#ff9a52', '#ff567e'],
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
  const theme = themes.find((item) => item.id === id) ?? themes[3];
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

