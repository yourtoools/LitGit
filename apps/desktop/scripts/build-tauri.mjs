#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const env = { ...process.env };

if (process.platform === "linux") {
  env.NO_STRIP ??= "true";
}

const tauriBinary = process.platform === "win32" ? "tauri.cmd" : "tauri";
const child = spawn(tauriBinary, ["build", ...args], {
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
