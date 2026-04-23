#!/usr/bin/env bun

/**
 * Bump Skills Script for Monorepo
 *
 * Checks and updates all skills listed in skills-lock.json,
 * forcing universal agent installation.
 *
 * Usage:
 *   bun run bump-skills             # Update all skills
 *   bun run bump-skills:dry         # Preview commands without executing
 *   bun run bump-skills [name]      # Update specific skill(s)
 *
 * Options:
 *   --dry-run       Print commands without executing them
 *   -h, --help      Show help message
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const ROOT_DIR = process.cwd();
const LOCK_PATH = join(ROOT_DIR, "skills-lock.json");

/**
 * @typedef {{ name: string, source: string, hash?: string }} LockedSkill
 */

/**
 * @param {string} text
 * @returns {LockedSkill[]}
 */
function parseSkillsLock(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Failed to parse skills-lock.json as JSON", {
      cause: error,
    });
  }

  const skills = parsed?.skills;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    throw new Error('skills-lock.json must contain a top-level "skills" object');
  }

  /** @type {LockedSkill[]} */
  const lockedSkills = [];
  const normalizedNames = new Set();

  for (const [name, entry] of Object.entries(skills)) {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new Error("Skill name must not be blank");
    }
    if (normalizedNames.has(normalizedName)) {
      throw new Error(`Duplicate skill name after trimming: "${normalizedName}"`);
    }
    normalizedNames.add(normalizedName);

    const source = entry?.source;
    if (typeof source !== "string") {
      throw new Error(`Skill "${name}" is missing required "source"`);
    }

    const normalizedSource = source.trim();
    if (normalizedSource.length === 0) {
      throw new Error(`Skill "${name}" is missing required "source"`);
    }

    lockedSkills.push({
      name: normalizedName,
      source: normalizedSource,
      hash: entry?.computedHash,
    });
  }

  if (lockedSkills.length === 0) {
    throw new Error("skills-lock.json does not contain any locked skills");
  }

  return lockedSkills;
}

/**
 * @param {LockedSkill[]} lockedSkills
 * @param {string[]} requestedNames
 * @returns {LockedSkill[]}
 */
function selectLockedSkills(lockedSkills, requestedNames) {
  if (requestedNames.length === 0) {
    return lockedSkills.slice();
  }

  const availableNames = lockedSkills.map((skill) => skill.name);
  const availableNameSet = new Set(availableNames);

  for (const requestedName of requestedNames) {
    if (!availableNameSet.has(requestedName)) {
      throw new Error(
        `Unknown skill "${requestedName}". Available skills: ${availableNames.join(", ")}`,
      );
    }
  }

  const requestedNameSet = new Set(requestedNames);
  return lockedSkills.filter((skill) => requestedNameSet.has(skill.name));
}

/**
 * @param {LockedSkill} lockedSkill
 * @returns {string[]}
 */
function buildSkillsAddArgs(lockedSkill) {
  return [
    "skills@latest",
    "add",
    lockedSkill.source,
    "--skill",
    lockedSkill.name,
    "--agent",
    "universal",
    "-y",
  ];
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteShellArg(value) {
  if (/^[A-Za-z0-9_ @%+=:,./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

/**
 * @param {LockedSkill} lockedSkill
 * @returns {string}
 */
function formatSkillsAddCommand(lockedSkill) {
  return `bunx ${buildSkillsAddArgs(lockedSkill).map(quoteShellArg).join(" ")}`;
}

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
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });

    if (values.help) {
      console.log(`
Update project skills from skills-lock.json

Usage:
  bun run bump-skills [skill-name...]
  bun run bump-skills:dry [skill-name...]

Options:
  --dry-run   Print commands without executing them
  -h, --help  Show this help message
`);
      process.exit(0);
    }

    if (!existsSync(LOCK_PATH)) {
      console.error("skills-lock.json was not found in the repository root");
      process.exit(1);
    }

    const lockedSkills = parseSkillsLock(readFileSync(LOCK_PATH, "utf8"));
    const selectedSkills = selectLockedSkills(lockedSkills, positionals);

    for (const lockedSkill of selectedSkills) {
      const command = formatSkillsAddCommand(lockedSkill);

      if (values["dry-run"]) {
        console.log(`[DRY RUN] ${command}`);
        continue;
      }

      console.log(`Updating ${lockedSkill.name}...`);
      const exitCode = await runCommand("bunx", buildSkillsAddArgs(lockedSkill));

      if (exitCode !== 0) {
        console.error(
          `Failed while updating skill "${lockedSkill.name}" from "${lockedSkill.source}"`,
        );
        process.exit(exitCode);
      }
    }

    console.log("\n✓ All skills processed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
