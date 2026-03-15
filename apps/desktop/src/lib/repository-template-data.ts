import spdxLicenseListFull from "spdx-license-list/full";
import {
  gitignoreTemplateContents,
  gitignoreTemplateOptions,
} from "@/lib/generated/gitignore-templates";
import type { RepositoryTemplateOption } from "@/stores/repo/use-repo-store";

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

const rawLicenseEntries = Object.entries(
  spdxLicenseListFull as Record<string, SpdxLicenseRecord>
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

export const localGitignoreTemplateOptions: RepositoryTemplateOption[] =
  gitignoreTemplateOptions
    .filter((option) => !option.key.startsWith("Global/"))
    .map((option) => ({
      key: option.key,
      label: option.label,
    }));

export const localGitignoreTemplateContents: Record<string, string> =
  gitignoreTemplateContents;

export const localLicenseTemplateOptions: RepositoryTemplateOption[] =
  sortedLicenseEntries.map(([key, license]) => ({
    description: license.osiApproved ? "OSI Approved" : undefined,
    key,
    label: githubSupportedLicenses[key as keyof typeof githubSupportedLicenses],
  }));

export const localLicenseTemplateContents: Record<string, string> =
  Object.fromEntries(
    sortedLicenseEntries.map(([key, license]) => [key, license.licenseText])
  );
