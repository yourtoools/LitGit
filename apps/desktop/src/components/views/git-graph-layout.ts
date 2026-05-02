import type { RepositoryCommitSyncState } from "@/stores/repo/repo-store-types";

export interface GitTimelineRow {
  anchorCommitHash?: string;
  author?: string;
  authorAvatarUrl?: string | null;
  commitHash?: string;
  id: string;
  label?: string;
  syncState?: RepositoryCommitSyncState;
  type: "commit" | "stash" | "tag" | "wip";
}

export const TIMELINE_BRANCH_COLUMN_WIDTH = 180;
