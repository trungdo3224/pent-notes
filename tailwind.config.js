/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", "[data-theme]"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: "var(--line)",
        input: "var(--line)",
        ring: "var(--forest)",
        background: "var(--paper)",
        foreground: "var(--ink)",
        primary: {
          DEFAULT: "var(--forest)",
          foreground: "var(--button-text)",
        },
        secondary: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--heading)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--muted)",
        },
        accent: {
          DEFAULT: "var(--hover)",
          foreground: "var(--ink)",
        },
        popover: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--ink)",
        },
        card: {
          DEFAULT: "var(--surface)",
          foreground: "var(--ink)",
        },
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
