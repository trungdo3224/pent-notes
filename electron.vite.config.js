import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Ensure Electron runs as a GUI application, even when launched from an IDE/terminal
// environment that sets ELECTRON_RUN_AS_NODE=1 (such as VS Code/Antigravity/Cursor)
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "zustand",
        "lucide-react",
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lang-markdown",
        "@lezer/markdown",
      ],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("@codemirror") || id.includes("@lezer")) {
                return "vendor-editor";
              }
              if (
                id.includes("react") ||
                id.includes("zustand") ||
                id.includes("lucide-react")
              ) {
                return "vendor-ui";
              }
            }
          },
        },
      },
    },
  },
});
