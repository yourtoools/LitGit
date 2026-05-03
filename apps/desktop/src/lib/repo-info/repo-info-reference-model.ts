import type { GitTimelineRow } from "@/lib/git-graph/git-graph-layout";
import {
  formatStashLabel,
  normalizeCommitRefLabel,
} from "@/lib/repo-info/repo-info-reference-labels";
import type { SidebarEntry } from "@/lib/repo-info/repo-info-sidebar-model";
import type {
  RepositoryBranch,
  RepositoryCommit,
  RepositoryStash,
} from "@/stores/repo/repo-store-types";

function createSidebarEntryFromRefName(
  referenceName: string,
  branches: RepositoryBranch[],
  currentBranch: string
): SidebarEntry {
  const matchingBranch = branches.find(
    (branch) => branch.name === referenceName
  );

  if (matchingBranch) {
    return {
      active: matchingBranch.isCurrent,
      isRemote: matchingBranch.isRemote,
      name: matchingBranch.name,
      searchName: matchingBranch.name.toLowerCase(),
      type: matchingBranch.refType === "tag" ? "tag" : "branch",
    };
  }

  return {
    active: referenceName === currentBranch,
    isRemote: referenceName.includes("/"),
    name: referenceName,
    searchName: referenceName.toLowerCase(),
    type: "branch",
  };
}

export interface BuildRepoInfoReferenceModelInput {
  branches: RepositoryBranch[];
  currentBranch: string;
  stashes: RepositoryStash[];
  timelineCommits: RepositoryCommit[];
  timelineRows: GitTimelineRow[];
}

export interface RepoInfoReferenceModel {
  commitHashByEntryKey: Record<string, string>;
  commitRefEntriesByCommitHash: Record<string, SidebarEntry[]>;
  graphEntryTypeByReferenceName: Record<string, "branch" | "tag">;
  sidebarEntryByTimelineRowId: Record<string, SidebarEntry>;
  timelineRowIdByEntryKey: Record<string, string>;
}

export function buildRepoInfoReferenceModel(
  input: BuildRepoInfoReferenceModelInput
): RepoInfoReferenceModel {
  const { branches, currentBranch, stashes, timelineCommits, timelineRows } =
    input;
  const commitHashByEntryKey: Record<string, string> = {};
  const commitRefEntriesByCommitHash: Record<string, SidebarEntry[]> = {};
  const graphEntryTypeByReferenceName: Record<string, "branch" | "tag"> = {};
  const sidebarEntryByTimelineRowId: Record<string, SidebarEntry> = {};
  const timelineRowIdByEntryKey: Record<string, string> = {};

  for (const branch of branches) {
    if (branch.refType === "branch" || branch.refType === "tag") {
      graphEntryTypeByReferenceName[branch.name] =
        branch.refType === "tag" ? "tag" : "branch";
    }
  }

  for (const stash of stashes) {
    const entryKey = `stash:${stash.ref}`;
    commitHashByEntryKey[entryKey] = stash.anchorCommitHash;
  }

  for (const row of timelineRows) {
    if (row.type === "stash") {
      const stashRef = row.id.slice("stash:".length);
      const stash = stashes.find((item) => item.ref === stashRef);

      if (!stash) {
        continue;
      }

      const entry = {
        name: formatStashLabel(stash),
        searchName: formatStashLabel(stash).toLowerCase(),
        stashMessage: stash.message,
        stashRef: stash.ref,
        type: "stash",
      } satisfies SidebarEntry;
      sidebarEntryByTimelineRowId[row.id] = entry;
      timelineRowIdByEntryKey[`stash:${stash.ref}`] = row.id;
      continue;
    }

    if (row.type === "tag" && row.label) {
      const entry = {
        active: false,
        name: row.label,
        searchName: row.label.toLowerCase(),
        type: "tag",
      } satisfies SidebarEntry;
      sidebarEntryByTimelineRowId[row.id] = entry;
      timelineRowIdByEntryKey[`tag:${row.label}`] = row.id;
    }
  }

  for (const commit of timelineCommits) {
    const uniqueEntries = new Map<string, SidebarEntry>();

    for (const rawReference of commit.refs) {
      const normalizedReference = normalizeCommitRefLabel(rawReference);

      if (!normalizedReference) {
        continue;
      }

      const entry = createSidebarEntryFromRefName(
        normalizedReference,
        branches,
        currentBranch
      );
      const key = `${entry.type}:${entry.name}`;

      if (!uniqueEntries.has(key)) {
        uniqueEntries.set(key, entry);
      }

      if (!(key in commitHashByEntryKey)) {
        commitHashByEntryKey[key] = commit.hash;
      }
    }

    commitRefEntriesByCommitHash[commit.hash] = Array.from(
      uniqueEntries.values()
    );
  }

  return {
    commitHashByEntryKey,
    commitRefEntriesByCommitHash,
    graphEntryTypeByReferenceName,
    sidebarEntryByTimelineRowId,
    timelineRowIdByEntryKey,
  };
}
