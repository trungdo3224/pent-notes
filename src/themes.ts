const THEME_STORAGE_KEY = "pentnotes.theme.v1";

export const themes = [
  {
    id: "espresso",
    name: "Warm Espresso",
    mode: "dark",
    description: "Roasted coffee charcoal with warm caramel amber tones.",
    colors: ["#191614", "#241f1c", "#d97736", "#8cb88b"],
  },
  {
    id: "slate",
    name: "Deep Slate",
    mode: "dark",
    description: "Graphite stone with serene sage pine accents.",
    colors: ["#15181b", "#20242a", "#4ea685", "#d6a858"],
  },
  {
    id: "linen",
    name: "Warm Linen",
    mode: "light",
    description: "Unbleached oat paper with soft terracotta accents.",
    colors: ["#f7f4ee", "#fbf9f5", "#b85d38", "#3d6b56"],
  },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  midnight: "espresso",
  ember: "espresso",
  evergreen: "slate",
  parchment: "linen",
  glacier: "linen",
  rosewood: "linen",
};

export function initialTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      if (raw in LEGACY_THEME_MAP) {
        return LEGACY_THEME_MAP[raw];
      }
      const found = themes.find((t) => t.id === raw);
      if (found) return found.id;
    }
  } catch {
    // Ignore storage read errors
  }
  return "espresso";
}

export function applyTheme(id: ThemeId): void {
  const theme = themes.find((item) => item.id === id) ?? themes[0];
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.mode;

  if (typeof window !== "undefined" && window.electronAPI) {
    document.documentElement.classList.add("app-is-electron");
    const isDark = theme.mode === "dark";
    const bgColor = isDark
      ? theme.id === "espresso"
        ? "#191614"
        : "#15181b"
      : "#f7f4ee";
    const symbolColor = isDark ? "#f7f1eb" : "#231f1c";
    void window.electronAPI.window?.setTitleBarOverlay?.({
      color: bgColor,
      symbolColor,
    });
  }
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Ignore storage write errors
  }
}
