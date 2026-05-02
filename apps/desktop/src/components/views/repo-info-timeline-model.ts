import type { GitTimelineRow } from "@/components/views/git-graph-layout";
import type {
  RepositoryCommit,
  RepositoryStash,
} from "@/stores/repo/repo-store-types";

export const WORKING_TREE_ROW_ID = "__working_tree__";

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;

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

function normalizeCommitRefLabel(rawReference: string): string | null {
  const trimmedReference = rawReference.trim();

  if (trimmedReference.length === 0) {
    return null;
  }

  const headSeparatorIndex = trimmedReference.indexOf("->");

  if (headSeparatorIndex >= 0) {
    const targetReference = trimmedReference
      .slice(headSeparatorIndex + 2)
      .trim();

    return targetReference.length > 0 ? targetReference : null;
  }

  if (trimmedReference.startsWith("tag: ")) {
    const tagName = trimmedReference.slice("tag: ".length).trim();
    return tagName.length > 0 ? tagName : null;
  }

  if (trimmedReference === "HEAD") {
    return null;
  }

  return trimmedReference;
}

function resolveTagNameFromCommitRef(rawReference: string): string | null {
  const trimmedReference = rawReference.trim();

  if (!trimmedReference.startsWith("tag: ")) {
    return null;
  }

  return normalizeCommitRefLabel(trimmedReference);
}

function formatStashLabel(stash: RepositoryStash): string {
  const rawMessage = stash.message.trim();

  if (rawMessage.length === 0) {
    return stash.ref;
  }

  const parsedMessage = STASH_WITH_BRANCH_PATTERN.exec(rawMessage);

  if (!parsedMessage) {
    return rawMessage;
  }

  const branchName = parsedMessage[1]?.trim();
  const stashMessage = parsedMessage[2]?.trim();

  if (!branchName) {
    return rawMessage;
  }

  if (stashMessage && stashMessage.length > 0) {
    return `${stashMessage} on: ${branchName}`;
  }

  return rawMessage;
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
