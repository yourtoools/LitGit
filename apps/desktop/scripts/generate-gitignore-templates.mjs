import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(appRoot, "src", "lib", "generated");
const outputFile = path.join(outputDirectory, "gitignore-templates.ts");
const GITIGNORE_SUFFIX_REGEX = /\.gitignore$/;

const gitignorePackageJsonPath = require.resolve(
  "gitignore-templates/package.json",
  {
    paths: [appRoot],
  }
);
const gitignoreRoot = path.join(
  path.dirname(gitignorePackageJsonPath),
  "gitignore"
);

async function collectGitignoreFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectGitignoreFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".gitignore")) {
      files.push(entryPath);
    }
  }

  return files;
}

function toTemplateKey(filePath) {
  return path
    .relative(gitignoreRoot, filePath)
    .replace(/\\/g, "/")
    .replace(GITIGNORE_SUFFIX_REGEX, "");
}

function toTemplateLabel(templateKey) {
  return templateKey;
}

const gitignoreFiles = await collectGitignoreFiles(gitignoreRoot);
const templateEntries = await Promise.all(
  gitignoreFiles
    .filter((filePath) => !toTemplateKey(filePath).startsWith("Global/"))
    .map(async (filePath) => {
      const key = toTemplateKey(filePath);
      const content = await readFile(filePath, "utf8");

      return {
        content,
        key,
        label: toTemplateLabel(key),
      };
    })
);

templateEntries.sort((left, right) => left.label.localeCompare(right.label));

const options = templateEntries.map(({ key, label }) => ({ key, label }));
const contents = Object.fromEntries(
  templateEntries.map(({ key, content }) => [key, content])
);

const fileContents = `export const gitignoreTemplateOptions = ${JSON.stringify(options, null, 2)} as const;\n\nexport const gitignoreTemplateContents = ${JSON.stringify(contents, null, 2)} as const;\n`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, fileContents, "utf8");

console.log(
  `Generated ${templateEntries.length} gitignore templates at ${outputFile}`
);
