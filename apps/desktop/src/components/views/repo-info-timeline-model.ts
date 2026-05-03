import type { GitTimelineRow } from "@/components/views/git-graph-layout";
import {
  formatStashLabel,
  resolveTagNameFromCommitRef,
} from "@/components/views/repo-info-reference-labels";
import type {
  RepositoryCommit,
  RepositoryStash,
} from "@/stores/repo/repo-store-types";

export const WORKING_TREE_ROW_ID = "__working_tree__";

interface TimelineReferenceRowData {
  anchorCommitHash: string;
  id: string;
  label: string;
  type: "stash" | "tag";
}

export interface BuildRepoInfoTimelineRowsInput {
  hasAnyWorkingTreeChanges: boolean;
  hiddenSidebarGraphEntryKeys: Record<string, boolean>;
  localHeadCommitHash: null | string;
  stashes: RepositoryStash[];
  timelineCommits: RepositoryCommit[];
  wipAuthorAvatarUrl: null | string;
  wipAuthorName: string;
}

export function buildRepoInfoTimelineRows(
  input: BuildRepoInfoTimelineRowsInput
): GitTimelineRow[] {
  const {
    hasAnyWorkingTreeChanges,
    hiddenSidebarGraphEntryKeys,
    localHeadCommitHash,
    stashes,
    timelineCommits,
    wipAuthorAvatarUrl,
    wipAuthorName,
  } = input;
  const rowsByCommitHash = new Map<string, TimelineReferenceRowData[]>();
  const commitHashSet = new Set(timelineCommits.map((commit) => commit.hash));
  const seenStashRefs = new Set<string>();
  const seenTagNames = new Set<string>();

  for (const stash of stashes) {
    if (
      seenStashRefs.has(stash.ref) ||
      !commitHashSet.has(stash.anchorCommitHash)
    ) {
      continue;
    }

    seenStashRefs.add(stash.ref);
    const existingRows = rowsByCommitHash.get(stash.anchorCommitHash) ?? [];
    existingRows.push({
      anchorCommitHash: stash.anchorCommitHash,
      id: `stash:${stash.ref}`,
      label: formatStashLabel(stash),
      type: "stash",
    });
    rowsByCommitHash.set(stash.anchorCommitHash, existingRows);
  }

  for (const commit of timelineCommits) {
    const tagNames = new Set<string>();

    for (const rawReference of commit.refs) {
      const tagName = resolveTagNameFromCommitRef(rawReference);

      if (!tagName) {
        continue;
      }

      tagNames.add(tagName);
    }

    for (const tagName of tagNames) {
      if (seenTagNames.has(tagName)) {
        continue;
      }

      seenTagNames.add(tagName);
      const existingRows = rowsByCommitHash.get(commit.hash) ?? [];
      existingRows.push({
        anchorCommitHash: commit.hash,
        id: `tag:${tagName}`,
        label: tagName,
        type: "tag",
      });
      rowsByCommitHash.set(commit.hash, existingRows);
    }
  }

  const rows: GitTimelineRow[] = [];

  if (hasAnyWorkingTreeChanges) {
    rows.push({
      anchorCommitHash: localHeadCommitHash ?? undefined,
      author: wipAuthorName,
      authorAvatarUrl: wipAuthorAvatarUrl,
      id: WORKING_TREE_ROW_ID,
      type: "wip",
    });
  }

  for (const commit of timelineCommits) {
    const referenceRows = rowsByCommitHash.get(commit.hash) ?? [];

    for (const referenceRow of referenceRows) {
      if (referenceRow.type === "stash") {
        const stashRef = referenceRow.id.slice("stash:".length);

        if (hiddenSidebarGraphEntryKeys[`stash:${stashRef}`] === true) {
          continue;
        }
      }

      if (
        referenceRow.type === "tag" &&
        referenceRow.label &&
        hiddenSidebarGraphEntryKeys[`tag:${referenceRow.label}`] === true
      ) {
        continue;
      }

      rows.push({
        anchorCommitHash: referenceRow.anchorCommitHash,
        id: referenceRow.id,
        label: referenceRow.label,
        type: referenceRow.type,
      });
    }

    rows.push({
      author: commit.author,
      authorAvatarUrl: commit.authorAvatarUrl,
      commitHash: commit.hash,
      id: commit.hash,
      syncState: commit.syncState,
      type: "commit",
    });
  }

  return rows;
}
