#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE_FILE = "AGENTS.md";
const TARGET_FILES = ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"];
const START_MARKER = "<!-- gitnexus:start -->";
const END_MARKER = "<!-- gitnexus:end -->";

const gitNexusBlockPattern = new RegExp(
  `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractGitNexusBlock(content, filePath) {
  const match = content.match(gitNexusBlockPattern);

  if (!match) {
    throw new Error(`${filePath} does not contain GitNexus block`);
  }

  return match[0];
}

export function replaceGitNexusBlock(content, replacementBlock, filePath) {
  if (!gitNexusBlockPattern.test(content)) {
    throw new Error(`${filePath} does not contain GitNexus block`);
  }

  return content.replace(gitNexusBlockPattern, replacementBlock);
}

function runGitNexusAnalyze() {
  const result = spawnSync("gitnexus", ["analyze", "--force"], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`gitnexus analyze --force failed with exit code ${result.status}`);
  }
}

function syncGitNexusBlocks() {
  const sourceContent = readFileSync(SOURCE_FILE, "utf8");
  const sourceBlock = extractGitNexusBlock(sourceContent, SOURCE_FILE);

  for (const targetFile of TARGET_FILES) {
    const targetContent = readFileSync(targetFile, "utf8");
    const updatedContent = replaceGitNexusBlock(
      targetContent,
      sourceBlock,
      targetFile
    );

    if (updatedContent !== targetContent) {
      writeFileSync(targetFile, updatedContent);
      console.log(`Synced GitNexus block: ${targetFile}`);
      continue;
    }

    console.log(`GitNexus block already current: ${targetFile}`);
  }
}

export function main(args = process.argv.slice(2)) {
  const syncOnly = args.includes("--sync-only");

  if (!syncOnly) {
    runGitNexusAnalyze();
  }

  syncGitNexusBlocks();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
