/*
Cleanup runner for the monorepo.

Usage:
  bun scripts/cleanup.mjs          # Clean build artifacts
  bun scripts/cleanup.mjs --all    # Also clean node_modules
*/

import { spawnSync } from "node:child_process";

const BASE_PATTERNS = [
  ".turbo",
  "**/.turbo",
  ".next",
  "**/.next",
  "**/.output",
  "**/.react-router",
  "**/.nitro",
  ".alchemy",
  "**/.alchemy",
  "**/dist",
  "**/build",
  "**/out",
  "**/dev-dist",
  "**/coverage",
  "**/.vercel",
  "**/.netlify",
  "**/.wrangler",
  "**/.open-next",
  "**/.cache",
  "**/.eslintcache",
  "**/src-tauri/target",
  "**/tsconfig.tsbuildinfo",
  "**/.tanstack",
  "**/next-env.d.ts",
];

const EXTRA_PATTERNS = ["node_modules", "**/node_modules"];

const includeAll = process.argv.includes("--all");
const patterns = [...BASE_PATTERNS, ...(includeAll ? EXTRA_PATTERNS : [])];

const result = spawnSync("bunx", ["rimraf", "--glob", ...patterns], {
  stdio: "inherit",
  shell: false,
});

if (result.status === 0) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  ].join(" ");
  console.log(`[${timestamp}] Cleanup completed. 🎉`);
  process.exit(0);
}

process.exit(result.status ?? 1);
