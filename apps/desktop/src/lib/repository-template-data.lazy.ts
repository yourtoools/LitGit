import type { RepositoryTemplateOption } from "@/stores/repo/repo-store-types";

interface SpdxLicenseRecord {
  licenseText: string;
  name: string;
  osiApproved: boolean;
  url: string;
}

const githubSupportedLicenses = {
  "AGPL-3.0": "GNU Affero General Public License v3.0",
  "Apache-2.0": "Apache License 2.0",
  "BSD-2-Clause": 'BSD 2-Clause "Simplified" License',
  "BSD-3-Clause": 'BSD 3-Clause "New" or "Revised" License',
  "BSL-1.0": "Boost Software License 1.0",
  "CC0-1.0": "Creative Commons Zero v1.0 Universal",
  "EPL-2.0": "Eclipse Public License 2.0",
  "GPL-2.0": "GNU General Public License v2.0",
  "GPL-3.0": "GNU General Public License v3.0",
  "LGPL-2.1": "GNU Lesser General Public License v2.1",
  MIT: "MIT License",
  "MPL-2.0": "Mozilla Public License 2.0",
  Unlicense: "The Unlicense",
} as const;

const githubSupportedLicenseIds = new Set<string>(
  Object.keys(githubSupportedLicenses)
);

const preferredLicenseKeys = new Set<string>([
  "MIT",
  "Apache-2.0",
  "GPL-3.0",
  "BSD-3-Clause",
  "BSD-2-Clause",
  "MPL-2.0",
  "LGPL-2.1",
  "AGPL-3.0",
  "CC0-1.0",
  "Unlicense",
  "BSL-1.0",
  "EPL-2.0",
  "GPL-2.0",
]);

export interface RepositoryTemplates {
  gitignoreContents: Record<string, string>;
  gitignoreOptions: RepositoryTemplateOption[];
  licenseContents: Record<string, string>;
  licenseOptions: RepositoryTemplateOption[];
}

let repositoryTemplatesPromise: Promise<RepositoryTemplates> | null = null;

/**
 * Lazy load gitignore templates (78KB)
 * Only loaded when user opens "Start Local Repository" dialog
 */
async function loadGitignoreTemplates() {
  const module = await import("@/lib/generated/gitignore-templates");

  const gitignoreOptions: RepositoryTemplateOption[] =
    module.gitignoreTemplateOptions
      .filter((option) => !option.key.startsWith("Global/"))
      .map((option) => ({
        key: option.key,
        label: option.label,
      }));

  const gitignoreContents: Record<string, string> =
    module.gitignoreTemplateContents;

  return { gitignoreOptions, gitignoreContents };
}

/**
 * Lazy load SPDX license database (~3-4MB!)
 * Only loaded when user opens "Start Local Repository" dialog
 */
async function loadLicenseTemplates() {
  const spdxLicenseListFull = await import("spdx-license-list/full");

  const rawLicenseEntries = Object.entries(
    spdxLicenseListFull.default as Record<string, SpdxLicenseRecord>
  );

  const sortedLicenseEntries = rawLicenseEntries
    .filter(
      ([key, license]) =>
        githubSupportedLicenseIds.has(key) &&
        license.licenseText.trim().length > 0
    )
    .sort(([leftKey, leftLicense], [rightKey, rightLicense]) => {
      const leftPreferred = preferredLicenseKeys.has(leftKey);
      const rightPreferred = preferredLicenseKeys.has(rightKey);

      if (leftPreferred !== rightPreferred) {
        return leftPreferred ? -1 : 1;
      }

      if (leftLicense.osiApproved !== rightLicense.osiApproved) {
        return leftLicense.osiApproved ? -1 : 1;
      }

      return leftLicense.name.localeCompare(rightLicense.name);
    });

  const licenseOptions: RepositoryTemplateOption[] = sortedLicenseEntries.map(
    ([key, license]) => ({
      description: license.osiApproved ? "OSI Approved" : undefined,
      key,
      label:
        githubSupportedLicenses[key as keyof typeof githubSupportedLicenses],
    })
  );

  const licenseContents: Record<string, string> = Object.fromEntries(
    sortedLicenseEntries.map(([key, license]) => [key, license.licenseText])
  );

  return { licenseOptions, licenseContents };
}

/**
 * Load all repository templates on-demand
 * This prevents ~3.5MB from being bundled into the vendor chunk
 */
export function loadRepositoryTemplates(): Promise<RepositoryTemplates> {
  if (!repositoryTemplatesPromise) {
    repositoryTemplatesPromise = Promise.all([
      loadGitignoreTemplates(),
      loadLicenseTemplates(),
    ]).then(([gitignore, license]) => ({
      gitignoreOptions: gitignore.gitignoreOptions,
      gitignoreContents: gitignore.gitignoreContents,
      licenseOptions: license.licenseOptions,
      licenseContents: license.licenseContents,
    }));
  }

  return repositoryTemplatesPromise;
}
