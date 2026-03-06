import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Configuration constants */
const CONFIG = {
  OUTPUT_PATH: "../src/components/atoms/lucide-icons.ts",
  LIBRARY_INDEX_PATH: "../node_modules/lucide-react/dist/lucide-react.d.ts",
  SAMPLE_ICONS_COUNT: 10,
  EXPORT_PATTERN: /^declare const (\w+):/gm,
  EXCLUDED_EXPORTS: ["createLucideIcon"],
} as const;

/** Logger utility for consistent output */
const logger = {
  info: (message: string) => process.stdout.write(`${message}\n`),
  success: (message: string) => process.stdout.write(`✅ ${message}\n`),
  error: (message: string) => process.stderr.write(`❌ ${message}\n`),
  step: (message: string) => process.stdout.write(`🔍 ${message}\n`),
};

/**
 * Convert PascalCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Extract icon names from the library type definitions
 */
function extractIconNames(libraryCode: string): string[] {
  const iconNames: string[] = [];
  const matches = libraryCode.matchAll(CONFIG.EXPORT_PATTERN);

  for (const match of matches) {
    const iconName = match[1];
    // Filter out index_ prefixed exports (these are re-exports)
    // and utility functions
    if (
      iconName &&
      !iconName.startsWith("index_") &&
      !(CONFIG.EXCLUDED_EXPORTS as readonly string[]).includes(iconName)
    ) {
      iconNames.push(iconName);
    }
  }

  // Remove duplicates and sort alphabetically
  return [...new Set(iconNames)].sort();
}

/**
 * Generate the TypeScript content for the icon map
 */
function generateIconMapContent(iconNames: string[]): string {
  const iconMapEntries = iconNames
    .map((name) => {
      // Convert PascalCase to kebab-case for the map key
      const keyName = toKebabCase(name);
      return `  "${keyName}": "${name}"`;
    })
    .join(",\n");

  return `// THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
// Run "bun run generate:lucide-icons" to regenerate.
// Generated from lucide-react package
// Total icons: ${iconNames.length}

export const lucideIconMap = {
${iconMapEntries}
} as const;

export type LucideIconName = keyof typeof lucideIconMap;
`;
}

/**
 * Ensure output directory exists
 */
function ensureOutputDirectory(outputPath: string): void {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    logger.info(`📁 Creating output directory: ${outputDir}`);
    mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Main function to generate icons from lucide-react
 */
function generateLucideIcons(): void {
  try {
    // Resolve paths
    const outputPath = resolve(__dirname, CONFIG.OUTPUT_PATH);
    const libraryIndexPath = resolve(__dirname, CONFIG.LIBRARY_INDEX_PATH);

    // Validate library exists
    if (!existsSync(libraryIndexPath)) {
      throw new Error(
        `Library index file not found: ${libraryIndexPath}\nPlease ensure lucide-react package is installed.`
      );
    }

    // Clean up existing file
    if (existsSync(outputPath)) {
      logger.info("🗑️  Deleting existing generated file...");
      unlinkSync(outputPath);
    }

    logger.step("Analyzing lucide-react package...");

    // Read and parse library code
    const libraryCode = readFileSync(libraryIndexPath, "utf-8");
    const iconNames = extractIconNames(libraryCode);

    if (iconNames.length === 0) {
      throw new Error("No icons found in the library type definitions");
    }

    logger.success(`Found ${iconNames.length} icons`);

    // Generate output content
    const content = generateIconMapContent(iconNames);

    // Ensure output directory exists
    ensureOutputDirectory(outputPath);

    // Write output file
    writeFileSync(outputPath, content, "utf-8");

    // Success output
    logger.info("\n✨ Successfully generated lucide-icons.ts");
    logger.info(`📦 Exported ${iconNames.length} icons from lucide-react`);
    logger.info(`📍 Output: ${outputPath}`);
    logger.info("\n📋 Sample icons:");
    logger.info(
      `   ${iconNames.slice(0, CONFIG.SAMPLE_ICONS_COUNT).join(", ")}, ...`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error(`Error generating icons from lucide-react: ${errorMessage}`);

    if (error instanceof Error && error.stack) {
      process.stderr.write(`\n${error.stack}\n`);
    }

    process.exit(1);
  }
}

// Execute main function
generateLucideIcons();
