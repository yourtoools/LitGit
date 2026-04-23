#!/usr/bin/env bun

/**
 * Bump Dependencies Script for Monorepo
 *
 * Checks and updates all npm dependency versions across the monorepo,
 * with intelligent handling of canary/beta/prerelease versions.
 *
 * Usage:
 *   bun run bump-deps             # Interactive mode with major version confirmation
 *   bun run bump-deps:dry         # Preview changes without applying
 *   bun run bump-deps:safe        # Skip major version bumps
 *   bun run bump-deps:stable      # Only update stable versions
 *   bun run bump-deps:ci          # Auto-confirm for CI/automation
 *
 * Options:
 *   --dry-run       Preview changes without applying them
 *   --skip-major    Skip packages with major version bumps
 *   --yes           Auto-confirm all prompts (for CI/automation)
 *   --only-type     Only update packages of specific type (stable|canary|beta|alpha|rc|next)
 *   --package <n>   Only check a specific package
 *   -h, --help      Show help message
 *
 * Note: When cleanup is performed, bun audit --fix runs automatically
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

// ============================================================================
// Constants & Regex Patterns (top-level for performance)
// ============================================================================

const ROOT_DIR = process.cwd();
const SKIP_PREFIXES = ["@socialyze/", "workspace:"];
const PACKAGE_BROWSER_BASE_URL = "https://npmx.dev";
/** @type {Map<string, {["dist-tags"]: Record<string, string>, versions: Record<string, unknown>, repository?: {url?: string}, homepage?: string}>} */
const VERSION_CACHE = new Map();

// Regex patterns at top level for performance
const VERSION_PREFIX_REGEX = /^[\^~>=<]+/;
const VERSION_SPEC_REGEX = /^(\^|~|>=|>|<=|<)?(.+)$/;
const SEMVER_SUFFIX_REGEX = /-.*$/;
const PRERELEASE_SUFFIX_REGEX = /-(\w+)\.(\d+)/;
const PACKAGE_JSON_PATH_REGEX = /[/\\]package\.json$/;
const MAJOR_VERSION_REGEX = /^(\d+)/;
const GITHUB_REPO_REGEX = /github\.com[/:]([\w.-]+)\/([\w.-]+)/;
const GIT_SUFFIX_REGEX = /\.git$/;

async function runCommand(command, args, cwd = ROOT_DIR) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

/**
 * @typedef {"stable" | "canary" | "beta" | "alpha" | "rc" | "next"} VersionType
 */

/**
 * @typedef {"low" | "medium" | "high"} RiskLevel
 */

/**
 * @typedef {{["dist-tags"]: Record<string, string>, versions: Record<string, unknown>, repository?: {url?: string}, homepage?: string}} PackageInfo
 */

// ============================================================================
// CLI Parsing
// ============================================================================

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "skip-major": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "only-type": { type: "string" },
    package: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`
Bump Dependencies Script

Usage:
  bun run bump-deps [options]

Options:
  --dry-run       Preview changes without applying them
  --skip-major    Skip packages with major version bumps
  --yes           Auto-confirm all prompts (for CI/automation)
  --only-type     Only update packages of specific type (stable|canary|beta|alpha|rc|next)
  --package <n>   Only check a specific package
  -h, --help      Show this help message

Examples:
  bun run bump-deps:dry
  bun run bump-deps --package next --dry-run
  bun run bump-deps:safe           # Skip major version bumps
  bun run bump-deps --only-type stable
  bun run bump-deps --yes          # Auto-confirm (CI mode)

Note: When you confirm cleanup, the workflow runs:
  rm -rf bun.lock node_modules -> bun pm cache rm -> bun install -> bun audit --fix
  bun run bump-deps
`);
  process.exit(0);
}

// ============================================================================
// Version Detection
// ============================================================================

/**
 * @param {string} version
 * @returns {VersionType}
 */
export function detectVersionType(version) {
  const cleanVersion = version.replace(VERSION_PREFIX_REGEX, "");
  if (cleanVersion.includes("-canary")) {
    return "canary";
  }
  if (cleanVersion.includes("-beta")) {
    return "beta";
  }
  if (cleanVersion.includes("-alpha")) {
    return "alpha";
  }
  if (cleanVersion.includes("-rc")) {
    return "rc";
  }
  if (cleanVersion.includes("-next")) {
    return "next";
  }
  return "stable";
}

/**
 * @param {string} versionSpec
 * @returns {{prefix: string, version: string}}
 */
function parseVersionSpec(versionSpec) {
  const match = versionSpec.match(VERSION_SPEC_REGEX);
  return {
    prefix: match?.[1] ?? "",
    version: match?.[2] ?? versionSpec,
  };
}

/**
 * @param {string} version
 * @returns {{major: number, minor: number, patch: number}}
 */
function parseVersionParts(version) {
  const cleanVersion = version
    .replace(VERSION_PREFIX_REGEX, "")
    .replace(SEMVER_SUFFIX_REGEX, "");
  const [major = "0", minor = "0", patch = "0"] = cleanVersion.split(".");
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

/**
 * Extract major version number from a version string
 * @param {string} version
 * @returns {number}
 */
export function getMajorVersion(version) {
  const cleanVersion = version.replace(VERSION_PREFIX_REGEX, "");
  const match = cleanVersion.match(MAJOR_VERSION_REGEX);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/**
 * Check if this is a major version bump
 * @param {string} currentVersion
 * @param {string} latestVersion
 * @returns {boolean}
 */
export function isMajorBump(currentVersion, latestVersion) {
  const currentMajor = getMajorVersion(currentVersion);
  const latestMajor = getMajorVersion(latestVersion);
  return latestMajor > currentMajor;
}

/**
 * Get changelog/releases URL for a package
 * @param {string} packageName
 * @param {PackageInfo | null} info
 * @returns {string}
 */
export function getChangelogUrl(packageName, info) {
  // Try to extract GitHub repo from package metadata
  const repo = info?.repository?.url;
  if (repo?.includes("github.com")) {
    const match = repo.match(GITHUB_REPO_REGEX);
    if (match) {
      // Clean up repo name (remove .git suffix if present)
      const repoName = match[2].replace(GIT_SUFFIX_REGEX, "");
      return `https://github.com/${match[1]}/${repoName}/releases`;
    }
  }
  // Fallback to npm package page
  return createPackageBrowserUrl(packageName);
}

/**
 * @param {string} packageName
 * @returns {string}
 */
export function createPackageBrowserUrl(packageName) {
  return `${PACKAGE_BROWSER_BASE_URL}/package/${packageName}`;
}

/**
 * @param {string} currentVersion
 * @param {string} latestVersion
 * @returns {{isBreaking: boolean, level: RiskLevel, reasons: string[]}}
 */
export function getBreakingChangeAssessment(currentVersion, latestVersion) {
  const current = parseVersionParts(currentVersion);
  const latest = parseVersionParts(latestVersion);
  const reasons = [];

  if (latest.major > current.major) {
    reasons.push("Major version bump");
    return {
      isBreaking: true,
      level: "high",
      reasons,
    };
  }

  if (
    current.major === 0 &&
    latest.major === 0 &&
    latest.minor > current.minor
  ) {
    reasons.push("Pre-1.0 minor bump can include breaking changes");
    return {
      isBreaking: true,
      level: "medium",
      reasons,
    };
  }

  return {
    isBreaking: false,
    level: "low",
    reasons,
  };
}

/**
 * @param {VersionType} type
 * @returns {string}
 */
function getVersionTypeLabel(type) {
  const labels = {
    stable: "sta",
    canary: "can",
    beta: "bet",
    alpha: "alp",
    rc: "rc",
    next: "nxt",
  };
  return labels[type];
}

/**
 * @returns {Promise<typeof import("@inquirer/prompts")>}
 */
async function loadPrompts() {
  return await import("@inquirer/prompts");
}

/**
 * Confirm major version bumps with user
 * @param {Array<{packageName: string, currentVersion: string, latestVersion: string}>} majorBumps
 * @returns {Promise<boolean | Set<string>>} Returns false if rejected, true if all accepted, or Set of allowed package names
 */
async function confirmMajorBumps(majorBumps) {
  if (majorBumps.length === 0) {
    return true;
  }

  // Auto-confirm in CI mode with warning
  if (args.yes) {
    console.warn("\n⚠️  --yes flag enabled: Auto-accepting major version bumps");
    console.warn("   Review recommended before committing\n");
    return true;
  }

  const { checkbox, confirm } = await loadPrompts();

  // Display major version bumps with changelog URLs
  console.log("\n⚠️  MAJOR VERSION BUMPS DETECTED:\n");
  const uniquePackages = [...new Set(majorBumps.map((b) => b.packageName))];

  for (const packageName of uniquePackages) {
    const bump = majorBumps.find((b) => b.packageName === packageName);
    if (!bump) {
      continue;
    }

    const info = VERSION_CACHE.get(packageName);
    const currMajor = getMajorVersion(bump.currentVersion);
    const latestMajor = getMajorVersion(bump.latestVersion);
    const changelogUrl = getChangelogUrl(packageName, info);

    console.log(`  ${bump.packageName}: v${currMajor} → v${latestMajor}`);
    console.log(`    ${bump.currentVersion} → ${bump.latestVersion}`);
    console.log(`    📝 ${changelogUrl}\n`);
  }

  // Initial confirmation
  const proceed = await confirm({
    message: `Proceed with ${uniquePackages.length} major version update(s)?`,
    default: false,
  });

  if (!proceed) {
    return false;
  }

  // Selective confirmation for multiple packages
  if (uniquePackages.length > 1) {
    const selected = await checkbox({
      message:
        "Select which major bumps to apply (space to toggle, enter to confirm):",
      choices: uniquePackages.map((name) => {
        const bump = majorBumps.find((b) => b.packageName === name);
        return {
          name: `${name} (${bump.currentVersion} → ${bump.latestVersion})`,
          value: name,
          checked: true,
        };
      }),
    });

    return new Set(selected);
  }

  // Single package - already confirmed above
  return true;
}

// ============================================================================
// npm Registry
// ============================================================================

/**
 * @param {string} packageName
 * @returns {Promise<PackageInfo | null>}
 */
async function fetchPackageInfo(packageName) {
  const cached = VERSION_CACHE.get(packageName);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) {
      console.error(`Failed to fetch ${packageName}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    VERSION_CACHE.set(packageName, data);
    return data;
  } catch (error) {
    console.error(`Error fetching ${packageName}:`, error);
    return null;
  }
}

/**
 * @param {string} packageName
 * @param {PackageInfo | null} info
 * @returns {string}
 */
function getDocumentationUrl(packageName, info) {
  return info?.homepage ?? createPackageBrowserUrl(packageName);
}

/**
 * @param {Record<string, unknown>} versions
 * @param {"stable" | "canary" | "beta" | "alpha" | "rc" | "next"} versionType
 * @returns {string | null}
 */
function findLatestVersionOfType(versions, versionType) {
  const versionList = Object.keys(versions).filter((v) => {
    const detectedType = detectVersionType(v);
    return detectedType === versionType;
  });

  if (versionList.length === 0) {
    return null;
  }

  // Sort by semver (simple string comparison works for most cases)
  versionList.sort((a, b) => {
    const aParts = a.replace(SEMVER_SUFFIX_REGEX, "").split(".").map(Number);
    const bParts = b.replace(SEMVER_SUFFIX_REGEX, "").split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      const aNum = aParts[i] ?? 0;
      const bNum = bParts[i] ?? 0;

      if (aNum !== bNum) {
        return aNum - bNum;
      }
    }

    // For prerelease versions, compare the suffix
    const aSuffix = a.match(PRERELEASE_SUFFIX_REGEX);
    const bSuffix = b.match(PRERELEASE_SUFFIX_REGEX);
    if (aSuffix && bSuffix) {
      return Number(aSuffix[2]) - Number(bSuffix[2]);
    }
    return a.localeCompare(b);
  });

  return versionList.at(-1) ?? null;
}

/**
 * @param {string} packageName
 * @param {"stable" | "canary" | "beta" | "alpha" | "rc" | "next"} versionType
 * @returns {Promise<string | null>}
 */
async function getLatestVersion(packageName, versionType) {
  const info = await fetchPackageInfo(packageName);
  if (!info) {
    return null;
  }

  // For stable, trust the dist-tag
  if (versionType === "stable") {
    return info["dist-tags"].latest ?? null;
  }

  // For all prerelease types, find the highest version numerically
  // (dist-tags for prereleases are often stale or not updated by maintainers)
  return findLatestVersionOfType(info.versions, versionType);
}

// ============================================================================
// Package.json Discovery
// ============================================================================

/**
 * @param {string} packageName
 * @param {string} versionSpec
 * @returns {boolean}
 */
function shouldSkip(packageName, versionSpec) {
  for (const prefix of SKIP_PREFIXES) {
    if (packageName.startsWith(prefix) || versionSpec.startsWith(prefix)) {
      return true;
    }
  }
  // Skip catalog: references (they point to the catalog)
  if (versionSpec === "catalog:" || versionSpec.startsWith("catalog:")) {
    return true;
  }
  return false;
}

/**
 * @returns {string[]}
 */
function findPackageJsonFiles() {
  const files = [];

  // Root package.json
  const rootPkg = join(ROOT_DIR, "package.json");
  if (existsSync(rootPkg)) {
    files.push(rootPkg);
  }

  // apps/*
  const appsDir = join(ROOT_DIR, "apps");
  if (existsSync(appsDir)) {
    for (const app of readdirSync(appsDir)) {
      const appPkg = join(appsDir, app, "package.json");
      if (existsSync(appPkg)) {
        files.push(appPkg);
      }
    }
  }

  // packages/*
  const packagesDir = join(ROOT_DIR, "packages");
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir)) {
      const pkgFile = join(packagesDir, pkg, "package.json");
      if (existsSync(pkgFile)) {
        files.push(pkgFile);
      }
    }
  }

  return files;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getFileLabel(filePath) {
  const rel = relative(ROOT_DIR, filePath);
  if (rel === "package.json") {
    return "root";
  }
  return rel.replace(PACKAGE_JSON_PATH_REGEX, "");
}

/**
 * @param {string} name
 * @param {string} version
 * @param {string} filePath
 * @param {string} fileLabel
 * @param {"dependencies" | "devDependencies" | "catalog"} depType
 * @returns {{packageName: string, currentVersion: string, prefix: string, versionType: "stable" | "canary" | "beta" | "alpha" | "rc" | "next", filePath: string, fileLabel: string, depType: "dependencies" | "devDependencies" | "catalog"} | null}
 */
function processDependencyEntry(name, version, filePath, fileLabel, depType) {
  if (shouldSkip(name, version)) {
    return null;
  }
  if (args.package && name !== args.package) {
    return null;
  }

  const { prefix, version: cleanVersion } = parseVersionSpec(version);
  return {
    packageName: name,
    currentVersion: cleanVersion,
    prefix,
    versionType: detectVersionType(cleanVersion),
    filePath,
    fileLabel,
    depType,
  };
}

/**
 * @returns {Promise<Array<{packageName: string, currentVersion: string, prefix: string, versionType: "stable" | "canary" | "beta" | "alpha" | "rc" | "next", filePath: string, fileLabel: string, depType: "dependencies" | "devDependencies" | "catalog"}>>}
 */
async function collectDependencies() {
  const dependencies = [];
  const files = findPackageJsonFiles();

  for (const filePath of files) {
    const content = await Bun.file(filePath).text();
    const pkg = JSON.parse(content);
    const fileLabel = getFileLabel(filePath);

    // Collect from catalog (root only)
    if (pkg.workspaces?.catalog) {
      for (const [name, version] of Object.entries(pkg.workspaces.catalog)) {
        const dep = processDependencyEntry(
          name,
          version,
          filePath,
          "catalog",
          "catalog"
        );
        if (dep) {
          dependencies.push(dep);
        }
      }
    }

    // Collect from dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        const dep = processDependencyEntry(
          name,
          version,
          filePath,
          fileLabel,
          "dependencies"
        );
        if (dep) {
          dependencies.push(dep);
        }
      }
    }

    // Collect from devDependencies
    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        const dep = processDependencyEntry(
          name,
          version,
          filePath,
          fileLabel,
          "devDependencies"
        );
        if (dep) {
          dependencies.push(dep);
        }
      }
    }
  }

  return dependencies;
}

// ============================================================================
// Update Logic
// ============================================================================

/**
 * @param {Array<{packageName: string, currentVersion: string, prefix: string, versionType: "stable" | "canary" | "beta" | "alpha" | "rc" | "next", filePath: string, fileLabel: string, depType: "dependencies" | "devDependencies" | "catalog"}>} dependencies
 * @returns {Promise<Array<{packageName: string, currentVersion: string, prefix: string, versionType: "stable" | "canary" | "beta" | "alpha" | "rc" | "next", filePath: string, fileLabel: string, depType: "dependencies" | "devDependencies" | "catalog", latestVersion: string}>>}
 */
async function checkForUpdates(dependencies) {
  const updates = [];
  const checked = new Set();

  // Batch fetch unique packages
  const uniquePackages = [...new Set(dependencies.map((d) => d.packageName))];
  console.log(`Checking ${uniquePackages.length} unique packages...`);

  // Fetch all package info in parallel (with concurrency limit)
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniquePackages.length; i += BATCH_SIZE) {
    const batch = uniquePackages.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((pkg) => fetchPackageInfo(pkg)));
    const current = Math.min(i + BATCH_SIZE, uniquePackages.length);
    const percentage = Math.round((current / uniquePackages.length) * 100);
    process.stdout.write(
      `\r  Fetched ${current}/${uniquePackages.length} (${percentage}%)`
    );
  }
  console.log();

  for (const dep of dependencies) {
    const cacheKey = `${dep.packageName}@${dep.versionType}`;
    let latestVersion;

    if (checked.has(cacheKey)) {
      // Get from already computed results
      const existing = updates.find(
        (u) =>
          u.packageName === dep.packageName && u.versionType === dep.versionType
      );
      latestVersion = existing?.latestVersion ?? null;
    } else {
      latestVersion = await getLatestVersion(dep.packageName, dep.versionType);
      checked.add(cacheKey);
    }

    if (latestVersion && latestVersion !== dep.currentVersion) {
      updates.push({
        ...dep,
        latestVersion,
      });
    }
  }

  return updates;
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * @param {Array<{packageName: string, currentVersion: string, prefix: string, versionType: "stable" | "canary" | "beta" | "alpha" | "rc" | "next", filePath: string, fileLabel: string, depType: "dependencies" | "devDependencies" | "catalog", latestVersion: string}>} updates
 */
function printTable(updates) {
  if (updates.length === 0) {
    console.log("\n✓ All dependencies are up to date!\n");
    return;
  }

  const breakingUpdates = updates
    .map((update) => ({
      ...update,
      assessment: getBreakingChangeAssessment(
        update.currentVersion,
        update.latestVersion
      ),
    }))
    .filter((update) => update.assessment.isBreaking);
  const breakingPackageNames = new Set(
    breakingUpdates.map((update) => update.packageName)
  );

  // Calculate column widths
  const pkgWidth = Math.max(18, ...updates.map((u) => u.packageName.length));
  const fileWidth = Math.max(16, ...updates.map((u) => u.fileLabel.length));
  const currWidth = Math.max(
    15,
    ...updates.map((u) => u.currentVersion.length)
  );
  const latestWidth = Math.max(
    15,
    ...updates.map((u) => u.latestVersion.length)
  );

  const hr = `├${"─".repeat(pkgWidth + 2)}┼${"─".repeat(fileWidth + 2)}┼${"─".repeat(currWidth + 2)}┼${"─".repeat(latestWidth + 2)}┼${"─".repeat(5)}┤`;
  const topBorder = `┌${"─".repeat(pkgWidth + 2)}┬${"─".repeat(fileWidth + 2)}┬${"─".repeat(currWidth + 2)}┬${"─".repeat(latestWidth + 2)}┬${"─".repeat(5)}┐`;
  const bottomBorder = `└${"─".repeat(pkgWidth + 2)}┴${"─".repeat(fileWidth + 2)}┴${"─".repeat(currWidth + 2)}┴${"─".repeat(latestWidth + 2)}┴${"─".repeat(5)}┘`;

  console.log("\n                           Version Check Results");
  console.log(topBorder);
  console.log(
    `│ ${"Package".padEnd(pkgWidth)} │ ${"File".padEnd(fileWidth)} │ ${"Current".padEnd(currWidth)} │ ${"Latest".padEnd(latestWidth)} │ Type│`
  );
  console.log(hr);

  for (const update of updates) {
    const typeLabel = getVersionTypeLabel(update.versionType);
    const isMajor = isMajorBump(update.currentVersion, update.latestVersion);
    // Add ⚠ indicator for major bumps
    const pkgDisplay = isMajor
      ? `⚠ ${update.packageName}`.padEnd(pkgWidth)
      : update.packageName.padEnd(pkgWidth);
    console.log(
      `│ ${pkgDisplay} │ ${update.fileLabel.padEnd(fileWidth)} │ ${update.currentVersion.padEnd(currWidth)} │ ${update.latestVersion.padEnd(latestWidth)} │ ${typeLabel.padEnd(4)}│`
    );
  }

  console.log(bottomBorder);

  const fileCount = new Set(updates.map((u) => u.filePath)).size;
  console.log(
    `\nSummary: ${updates.length} updates available across ${fileCount} file(s)`
  );

  // Print breaking change guidance
  if (breakingUpdates.length > 0) {
    console.log(
      `\n⚠ WARNING: ${breakingPackageNames.size} package(s) need extra review before updating:`
    );
    for (const name of breakingPackageNames) {
      const bump = breakingUpdates.find((update) => update.packageName === name);
      const info = VERSION_CACHE.get(name) ?? null;
      if (bump) {
        const changelogUrl = getChangelogUrl(name, info);
        const docsUrl = getDocumentationUrl(name, info);
        console.log(
          `   - ${name}: ${bump.currentVersion} → ${bump.latestVersion} [${bump.assessment.level}]`
        );
        console.log(`     ${bump.assessment.reasons.join("; ")}`);
        console.log(`     ${changelogUrl}`);
        if (docsUrl !== changelogUrl) {
          console.log(`     Docs: ${docsUrl}`);
        }
      }
    }
  }
}

// ============================================================================
// Apply Updates
// ============================================================================

/**
 * @param {Array<{packageName: string, currentVersion: string, prefix: string, versionType: "stable" | "canary" | "beta" | "alpha" | "rc" | "next", filePath: string, fileLabel: string, depType: "dependencies" | "devDependencies" | "catalog", latestVersion: string}>} updates
 */
async function applyUpdates(updates) {
  // Group updates by file
  const updatesByFile = new Map();
  for (const update of updates) {
    const existing = updatesByFile.get(update.filePath) ?? [];
    existing.push(update);
    updatesByFile.set(update.filePath, existing);
  }

  for (const [filePath, fileUpdates] of updatesByFile) {
    const content = await Bun.file(filePath).text();
    const pkg = JSON.parse(content);

    for (const update of fileUpdates) {
      const newVersionSpec = `${update.prefix}${update.latestVersion}`;

      if (update.depType === "catalog" && pkg.workspaces?.catalog) {
        pkg.workspaces.catalog[update.packageName] = newVersionSpec;
      } else if (update.depType === "dependencies" && pkg.dependencies) {
        pkg.dependencies[update.packageName] = newVersionSpec;
      } else if (update.depType === "devDependencies" && pkg.devDependencies) {
        pkg.devDependencies[update.packageName] = newVersionSpec;
      }
    }

    await Bun.write(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const fileCount = updatesByFile.size;
  console.log(
    `\n✓ Updated ${updates.length} dependencies across ${fileCount} file(s)`
  );
}

// ============================================================================
// Cleanup
// ============================================================================

async function promptCleanup() {
  const { confirm } = await loadPrompts();
  return await confirm({
    message: "Clean up and reinstall? (Recommended)",
    default: true,
  });
}

/**
 * @param {string} dir
 */
function removeDirectory(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runCleanup() {
  console.log("\nCleaning up...");

  // Remove bun.lock
  const lockFile = join(ROOT_DIR, "bun.lock");
  if (existsSync(lockFile)) {
    rmSync(lockFile);
    console.log("  ✓ Removed bun.lock");
  }

  // Remove root node_modules
  removeDirectory(join(ROOT_DIR, "node_modules"));
  console.log("  ✓ Removed root node_modules");

  // Remove apps/*/node_modules
  const appsDir = join(ROOT_DIR, "apps");
  if (existsSync(appsDir)) {
    for (const app of readdirSync(appsDir)) {
      const appPath = join(appsDir, app);
      if (statSync(appPath).isDirectory()) {
        removeDirectory(join(appPath, "node_modules"));
      }
    }
    console.log("  ✓ Removed apps/*/node_modules");
  }

  // Remove packages/*/node_modules
  const packagesDir = join(ROOT_DIR, "packages");
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir)) {
      const pkgPath = join(packagesDir, pkg);
      if (statSync(pkgPath).isDirectory()) {
        removeDirectory(join(pkgPath, "node_modules"));
      }
    }
    console.log("  ✓ Removed packages/*/node_modules");
  }

  // Clear bun cache
  console.log("\n  Running bun pm cache rm...");
  const cacheExitCode = await runCommand("bun", ["pm", "cache", "rm"]);
  if (cacheExitCode === 0) {
    console.log("  ✓ Cleared bun cache");
  } else {
    console.log("  ⚠ Failed to clear bun cache");
  }

  // Run bun install
  console.log("\nInstalling dependencies...");
  const installExitCode = await runCommand("bun", ["install"]);
  if (installExitCode === 0) {
    console.log("  ✓ bun install completed");
  } else {
    console.log("  ⚠ bun install failed");
    process.exit(1);
  }

  // Run bun audit --fix automatically after install
  console.log("\nRunning bun audit --fix...");
  const auditFixExitCode = await runCommand("bun", ["audit", "--fix"]);
  if (auditFixExitCode === 0) {
    console.log("  ✓ bun audit --fix completed");
  } else {
    console.log("  ⚠ bun audit --fix found vulnerabilities or completed with warnings");
  }

  console.log("\nDone! All dependencies updated.");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("Bump Dependencies Script\n");

  if (args["dry-run"]) {
    console.log("Mode: Dry Run (no changes will be made)\n");
  }

  // Collect dependencies
  console.log("Scanning package.json files...");
  const dependencies = await collectDependencies();
  console.log(`Found ${dependencies.length} dependencies to check\n`);

  if (dependencies.length === 0) {
    console.log("No dependencies found to check.");
    return;
  }

  // Check for updates
  const updates = await checkForUpdates(dependencies);

  // Filter by --only-type if specified
  let filteredUpdates = updates;
  if (args["only-type"]) {
    const requestedType =
      /** @type {"stable" | "canary" | "beta" | "alpha" | "rc" | "next"} */ (
        args["only-type"]
      );
    const validTypes = ["stable", "canary", "beta", "alpha", "rc", "next"];
    if (!validTypes.includes(requestedType)) {
      console.error(
        `Invalid --only-type value: "${requestedType}"\nValid options: ${validTypes.join(", ")}`
      );
      process.exit(1);
    }
    const beforeCount = filteredUpdates.length;
    filteredUpdates = filteredUpdates.filter(
      (u) => u.versionType === requestedType
    );
    const skippedCount = beforeCount - filteredUpdates.length;
    console.log(
      `\nFiltered by type "${requestedType}": ${filteredUpdates.length} updates, ${skippedCount} skipped\n`
    );
  }

  // Filter out major version bumps if --skip-major is set
  if (args["skip-major"]) {
    const skipped = filteredUpdates.filter((u) =>
      isMajorBump(u.currentVersion, u.latestVersion)
    );
    filteredUpdates = filteredUpdates.filter(
      (u) => !isMajorBump(u.currentVersion, u.latestVersion)
    );
    if (skipped.length > 0) {
      const skippedNames = [...new Set(skipped.map((s) => s.packageName))];
      console.log(
        `\nSkipped ${skippedNames.length} major version bump(s): ${skippedNames.join(", ")}`
      );
    }
  }

  // Print results
  printTable(filteredUpdates);

  if (filteredUpdates.length === 0) {
    return;
  }

  if (args["dry-run"]) {
    console.log("\nRun without --dry-run to apply changes");
    return;
  }

  // Confirm major version bumps before applying
  const majorBumps = filteredUpdates.filter((u) =>
    isMajorBump(u.currentVersion, u.latestVersion)
  );

  let finalUpdates = filteredUpdates;
  if (majorBumps.length > 0) {
    const confirmation = await confirmMajorBumps(majorBumps);

    if (confirmation === false) {
      console.log("\n❌ Cancelled: No updates applied");
      return;
    }

    // Filter updates based on user selection
    if (confirmation instanceof Set) {
      const allowedPackages = confirmation;
      finalUpdates = filteredUpdates.filter(
        (u) =>
          !isMajorBump(u.currentVersion, u.latestVersion) ||
          allowedPackages.has(u.packageName)
      );
      console.log(
        `\n✓ Applied ${finalUpdates.length} update(s) (${
          filteredUpdates.length - finalUpdates.length
        } skipped)`
      );
    }
  }

  // Apply updates
  await applyUpdates(finalUpdates);

  // Prompt for cleanup
  const shouldCleanup = await promptCleanup();
  if (shouldCleanup) {
    await runCleanup();
  } else {
    console.log("\nSkipped cleanup. Run manually:");
    console.log("  rm -rf bun.lock node_modules");
    console.log("  bun pm cache rm");
    console.log("  bun install");
    console.log("  bun audit --fix");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
