/*
Cleanup runner for the monorepo.

Usage:
  bun scripts/cleanup.mjs          # Clean build artifacts
  bun scripts/cleanup.mjs --all    # Also clean node_modules
*/

import { spawn } from "node:child_process";

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

async function runCommand(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const exitCode = await runCommand("bunx", ["rimraf", "--glob", ...patterns]);

  if (exitCode === 0) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const timestamp = [
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    ].join(" ");
    console.log(`[${timestamp}] Cleanup completed. 🎉`);
    process.exit(0);
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
