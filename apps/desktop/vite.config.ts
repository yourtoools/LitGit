import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Rolldown code splitting regex patterns
const CODEMIRROR_PATTERN = /@codemirror|codemirror/;
const TERMINAL_PATTERN = /xterm|@xterm/;
const GRAPH_PATTERN = /@xyflow/;
const DND_PATTERN = /@dnd-kit/;
const REACT_VENDOR_PATTERN =
  /node_modules[\\/](react|react-dom|scheduler)[\\/]/;
const ROUTER_PATTERN = /@tanstack[\\/]react-router/;
const STATE_PATTERN = /zustand|immer/;
const UI_PATTERN = /@base-ui|sonner|class-variance-authority|@radix-ui/;
const SPDX_PATTERN = /spdx-license-list/;
const GITIGNORE_PATTERN = /generated[\\/]gitignore-templates/;
const PHOSPHOR_PATTERN = /@phosphor-icons[\\/]react/;
const MANTINE_PATTERN = /@mantine[\\/]hooks/;
const NODE_MODULES_PATTERN = /node_modules/;

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    tanstackRouter({ autoCodeSplitting: true }),
    react(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3001,
  },
  build: {
    target: "esnext",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: mode === "production",
        drop_debugger: true,
      },
    },
    sourcemap: mode !== "production",
    // Rolldown-native code splitting (Vite 8+)
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Prevent overly small chunks
          minSize: 20_000, // 20KB minimum
          // Target max chunk size
          maxSize: 500_000, // 500KB target
          groups: [
            // CodeMirror editor - priority for editor functionality
            {
              name: "codemirror",
              test: CODEMIRROR_PATTERN,
              priority: 100,
            },
            // Terminal (xterm) and addons
            {
              name: "terminal",
              test: TERMINAL_PATTERN,
              priority: 90,
            },
            // Git graph visualization
            {
              name: "graph",
              test: GRAPH_PATTERN,
              priority: 80,
            },
            // Drag and drop kit
            {
              name: "dnd",
              test: DND_PATTERN,
              priority: 70,
            },
            // Core React vendor - high priority
            {
              name: "vendor-react",
              test: REACT_VENDOR_PATTERN,
              priority: 60,
            },
            // Router
            {
              name: "router",
              test: ROUTER_PATTERN,
              priority: 50,
            },
            // State management
            {
              name: "vendor-state",
              test: STATE_PATTERN,
              priority: 40,
            },
            // UI primitives
            {
              name: "ui",
              test: UI_PATTERN,
              priority: 30,
            },
            // SPDX license database and related data
            {
              name: "templates",
              test: SPDX_PATTERN,
              priority: 29,
            },
            // Local generated gitignore templates
            {
              name: "templates",
              test: GITIGNORE_PATTERN,
              priority: 28,
            },
            // Icon library often too large for default vendor chunk
            {
              name: "icons",
              test: PHOSPHOR_PATTERN,
              priority: 27,
            },
            // Mantine hooks utility bundle
            {
              name: "hooks",
              test: MANTINE_PATTERN,
              priority: 26,
            },
            // All other node_modules - lower priority catch-all
            {
              name: "vendor",
              test: NODE_MODULES_PATTERN,
              priority: 10,
              minSize: 50_000, // Only create if >50KB
            },
            // Shared application code
            {
              name: "common",
              minShareCount: 2,
              minSize: 10_000,
              priority: 5,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "zustand"],
    exclude: ["@tauri-apps/api", "@tauri-apps/plugin-opener"],
  },
}));
