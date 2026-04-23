import type { MergeView } from "@codemirror/merge";
import { goToNextChunk, goToPreviousChunk } from "@codemirror/merge";
import type { EditorView } from "@codemirror/view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@litgit/ui/components/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@litgit/ui/components/avatar";
import { Button } from "@litgit/ui/components/button";
import { Checkbox } from "@litgit/ui/components/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import { Separator } from "@litgit/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@litgit/ui/components/sidebar";
import { Antigravity } from "@litgit/ui/components/svgs/antigravity";
import { Bash } from "@litgit/ui/components/svgs/bash";
import { Cursor } from "@litgit/ui/components/svgs/cursor";
import { CursorDark } from "@litgit/ui/components/svgs/cursor-dark";
import { Linux } from "@litgit/ui/components/svgs/linux";
import { Powershell } from "@litgit/ui/components/svgs/powershell";
import { VisualStudio } from "@litgit/ui/components/svgs/visual-studio";
import { Vscode } from "@litgit/ui/components/svgs/vscode";
import { Textarea } from "@litgit/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CloudIcon,
  CopyIcon,
  DesktopIcon,
  DotOutlineIcon,
  DotsThreeVerticalIcon,
  EyeIcon,
  EyeSlashIcon,
  GearIcon,
  GitBranchIcon,
  GithubLogoIcon,
  LaptopIcon,
  MinusIcon,
  PencilSimpleIcon,
  PlusIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  SparkleIcon,
  SpinnerGapIcon,
  StackSimpleIcon,
  TagIcon,
  TerminalWindowIcon,
  TrashIcon,
  TrayArrowDownIcon,
  TrayArrowUpIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useSearch } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { intlFormat } from "date-fns";
import { useTheme } from "next-themes";
import {
  Fragment,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { resolveLanguage } from "@/components/code-editor/utils/language-resolver";
import { IntegratedTerminalPanel } from "@/components/terminal/integrated-terminal-panel";
import {
  type GitTimelineRow,
  getCommitLaneColor,
  resolveGitGraphColumnWidth,
  TIMELINE_BRANCH_COLUMN_WIDTH,
} from "@/components/views/git-graph-layout";
import {
  type DiffPreviewPanelState,
  resolveDiffPreviewUiState,
  shouldMountMonaco,
} from "@/components/views/repo-info/diff-preview-state";
import { DiffPreviewSurface } from "@/components/views/repo-info/diff-preview-surface";
import {
  DEFAULT_DIFF_WORKSPACE_ENCODING,
  DIFF_WORKSPACE_ENCODING_OPTIONS,
  DIFF_WORKSPACE_GUESS_ENCODING_VALUE,
  isDiffWorkspaceTextEncodingUnsupported,
  resolveDiffWorkspaceEncodingValue,
  resolveDiffWorkspaceRequestedEncoding,
} from "@/components/views/repo-info/diff-workspace-encoding";
import {
  resolvePresentationForViewerKind,
  resolveToolbarControlState,
} from "@/components/views/repo-info/diff-workspace-state";
import { DiffWorkspaceToolbar } from "@/components/views/repo-info/diff-workspace-toolbar";
import {
  DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION,
  DEFAULT_DIFF_WORKSPACE_MODE,
  DEFAULT_DIFF_WORKSPACE_PRESENTATION,
  type DiffWorkspaceFilePresentationMode,
  type DiffWorkspaceMode,
  type DiffWorkspacePresentationMode,
} from "@/components/views/repo-info/diff-workspace-types";
import { ImageDiffViewer } from "@/components/views/repo-info/image-diff-viewer";
import { PublishRepositoryDialog } from "@/components/views/repo-info/publish-repository-dialog";
import {
  finalizeAiCommitGenerationState,
  getNextAiCommitGenerationState,
} from "@/components/views/repo-info-ai-commit-generation-state";
import {
  type BuildRepoInfoAllFilesModelInput,
  buildRepoInfoAllFilesModel,
} from "@/components/views/repo-info-all-files-model";
import { resolveWipAuthorAvatarUrl } from "@/components/views/repo-info-author-avatar";
import {
  type BuildRepoInfoCommitFilesModelInput,
  buildRepoInfoCommitFilesModel,
} from "@/components/views/repo-info-commit-files-model";
import {
  createRenderBudget,
  type RenderBudget,
  useProgressiveRenderLimit,
} from "@/components/views/repo-info-progressive-render";
import {
  type BuildRepoInfoReferenceModelInput,
  buildRepoInfoReferenceModel,
} from "@/components/views/repo-info-reference-model";
import {
  type BranchTreeNode,
  type BuildRepoInfoSidebarGroupsInput,
  buildRepoInfoSidebarGroups,
  type SidebarEntry,
} from "@/components/views/repo-info-sidebar-model";
import {
  type BuildRepoInfoTimelineRowsInput,
  buildRepoInfoTimelineRows,
  WORKING_TREE_ROW_ID,
} from "@/components/views/repo-info-timeline-model";
import {
  type ChangeTreeNode,
  type CommitFileTreeNode,
  collectCommitTreeChangeSummary as collectCommitTreeChangeSummaryModel,
  collectExpandableCommitTreeKeys as collectExpandableCommitTreeKeysModel,
  collectExpandableTreeKeys as collectExpandableTreeKeysModel,
  collectTreeStatusCounts as collectTreeStatusCountsModel,
} from "@/components/views/repo-info-tree-utils";
import {
  type BuildRepoInfoVisibleCountsModelInput,
  buildRepoInfoVisibleCountsModel,
} from "@/components/views/repo-info-visible-counts-model";
import {
  type BuildRepoInfoVisibleGraphModelInput,
  buildRepoInfoVisibleGraphModel,
} from "@/components/views/repo-info-visible-graph-model";
import {
  type BuildRepoInfoWorkingTreeModelInput,
  buildRepoInfoWorkingTreeModel,
} from "@/components/views/repo-info-working-tree-model";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { getRuntimePlatform } from "@/lib/runtime-platform";
import { getRepositoryRemoteAvatars } from "@/lib/tauri-repo-client";
import {
  type ExternalLauncherApp,
  type ExternalLauncherApplication,
  getLauncherApplications,
  openPathWithApplication,
} from "@/lib/tauri-settings-client";
import { createWorkerClient } from "@/lib/workers/create-worker-client";
import { runWorkerTask } from "@/lib/workers/run-worker-task";
import {
  DEFAULT_REPO_FILE_BROWSER_STATE,
  DEFAULT_REPO_TIMELINE_PREFERENCES,
  type RepoFileBrowserSortOrder,
  type RepoTimelineColumnId,
  type RepoTimelinePreferences,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import {
  useRepoActions,
  useRepoActiveContext,
  useRepoBranches,
  useRepoCommitDraftPrefill,
  useRepoCommits,
  useRepoFiles,
  useRepoGitIdentity,
  useRepoHistoryGraph,
  useRepoHistoryRewriteHint,
  useRepoLoadingState,
  useRepoRedoDepth,
  useRepoRedoLabel,
  useRepoRefreshStatus,
  useRepoRemoteNames,
  useRepoStashes,
  useRepoUndoDepth,
  useRepoUndoLabel,
  useRepoWorkingTreeItems,
} from "@/stores/repo/repo-selectors";
import { resolveHeadCommit } from "@/stores/repo/repo-store.helpers";
import type {
  MergeActionMode,
  PublishRepositoryOptions,
  PullActionMode,
  RepositoryCommit,
  RepositoryCommitFile,
  RepositoryCommitFileDiff,
  RepositoryFileBlameLine,
  RepositoryFileDiff,
  RepositoryFileHistoryEntry,
  RepositoryFileHunk,
  RepositoryFilePreflight,
  RepositoryStash,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

function renderSidebarGroupSectionIcon(groupKey: string): ReactNode {
  if (groupKey === "local") {
    return <LaptopIcon className="size-3" />;
  }

  if (groupKey === "remote") {
    return <CloudIcon className="size-3" />;
  }

  if (groupKey === "stashes") {
    return <StackSimpleIcon className="size-3" />;
  }

  if (groupKey === "tags") {
    return <TagIcon className="size-3" />;
  }

  return null;
}

interface TimelineColumnDefinition {
  align?: "center" | "left";
  id: RepoTimelineColumnId;
  label: string;
  width: string;
}

type ChangesViewMode = "path" | "tree";
type ChangeTreeSection = "all" | "staged" | "unstaged";
type SidebarResizeTarget = "left" | "right";
type DiffPreviewOpenContext =
  | {
      filePath: string;
      item: RepositoryWorkingTreeItem;
      mode: "diff" | "file";
      source: "working";
    }
  | {
      commitHash: string;
      filePath: string;
      mode: "diff" | "file";
      source: "commit";
      status: string;
    };

interface CommitDetailsResizeState {
  startHeight: number;
  startY: number;
}

interface ChangesSectionsResizeState {
  maxHeight: number;
  minHeight: number;
  startHeight: number;
  startY: number;
}

interface WorkingTreeFilesPanelResizeState {
  maxHeight: number;
  minHeight: number;
  startHeight: number;
  startY: number;
}

interface SidebarResizeState {
  startWidth: number;
  startX: number;
  target: SidebarResizeTarget;
}

const LEFT_SIDEBAR_MIN_WIDTH = 220;
const LEFT_SIDEBAR_MAX_WIDTH = 520;
const LEFT_SIDEBAR_DEFAULT_WIDTH = 256;
const RIGHT_SIDEBAR_MIN_WIDTH = 280;
const RIGHT_SIDEBAR_MAX_WIDTH = 720;
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;
const COMMIT_DETAILS_PANEL_MIN_HEIGHT = 96;
const COMMIT_DETAILS_PANEL_DEFAULT_HEIGHT = 96;
const COMMIT_DETAILS_PANEL_MAX_HEIGHT = 160;
const CHANGES_SECTIONS_MIN_HEIGHT = 64;
const CHANGES_SECTIONS_DEFAULT_HEIGHT = 144;
const WORKING_TREE_FILES_PANEL_MIN_HEIGHT = 120;
const WORKING_TREE_FILES_PANEL_RESIZE_HANDLE_HEIGHT = 6;
const HORIZONTAL_RESIZE_HANDLE_WIDTH = 6;
const MIN_TIMELINE_CONTENT_WIDTH = 560;
const COMMIT_MESSAGE_LIST_MARKER_PATTERN = /^[-*•]\s*/;
const FILE_FILTER_DEBOUNCE_MS = 500;
const SIDEBAR_FILTER_DEBOUNCE_MS = 500;
const SIDEBAR_TREE_BASE_PADDING_REM = 0.5;
const SIDEBAR_TREE_DEPTH_PADDING_REM = 0.55;
const COMMIT_DIFF_CACHE_LIMIT = 32;
const DIFF_WORKSPACE_PAYLOAD_CACHE_LIMIT = 64;
const FILE_HISTORY_LIMIT = 200;
const UNSUPPORTED_ENCODING_MESSAGE =
  "Encoding not supported. Reopen with another encoding.";

function readCachedValue<T>(cache: Map<string, T>, key: string): T | null {
  return cache.get(key) ?? null;
}

function writeCachedValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number
) {
  cache.set(key, value);

  if (cache.size <= limit) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (typeof oldestKey === "string") {
    cache.delete(oldestKey);
  }
}

const LazyDiffWorkspaceHistorySurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-workspace-history-surface"
  );

  return {
    default: module.DiffWorkspaceHistorySurface,
  };
});

const LazyDiffWorkspaceBlameSurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-workspace-blame-surface"
  );

  return {
    default: module.DiffWorkspaceBlameSurface,
  };
});

const LazyDiffWorkspaceMarkdownPreviewSurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-workspace-markdown-preview-surface"
  );

  return {
    default: module.DiffWorkspaceMarkdownPreviewSurface,
  };
});

const LazyDiffWorkspaceHunkSurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-workspace-hunk-surface"
  );

  return {
    default: module.DiffWorkspaceHunkSurface,
  };
});

const LazyGitGraphOverlay = lazy(async () => {
  const module = await import("@/components/views/git-graph-overlay");

  return {
    default: module.GitGraphOverlay,
  };
});

// Add these new lazy imports near existing lazy imports
const LazyCodeEditorView = lazy(async () => {
  const module = await import("@/components/code-editor/code-editor");
  return {
    default: (props: React.ComponentProps<typeof module.CodeEditor>) => (
      <module.CodeEditor {...props} />
    ),
  };
});

const LazyCodeEditorDiff = lazy(async () => {
  const module = await import("@/components/code-editor/code-editor");
  return {
    default: (props: React.ComponentProps<typeof module.CodeEditor>) => (
      <module.CodeEditor {...props} />
    ),
  };
});

const LazyCodeEditorEdit = lazy(async () => {
  const module = await import("@/components/code-editor/code-editor");
  return {
    default: (props: React.ComponentProps<typeof module.CodeEditor>) => (
      <module.CodeEditor {...props} />
    ),
  };
});

const GIT_STATUS_STYLE_BY_CODE: Record<
  string,
  { className: string; label: string; short: string }
> = {
  A: {
    className: "text-emerald-700 dark:text-emerald-300",
    label: "Added",
    short: "+",
  },
  C: {
    className: "text-sky-500 dark:text-sky-400",
    label: "Copied",
    short: "C",
  },
  D: {
    className: "text-rose-700 dark:text-rose-300",
    label: "Removed",
    short: "-",
  },
  M: {
    className: "text-amber-700 dark:text-amber-300",
    label: "Edited",
    short: "~",
  },
  R: {
    className: "text-indigo-500 dark:text-indigo-400",
    label: "Renamed",
    short: "R",
  },
  T: {
    className: "text-cyan-500 dark:text-cyan-400",
    label: "Type",
    short: "T",
  },
  U: {
    className: "text-orange-500 dark:text-orange-400",
    label: "Conflict",
    short: "!",
  },
  "?": {
    className: "text-emerald-700 dark:text-emerald-300",
    label: "Added",
    short: "+",
  },
};

function getStatusDescriptor(code: string) {
  return GIT_STATUS_STYLE_BY_CODE[code] ?? null;
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

const TREE_STATUS_SUMMARY_ORDER = ["M", "A", "D", "R", "C", "U", "T", "?"];
const IMAGE_PREVIEWABLE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "avif",
  "svg",
]);
const MARKDOWN_PREVIEWABLE_EXTENSIONS = new Set([
  "markdown",
  "md",
  "mdown",
  "mdx",
  "mkd",
  "mkdn",
]);
const UNSUPPORTED_FILE_ASCII_ART = String.raw`       _____________
      /           /|
     /  FILE     / |
    / UNSUPPORTED/  |
   /___________ /   |
   |   .----.  |    |
   |  / __ \ \ |    |
   | | |  | | ||    |
   | | |__| | ||    |
   |  \____/ / |   /
   |_________/  |  /
   |____________| /`;
const PREVIEW_UNAVAILABLE_ASCII_ART = `       _____________
      /  PREVIEW  /|
     /UNAVAILABLE/ |
    /____________/  |
    |    >15MB   |  |
    |            |  |
    |    [ ! ]   |  |
    |            | /
    |____________|/`;
const EMPTY_ALL_FILES_MODEL = {
  allFilesTree: [],
  filteredRepositoryFiles: [],
} satisfies ReturnType<typeof buildRepoInfoAllFilesModel>;
const EMPTY_COMMIT_FILES_MODEL = {
  filteredFiles: [],
  sortedPathRows: [],
  summary: {
    addedCount: 0,
    modifiedCount: 0,
    removedCount: 0,
    totalCount: 0,
  },
  tree: [],
} satisfies ReturnType<typeof buildRepoInfoCommitFilesModel>;
const EMPTY_REFERENCE_MODEL = {
  commitHashByEntryKey: {},
  commitRefEntriesByCommitHash: {},
  graphEntryTypeByReferenceName: {},
  sidebarEntryByTimelineRowId: {},
  timelineRowIdByEntryKey: {},
} satisfies ReturnType<typeof buildRepoInfoReferenceModel>;
const EMPTY_SIDEBAR_RESULTS = {
  filteredSidebarEntryCount: 0,
  filteredSidebarGroups: [],
} satisfies ReturnType<typeof buildRepoInfoSidebarGroups>;
const EMPTY_VISIBLE_COUNTS_MODEL = {
  allFilesVisibleNodeCount: 0,
  selectedCommitVisibleNodeCount: 0,
  selectedReferenceVisibleNodeCount: 0,
  sidebarVisibleNodeCount: 0,
  stagedVisibleNodeCount: 0,
  unstagedVisibleNodeCount: 0,
} satisfies ReturnType<typeof buildRepoInfoVisibleCountsModel>;
const EMPTY_VISIBLE_GRAPH_MODEL = {
  currentBranchLaneColor: "",
  visibleHistoryGraph: {
    commitLanes: {},
    graphWidth: 0,
  },
} satisfies ReturnType<typeof buildRepoInfoVisibleGraphModel>;
const EMPTY_WORKING_TREE_MODEL = {
  stagedTree: [],
  unstagedTree: [],
} satisfies ReturnType<typeof buildRepoInfoWorkingTreeModel>;

const LAUNCHER_ICON_CLASS = "size-[15px] shrink-0";

function ExplorerIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(LAUNCHER_ICON_CLASS, className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3 7.25h8.1l1.4 1.6H21v8.9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10.5Z"
        fill="#FFD54F"
      />
      <path
        d="M3 8.25a2 2 0 0 1 2-2h5.55l1.4 1.6H19a2 2 0 0 1 2 2v.4H3v-2Z"
        fill="#64B5F6"
      />
      <path
        d="M3 10.25h18l-1.38 6.08a2 2 0 0 1-1.95 1.56H5.33a2 2 0 0 1-1.95-1.56L3 10.25Z"
        fill="#FFCA28"
      />
    </svg>
  );
}

function LauncherItemIcon({
  application,
  className,
}: {
  application: ExternalLauncherApplication;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();

  switch (application) {
    case "file-manager":
      return <ExplorerIcon className={className} />;
    case "terminal":
      return <Powershell className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "vscode":
      return <Vscode className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "cursor":
      if (resolvedTheme === "dark") {
        return <CursorDark className={cn(LAUNCHER_ICON_CLASS, className)} />;
      }
      return <Cursor className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "visual-studio":
      return <VisualStudio className={cn(LAUNCHER_ICON_CLASS, className)} />;

    case "antigravity":
      return <Antigravity className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "git-bash":
      return <Bash className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "wsl":
      return <Linux className={cn(LAUNCHER_ICON_CLASS, className)} />;
    default:
      return <ExplorerIcon className={className} />;
  }
}

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;
const STASH_MESSAGE_SECTION_BREAK_PATTERN = /\r?\n\r?\n/;
const FILE_EXTENSION_PATTERN = /\.([a-z0-9]+)$/i;
const TIMELINE_ROW_HEIGHT = 36;
const TIMELINE_GRAPH_COLUMN_MIN_WIDTH = 60;
const TIMELINE_GRAPH_COLUMN_MAX_WIDTH = 320;
const TIMELINE_COMMIT_MESSAGE_BAR_WIDTH = 3;
const TIMELINE_COMMIT_MESSAGE_BAR_GAP = 8;
const TIMELINE_AUTO_COMPACT_BREAKPOINT = 1200;
const TIMELINE_AUTHOR_COLUMN_WIDTH = 160;
const TIMELINE_DATE_TIME_COLUMN_WIDTH = 190;
const TIMELINE_SHA_COLUMN_WIDTH = 110;
const TIMELINE_COLUMN_ORDER: RepoTimelineColumnId[] = [
  "branch",
  "graph",
  "commitMessage",
  "author",
  "dateTime",
  "sha",
];
const TIMELINE_COMPACT_LAYOUT_PREFERENCES: RepoTimelinePreferences = {
  compactGraph: true,
  smartBranchVisibility: true,
  visibleColumns: DEFAULT_REPO_TIMELINE_PREFERENCES.visibleColumns,
};

type DiffEditorInstance = EditorView | MergeView;

function isEditorViewInstance(
  value: DiffEditorInstance | null
): value is EditorView {
  return value !== null && "dispatch" in value && "state" in value;
}

function isMergeViewInstance(
  value: DiffEditorInstance | null
): value is MergeView {
  return value !== null && "a" in value && "b" in value;
}

function navigateDiffEditor(
  editor: DiffEditorInstance | null,
  direction: "next" | "previous"
): void {
  const command = direction === "next" ? goToNextChunk : goToPreviousChunk;

  if (isMergeViewInstance(editor)) {
    command({
      dispatch: editor.a.dispatch,
      state: editor.a.state,
    });
    editor.a.focus();
    return;
  }

  if (!isEditorViewInstance(editor)) {
    return;
  }

  command({
    dispatch: editor.dispatch,
    state: editor.state,
  });
  editor.focus();
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

function parseStashDraft(message: string): {
  description: string;
  summary: string;
} {
  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    return {
      description: "",
      summary: "",
    };
  }

  const parsedMessage = STASH_WITH_BRANCH_PATTERN.exec(trimmedMessage);
  const content = parsedMessage?.[2]?.trim() ?? trimmedMessage;

  if (content.length === 0) {
    return {
      description: "",
      summary: "",
    };
  }

  const [summaryLine = "", ...descriptionParts] = content
    .split(STASH_MESSAGE_SECTION_BREAK_PATTERN)
    .map((part) => part.trim());

  return {
    description: descriptionParts.join("\n\n").trim(),
    summary: summaryLine.trim(),
  };
}

function resolveFileExtension(filePath: string): string | null {
  const normalizedPath = filePath.toLowerCase();
  const extension = FILE_EXTENSION_PATTERN.exec(normalizedPath)?.[1] ?? "";

  return extension.length > 0 ? extension : null;
}

function isMarkdownPreviewablePath(filePath: string): boolean {
  const extension = resolveFileExtension(filePath);

  if (!extension) {
    return false;
  }

  return MARKDOWN_PREVIEWABLE_EXTENSIONS.has(extension);
}

function resolveDefaultWorkspacePreviewMode(filePath: string): "diff" | "file" {
  return isMarkdownPreviewablePath(filePath) ? "file" : "diff";
}

function formatUnsupportedExtensionLabel(
  filePath: string,
  unsupportedExtension: string | null
): string {
  const resolvedExtension =
    unsupportedExtension?.trim().toLowerCase() ??
    resolveFileExtension(filePath);

  if (!resolvedExtension) {
    return "This file type is not previewable in File View.";
  }

  return `.${resolvedExtension} is not supported in File View.`;
}

function resolveWorkingTreePreviewStatusCode(
  item: RepositoryWorkingTreeItem | null
): string | null {
  if (item === null) {
    return null;
  }

  if (
    item.isUntracked ||
    item.stagedStatus === "?" ||
    item.unstagedStatus === "?" ||
    item.stagedStatus === "A" ||
    item.unstagedStatus === "A"
  ) {
    return "A";
  }

  if (item.stagedStatus === "D" || item.unstagedStatus === "D") {
    return "D";
  }

  if (item.unstagedStatus !== " ") {
    return item.unstagedStatus;
  }

  if (item.stagedStatus !== " " && item.stagedStatus !== "?") {
    return item.stagedStatus;
  }

  return null;
}

function resolveCommitPreviewStatusCode(status: string): string | null {
  const code = status.trim().charAt(0);

  return code.length > 0 ? code : null;
}

function clampWidth(value: number, min: number, max: number): number {
  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);

  return Math.min(upperBound, Math.max(lowerBound, value));
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const role = target.getAttribute("role");

  if (role === "textbox") {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea";
}

function getLeftSidebarMaxWidth(
  viewportWidth: number,
  rightSidebarWidth: number,
  hasRightSidebar: boolean
): number {
  const rightSectionWidth = hasRightSidebar
    ? rightSidebarWidth + HORIZONTAL_RESIZE_HANDLE_WIDTH
    : 0;
  const availableWidth =
    viewportWidth -
    MIN_TIMELINE_CONTENT_WIDTH -
    HORIZONTAL_RESIZE_HANDLE_WIDTH -
    rightSectionWidth;

  return clampWidth(
    availableWidth,
    LEFT_SIDEBAR_MIN_WIDTH,
    LEFT_SIDEBAR_MAX_WIDTH
  );
}

function getRightSidebarMaxWidth(
  viewportWidth: number,
  leftSidebarWidth: number
): number {
  const availableWidth =
    viewportWidth -
    MIN_TIMELINE_CONTENT_WIDTH -
    HORIZONTAL_RESIZE_HANDLE_WIDTH -
    leftSidebarWidth -
    HORIZONTAL_RESIZE_HANDLE_WIDTH;

  return clampWidth(
    availableWidth,
    RIGHT_SIDEBAR_MIN_WIDTH,
    RIGHT_SIDEBAR_MAX_WIDTH
  );
}

export function RepoInfo() {
  const { activeRepoId, openedRepos } = useRepoActiveContext();
  const {
    addIgnoreRule,
    applyStash,
    checkoutCommit,
    cherryPickCommit,
    clearRepoCommitDraftPrefill,
    commitChanges,
    createBranch,
    createBranchAtReference,
    createStash,
    createTag,
    deleteBranch,
    deleteRemoteBranch,
    discardAllChanges,
    discardPathChanges,
    dropCommit,
    dropStash,
    generateAiCommitMessage,
    getCommitFileContent,
    getCommitFileHunks,
    getCommitFilePreflight,
    getCommitFiles,
    getFileBlame,
    getFileContent,
    getFileDetectedEncoding,
    getFileHistory,
    getFileHunks,
    getFilePreflight,
    getFileText,
    getLatestCommitMessage,
    getRepositoryFiles,
    mergeReference,
    popStash,
    pullBranch,
    pushBranch,
    redoRepoAction,
    renameBranch,
    resetToReference,
    revertCommit,
    rewordCommitMessage,
    saveFileText,
    setBranchUpstream,
    stageAll,
    stageFile,
    switchBranch,
    undoRepoAction,
    unstageAll,
    unstageFile,
  } = useRepoActions();
  const branches = useRepoBranches(activeRepoId);
  const commits = useRepoCommits(activeRepoId);
  const historyGraph = useRepoHistoryGraph(activeRepoId);
  const allRepositoryFiles = useRepoFiles(activeRepoId);
  const activeRepoIdentity = useRepoGitIdentity(activeRepoId);
  const requiresForcePushAfterHistoryRewrite =
    useRepoHistoryRewriteHint(activeRepoId);
  const activeRepoRemoteNames = useRepoRemoteNames(activeRepoId);
  const stashes = useRepoStashes(activeRepoId);
  const workingTreeItems = useRepoWorkingTreeItems(activeRepoId);
  const canUndoAction = useRepoUndoDepth(activeRepoId) > 0;
  const canRedoAction = useRepoRedoDepth(activeRepoId) > 0;
  const undoActionLabel = useRepoUndoLabel(activeRepoId);
  const redoActionLabel = useRepoRedoLabel(activeRepoId);
  const commitDraftPrefill = useRepoCommitDraftPrefill(activeRepoId);
  const { isLoadingBranches, isLoadingHistory, isLoadingStatus, isLoadingWip } =
    useRepoLoadingState();
  useRepoRefreshStatus(activeRepoId);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    Record<string, boolean>
  >({
    local: true,
    remote: true,
    stashes: true,
    tags: true,
  });
  const [remoteAvatarUrlByName, setRemoteAvatarUrlByName] = useState<
    Record<string, string | null>
  >({});
  const [collapsedBranchFolderKeys, setCollapsedBranchFolderKeys] = useState<
    Record<string, boolean>
  >({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [selectedTimelineRowId, setSelectedTimelineRowId] = useState<
    string | null
  >(null);
  const isLeftSidebarOpen = true;
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    LEFT_SIDEBAR_DEFAULT_WIDTH
  );
  const [rightSidebarWidth, setRightSidebarWidth] = useState(
    RIGHT_SIDEBAR_DEFAULT_WIDTH
  );
  const [isTimelineGraphAutoCompact, setIsTimelineGraphAutoCompact] =
    useState(false);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [isBranchCreateInputOpen, setIsBranchCreateInputOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isStagingAll, setIsStagingAll] = useState(false);
  const [isUnstagingAll, setIsUnstagingAll] = useState(false);
  const [isUpdatingFilePath, setIsUpdatingFilePath] = useState<string | null>(
    null
  );
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGeneratingAiCommitMessage, setIsGeneratingAiCommitMessage] =
    useState(false);
  const [aiCommitGenerationStatusMessage, setAiCommitGenerationStatusMessage] =
    useState<string | null>(null);
  const [aiCommitGenerationPreview, setAiCommitGenerationPreview] =
    useState("");
  const aiCommitGenerationStatusMessageRef = useRef<string | null>(null);
  const aiCommitGenerationPreviewRef = useRef("");
  const [lastAiCommitGeneration, setLastAiCommitGeneration] = useState<null | {
    promptMode: string;
    providerKind: string;
    schemaFallbackUsed: boolean;
  }>(null);
  const [isDiscardingAllChanges, setIsDiscardingAllChanges] = useState(false);
  const [isDiscardAllConfirmOpen, setIsDiscardAllConfirmOpen] = useState(false);
  const [isDeleteBranchConfirmOpen, setIsDeleteBranchConfirmOpen] =
    useState(false);
  const [pendingDeleteBranchName, setPendingDeleteBranchName] = useState<
    string | null
  >(null);
  const [pendingDeleteBranchRemoteName, setPendingDeleteBranchRemoteName] =
    useState<string | null>(null);
  const [isDeleteRemoteBranch, setIsDeleteRemoteBranch] = useState(false);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const [isRenameBranchDialogOpen, setIsRenameBranchDialogOpen] =
    useState(false);
  const [renameBranchSourceName, setRenameBranchSourceName] = useState<
    string | null
  >(null);
  const [renameBranchTargetName, setRenameBranchTargetName] = useState("");
  const [isRenamingBranch, setIsRenamingBranch] = useState(false);
  const [isSetUpstreamDialogOpen, setIsSetUpstreamDialogOpen] = useState(false);
  const [setUpstreamLocalBranchName, setSetUpstreamLocalBranchName] = useState<
    string | null
  >(null);
  const [setUpstreamRemoteName, setSetUpstreamRemoteName] = useState("");
  const [setUpstreamRemoteBranchName, setSetUpstreamRemoteBranchName] =
    useState("");
  const [setUpstreamFormError, setSetUpstreamFormError] = useState<
    string | null
  >(null);
  const [isSettingUpstream, setIsSettingUpstream] = useState(false);
  const [isCreateRefBranchDialogOpen, setIsCreateRefBranchDialogOpen] =
    useState(false);
  const [createRefBranchName, setCreateRefBranchName] = useState("");
  const [createRefBranchTarget, setCreateRefBranchTarget] = useState<
    string | null
  >(null);
  const [createRefBranchLabel, setCreateRefBranchLabel] = useState("");
  const [isCreatingRefBranch, setIsCreatingRefBranch] = useState(false);
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
  const [createTagNameValue, setCreateTagNameValue] = useState("");
  const [createTagTarget, setCreateTagTarget] = useState<string | null>(null);
  const [createTagTargetLabel, setCreateTagTargetLabel] = useState("");
  const [createTagAnnotated, setCreateTagAnnotated] = useState(false);
  const [isCreatingTagAtReference, setIsCreatingTagAtReference] =
    useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetTargetLabel, setResetTargetLabel] = useState("");
  const [resetTargetMode, setResetTargetMode] = useState<
    "hard" | "mixed" | "soft"
  >("mixed");
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResettingToReference, setIsResettingToReference] = useState(false);
  const [isForcePushConfirmOpen, setIsForcePushConfirmOpen] = useState(false);
  const [isPublishRepoConfirmOpen, setIsPublishRepoConfirmOpen] =
    useState(false);
  const [publishRepoFormError, setPublishRepoFormError] = useState<
    string | null
  >(null);
  const [isSubmittingPublishRepo, setIsSubmittingPublishRepo] = useState(false);
  const [forcePushConfirmMode, setForcePushConfirmMode] = useState<
    "commit" | "push"
  >("push");
  const [isPulling, setIsPulling] = useState(false);
  const [isRunningMergeAction, setIsRunningMergeAction] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isUndoRedoBusy, setIsUndoRedoBusy] = useState(false);
  const [isApplyingStash, setIsApplyingStash] = useState(false);
  const [isCreatingStash, setIsCreatingStash] = useState(false);
  const [isPoppingStash, setIsPoppingStash] = useState(false);
  const [isDroppingStash, setIsDroppingStash] = useState(false);
  const [isCheckingOutCommit, setIsCheckingOutCommit] = useState(false);
  const [isCherryPickingCommit, setIsCherryPickingCommit] = useState(false);
  const [isRevertingCommit, setIsRevertingCommit] = useState(false);
  const [isEditingSelectedCommitMessage, setIsEditingSelectedCommitMessage] =
    useState(false);
  const [rewordCommitSummary, setRewordCommitSummary] = useState("");
  const [rewordCommitDescription, setRewordCommitDescription] = useState("");
  const [isGeneratingAiRewordMessage, setIsGeneratingAiRewordMessage] =
    useState(false);
  const [lastAiRewordGeneration, setLastAiRewordGeneration] = useState<null | {
    promptMode: string;
    providerKind: string;
    schemaFallbackUsed: boolean;
  }>(null);
  const [isRewordingCommitMessage, setIsRewordingCommitMessage] =
    useState(false);
  const [isDropCommitConfirmOpen, setIsDropCommitConfirmOpen] = useState(false);
  const [pendingDropCommitHash, setPendingDropCommitHash] = useState<
    string | null
  >(null);
  const [pendingDropCommitLabel, setPendingDropCommitLabel] = useState("");
  const [isDroppingCommit, setIsDroppingCommit] = useState(false);
  let resetTargetDescription =
    "Hard reset discards staged and working tree changes after moving HEAD. Use this carefully.";

  if (resetTargetMode === "soft") {
    resetTargetDescription =
      "Move HEAD to the selected commit and keep all staged and working tree changes.";
  } else if (resetTargetMode === "mixed") {
    resetTargetDescription =
      "Move HEAD to the selected commit, keep working tree changes, and unstage them.";
  }
  const [draftCommitSummary, setDraftCommitSummary] = useState("");
  const [draftCommitDescription, setDraftCommitDescription] = useState("");
  const [amendPreviousCommit, setAmendPreviousCommit] = useState(false);
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [skipCommitHooks, setSkipCommitHooks] = useState(false);
  const [isCommitOptionsCollapsed, setIsCommitOptionsCollapsed] =
    useState(true);
  const [commitDetailsViewMode, setCommitDetailsViewMode] =
    useState<ChangesViewMode>("tree");
  const [showAllCommitFiles, setShowAllCommitFiles] = useState(false);
  const [commitDetailsPanelHeight, setCommitDetailsPanelHeight] = useState(
    COMMIT_DETAILS_PANEL_DEFAULT_HEIGHT
  );
  const [workingTreeFilesPanelHeight, setWorkingTreeFilesPanelHeight] =
    useState<number | null>(null);
  const [unstagedSectionHeight, setUnstagedSectionHeight] = useState(
    CHANGES_SECTIONS_DEFAULT_HEIGHT
  );
  const [commitFileFilterInputValue, setCommitFileFilterInputValue] =
    useState("");
  const debouncedCommitFileFilterInputValue = useDebouncedValue(
    commitFileFilterInputValue,
    FILE_FILTER_DEBOUNCE_MS
  );
  const [commitFileSortOrder, setCommitFileSortOrder] =
    useState<RepoFileBrowserSortOrder>("asc");
  const [expandedCommitTreeNodePaths, setExpandedCommitTreeNodePaths] =
    useState<Record<string, boolean>>({});
  const [isLoadingDiffPath, setIsLoadingDiffPath] = useState<string | null>(
    null
  );
  const [diffPreviewPanelState, setDiffPreviewPanelState] =
    useState<DiffPreviewPanelState>({ kind: "idle" });
  const [workspaceMode, setWorkspaceMode] = useState<DiffWorkspaceMode>(
    DEFAULT_DIFF_WORKSPACE_MODE
  );
  const [workspacePresentation, setWorkspacePresentation] =
    useState<DiffWorkspacePresentationMode>(
      DEFAULT_DIFF_WORKSPACE_PRESENTATION
    );
  const [workspaceFilePresentation, setWorkspaceFilePresentation] =
    useState<DiffWorkspaceFilePresentationMode>(
      DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION
    );
  const [ignoreTrimWhitespace, setIgnoreTrimWhitespace] = useState(false);
  const [workspaceEncoding, setWorkspaceEncoding] = useState(
    DEFAULT_DIFF_WORKSPACE_ENCODING
  );
  const [openedDiffContext, setOpenedDiffContext] =
    useState<DiffPreviewOpenContext | null>(null);
  const [hasRequestedDiffSurface, setHasRequestedDiffSurface] = useState(false);
  const [isDiffEditorReady, setIsDiffEditorReady] = useState(false);
  const [hasRequestedFileSurface, setHasRequestedFileSurface] = useState(false);
  const [openedDiff, setOpenedDiff] = useState<RepositoryFileDiff | null>(null);
  const [openedDiffPath, setOpenedDiffPath] = useState<string | null>(null);
  const [openedDiffStatusCode, setOpenedDiffStatusCode] = useState<
    string | null
  >(null);
  const [activeHunks, setActiveHunks] = useState<RepositoryFileHunk[]>([]);
  const [_activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [isLoadingDiffHunks, setIsLoadingHunks] = useState(false);
  const [diffHunksError, setHunkLoadError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<
    RepositoryFileHistoryEntry[]
  >([]);
  const [selectedHistoryCommitHash, setSelectedHistoryCommitHash] = useState<
    string | null
  >(null);
  const [isLoadingFileHistory, setIsLoadingFileHistory] = useState(false);
  const [fileHistoryError, setFileHistoryError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<RepositoryFileBlameLine[]>([]);
  const [isLoadingBlame, setIsLoadingBlame] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const [editInitialBuffer, setEditInitialBuffer] = useState("");
  const [isLoadingEditBuffer, setIsLoadingEditBuffer] = useState(false);
  const [isSavingEditBuffer, setIsSavingEditBuffer] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [pendingWorkspaceMode, setPendingWorkspaceMode] =
    useState<DiffWorkspaceMode | null>(null);
  const [pendingOpenDiffContext, setPendingOpenDiffContext] =
    useState<DiffPreviewOpenContext | null>(null);
  const [pendingCloseDiffPanel, setPendingCloseDiffPanel] = useState(false);
  const [isUnsavedEditConfirmOpen, setIsUnsavedEditConfirmOpen] =
    useState(false);
  const [commitFilesByHash, setCommitFilesByHash] = useState<
    Record<string, RepositoryCommitFile[]>
  >({});
  const [isLoadingCommitFilesHash, setIsLoadingCommitFilesHash] = useState<
    string | null
  >(null);
  const [openedCommitDiff, setOpenedCommitDiff] =
    useState<RepositoryCommitFileDiff | null>(null);
  const [openedCommitDiffStatusCode, setOpenedCommitDiffStatusCode] = useState<
    string | null
  >(null);
  const [isLoadingCommitDiffPath, setIsLoadingCommitDiffPath] = useState<
    string | null
  >(null);
  const [pullActionMode, setPullActionMode] =
    useState<PullActionMode>("pull-ff-possible");
  const [openEntryContextMenuKey, setOpenEntryContextMenuKey] = useState<
    string | null
  >(null);
  const [openEntryDropdownMenuKey, setOpenEntryDropdownMenuKey] = useState<
    string | null
  >(null);
  const [openCommitMenuHash, setOpenCommitMenuHash] = useState<string | null>(
    null
  );
  const pullActionLabelByMode: Record<PullActionMode, string> = {
    "fetch-all": "Fetch All",
    "pull-ff-only": "Pull (fast-forward only)",
    "pull-ff-possible": "Pull (fast-forward if possible)",
    "pull-rebase": "Pull (rebase)",
  };
  const mergeActionLabelByMode: Record<MergeActionMode, string> = {
    "ff-only": "Fast-forward",
    merge: "Merge",
    rebase: "Rebase",
  };
  const selectedPullActionLabel = pullActionLabelByMode[pullActionMode];
  const [sidebarFilterInputValue, setSidebarFilterInputValue] = useState("");
  const [sidebarFilterQuery, setSidebarFilterQuery] = useState("");
  const sidebarFilterInputRef = useRef<HTMLInputElement | null>(null);
  const branchCreateInputRef = useRef<HTMLInputElement | null>(null);
  const commitSummaryInputRef = useRef<HTMLInputElement | null>(null);
  const commitDetailsLayoutRef = useRef<HTMLDivElement | null>(null);
  const mainScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const branchCreateRowRef = useRef<HTMLDivElement | null>(null);
  const workingTreeTimelineRowRef = useRef<HTMLButtonElement | null>(null);
  const timelineRowElementsRef = useRef(
    new Map<string, HTMLButtonElement | null>()
  );
  const sidebarFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingMainScrollRestoreRef = useRef<{
    repoId: string;
    scrollTop: number;
    tabId: string;
  } | null>(null);
  const isRepoRefreshLoading =
    isLoadingBranches || isLoadingHistory || isLoadingStatus || isLoadingWip;
  const wasRepoRefreshLoadingRef = useRef(isRepoRefreshLoading);
  const sidebarResizeStateRef = useRef<SidebarResizeState | null>(null);
  const commitDetailsResizeStateRef = useRef<CommitDetailsResizeState | null>(
    null
  );
  const changesSectionsResizeStateRef =
    useRef<ChangesSectionsResizeState | null>(null);
  const workingTreeFilesPanelResizeStateRef =
    useRef<WorkingTreeFilesPanelResizeState | null>(null);
  const leftSidebarWidthRef = useRef(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const rightSidebarWidthRef = useRef(RIGHT_SIDEBAR_DEFAULT_WIDTH);
  const commitDetailsPanelHeightRef = useRef(
    COMMIT_DETAILS_PANEL_DEFAULT_HEIGHT
  );
  const workingTreeFilesPanelHeightRef = useRef<number | null>(null);
  const unstagedSectionHeightRef = useRef(CHANGES_SECTIONS_DEFAULT_HEIGHT);
  const workingTreeFilesPanelLayoutRef = useRef<HTMLDivElement | null>(null);
  const workingTreeFilesPanelRef = useRef<HTMLDivElement | null>(null);
  const commitComposerFormRef = useRef<HTMLFormElement | null>(null);
  const changesSectionsLayoutRef = useRef<HTMLDivElement | null>(null);
  const isRightSidebarOpenRef = useRef(true);
  const [, startSidebarFilterTransition] = useTransition();
  const deferredSidebarFilterQuery = useDeferredValue(sidebarFilterQuery);

  const isTerminalPanelOpen = useTerminalPanelStore((state) => state.isOpen);
  const toggleTerminalPanel = useTerminalPanelStore((state) => state.toggle);
  const [selectedLauncherId, setSelectedLauncherId] =
    useState<ExternalLauncherApplication>("file-manager");

  const [launcherApplications, setLauncherApplications] = useState<
    ExternalLauncherApp[]
  >([]);

  const tauriRuntime = isTauri();
  const selectedLauncher = launcherApplications.find(
    (app) => app.id === selectedLauncherId
  );
  const hasLauncherItems = launcherApplications.length > 0;

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let cancelled = false;

    getLauncherApplications()
      .then((applications) => {
        if (!cancelled) {
          setLauncherApplications(applications);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLauncherApplications([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tauriRuntime]);

  const dateFormatPreference = usePreferencesStore(
    (state) => state.ui.dateFormat
  );
  const localePreference = usePreferencesStore((state) => state.ui.locale);
  const aiSelectedModel = usePreferencesStore((state) => state.ai.model);
  const repoFileBrowserPreferences = usePreferencesStore((state) =>
    activeRepoId
      ? (state.ui.repoFileBrowserByRepoId[activeRepoId] ??
        DEFAULT_REPO_FILE_BROWSER_STATE)
      : DEFAULT_REPO_FILE_BROWSER_STATE
  );
  const setRepoFileBrowserState = usePreferencesStore(
    (state) => state.setRepoFileBrowserState
  );
  const repoTimelinePreferences = usePreferencesStore(
    (state) => state.ui.repoTimeline
  );
  const setRepoTimelinePreferences = usePreferencesStore(
    (state) => state.setRepoTimelinePreferences
  );
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const editorPreferences = usePreferencesStore((state) => state.editor);
  const openedDiffEditorRef = useRef<DiffEditorInstance | null>(null);
  const openedFileEditorRef = useRef<EditorView | null>(null);
  const openedEditEditorRef = useRef<EditorView | null>(null);
  const previousWorkspaceEncodingRef = useRef(workspaceEncoding);
  const resolvedWorkspaceEncoding =
    resolveDiffWorkspaceEncodingValue(workspaceEncoding);
  const requestedWorkspaceEncoding = resolveDiffWorkspaceRequestedEncoding(
    resolvedWorkspaceEncoding
  );
  const hasUnsupportedWorkspaceTextEncoding =
    isDiffWorkspaceTextEncodingUnsupported(resolvedWorkspaceEncoding);
  const commitDiffCacheRef = useRef<Map<string, RepositoryCommitFileDiff>>(
    new Map()
  );
  const fileHistoryCacheRef = useRef<Map<string, RepositoryFileHistoryEntry[]>>(
    new Map()
  );
  const fileBlameCacheRef = useRef<Map<string, RepositoryFileBlameLine[]>>(
    new Map()
  );
  const preAmendDraftRef = useRef<{
    description: string;
    summary: string;
  } | null>(null);
  const pendingForcePushActionRef = useRef<(() => Promise<void>) | null>(null);
  const pendingPublishPushActionRef = useRef<
    ((options: PublishRepositoryOptions) => Promise<void>) | null
  >(null);
  const { resolvedTheme } = useTheme();
  const routeSearch = useSearch({ strict: false });
  const activeTabIdFromUrl =
    typeof routeSearch.tabId === "string" ? routeSearch.tabId : "tab:default";

  leftSidebarWidthRef.current = leftSidebarWidth;
  rightSidebarWidthRef.current = rightSidebarWidth;
  commitDetailsPanelHeightRef.current = commitDetailsPanelHeight;
  workingTreeFilesPanelHeightRef.current = workingTreeFilesPanelHeight;
  unstagedSectionHeightRef.current = unstagedSectionHeight;
  isRightSidebarOpenRef.current = isRightSidebarOpen;

  const activeRepo = openedRepos.find((repo) => repo.id === activeRepoId);
  const activeRepoPath = activeRepo?.path ?? null;

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let disposed = false;
    const unlistenProgressPromise = listen<{
      message: string;
      repoPath: string;
      stage: string;
    }>("ai-commit-generation-progress", (event) => {
      const payload = event.payload;

      if (disposed || payload.repoPath !== activeRepoPath) {
        return;
      }

      const nextState = getNextAiCommitGenerationState(
        {
          preview: aiCommitGenerationPreviewRef.current,
          statusMessage: aiCommitGenerationStatusMessageRef.current,
        },
        payload
      );

      aiCommitGenerationStatusMessageRef.current = nextState.statusMessage;
      aiCommitGenerationPreviewRef.current = nextState.preview;
      setAiCommitGenerationStatusMessage(nextState.statusMessage);
      setAiCommitGenerationPreview(nextState.preview);
    });
    const unlistenChunkPromise = listen<{
      content: string;
      repoPath: string;
    }>("ai-commit-generation-chunk", (event) => {
      const payload = event.payload;

      if (disposed || payload.repoPath !== activeRepoPath) {
        return;
      }

      aiCommitGenerationPreviewRef.current = payload.content;
      setAiCommitGenerationPreview(payload.content);
    });

    return () => {
      disposed = true;
      unlistenProgressPromise.then((unlisten) => unlisten());
      unlistenChunkPromise.then((unlisten) => unlisten());
    };
  }, [activeRepoPath, tauriRuntime]);

  const handleOpenPath = useCallback(
    async (application: ExternalLauncherApplication) => {
      if (!activeRepoPath) {
        return;
      }

      try {
        await openPathWithApplication({
          application,
          path: activeRepoPath,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to open repository in external application."
        );
      }
    },
    [activeRepoPath]
  );

  const handleCopyRepoPath = useCallback(async () => {
    if (!activeRepoPath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeRepoPath);
      toast.success("Repository path copied to clipboard.");
    } catch {
      toast.error("Failed to copy repository path.");
    }
  }, [activeRepoPath]);

  useEffect(() => {
    if (!activeRepoPath) {
      setRemoteAvatarUrlByName({});
      return;
    }

    let cancelled = false;

    getRepositoryRemoteAvatars(activeRepoPath)
      .then((avatarsByRemote) => {
        if (!cancelled) {
          setRemoteAvatarUrlByName(avatarsByRemote);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteAvatarUrlByName({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRepoPath]);
  useEffect(() => {
    import("@/components/views/git-graph-overlay").catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to preload commit graph surface."
      );
    });
  }, []);
  const timelineCommits = useMemo<RepositoryCommit[]>(
    () =>
      requiresForcePushAfterHistoryRewrite
        ? commits.filter((commit) => commit.syncState !== "pullable")
        : commits,
    [commits, requiresForcePushAfterHistoryRewrite]
  );
  const localHeadCommit = useMemo(
    () => resolveHeadCommit(timelineCommits),
    [timelineCommits]
  );
  const preferredWipIdentity = activeRepoIdentity?.global.isComplete
    ? activeRepoIdentity.global
    : (activeRepoIdentity?.effective ?? null);
  const preferredWipEmail = preferredWipIdentity?.email ?? null;
  const preferredWipRawName = preferredWipIdentity?.name ?? null;
  const preferredWipName = preferredWipRawName?.trim() ?? "";
  const wipAuthorName =
    preferredWipName.length > 0
      ? preferredWipName
      : (localHeadCommit?.author ?? "");
  const wipAuthorAvatarUrl = useMemo(
    () =>
      resolveWipAuthorAvatarUrl(
        timelineCommits,
        preferredWipEmail,
        preferredWipRawName
      ),
    [timelineCommits, preferredWipEmail, preferredWipRawName]
  );
  const persistRepoFileBrowserState = (
    input:
      | Partial<typeof repoFileBrowserPreferences>
      | ((
          current: typeof repoFileBrowserPreferences
        ) => Partial<typeof repoFileBrowserPreferences>)
  ) => {
    if (!activeRepoId) {
      return;
    }

    setRepoFileBrowserState(activeRepoId, input);
  };
  const setChangesViewMode = (viewMode: ChangesViewMode) => {
    persistRepoFileBrowserState({ viewMode });
  };
  const setShowAllCommitFilesState = (shouldShowAll: boolean) => {
    setShowAllCommitFiles(shouldShowAll);

    if (shouldShowAll) {
      setCommitDetailsViewMode("tree");
      return;
    }

    setCommitFileFilterInputValue("");
  };
  const setIsUnstagedSectionCollapsed = (
    value: boolean | ((current: boolean) => boolean)
  ) => {
    persistRepoFileBrowserState((current) => ({
      isUnstagedSectionCollapsed:
        typeof value === "function"
          ? value(current.isUnstagedSectionCollapsed)
          : value,
    }));
  };
  const setIsStagedSectionCollapsed = (
    value: boolean | ((current: boolean) => boolean)
  ) => {
    persistRepoFileBrowserState((current) => ({
      isStagedSectionCollapsed:
        typeof value === "function"
          ? value(current.isStagedSectionCollapsed)
          : value,
    }));
  };
  const setExpandedTreeNodePaths = (
    value:
      | Record<string, boolean>
      | ((current: Record<string, boolean>) => Record<string, boolean>)
  ) => {
    persistRepoFileBrowserState((current) => ({
      expandedTreeNodePaths:
        typeof value === "function"
          ? value(current.expandedTreeNodePaths)
          : value,
    }));
  };
  const setRepositoryFileFilterInputValue = (value: string) => {
    persistRepoFileBrowserState({ filterInputValue: value });
  };
  const toggleFileTreeSortOrder = () => {
    persistRepoFileBrowserState((current) => ({
      sortOrder: current.sortOrder === "asc" ? "desc" : "asc",
    }));
  };

  const changesViewMode = repoFileBrowserPreferences.viewMode;
  const isUnstagedSectionCollapsed =
    repoFileBrowserPreferences.isUnstagedSectionCollapsed;
  const isStagedSectionCollapsed =
    repoFileBrowserPreferences.isStagedSectionCollapsed;
  const expandedTreeNodePaths =
    repoFileBrowserPreferences.expandedTreeNodePaths;
  const hiddenSidebarGraphEntryKeys =
    repoFileBrowserPreferences.hiddenGraphEntryKeys;
  const showAllFiles = repoFileBrowserPreferences.showAllFiles;
  const fileTreeSortOrder = repoFileBrowserPreferences.sortOrder;
  const repositoryFileFilterInputValue =
    repoFileBrowserPreferences.filterInputValue;
  const debouncedRepositoryFileFilterInputValue = useDebouncedValue(
    repositoryFileFilterInputValue,
    FILE_FILTER_DEBOUNCE_MS
  );
  const unstagedItems = useMemo(
    () =>
      workingTreeItems.filter(
        (item) => item.unstagedStatus !== " " || item.isUntracked
      ),
    [workingTreeItems]
  );
  const stagedItems = useMemo(
    () =>
      workingTreeItems.filter(
        (item) =>
          !item.isUntracked &&
          item.stagedStatus !== " " &&
          item.stagedStatus !== "?"
      ),
    [workingTreeItems]
  );
  const hasUnstagedChanges = unstagedItems.length > 0;
  const hasStagedChanges = stagedItems.length > 0;
  const isChangesSectionsResizable = !(
    showAllFiles ||
    isUnstagedSectionCollapsed ||
    isStagedSectionCollapsed
  );
  const hasAnyWorkingTreeChanges = workingTreeItems.length > 0;
  const canCreateStash = hasAnyWorkingTreeChanges;
  const canPopCurrentStash = stashes.length > 0;
  const workingTreeIndicators = useMemo(() => {
    let addedCount = 0;
    let editedCount = 0;
    let removedCount = 0;

    for (const item of workingTreeItems) {
      const stagedStatus = item.stagedStatus;
      const unstagedStatus = item.unstagedStatus;

      if (
        item.isUntracked ||
        stagedStatus === "A" ||
        unstagedStatus === "A" ||
        stagedStatus === "?" ||
        unstagedStatus === "?"
      ) {
        addedCount += 1;
        continue;
      }

      if (stagedStatus === "D" || unstagedStatus === "D") {
        removedCount += 1;
        continue;
      }

      if (stagedStatus !== " " || unstagedStatus !== " ") {
        editedCount += 1;
      }
    }

    return {
      addedCount,
      editedCount,
      removedCount,
    };
  }, [workingTreeItems]);
  const canCommit = draftCommitSummary.trim().length > 0 && hasStagedChanges;
  const hasRemoteConfigured = activeRepoRemoteNames.length > 0;
  const workingTreeModelInput = useMemo<BuildRepoInfoWorkingTreeModelInput>(
    () => ({
      sortOrder: fileTreeSortOrder,
      stagedItems,
      unstagedItems,
    }),
    [fileTreeSortOrder, stagedItems, unstagedItems]
  );
  const workingTreeWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoWorkingTreeModelInput,
      ReturnType<typeof buildRepoInfoWorkingTreeModel>
    >
  > | null>(null);
  const [workingTreeModel, setWorkingTreeModel] = useState<
    ReturnType<typeof buildRepoInfoWorkingTreeModel>
  >(EMPTY_WORKING_TREE_MODEL);
  const { stagedTree, unstagedTree } = workingTreeModel;
  const normalizedRepositoryFileFilter = debouncedRepositoryFileFilterInputValue
    .trim()
    .toLowerCase();
  const workingTreeItemByPath = useMemo(
    () => new Map(workingTreeItems.map((item) => [item.path, item])),
    [workingTreeItems]
  );
  const allFilesModelInput = useMemo<BuildRepoInfoAllFilesModelInput>(
    () => ({
      allRepositoryFiles,
      normalizedRepositoryFileFilter,
      sortOrder: fileTreeSortOrder,
      workingTreeItems,
    }),
    [
      allRepositoryFiles,
      normalizedRepositoryFileFilter,
      fileTreeSortOrder,
      workingTreeItems,
    ]
  );
  const allFilesWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoAllFilesModelInput,
      ReturnType<typeof buildRepoInfoAllFilesModel>
    >
  > | null>(null);
  const [allFilesModel, setAllFilesModel] = useState<
    ReturnType<typeof buildRepoInfoAllFilesModel>
  >(EMPTY_ALL_FILES_MODEL);
  const { allFilesTree, filteredRepositoryFiles } = allFilesModel;

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoAllFilesModelInput,
        ReturnType<typeof buildRepoInfoAllFilesModel>
      >(
        () =>
          new Worker(
            new URL("./repo-info-all-files.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:all-files" }
      );
      allFilesWorkerClientRef.current = client;

      return () => {
        allFilesWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      allFilesWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoWorkingTreeModelInput,
        ReturnType<typeof buildRepoInfoWorkingTreeModel>
      >(
        () =>
          new Worker(
            new URL("./repo-info-working-tree.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:working-tree" }
      );
      workingTreeWorkerClientRef.current = client;

      return () => {
        workingTreeWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      workingTreeWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = workingTreeWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      workingTreeModelInput,
      buildRepoInfoWorkingTreeModel
    ).then(
      (result) => {
        if (!cancelled) {
          setWorkingTreeModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [workingTreeModelInput]);

  useEffect(() => {
    const workerClient = allFilesWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      allFilesModelInput,
      buildRepoInfoAllFilesModel
    ).then(
      (result) => {
        if (!cancelled) {
          setAllFilesModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [allFilesModelInput]);

  const visibleGraphModelInput = useMemo<BuildRepoInfoVisibleGraphModelInput>(
    () => ({
      historyGraph,
      localHeadCommitHash: localHeadCommit?.hash ?? null,
      timelineCommits,
    }),
    [historyGraph, localHeadCommit?.hash, timelineCommits]
  );
  const visibleGraphWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoVisibleGraphModelInput,
      ReturnType<typeof buildRepoInfoVisibleGraphModel>
    >
  > | null>(null);
  const [visibleGraphModel, setVisibleGraphModel] = useState<
    ReturnType<typeof buildRepoInfoVisibleGraphModel>
  >(EMPTY_VISIBLE_GRAPH_MODEL);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoVisibleGraphModelInput,
        ReturnType<typeof buildRepoInfoVisibleGraphModel>
      >(
        () =>
          new Worker(
            new URL("./repo-info-visible-graph.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:visible-graph" }
      );
      visibleGraphWorkerClientRef.current = client;

      return () => {
        visibleGraphWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      visibleGraphWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = visibleGraphWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      visibleGraphModelInput,
      buildRepoInfoVisibleGraphModel
    ).then(
      (result) => {
        if (!cancelled) {
          setVisibleGraphModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [visibleGraphModelInput]);

  const currentBranch =
    branches.find((branch) => branch.isCurrent)?.name ?? "HEAD";
  const { currentBranchLaneColor, visibleHistoryGraph } = visibleGraphModel;
  const currentLocalBranch = useMemo(
    () =>
      branches.find(
        (branch) =>
          branch.isCurrent && !branch.isRemote && branch.refType === "branch"
      ) ?? null,
    [branches]
  );
  const isWorkingTreeSelection = selectedTimelineRowId === WORKING_TREE_ROW_ID;
  const selectedCommit = useMemo(
    () =>
      timelineCommits.find((item) => item.hash === selectedCommitId) ?? null,
    [selectedCommitId, timelineCommits]
  );
  const selectedCommitMessageSections = useMemo(() => {
    if (!selectedCommit) {
      return {
        detailLines: [] as string[],
        summary: "",
      };
    }

    const messageLines = selectedCommit.message
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return {
      detailLines: messageLines
        .slice(1)
        .map((line) => line.replace(COMMIT_MESSAGE_LIST_MARKER_PATTERN, "")),
      summary: messageLines[0] ?? selectedCommit.message.trim(),
    };
  }, [selectedCommit]);
  const selectedCommitRebaseImpactCount = useMemo(() => {
    if (!selectedCommit) {
      return 0;
    }

    const selectedIndex = timelineCommits.findIndex(
      (commit) => commit.hash === selectedCommit.hash
    );

    return selectedIndex > 0 ? selectedIndex : 0;
  }, [selectedCommit, timelineCommits]);
  const pendingDropCommitRebaseImpactCount = useMemo(() => {
    if (!pendingDropCommitHash) {
      return 0;
    }

    const targetIndex = timelineCommits.findIndex(
      (commit) => commit.hash === pendingDropCommitHash
    );

    return targetIndex > 0 ? targetIndex : 0;
  }, [pendingDropCommitHash, timelineCommits]);
  useEffect(() => {
    if (!selectedCommit) {
      setIsEditingSelectedCommitMessage(false);
      setRewordCommitSummary("");
      setRewordCommitDescription("");
      setLastAiRewordGeneration(null);
      return;
    }

    setIsEditingSelectedCommitMessage(false);
    setRewordCommitSummary(selectedCommit.messageSummary);
    setRewordCommitDescription(selectedCommit.messageDescription);
    setLastAiRewordGeneration(null);
  }, [selectedCommit]);
  const selectedCommitFiles = useMemo<RepositoryCommitFile[]>(
    () =>
      selectedCommit
        ? (commitFilesByHash[selectedCommit.hash] ?? [])
        : ([] as RepositoryCommitFile[]),
    [commitFilesByHash, selectedCommit]
  );
  const normalizedCommitFileFilter = debouncedCommitFileFilterInputValue
    .trim()
    .toLowerCase();
  const commitFilesModelInput = useMemo<BuildRepoInfoCommitFilesModelInput>(
    () => ({
      allRepositoryFiles,
      normalizedCommitFileFilter,
      selectedFiles: selectedCommitFiles,
      showAllCommitFiles,
      sortOrder: commitFileSortOrder,
    }),
    [
      allRepositoryFiles,
      normalizedCommitFileFilter,
      selectedCommitFiles,
      showAllCommitFiles,
      commitFileSortOrder,
    ]
  );
  const commitFilesWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoCommitFilesModelInput,
      ReturnType<typeof buildRepoInfoCommitFilesModel>
    >
  > | null>(null);
  const [selectedCommitFilesModel, setSelectedCommitFilesModel] = useState<
    ReturnType<typeof buildRepoInfoCommitFilesModel>
  >(EMPTY_COMMIT_FILES_MODEL);
  const {
    filteredFiles: filteredCommitFiles,
    sortedPathRows: sortedCommitPathRows,
    summary: selectedCommitFileSummary,
    tree: selectedCommitTree,
  } = selectedCommitFilesModel;
  const timelineRowsInput = useMemo<BuildRepoInfoTimelineRowsInput>(
    () => ({
      hasAnyWorkingTreeChanges,
      hiddenSidebarGraphEntryKeys,
      localHeadCommitHash: localHeadCommit?.hash ?? null,
      stashes,
      timelineCommits,
      wipAuthorAvatarUrl,
      wipAuthorName,
    }),
    [
      hasAnyWorkingTreeChanges,
      hiddenSidebarGraphEntryKeys,
      localHeadCommit?.hash,
      stashes,
      timelineCommits,
      wipAuthorAvatarUrl,
      wipAuthorName,
    ]
  );
  const timelineWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<BuildRepoInfoTimelineRowsInput, GitTimelineRow[]>
  > | null>(null);
  const [timelineRows, setTimelineRows] = useState<GitTimelineRow[]>([]);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoTimelineRowsInput,
        GitTimelineRow[]
      >(
        () =>
          new Worker(
            new URL("./repo-info-timeline.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:timeline" }
      );
      timelineWorkerClientRef.current = client;

      return () => {
        timelineWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      timelineWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = timelineWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      timelineRowsInput,
      buildRepoInfoTimelineRows
    ).then(
      (rows) => {
        if (!cancelled) {
          setTimelineRows(rows);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [timelineRowsInput]);
  const timelineRowById = useMemo(
    () => new Map(timelineRows.map((row) => [row.id, row])),
    [timelineRows]
  );
  const timelineDisplayRows = useMemo(
    () => timelineRows.filter((row) => row.type !== "wip"),
    [timelineRows]
  );
  const timelineDisplayRowIndexById = useMemo(
    () => new Map(timelineDisplayRows.map((row, index) => [row.id, index])),
    [timelineDisplayRows]
  );
  const timelineVirtualizer = useVirtualizer({
    count: timelineDisplayRows.length,
    estimateSize: () => TIMELINE_ROW_HEIGHT,
    getItemKey: (index) => timelineDisplayRows[index]?.id ?? index,
    getScrollElement: () => mainScrollContainerRef.current,
    overscan: 16,
  });
  const virtualTimelineRows = timelineVirtualizer.getVirtualItems();
  const timelineVirtualRowsOffset = virtualTimelineRows[0]?.start ?? 0;
  const visibleTimelineRows = useMemo(
    () =>
      virtualTimelineRows
        .map((virtualRow) => timelineDisplayRows[virtualRow.index] ?? null)
        .filter((row): row is GitTimelineRow => row !== null),
    [timelineDisplayRows, virtualTimelineRows]
  );
  const visibleTimelineCommitHashes = useMemo(
    () =>
      new Set(
        visibleTimelineRows
          .map((row) => row.commitHash ?? row.anchorCommitHash ?? null)
          .filter((hash): hash is string => hash !== null)
      ),
    [visibleTimelineRows]
  );
  const visibleTimelineCommits = useMemo(
    () =>
      timelineCommits.filter((commit) =>
        visibleTimelineCommitHashes.has(commit.hash)
      ),
    [timelineCommits, visibleTimelineCommitHashes]
  );
  const selectedTimelineRow = useMemo(
    () =>
      selectedTimelineRowId
        ? (timelineRowById.get(selectedTimelineRowId) ?? null)
        : null,
    [selectedTimelineRowId, timelineRowById]
  );
  const isSelectedCommitRow = selectedTimelineRow?.type === "commit";
  const isSelectedReferenceRow =
    selectedTimelineRow?.type === "stash" ||
    selectedTimelineRow?.type === "tag";
  const selectedReferenceCommit = useMemo(() => {
    if (
      !(
        selectedTimelineRow &&
        "anchorCommitHash" in selectedTimelineRow &&
        selectedTimelineRow.anchorCommitHash
      )
    ) {
      return null;
    }

    return (
      timelineCommits.find(
        (item) => item.hash === selectedTimelineRow.anchorCommitHash
      ) ?? null
    );
  }, [selectedTimelineRow, timelineCommits]);
  const selectedStash = useMemo(() => {
    if (selectedTimelineRow?.type !== "stash") {
      return null;
    }

    const stashRef = selectedTimelineRow.id.slice("stash:".length);
    return stashes.find((item) => item.ref === stashRef) ?? null;
  }, [selectedTimelineRow, stashes]);
  const selectedStashDraft = useMemo(
    () => (selectedStash ? parseStashDraft(selectedStash.message) : null),
    [selectedStash]
  );
  const selectedReferenceBadgeLabel = useMemo(() => {
    if (selectedTimelineRow?.type === "stash") {
      return selectedStash?.shortHash ?? selectedStash?.ref ?? "";
    }

    if (selectedReferenceCommit?.shortHash) {
      return `commit ${selectedReferenceCommit.shortHash}`;
    }

    return "reference";
  }, [selectedReferenceCommit?.shortHash, selectedStash, selectedTimelineRow]);
  const selectedReferenceRevision = useMemo(() => {
    if (selectedTimelineRow?.type === "stash") {
      return selectedStash?.ref ?? null;
    }

    if (selectedTimelineRow?.type === "tag") {
      return selectedTimelineRow.label ?? null;
    }

    return null;
  }, [selectedStash?.ref, selectedTimelineRow]);
  const selectedReferenceFiles = useMemo<RepositoryCommitFile[]>(
    () =>
      selectedReferenceRevision
        ? (commitFilesByHash[selectedReferenceRevision] ?? [])
        : ([] as RepositoryCommitFile[]),
    [commitFilesByHash, selectedReferenceRevision]
  );
  const referenceFilesModelInput = useMemo<BuildRepoInfoCommitFilesModelInput>(
    () => ({
      allRepositoryFiles,
      normalizedCommitFileFilter,
      selectedFiles: selectedReferenceFiles,
      showAllCommitFiles,
      sortOrder: commitFileSortOrder,
    }),
    [
      allRepositoryFiles,
      normalizedCommitFileFilter,
      selectedReferenceFiles,
      showAllCommitFiles,
      commitFileSortOrder,
    ]
  );
  const [selectedReferenceFilesModel, setSelectedReferenceFilesModel] =
    useState<ReturnType<typeof buildRepoInfoCommitFilesModel>>(
      EMPTY_COMMIT_FILES_MODEL
    );
  const {
    filteredFiles: filteredReferenceFiles,
    sortedPathRows: sortedSelectedReferencePathRows,
    summary: selectedReferenceFileSummary,
    tree: selectedReferenceTree,
  } = selectedReferenceFilesModel;

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoCommitFilesModelInput,
        ReturnType<typeof buildRepoInfoCommitFilesModel>
      >(
        () =>
          new Worker(
            new URL("./repo-info-commit-files.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:commit-files" }
      );
      commitFilesWorkerClientRef.current = client;

      return () => {
        commitFilesWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      commitFilesWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = commitFilesWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      commitFilesModelInput,
      buildRepoInfoCommitFilesModel
    ).then(
      (result) => {
        if (!cancelled) {
          setSelectedCommitFilesModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [commitFilesModelInput]);

  useEffect(() => {
    const workerClient = commitFilesWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      referenceFilesModelInput,
      buildRepoInfoCommitFilesModel
    ).then(
      (result) => {
        if (!cancelled) {
          setSelectedReferenceFilesModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [referenceFilesModelInput]);
  const referenceModelInput = useMemo<BuildRepoInfoReferenceModelInput>(
    () => ({
      branches,
      currentBranch,
      stashes,
      timelineCommits,
      timelineRows,
    }),
    [branches, currentBranch, stashes, timelineCommits, timelineRows]
  );
  const referenceWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoReferenceModelInput,
      ReturnType<typeof buildRepoInfoReferenceModel>
    >
  > | null>(null);
  const [referenceModel, setReferenceModel] = useState<
    ReturnType<typeof buildRepoInfoReferenceModel>
  >(EMPTY_REFERENCE_MODEL);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoReferenceModelInput,
        ReturnType<typeof buildRepoInfoReferenceModel>
      >(
        () =>
          new Worker(
            new URL("./repo-info-reference.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:reference" }
      );
      referenceWorkerClientRef.current = client;

      return () => {
        referenceWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      referenceWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = referenceWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      referenceModelInput,
      buildRepoInfoReferenceModel
    ).then(
      (result) => {
        if (!cancelled) {
          setReferenceModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [referenceModelInput]);

  const commitByHash = useMemo(
    () => new Map(timelineCommits.map((commit) => [commit.hash, commit])),
    [timelineCommits]
  );
  const timelineVisibleColumns = useMemo(
    () =>
      TIMELINE_COLUMN_ORDER.filter(
        (columnId) => repoTimelinePreferences.visibleColumns[columnId]
      ),
    [repoTimelinePreferences.visibleColumns]
  );
  const resolvedTimelineBranchColumnWidth = timelineVisibleColumns.includes(
    "branch"
  )
    ? TIMELINE_BRANCH_COLUMN_WIDTH
    : 0;
  const resolvedTimelineGraphColumnWidth = useMemo(
    () =>
      timelineVisibleColumns.includes("graph")
        ? resolveGitGraphColumnWidth(visibleHistoryGraph)
        : 0,
    [timelineVisibleColumns, visibleHistoryGraph]
  );
  let timelineGraphTargetWidth = resolvedTimelineGraphColumnWidth;

  if (isTimelineGraphAutoCompact || repoTimelinePreferences.compactGraph) {
    timelineGraphTargetWidth = TIMELINE_GRAPH_COLUMN_MIN_WIDTH;
  }

  const effectiveTimelineGraphColumnWidth = timelineVisibleColumns.includes(
    "graph"
  )
    ? clampWidth(
        timelineGraphTargetWidth,
        TIMELINE_GRAPH_COLUMN_MIN_WIDTH,
        TIMELINE_GRAPH_COLUMN_MAX_WIDTH
      )
    : 0;
  const isTimelineGraphCompactMode =
    isTimelineGraphAutoCompact || repoTimelinePreferences.compactGraph;
  const timelineColumnDefinitions = useMemo<TimelineColumnDefinition[]>(() => {
    const definitions: TimelineColumnDefinition[] = [];

    for (const columnId of timelineVisibleColumns) {
      switch (columnId) {
        case "branch": {
          definitions.push({
            align: "center",
            id: columnId,
            label: "Branch / Tag",
            width: `${TIMELINE_BRANCH_COLUMN_WIDTH}px`,
          });
          break;
        }
        case "graph": {
          definitions.push({
            align: "center",
            id: columnId,
            label: "Graph",
            width: `${effectiveTimelineGraphColumnWidth}px`,
          });
          break;
        }
        case "commitMessage": {
          definitions.push({
            id: columnId,
            label: "Commit message",
            width: "minmax(260px,1fr)",
          });
          break;
        }
        case "author": {
          definitions.push({
            id: columnId,
            label: "Author",
            width: `${TIMELINE_AUTHOR_COLUMN_WIDTH}px`,
          });
          break;
        }
        case "dateTime": {
          definitions.push({
            id: columnId,
            label: "Date / Time",
            width: `${TIMELINE_DATE_TIME_COLUMN_WIDTH}px`,
          });
          break;
        }
        case "sha": {
          definitions.push({
            id: columnId,
            label: "Sha",
            width: `${TIMELINE_SHA_COLUMN_WIDTH}px`,
          });
          break;
        }
        default: {
          break;
        }
      }
    }

    return definitions;
  }, [effectiveTimelineGraphColumnWidth, timelineVisibleColumns]);
  const timelineGridTemplateColumns = timelineColumnDefinitions
    .map((column) => column.width)
    .join(" ");
  const commitAvatarUrlByHash = useMemo<Record<string, string | null>>(() => {
    const avatarByHash: Record<string, string | null> = {};

    for (const commit of timelineCommits) {
      avatarByHash[commit.hash] = commit.authorAvatarUrl ?? null;
    }

    return avatarByHash;
  }, [timelineCommits]);
  const normalizedSidebarFilter = deferredSidebarFilterQuery
    .trim()
    .toLowerCase();
  const sidebarGroupsInput = useMemo<BuildRepoInfoSidebarGroupsInput>(
    () => ({
      branches,
      normalizedSidebarFilter,
      stashes,
    }),
    [branches, normalizedSidebarFilter, stashes]
  );
  const sidebarWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoSidebarGroupsInput,
      ReturnType<typeof buildRepoInfoSidebarGroups>
    >
  > | null>(null);
  const [sidebarResults, setSidebarResults] = useState<
    ReturnType<typeof buildRepoInfoSidebarGroups>
  >(EMPTY_SIDEBAR_RESULTS);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoSidebarGroupsInput,
        ReturnType<typeof buildRepoInfoSidebarGroups>
      >(
        () =>
          new Worker(
            new URL("./repo-info-sidebar.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:sidebar" }
      );
      sidebarWorkerClientRef.current = client;

      return () => {
        sidebarWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      sidebarWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = sidebarWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      sidebarGroupsInput,
      buildRepoInfoSidebarGroups
    ).then(
      (result) => {
        if (!cancelled) {
          setSidebarResults(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [sidebarGroupsInput]);

  const { filteredSidebarEntryCount, filteredSidebarGroups } = sidebarResults;
  const visibleCountsModelInput = useMemo<BuildRepoInfoVisibleCountsModelInput>(
    () => ({
      allFilesTree,
      changesViewMode,
      collapsedBranchFolderKeys,
      commitDetailsViewMode,
      expandedCommitTreeNodePaths,
      expandedTreeNodePaths,
      filteredSidebarGroups,
      selectedCommitHash: selectedCommit?.hash ?? null,
      selectedCommitTree,
      selectedReferenceRevision,
      selectedReferenceTree,
      sortedCommitPathRowsLength: sortedCommitPathRows.length,
      sortedSelectedReferencePathRowsLength:
        sortedSelectedReferencePathRows.length,
      stagedItemsLength: stagedItems.length,
      stagedTree,
      unstagedItemsLength: unstagedItems.length,
      unstagedTree,
    }),
    [
      allFilesTree,
      changesViewMode,
      collapsedBranchFolderKeys,
      commitDetailsViewMode,
      expandedCommitTreeNodePaths,
      expandedTreeNodePaths,
      filteredSidebarGroups,
      selectedCommit?.hash,
      selectedCommitTree,
      selectedReferenceRevision,
      selectedReferenceTree,
      sortedCommitPathRows.length,
      sortedSelectedReferencePathRows.length,
      stagedItems.length,
      stagedTree,
      unstagedItems.length,
      unstagedTree,
    ]
  );
  const visibleCountsWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoVisibleCountsModelInput,
      ReturnType<typeof buildRepoInfoVisibleCountsModel>
    >
  > | null>(null);
  const [visibleCountsModel, setVisibleCountsModel] = useState<
    ReturnType<typeof buildRepoInfoVisibleCountsModel>
  >(EMPTY_VISIBLE_COUNTS_MODEL);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        BuildRepoInfoVisibleCountsModelInput,
        ReturnType<typeof buildRepoInfoVisibleCountsModel>
      >(
        () =>
          new Worker(
            new URL("./repo-info-visible-counts.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "repo-info:visible-counts" }
      );
      visibleCountsWorkerClientRef.current = client;

      return () => {
        visibleCountsWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      visibleCountsWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = visibleCountsWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(
      workerClient,
      visibleCountsModelInput,
      buildRepoInfoVisibleCountsModel
    ).then(
      (result) => {
        if (!cancelled) {
          setVisibleCountsModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [visibleCountsModelInput]);

  const {
    allFilesVisibleNodeCount,
    selectedCommitVisibleNodeCount,
    selectedReferenceVisibleNodeCount,
    sidebarVisibleNodeCount,
    stagedVisibleNodeCount,
    unstagedVisibleNodeCount,
  } = visibleCountsModel;
  const sidebarRenderLimit = useProgressiveRenderLimit(
    sidebarVisibleNodeCount,
    [activeRepoId, normalizedSidebarFilter, collapsedBranchFolderKeys],
    { chunkSize: 240, initialCount: 240 }
  );
  const allFilesRenderLimit = useProgressiveRenderLimit(
    allFilesVisibleNodeCount,
    [activeRepoId, normalizedRepositoryFileFilter, fileTreeSortOrder],
    { chunkSize: 240, initialCount: 240 }
  );
  const unstagedRenderLimit = useProgressiveRenderLimit(
    unstagedVisibleNodeCount,
    [activeRepoId, changesViewMode, fileTreeSortOrder, expandedTreeNodePaths],
    { chunkSize: 200, initialCount: 200 }
  );
  const stagedRenderLimit = useProgressiveRenderLimit(
    stagedVisibleNodeCount,
    [activeRepoId, changesViewMode, fileTreeSortOrder, expandedTreeNodePaths],
    { chunkSize: 200, initialCount: 200 }
  );
  const selectedCommitRenderLimit = useProgressiveRenderLimit(
    selectedCommitVisibleNodeCount,
    [
      activeRepoId,
      selectedCommit?.hash ?? "",
      commitDetailsViewMode,
      expandedCommitTreeNodePaths,
    ],
    { chunkSize: 220, initialCount: 220 }
  );
  const selectedReferenceRenderLimit = useProgressiveRenderLimit(
    selectedReferenceVisibleNodeCount,
    [
      activeRepoId,
      selectedReferenceRevision ?? "",
      commitDetailsViewMode,
      expandedCommitTreeNodePaths,
    ],
    { chunkSize: 220, initialCount: 220 }
  );
  const isReferenceHiddenInGraph = useCallback(
    (referenceName: string): boolean => {
      if (referenceName === currentBranch) {
        return false;
      }

      const entryType =
        referenceModel.graphEntryTypeByReferenceName[referenceName];
      const visibilityKey = `${entryType ?? "branch"}:${referenceName}`;

      return hiddenSidebarGraphEntryKeys[visibilityKey] === true;
    },
    [
      currentBranch,
      hiddenSidebarGraphEntryKeys,
      referenceModel.graphEntryTypeByReferenceName,
    ]
  );

  useEffect(() => {
    if (activeRepoId === null) {
      fileHistoryCacheRef.current.clear();
      fileBlameCacheRef.current.clear();
      return;
    }

    fileHistoryCacheRef.current.clear();
    fileBlameCacheRef.current.clear();
  }, [activeRepoId]);

  const formatCommitDate = useCallback(
    (value: string): string => {
      const parsedDate = new Date(value);

      if (Number.isNaN(parsedDate.getTime())) {
        return value;
      }

      const locale =
        localePreference === "system" || localePreference.trim().length === 0
          ? undefined
          : localePreference;

      const formatOptions: Intl.DateTimeFormatOptions = {
        dateStyle: dateFormatPreference === "verbose" ? "full" : "medium",
        timeStyle: dateFormatPreference === "verbose" ? "medium" : "short",
      };

      return locale
        ? intlFormat(parsedDate, formatOptions, { locale })
        : intlFormat(parsedDate, formatOptions);
    },
    [dateFormatPreference, localePreference]
  );
  const resolveTimelineRowCommit = useCallback(
    (row: GitTimelineRow): RepositoryCommit | null => {
      const commitHash = row.commitHash ?? row.anchorCommitHash;

      if (!commitHash) {
        return null;
      }

      return commitByHash.get(commitHash) ?? null;
    },
    [commitByHash]
  );
  const renderTimelineCell = useCallback(
    (
      columnId: RepoTimelineColumnId,
      input: {
        branchCell?: ReactNode;
        commit?: RepositoryCommit | null;
        commitMessageCell?: ReactNode;
      }
    ): ReactNode => {
      switch (columnId) {
        case "branch": {
          return input.branchCell ?? <div className="min-w-0" />;
        }
        case "graph": {
          return <div className="h-full" />;
        }
        case "commitMessage": {
          return input.commitMessageCell ?? <div className="min-w-0" />;
        }
        case "author": {
          return (
            <div className="min-w-0 truncate px-2 text-xs">
              {input.commit?.author ?? ""}
            </div>
          );
        }
        case "dateTime": {
          return (
            <div className="min-w-0 truncate px-2 text-muted-foreground text-xs">
              {input.commit ? formatCommitDate(input.commit.date) : ""}
            </div>
          );
        }
        case "sha": {
          return (
            <div className="min-w-0 truncate px-2 font-mono text-[11px] text-muted-foreground">
              {input.commit?.shortHash ?? ""}
            </div>
          );
        }
        default: {
          return null;
        }
      }
    },
    [formatCommitDate]
  );
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }

    if (error && typeof error === "object" && "message" in error) {
      const message = Reflect.get(error, "message");
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }

    return "Unknown error";
  };

  const isMissingRemoteRepositoryError = (error: unknown): boolean => {
    const normalized = getErrorMessage(error).toLowerCase();

    return (
      normalized.includes("remote repository for 'origin' was not found") ||
      normalized.includes("repository not found")
    );
  };

  const getCheckoutFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("local changes") &&
      normalized.includes("would be overwritten")
    ) {
      return "You have uncommitted changes that would be overwritten. Commit or stash them, then try again.";
    }

    if (
      normalized.includes("did not match any file") ||
      normalized.includes("pathspec")
    ) {
      return "The target branch could not be found. It may have been deleted or renamed.";
    }

    if (
      normalized.includes("resolve your current index first") ||
      normalized.includes("you need to resolve")
    ) {
      return "There are unresolved merge conflicts. Resolve them first, then switch branches.";
    }

    if (
      normalized.includes("rebase in progress") ||
      normalized.includes("merge in progress") ||
      normalized.includes("cherry-pick in progress")
    ) {
      return "A Git operation is still in progress. Finish or abort it before switching branches.";
    }

    if (normalized.includes("not a git repository")) {
      return "This folder is not recognized as a Git repository.";
    }

    return `Git could not switch branches: ${rawMessage}`;
  };

  const getCreateBranchFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("already exists") ||
      normalized.includes("fatal: a branch named")
    ) {
      return "A branch with this name already exists.";
    }

    if (normalized.includes("not a valid branch name")) {
      return "Enter a valid Git branch name.";
    }

    return `Git could not create branch: ${rawMessage}`;
  };

  const getDeleteBranchFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("cannot delete branch") &&
      normalized.includes("checked out")
    ) {
      return "You cannot delete the currently checked out branch.";
    }

    if (
      normalized.includes("not fully merged") ||
      normalized.includes("is not fully merged")
    ) {
      return "This branch is not fully merged. Merge it first, then delete.";
    }

    if (
      normalized.includes("not found") ||
      normalized.includes("not a valid branch name")
    ) {
      return "The branch could not be found.";
    }

    return `Git could not delete branch: ${rawMessage}`;
  };

  const getDeleteRemoteBranchFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("remote ref does not exist") ||
      normalized.includes("not found")
    ) {
      return "The remote branch could not be found.";
    }

    if (normalized.includes("permission denied")) {
      return "Permission denied while deleting remote branch.";
    }

    return `Git could not delete remote branch: ${rawMessage}`;
  };

  const getRenameBranchFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("already exists") ||
      normalized.includes("fatal: a branch named")
    ) {
      return "A branch with that name already exists.";
    }

    if (normalized.includes("not a valid branch name")) {
      return "Enter a valid Git branch name.";
    }

    if (normalized.includes("not found")) {
      return "The source branch could not be found.";
    }

    return `Git could not rename branch: ${rawMessage}`;
  };

  const getSetUpstreamFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (normalized.includes("no such remote")) {
      return "The selected remote does not exist. Refresh remotes and try again.";
    }

    if (
      normalized.includes("not a valid branch name") ||
      normalized.includes("invalid refspec")
    ) {
      return "Enter a valid remote branch name.";
    }

    if (
      normalized.includes("couldn't find remote ref") ||
      normalized.includes("remote ref does not exist")
    ) {
      return "The remote branch could not be found or created.";
    }

    if (normalized.includes("permission denied")) {
      return "Permission denied while updating branch upstream.";
    }

    return `Git could not set upstream: ${rawMessage}`;
  };

  const getCommitActionFailureReason = (
    error: unknown,
    action:
      | "checkout"
      | "create-branch"
      | "reset"
      | "cherry-pick"
      | "drop"
      | "revert"
      | "reword"
      | "create-tag"
  ): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("rebase in progress") ||
      normalized.includes("merge in progress") ||
      normalized.includes("cherry-pick in progress")
    ) {
      return "Another Git operation is in progress. Finish or abort it, then try again.";
    }

    if (
      normalized.includes("local changes") &&
      normalized.includes("would be overwritten")
    ) {
      return "You have uncommitted changes that block this action. Commit, stash, or discard them first.";
    }

    if (
      normalized.includes("unknown revision") ||
      normalized.includes("bad revision") ||
      normalized.includes("could not be resolved")
    ) {
      return "The selected commit or reference could not be resolved. Refresh repository data and try again.";
    }

    if (
      action === "create-branch" &&
      (normalized.includes("already exists") ||
        normalized.includes("fatal: a branch named"))
    ) {
      return "A branch with this name already exists.";
    }

    if (action === "create-branch" && normalized.includes("valid git branch")) {
      return "Enter a valid Git branch name.";
    }

    if (action === "create-tag" && normalized.includes("already exists")) {
      return "A tag with this name already exists.";
    }

    if (action === "create-tag" && normalized.includes("valid git tag")) {
      return "Enter a valid Git tag name.";
    }

    if (action === "reset" && normalized.includes("detached head")) {
      return "Resetting a branch requires a checked out branch. Exit detached HEAD and try again.";
    }

    if (
      action === "revert" &&
      normalized.includes("is a merge but no -m option")
    ) {
      return "Reverting a merge commit is not supported in this menu yet.";
    }

    if (
      action === "drop" &&
      normalized.includes("root commit cannot be dropped")
    ) {
      return "The only commit on this branch cannot be dropped.";
    }

    if (
      action === "drop" &&
      normalized.includes("not on the current head ancestry path")
    ) {
      return "This commit is not on the currently checked out history path.";
    }

    if (
      action === "reword" &&
      normalized.includes("not on the current head ancestry path")
    ) {
      return "This commit is not on the currently checked out history path.";
    }

    const actionLabelByKind = {
      checkout: "checkout this commit",
      "create-branch": "create a branch here",
      "create-tag": "create a tag here",
      "cherry-pick": "cherry-pick this commit",
      drop: "drop this commit",
      reword: "reword this commit",
      reset: "reset to this commit",
      revert: "revert this commit",
    } as const;

    return `Git could not ${actionLabelByKind[action]}: ${rawMessage}`;
  };

  const getMergeFailureReason = (
    error: unknown,
    mode: MergeActionMode
  ): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("rebase in progress") ||
      normalized.includes("merge in progress") ||
      normalized.includes("cherry-pick in progress")
    ) {
      return "Another Git operation is in progress. Finish or abort it, then try again.";
    }

    if (normalized.includes("detached head")) {
      return "This action requires a checked out branch. Exit detached HEAD and try again.";
    }

    if (
      normalized.includes("could not be resolved") ||
      normalized.includes("unknown revision") ||
      normalized.includes("bad revision")
    ) {
      return "The selected target could not be resolved. Refresh repository data and try again.";
    }

    if (
      normalized.includes("local changes") &&
      normalized.includes("would be overwritten")
    ) {
      return "You have uncommitted changes that block this action. Commit, stash, or discard them first.";
    }

    if (
      mode === "ff-only" &&
      normalized.includes("not possible to fast-forward")
    ) {
      return "Fast-forward is not possible because histories have diverged. Use Merge or Rebase instead.";
    }

    if (
      normalized.includes("conflict") ||
      normalized.includes("resolve all conflicts")
    ) {
      return "Git found conflicts. Resolve conflicts, then continue or abort the operation from your terminal.";
    }

    if (
      normalized.includes("already up to date") ||
      normalized.includes("current branch")
    ) {
      return "No changes were required because branches are already aligned.";
    }

    return `Git could not ${mergeActionLabelByMode[mode].toLowerCase()}: ${rawMessage}`;
  };

  const openBranchCreateInput = () => {
    if (!activeRepoId || isCreatingBranch || isSwitchingBranch) {
      return;
    }

    setIsBranchCreateInputOpen(true);
    setNewBranchName("");
  };

  const closeBranchCreateInput = () => {
    if (isCreatingBranch) {
      return;
    }

    setIsBranchCreateInputOpen(false);
    setNewBranchName("");
  };

  const handleCreateBranchFromToolbar = async () => {
    if (!activeRepoId || isCreatingBranch) {
      return;
    }

    const trimmedBranchName = newBranchName.trim();

    if (trimmedBranchName.length === 0) {
      toast.error("Branch name is required");
      return;
    }

    setIsCreatingBranch(true);

    try {
      await createBranch(activeRepoId, trimmedBranchName);
      setIsBranchCreateInputOpen(false);
      setNewBranchName("");
      toast.success("Branch created", {
        description: `refs/heads/${trimmedBranchName}`,
      });
    } catch (error) {
      toast.error("Failed to create branch", {
        description: getCreateBranchFailureReason(error),
      });
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const openDeleteBranchConfirm = (entry: SidebarEntry) => {
    if (entry.type !== "branch" || isDeletingBranch) {
      return;
    }

    if (entry.active) {
      toast.error("Cannot delete current branch", {
        description: "Switch to another branch before deleting this one.",
      });
      return;
    }

    const targetBranch = branches.find(
      (branch) => branch.refType === "branch" && branch.name === entry.name
    );

    if (!targetBranch) {
      toast.error("Branch not found", {
        description: "The selected branch no longer exists.",
      });
      return;
    }

    if (targetBranch.isRemote) {
      const firstSlashIndex = entry.name.indexOf("/");

      if (firstSlashIndex <= 0 || firstSlashIndex >= entry.name.length - 1) {
        toast.error("Remote branch format not supported", {
          description:
            "Expected format remote/branch-name. Try refreshing branch data.",
        });
        return;
      }

      const remoteName = entry.name.slice(0, firstSlashIndex);
      const remoteBranchName = entry.name.slice(firstSlashIndex + 1);

      setPendingDeleteBranchRemoteName(remoteName);
      setPendingDeleteBranchName(remoteBranchName);
      setIsDeleteRemoteBranch(true);
      setIsDeleteBranchConfirmOpen(true);
      return;
    }

    setPendingDeleteBranchRemoteName(null);
    setIsDeleteRemoteBranch(false);
    setPendingDeleteBranchName(entry.name);
    setIsDeleteBranchConfirmOpen(true);
  };

  const handleDeleteBranch = async () => {
    if (!(activeRepoId && pendingDeleteBranchName) || isDeletingBranch) {
      return;
    }

    setIsDeletingBranch(true);

    try {
      if (isDeleteRemoteBranch) {
        if (!pendingDeleteBranchRemoteName) {
          throw new Error("Remote branch context is missing");
        }

        await deleteRemoteBranch(
          activeRepoId,
          pendingDeleteBranchRemoteName,
          pendingDeleteBranchName
        );
        toast.success("Remote branch deleted", {
          description: `${pendingDeleteBranchRemoteName}/${pendingDeleteBranchName}`,
        });
      } else {
        await deleteBranch(activeRepoId, pendingDeleteBranchName);
        toast.success("Branch deleted", {
          description: `refs/heads/${pendingDeleteBranchName}`,
        });
      }

      setIsDeleteBranchConfirmOpen(false);
      setPendingDeleteBranchName(null);
      setPendingDeleteBranchRemoteName(null);
      setIsDeleteRemoteBranch(false);
    } catch (error) {
      if (isDeleteRemoteBranch) {
        toast.error("Failed to delete remote branch", {
          description: getDeleteRemoteBranchFailureReason(error),
        });
      } else {
        toast.error("Failed to delete branch", {
          description: getDeleteBranchFailureReason(error),
        });
      }
    } finally {
      setIsDeletingBranch(false);
    }
  };

  const openRenameBranchDialog = (entry: SidebarEntry) => {
    if (entry.type !== "branch" || isRenamingBranch) {
      return;
    }

    const targetBranch = branches.find(
      (branch) => branch.refType === "branch" && branch.name === entry.name
    );

    if (!targetBranch) {
      toast.error("Branch not found", {
        description: "The selected branch no longer exists.",
      });
      return;
    }

    if (targetBranch.isRemote) {
      toast.error("Cannot rename remote branch", {
        description:
          "This action renames local branches only. Rename remotes by pushing a new branch and deleting the old remote.",
      });
      return;
    }

    setRenameBranchSourceName(entry.name);
    setRenameBranchTargetName(entry.name);
    setIsRenameBranchDialogOpen(true);
  };

  const handleRenameBranch = async () => {
    if (
      !(activeRepoId && renameBranchSourceName) ||
      isRenamingBranch ||
      isSwitchingBranch
    ) {
      return;
    }

    const trimmedNewBranchName = renameBranchTargetName.trim();

    if (trimmedNewBranchName.length === 0) {
      toast.error("New branch name is required");
      return;
    }

    if (trimmedNewBranchName === renameBranchSourceName) {
      setIsRenameBranchDialogOpen(false);
      return;
    }

    setIsRenamingBranch(true);

    try {
      await renameBranch(
        activeRepoId,
        renameBranchSourceName,
        trimmedNewBranchName
      );
      toast.success("Branch renamed", {
        description: `${renameBranchSourceName} -> ${trimmedNewBranchName}`,
      });
      setIsRenameBranchDialogOpen(false);
      setRenameBranchSourceName(null);
      setRenameBranchTargetName("");
    } catch (error) {
      toast.error("Failed to rename branch", {
        description: getRenameBranchFailureReason(error),
      });
    } finally {
      setIsRenamingBranch(false);
    }
  };

  const openSetUpstreamDialog = (entry: SidebarEntry) => {
    if (entry.type !== "branch" || entry.isRemote || isSettingUpstream) {
      return;
    }

    const targetBranch = branches.find(
      (branch) =>
        branch.refType === "branch" &&
        !branch.isRemote &&
        branch.name === entry.name
    );

    if (!targetBranch) {
      toast.error("Branch not found", {
        description: "The selected local branch no longer exists.",
      });
      return;
    }

    if (activeRepoRemoteNames.length === 0) {
      toast.error("No remote configured", {
        description: "Add a remote first, then set upstream tracking.",
      });
      return;
    }

    const defaultRemoteName = activeRepoRemoteNames.includes("origin")
      ? "origin"
      : (activeRepoRemoteNames[0] ?? "origin");

    setSetUpstreamLocalBranchName(entry.name);
    setSetUpstreamRemoteName(defaultRemoteName);
    setSetUpstreamRemoteBranchName(entry.name);
    setSetUpstreamFormError(null);
    setIsSetUpstreamDialogOpen(true);
  };

  const handleSetUpstream = async () => {
    if (!(activeRepoId && setUpstreamLocalBranchName) || isSettingUpstream) {
      return;
    }

    const trimmedRemoteName = setUpstreamRemoteName.trim();
    const trimmedRemoteBranchName = setUpstreamRemoteBranchName.trim();

    if (
      trimmedRemoteName.length === 0 ||
      trimmedRemoteBranchName.length === 0
    ) {
      setSetUpstreamFormError("Remote and branch are required.");
      return;
    }

    setIsSettingUpstream(true);
    setSetUpstreamFormError(null);

    try {
      await setBranchUpstream(
        activeRepoId,
        setUpstreamLocalBranchName,
        trimmedRemoteName,
        trimmedRemoteBranchName
      );
      toast.success("Upstream set", {
        description: `${setUpstreamLocalBranchName} -> ${trimmedRemoteName}/${trimmedRemoteBranchName}`,
      });
      setIsSetUpstreamDialogOpen(false);
      setSetUpstreamLocalBranchName(null);
      setSetUpstreamRemoteName("");
      setSetUpstreamRemoteBranchName("");
      setSetUpstreamFormError(null);
    } catch (error) {
      setSetUpstreamFormError(getSetUpstreamFailureReason(error));
    } finally {
      setIsSettingUpstream(false);
    }
  };

  useEffect(() => {
    if (!isBranchCreateInputOpen) {
      return;
    }

    globalThis.requestAnimationFrame(() => {
      branchCreateInputRef.current?.focus();
    });
  }, [isBranchCreateInputOpen]);

  useEffect(() => {
    if (
      selectedTimelineRowId === WORKING_TREE_ROW_ID &&
      hasAnyWorkingTreeChanges
    ) {
      if (selectedCommitId !== WORKING_TREE_ROW_ID) {
        setSelectedCommitId(WORKING_TREE_ROW_ID);
      }
      return;
    }

    if (timelineCommits.length === 0) {
      const fallbackRowId = hasAnyWorkingTreeChanges
        ? WORKING_TREE_ROW_ID
        : null;

      if (selectedTimelineRowId !== fallbackRowId) {
        setSelectedTimelineRowId(fallbackRowId);
      }

      if (selectedCommitId !== fallbackRowId) {
        setSelectedCommitId(fallbackRowId);
      }
      return;
    }

    const selectedTimelineRow = selectedTimelineRowId
      ? (timelineRowById.get(selectedTimelineRowId) ?? null)
      : null;

    if (selectedTimelineRow) {
      const resolvedCommitHash =
        selectedTimelineRow.type === "commit"
          ? selectedTimelineRow.commitHash
          : selectedTimelineRow.anchorCommitHash;

      if (
        resolvedCommitHash &&
        timelineCommits.some((commit) => commit.hash === resolvedCommitHash)
      ) {
        if (selectedCommitId !== resolvedCommitHash) {
          setSelectedCommitId(resolvedCommitHash);
        }

        return;
      }
    }

    if (
      selectedCommitId &&
      timelineCommits.some((commit) => commit.hash === selectedCommitId)
    ) {
      if (selectedTimelineRowId !== selectedCommitId) {
        setSelectedTimelineRowId(selectedCommitId);
      }
      return;
    }

    const fallbackCommitHash =
      localHeadCommit?.hash ?? timelineCommits[0]?.hash ?? null;

    if (selectedTimelineRowId !== fallbackCommitHash) {
      setSelectedTimelineRowId(fallbackCommitHash);
    }

    if (selectedCommitId !== fallbackCommitHash) {
      setSelectedCommitId(fallbackCommitHash);
    }
  }, [
    timelineCommits,
    hasAnyWorkingTreeChanges,
    localHeadCommit,
    selectedCommitId,
    selectedTimelineRowId,
    timelineRowById,
  ]);

  useEffect(() => {
    if (activeRepoId === null) {
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
      setLastAiCommitGeneration(null);
      return;
    }

    setDraftCommitSummary("");
    setDraftCommitDescription("");
    setAmendPreviousCommit(false);
    setLastAiCommitGeneration(null);
  }, [activeRepoId]);

  useEffect(() => {
    if (activeRepoId === null) {
      return;
    }

    if (!commitDraftPrefill) {
      return;
    }

    setDraftCommitSummary(commitDraftPrefill.summary);
    setDraftCommitDescription(commitDraftPrefill.description);
    setAmendPreviousCommit(false);
    setLastAiCommitGeneration(null);
    clearRepoCommitDraftPrefill(activeRepoId);
  }, [activeRepoId, clearRepoCommitDraftPrefill, commitDraftPrefill]);

  useEffect(() => {
    if (activeRepoId === null) {
      setIsLoadingDiffPath(null);
      setDiffPreviewPanelState({ kind: "idle" });
      setOpenedDiffContext(null);
      setHasRequestedDiffSurface(false);
      setOpenedDiff(null);
      setOpenedDiffPath(null);
      setOpenedDiffStatusCode(null);
      setOpenedCommitDiff(null);
      setOpenedCommitDiffStatusCode(null);
      commitDiffCacheRef.current.clear();
      return;
    }

    setIsLoadingDiffPath(null);
    setDiffPreviewPanelState({ kind: "idle" });
    setOpenedDiffContext(null);
    setHasRequestedDiffSurface(false);
    setOpenedDiff(null);
    setOpenedDiffPath(null);
    setOpenedDiffStatusCode(null);
    setOpenedCommitDiff(null);
    setOpenedCommitDiffStatusCode(null);
    commitDiffCacheRef.current.clear();
  }, [activeRepoId]);

  useEffect(() => {
    const shouldLoadRepositoryFiles = showAllFiles || showAllCommitFiles;

    if (
      !(activeRepoId && shouldLoadRepositoryFiles) ||
      allRepositoryFiles.length > 0
    ) {
      return;
    }

    getRepositoryFiles(activeRepoId).catch(() => undefined);
  }, [
    activeRepoId,
    allRepositoryFiles.length,
    getRepositoryFiles,
    showAllCommitFiles,
    showAllFiles,
  ]);

  useEffect(() => {
    if (
      isWorkingTreeSelection ||
      !(
        (selectedCommit && isSelectedCommitRow) ||
        (selectedReferenceRevision && isSelectedReferenceRow)
      )
    ) {
      return;
    }

    setShowAllCommitFiles(false);
    setCommitFileFilterInputValue("");
    setCommitFileSortOrder("asc");
    setExpandedCommitTreeNodePaths({});
  }, [
    isSelectedCommitRow,
    isSelectedReferenceRow,
    isWorkingTreeSelection,
    selectedCommit,
    selectedReferenceRevision,
  ]);

  useEffect(() => {
    if (
      !activeRepoId ||
      isWorkingTreeSelection ||
      !selectedCommit ||
      !isSelectedCommitRow
    ) {
      setOpenedCommitDiff(null);
      setOpenedCommitDiffStatusCode(null);
      setIsLoadingCommitFilesHash(null);
      return;
    }

    if (commitFilesByHash[selectedCommit.hash]) {
      return;
    }

    let cancelled = false;
    setIsLoadingCommitFilesHash(selectedCommit.hash);

    getCommitFiles(activeRepoId, selectedCommit.hash)
      .then((files) => {
        if (cancelled) {
          return;
        }

        setCommitFilesByHash((current) => ({
          ...current,
          [selectedCommit.hash]: files,
        }));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsLoadingCommitFilesHash((current) =>
          current === selectedCommit.hash ? null : current
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeRepoId,
    commitFilesByHash,
    getCommitFiles,
    isSelectedCommitRow,
    isWorkingTreeSelection,
    selectedCommit,
  ]);
  useEffect(() => {
    if (
      !activeRepoId ||
      isWorkingTreeSelection ||
      !isSelectedReferenceRow ||
      !selectedReferenceRevision
    ) {
      return;
    }

    if (commitFilesByHash[selectedReferenceRevision]) {
      return;
    }

    let cancelled = false;
    setIsLoadingCommitFilesHash(selectedReferenceRevision);

    getCommitFiles(activeRepoId, selectedReferenceRevision)
      .then((files) => {
        if (cancelled) {
          return;
        }

        setCommitFilesByHash((current) => ({
          ...current,
          [selectedReferenceRevision]: files,
        }));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsLoadingCommitFilesHash((current) =>
          current === selectedReferenceRevision ? null : current
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeRepoId,
    commitFilesByHash,
    getCommitFiles,
    isSelectedReferenceRow,
    isWorkingTreeSelection,
    selectedReferenceRevision,
  ]);

  useEffect(() => {
    if (activeRepoId === null) {
      pendingMainScrollRestoreRef.current = null;
      wasRepoRefreshLoadingRef.current = isRepoRefreshLoading;
      return;
    }

    const wasRepoRefreshLoading = wasRepoRefreshLoadingRef.current;

    if (!wasRepoRefreshLoading && isRepoRefreshLoading) {
      const mainScrollContainer = mainScrollContainerRef.current;

      pendingMainScrollRestoreRef.current = mainScrollContainer
        ? {
            repoId: activeRepoId,
            scrollTop: mainScrollContainer.scrollTop,
            tabId: activeTabIdFromUrl,
          }
        : null;
    }

    if (wasRepoRefreshLoading && !isRepoRefreshLoading) {
      const pendingMainScrollRestore = pendingMainScrollRestoreRef.current;

      if (
        pendingMainScrollRestore &&
        pendingMainScrollRestore.repoId === activeRepoId &&
        pendingMainScrollRestore.tabId === activeTabIdFromUrl
      ) {
        globalThis.requestAnimationFrame(() => {
          const mainScroller = mainScrollContainerRef.current;

          if (!mainScroller) {
            return;
          }

          mainScroller.scrollTop = pendingMainScrollRestore.scrollTop;
        });
      }

      pendingMainScrollRestoreRef.current = null;
    }

    wasRepoRefreshLoadingRef.current = isRepoRefreshLoading;
  }, [activeRepoId, activeTabIdFromUrl, isRepoRefreshLoading]);

  useEffect(() => {
    const handleFocusSidebarFilter = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.altKey) || event.key.toLowerCase() !== "f") {
        return;
      }

      event.preventDefault();
      sidebarFilterInputRef.current?.focus();
      sidebarFilterInputRef.current?.select();
    };

    globalThis.addEventListener("keydown", handleFocusSidebarFilter);

    return () => {
      globalThis.removeEventListener("keydown", handleFocusSidebarFilter);
    };
  }, []);
  useEffect(
    () => () => {
      if (sidebarFilterDebounceRef.current !== null) {
        globalThis.clearTimeout(sidebarFilterDebounceRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const clampSidebarWidths = () => {
      const viewportWidth = globalThis.innerWidth;
      const shouldAutoCompact =
        viewportWidth <= TIMELINE_AUTO_COMPACT_BREAKPOINT;

      setIsTimelineGraphAutoCompact((current) =>
        current === shouldAutoCompact ? current : shouldAutoCompact
      );
      const hasRightSidebar =
        isRightSidebarOpen &&
        workspaceMode !== "blame" &&
        workspaceMode !== "history";
      const leftMaxWidth = getLeftSidebarMaxWidth(
        viewportWidth,
        rightSidebarWidthRef.current,
        hasRightSidebar
      );
      const nextLeftWidth = clampWidth(
        leftSidebarWidthRef.current,
        LEFT_SIDEBAR_MIN_WIDTH,
        leftMaxWidth
      );

      if (nextLeftWidth !== leftSidebarWidthRef.current) {
        setLeftSidebarWidth(nextLeftWidth);
      }

      const rightMaxWidth = getRightSidebarMaxWidth(
        viewportWidth,
        nextLeftWidth
      );
      const nextRightWidth = clampWidth(
        rightSidebarWidthRef.current,
        RIGHT_SIDEBAR_MIN_WIDTH,
        rightMaxWidth
      );

      if (nextRightWidth !== rightSidebarWidthRef.current) {
        setRightSidebarWidth(nextRightWidth);
      }
    };

    clampSidebarWidths();
    globalThis.addEventListener("resize", clampSidebarWidths);

    return () => {
      globalThis.removeEventListener("resize", clampSidebarWidths);
    };
  }, [isRightSidebarOpen, workspaceMode]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const viewportWidth = globalThis.innerWidth;

      if (resizeState.target === "left") {
        const leftMaxWidth = getLeftSidebarMaxWidth(
          viewportWidth,
          rightSidebarWidthRef.current,
          isRightSidebarOpenRef.current
        );
        setLeftSidebarWidth(
          clampWidth(
            resizeState.startWidth + delta,
            LEFT_SIDEBAR_MIN_WIDTH,
            leftMaxWidth
          )
        );
        return;
      }

      const rightMaxWidth = getRightSidebarMaxWidth(
        viewportWidth,
        leftSidebarWidthRef.current
      );
      setRightSidebarWidth(
        clampWidth(
          resizeState.startWidth - delta,
          RIGHT_SIDEBAR_MIN_WIDTH,
          rightMaxWidth
        )
      );
    };

    const handlePointerUp = () => {
      if (!sidebarResizeStateRef.current) {
        return;
      }

      sidebarResizeStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    globalThis.addEventListener("mousemove", handlePointerMove);
    globalThis.addEventListener("mouseup", handlePointerUp);

    return () => {
      globalThis.removeEventListener("mousemove", handlePointerMove);
      globalThis.removeEventListener("mouseup", handlePointerUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = commitDetailsResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      setCommitDetailsPanelHeight(
        clampWidth(
          resizeState.startHeight + (event.clientY - resizeState.startY),
          COMMIT_DETAILS_PANEL_MIN_HEIGHT,
          COMMIT_DETAILS_PANEL_MAX_HEIGHT
        )
      );
    };

    const resetCommitDetailsResizeState = () => {
      if (!commitDetailsResizeStateRef.current) {
        return;
      }

      commitDetailsResizeStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    globalThis.addEventListener("mousemove", handlePointerMove);
    globalThis.addEventListener("mouseup", resetCommitDetailsResizeState);

    return () => {
      globalThis.removeEventListener("mousemove", handlePointerMove);
      globalThis.removeEventListener("mouseup", resetCommitDetailsResizeState);
      resetCommitDetailsResizeState();
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = changesSectionsResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      setUnstagedSectionHeight(
        clampWidth(
          resizeState.startHeight + (event.clientY - resizeState.startY),
          resizeState.minHeight,
          resizeState.maxHeight
        )
      );
    };

    const resetChangesSectionsResizeState = () => {
      if (!changesSectionsResizeStateRef.current) {
        return;
      }

      changesSectionsResizeStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    globalThis.addEventListener("mousemove", handlePointerMove);
    globalThis.addEventListener("mouseup", resetChangesSectionsResizeState);

    return () => {
      globalThis.removeEventListener("mousemove", handlePointerMove);
      globalThis.removeEventListener(
        "mouseup",
        resetChangesSectionsResizeState
      );
      resetChangesSectionsResizeState();
    };
  }, []);

  useEffect(() => {
    if (!isChangesSectionsResizable) {
      return;
    }

    const clampUnstagedSectionHeight = () => {
      const layoutHeight =
        changesSectionsLayoutRef.current?.getBoundingClientRect().height ?? 0;

      if (layoutHeight <= CHANGES_SECTIONS_MIN_HEIGHT * 2) {
        return;
      }

      setUnstagedSectionHeight((current) =>
        clampWidth(
          current,
          CHANGES_SECTIONS_MIN_HEIGHT,
          layoutHeight - CHANGES_SECTIONS_MIN_HEIGHT
        )
      );
    };

    clampUnstagedSectionHeight();
    globalThis.addEventListener("resize", clampUnstagedSectionHeight);

    return () => {
      globalThis.removeEventListener("resize", clampUnstagedSectionHeight);
    };
  }, [isChangesSectionsResizable]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = workingTreeFilesPanelResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      setWorkingTreeFilesPanelHeight(
        clampWidth(
          resizeState.startHeight + (event.clientY - resizeState.startY),
          resizeState.minHeight,
          resizeState.maxHeight
        )
      );
    };

    const resetWorkingTreeFilesPanelResizeState = () => {
      if (!workingTreeFilesPanelResizeStateRef.current) {
        return;
      }

      workingTreeFilesPanelResizeStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    globalThis.addEventListener("mousemove", handlePointerMove);
    globalThis.addEventListener(
      "mouseup",
      resetWorkingTreeFilesPanelResizeState
    );

    return () => {
      globalThis.removeEventListener("mousemove", handlePointerMove);
      globalThis.removeEventListener(
        "mouseup",
        resetWorkingTreeFilesPanelResizeState
      );
      resetWorkingTreeFilesPanelResizeState();
    };
  }, []);

  useEffect(() => {
    if (!isWorkingTreeSelection) {
      return;
    }

    const clampWorkingTreeFilesPanelHeight = () => {
      const currentHeight = workingTreeFilesPanelHeightRef.current;

      if (currentHeight === null) {
        return;
      }

      const layoutHeight =
        workingTreeFilesPanelLayoutRef.current?.getBoundingClientRect()
          .height ?? 0;
      const commitFormHeight =
        commitComposerFormRef.current?.getBoundingClientRect().height ?? 0;
      const maxHeight =
        layoutHeight -
        commitFormHeight -
        WORKING_TREE_FILES_PANEL_RESIZE_HANDLE_HEIGHT;

      if (maxHeight <= WORKING_TREE_FILES_PANEL_MIN_HEIGHT) {
        setWorkingTreeFilesPanelHeight(WORKING_TREE_FILES_PANEL_MIN_HEIGHT);
        return;
      }

      setWorkingTreeFilesPanelHeight((value) =>
        value === null
          ? value
          : clampWidth(value, WORKING_TREE_FILES_PANEL_MIN_HEIGHT, maxHeight)
      );
    };

    clampWorkingTreeFilesPanelHeight();
    globalThis.addEventListener("resize", clampWorkingTreeFilesPanelHeight);

    return () => {
      globalThis.removeEventListener(
        "resize",
        clampWorkingTreeFilesPanelHeight
      );
    };
  }, [isWorkingTreeSelection]);

  const scheduleSidebarFilterUpdate = (nextValue: string) => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
    }

    sidebarFilterDebounceRef.current = globalThis.setTimeout(() => {
      startSidebarFilterTransition(() => {
        setSidebarFilterQuery(nextValue);
      });
      sidebarFilterDebounceRef.current = null;
    }, SIDEBAR_FILTER_DEBOUNCE_MS);
  };

  const clearSidebarFilter = () => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
      sidebarFilterDebounceRef.current = null;
    }

    setSidebarFilterInputValue("");
    setSidebarFilterQuery("");
  };

  const startSidebarResize =
    (target: SidebarResizeTarget) =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      sidebarResizeStateRef.current = {
        startWidth: target === "left" ? leftSidebarWidth : rightSidebarWidth,
        startX: event.clientX,
        target,
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    };

  const startCommitDetailsResize = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    commitDetailsResizeStateRef.current = {
      startHeight: commitDetailsPanelHeightRef.current,
      startY: event.clientY,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
  };

  const startChangesSectionsResize = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const layoutHeight =
      changesSectionsLayoutRef.current?.getBoundingClientRect().height ?? 0;

    if (layoutHeight <= CHANGES_SECTIONS_MIN_HEIGHT * 2) {
      return;
    }

    changesSectionsResizeStateRef.current = {
      maxHeight: layoutHeight - CHANGES_SECTIONS_MIN_HEIGHT,
      minHeight: CHANGES_SECTIONS_MIN_HEIGHT,
      startHeight: unstagedSectionHeightRef.current,
      startY: event.clientY,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
  };

  const startWorkingTreeFilesPanelResize = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const layoutHeight =
      workingTreeFilesPanelLayoutRef.current?.getBoundingClientRect().height ??
      0;
    const commitFormHeight =
      commitComposerFormRef.current?.getBoundingClientRect().height ?? 0;
    const panelHeight =
      workingTreeFilesPanelRef.current?.getBoundingClientRect().height ?? 0;
    const maxHeight =
      layoutHeight -
      commitFormHeight -
      WORKING_TREE_FILES_PANEL_RESIZE_HANDLE_HEIGHT;

    if (maxHeight <= WORKING_TREE_FILES_PANEL_MIN_HEIGHT) {
      return;
    }

    const initialPanelHeight =
      panelHeight > 0
        ? panelHeight
        : (workingTreeFilesPanelHeightRef.current ?? maxHeight);

    workingTreeFilesPanelResizeStateRef.current = {
      maxHeight,
      minHeight: WORKING_TREE_FILES_PANEL_MIN_HEIGHT,
      startHeight: clampWidth(
        initialPanelHeight,
        WORKING_TREE_FILES_PANEL_MIN_HEIGHT,
        maxHeight
      ),
      startY: event.clientY,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
  };

  const setTimelineGraphCompactMode = (isCompact: boolean) => {
    setRepoTimelinePreferences({ compactGraph: isCompact });
  };
  const setTimelineColumnVisibility = (
    columnId: RepoTimelineColumnId,
    visible: boolean
  ) => {
    setRepoTimelinePreferences((current) => {
      const visibleColumnCount = Object.values(current.visibleColumns).filter(
        Boolean
      ).length;

      if (!visible && visibleColumnCount <= 1) {
        return current;
      }

      return {
        visibleColumns: {
          ...current.visibleColumns,
          [columnId]: visible,
        },
      };
    });
  };
  const resetTimelineLayout = (mode: "compact" | "default") => {
    const nextPreferences =
      mode === "compact"
        ? TIMELINE_COMPACT_LAYOUT_PREFERENCES
        : DEFAULT_REPO_TIMELINE_PREFERENCES;

    setRepoTimelinePreferences({
      compactGraph: nextPreferences.compactGraph,
      smartBranchVisibility: nextPreferences.smartBranchVisibility,
      visibleColumns: { ...nextPreferences.visibleColumns },
    });
  };

  const preventLeftClickInMenus = (event: React.MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleEntryContextMenuOpenChange = useCallback(
    (entryMenuKey: string, open: boolean) => {
      if (open) {
        setOpenEntryDropdownMenuKey(null);
      }

      setOpenEntryContextMenuKey((current) => {
        if (open) {
          return entryMenuKey;
        }

        if (current === entryMenuKey) {
          return null;
        }

        return current;
      });
    },
    []
  );

  const handleEntryDropdownMenuOpenChange = useCallback(
    (entryMenuKey: string, open: boolean) => {
      if (open) {
        setOpenEntryContextMenuKey(null);
      }

      setOpenEntryDropdownMenuKey((current) => {
        if (open) {
          return entryMenuKey;
        }

        if (current === entryMenuKey) {
          return null;
        }

        return current;
      });
    },
    []
  );

  const handleCommitMenuOpenChange = useCallback(
    (commitHash: string, open: boolean) => {
      setOpenCommitMenuHash((current) => {
        if (open) {
          return commitHash;
        }

        if (current === commitHash) {
          return null;
        }

        return current;
      });
    },
    []
  );

  const renderEntryIcon = (entry: SidebarEntry) => {
    if (entry.type === "stash") {
      return <StackSimpleIcon className="size-3 shrink-0" />;
    }

    if (entry.type === "tag") {
      return <TagIcon className="size-3 shrink-0" />;
    }

    return <GitBranchIcon className="size-3 shrink-0" />;
  };

  const resolveSidebarEntryActionsLabel = (entry: SidebarEntry): string => {
    if (entry.type === "stash") {
      return "Stash actions";
    }

    if (entry.type === "tag") {
      return "Tag actions";
    }

    return "Branch actions";
  };

  const getSidebarGraphEntryVisibilityKey = (
    entry: Pick<SidebarEntry, "type" | "name" | "stashRef">
  ): string => {
    if (entry.type === "stash") {
      return `stash:${entry.stashRef ?? entry.name}`;
    }

    return `${entry.type}:${entry.name}`;
  };
  const isSidebarEntryHiddenInGraph = (
    entry: Pick<SidebarEntry, "active" | "type" | "name" | "stashRef">
  ): boolean => {
    if (entry.type === "branch" && entry.active) {
      return false;
    }

    const visibilityKey = getSidebarGraphEntryVisibilityKey(entry);

    return hiddenSidebarGraphEntryKeys[visibilityKey] === true;
  };
  const toggleSidebarEntryGraphVisibility = (entry: SidebarEntry) => {
    if (entry.type === "branch" && entry.active) {
      return;
    }

    const visibilityKey = getSidebarGraphEntryVisibilityKey(entry);

    persistRepoFileBrowserState((current) => {
      const next = { ...current.hiddenGraphEntryKeys };

      if (next[visibilityKey]) {
        delete next[visibilityKey];
      } else {
        next[visibilityKey] = true;
      }

      return { hiddenGraphEntryKeys: next };
    });
  };

  const renderSidebarEntryLeadIndicator = (
    groupKey: string,
    entry: SidebarEntry
  ) => {
    const isHiddenInGraph = isSidebarEntryHiddenInGraph(entry);
    const isActiveLocalBranch =
      groupKey === "local" && entry.type === "branch" && entry.active;
    const indicatorLabel = isHiddenInGraph
      ? "Show in the graph"
      : "Hide in the graph";

    const eyeButton = (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label={indicatorLabel}
              className="inline-flex size-3 items-center justify-center text-muted-foreground/75 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleSidebarEntryGraphVisibility(entry);
              }}
              type="button"
            />
          }
        >
          {isHiddenInGraph ? (
            <EyeSlashIcon className="size-3" />
          ) : (
            <EyeIcon className="size-3" />
          )}
        </TooltipTrigger>
        <TooltipContent align="start" side="right" sideOffset={6}>
          {indicatorLabel}
        </TooltipContent>
      </Tooltip>
    );

    if (isActiveLocalBranch) {
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex w-3 shrink-0 items-center justify-center text-emerald-500">
                <CheckCircleIcon className="size-3" />
              </span>
            }
          >
            Checked out
          </TooltipTrigger>
          <TooltipContent align="start" side="right" sideOffset={6}>
            Checked out
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <span className="inline-flex w-3 shrink-0 items-center justify-center">
        {eyeButton}
      </span>
    );
  };

  const renderHighlightedEntryName = (name: string) => {
    if (normalizedSidebarFilter.length === 0) {
      return name;
    }

    const normalizedName = name.toLowerCase();
    const firstMatchIndex = normalizedName.indexOf(normalizedSidebarFilter);

    if (firstMatchIndex < 0) {
      return name;
    }

    const highlightedParts: ReactNode[] = [];
    let searchFrom = 0;
    let key = 0;

    while (searchFrom < name.length) {
      const matchIndex = normalizedName.indexOf(
        normalizedSidebarFilter,
        searchFrom
      );

      if (matchIndex < 0) {
        const tail = name.slice(searchFrom);
        if (tail.length > 0) {
          highlightedParts.push(tail);
        }
        break;
      }

      const beforeMatch = name.slice(searchFrom, matchIndex);
      if (beforeMatch.length > 0) {
        highlightedParts.push(beforeMatch);
      }

      const matchedText = name.slice(
        matchIndex,
        matchIndex + normalizedSidebarFilter.length
      );
      highlightedParts.push(
        <span
          className="bg-primary/20 px-0.5 text-foreground"
          key={`${name}-${key}`}
        >
          {matchedText}
        </span>
      );
      key += 1;
      searchFrom = matchIndex + normalizedSidebarFilter.length;
    }

    return <>{highlightedParts}</>;
  };
  const toggleBranchFolder = (groupKey: string, folderPath: string) => {
    const stateKey = `${groupKey}:${folderPath}`;

    setCollapsedBranchFolderKeys((current) => ({
      ...current,
      [stateKey]: !current[stateKey],
    }));
  };
  const renderSidebarBranchCounts = (entry: SidebarEntry) => {
    return (
      <>
        {typeof entry.pendingSyncCount === "number" &&
        entry.pendingSyncCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs opacity-90">
            <ArrowLineDownIcon className="size-3" />
            {entry.pendingSyncCount}
          </span>
        ) : null}
        {typeof entry.pendingPushCount === "number" &&
        entry.pendingPushCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs opacity-90">
            <ArrowLineUpIcon className="size-3" />
            {entry.pendingPushCount}
          </span>
        ) : null}
      </>
    );
  };
  const renderProgressiveLoadingMessage = (label: string) => (
    <p className="px-2 py-1 text-muted-foreground text-xs">
      Loading more {label}...
    </p>
  );
  const renderSidebarBranchTreeNodes = (
    groupKey: string,
    nodes: BranchTreeNode[],
    depth = 0,
    budget: RenderBudget = createRenderBudget(Number.POSITIVE_INFINITY)
  ): ReactNode => {
    const renderedNodes: ReactNode[] = [];

    for (const node of nodes) {
      if (budget.remaining <= 0) {
        break;
      }

      budget.remaining -= 1;
      const hasChildren = node.children.length > 0;

      if (node.entry) {
        const entry = node.entry;
        const entryMenuKey = `${groupKey}-${entry.stashRef ?? entry.name}`;
        const entryActionsLabel = resolveSidebarEntryActionsLabel(entry);
        const isEntryMenuOpen =
          openEntryContextMenuKey === entryMenuKey ||
          openEntryDropdownMenuKey === entryMenuKey;
        const isEntryContextMenuOpen = openEntryContextMenuKey === entryMenuKey;
        const isEntryDropdownMenuOpen =
          openEntryDropdownMenuKey === entryMenuKey;
        const remoteGroupItemInsetRem =
          groupKey === "remote" ? SIDEBAR_TREE_DEPTH_PADDING_REM : 0;

        renderedNodes.push(
          <SidebarMenuItem key={entryMenuKey}>
            <ContextMenu
              onOpenChange={(open) => {
                handleEntryContextMenuOpenChange(entryMenuKey, open);
              }}
              open={isEntryContextMenuOpen}
            >
              <ContextMenuTrigger>
                <SidebarMenuButton
                  aria-label={entry.name}
                  className={cn(
                    "group gap-1.5 rounded-none px-1 py-1 text-xs",
                    isSidebarEntrySelected(entry) || isEntryMenuOpen
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                  disabled={isSwitchingBranch}
                  onClick={() => {
                    handleSidebarEntryClick(entry);
                  }}
                  onDoubleClick={() => {
                    handleSidebarEntryDoubleClick(entry);
                  }}
                  style={{
                    paddingLeft: `${depth * SIDEBAR_TREE_DEPTH_PADDING_REM + SIDEBAR_TREE_BASE_PADDING_REM + remoteGroupItemInsetRem}rem`,
                  }}
                >
                  {renderSidebarEntryLeadIndicator(groupKey, entry)}
                  {renderEntryIcon(entry)}
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="min-w-0 flex-1 truncate" />}
                    >
                      {renderHighlightedEntryName(node.name)}
                    </TooltipTrigger>
                    <TooltipContent align="start" side="right" sideOffset={6}>
                      {entry.name}
                    </TooltipContent>
                  </Tooltip>
                  {renderSidebarBranchCounts(entry)}
                  <DropdownMenu
                    onOpenChange={(open) => {
                      handleEntryDropdownMenuOpenChange(entryMenuKey, open);
                    }}
                    open={isEntryDropdownMenuOpen}
                  >
                    <DropdownMenuTrigger
                      render={
                        <button
                          aria-label={`More options for ${entry.name}`}
                          className={cn(
                            "ml-0.5 inline-flex size-4 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-accent/80 focus-visible:opacity-100 group-hover:opacity-100",
                            isEntryMenuOpen && "opacity-100",
                            entry.active && "hover:bg-accent-foreground/10"
                          )}
                          onClick={(event) => event.stopPropagation()}
                          type="button"
                        />
                      }
                    >
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="inline-flex items-center" />}
                        >
                          <DotsThreeVerticalIcon className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent
                          align="start"
                          side="right"
                          sideOffset={6}
                        >
                          {entryActionsLabel}
                        </TooltipContent>
                      </Tooltip>
                    </DropdownMenuTrigger>
                    {isEntryDropdownMenuOpen
                      ? renderEntryDropdownMenuContent(entry)
                      : null}
                  </DropdownMenu>
                </SidebarMenuButton>
              </ContextMenuTrigger>
              {isEntryContextMenuOpen
                ? renderEntryContextMenuContent(entry)
                : null}
            </ContextMenu>
          </SidebarMenuItem>
        );

        continue;
      }

      const folderStateKey = `${groupKey}:${node.fullPath}`;
      const isRemoteRootFolder = groupKey === "remote" && depth === 0;
      const isCollapsed =
        collapsedBranchFolderKeys[folderStateKey] ?? depth > 0;
      const remoteGroupItemInsetRem =
        groupKey === "remote" && depth > 0 ? SIDEBAR_TREE_DEPTH_PADDING_REM : 0;

      renderedNodes.push(
        <div key={folderStateKey}>
          <button
            className="focus-visible:desktop-focus flex w-full items-center gap-1.5 px-1 py-0.5 text-left text-muted-foreground text-xs hover:bg-accent/20 hover:text-foreground"
            onClick={() => toggleBranchFolder(groupKey, node.fullPath)}
            style={{
              paddingLeft: `${depth * SIDEBAR_TREE_DEPTH_PADDING_REM + SIDEBAR_TREE_BASE_PADDING_REM + remoteGroupItemInsetRem}rem`,
            }}
            type="button"
          >
            {isRemoteRootFolder ? null : (
              <span className="inline-flex w-3 shrink-0 items-center justify-center">
                {isCollapsed ? (
                  <CaretRightIcon className="size-3" />
                ) : (
                  <CaretDownIcon className="size-3" />
                )}
              </span>
            )}
            {isRemoteRootFolder ? (
              <span className="inline-flex w-3 shrink-0 items-center justify-center" />
            ) : null}
            {isRemoteRootFolder ? (
              <Avatar className="size-3.5 shrink-0">
                <AvatarImage
                  alt={`${node.name} owner avatar`}
                  src={remoteAvatarUrlByName[node.name] ?? undefined}
                />
                <AvatarFallback className="bg-transparent p-0 text-muted-foreground/70">
                  <GithubLogoIcon className="size-3.5" />
                </AvatarFallback>
              </Avatar>
            ) : null}
            <span className="min-w-0 flex-1 truncate" title={node.fullPath}>
              {renderHighlightedEntryName(node.name)}
            </span>
          </button>
          {hasChildren && !isCollapsed ? (
            <div>
              {renderSidebarBranchTreeNodes(
                groupKey,
                node.children,
                depth + 1,
                budget
              )}
            </div>
          ) : null}
        </div>
      );

      if (budget.remaining <= 0) {
        break;
      }
    }

    return renderedNodes;
  };
  const renderSidebarFlatEntries = (
    groupKey: string,
    entries: SidebarEntry[],
    budget: RenderBudget
  ): ReactNode => {
    const renderedEntries: ReactNode[] = [];

    for (const entry of entries) {
      if (budget.remaining <= 0) {
        break;
      }

      budget.remaining -= 1;
      const entryMenuKey = `${groupKey}-${entry.stashRef ?? entry.name}`;
      const entryActionsLabel = resolveSidebarEntryActionsLabel(entry);
      const isEntryMenuOpen =
        openEntryContextMenuKey === entryMenuKey ||
        openEntryDropdownMenuKey === entryMenuKey;
      const isEntryContextMenuOpen = openEntryContextMenuKey === entryMenuKey;
      const isEntryDropdownMenuOpen = openEntryDropdownMenuKey === entryMenuKey;

      renderedEntries.push(
        <SidebarMenuItem key={entryMenuKey}>
          <ContextMenu
            onOpenChange={(open) => {
              handleEntryContextMenuOpenChange(entryMenuKey, open);
            }}
            open={isEntryContextMenuOpen}
          >
            <ContextMenuTrigger>
              <SidebarMenuButton
                aria-label={entry.name}
                className={cn(
                  "group gap-1.5 rounded-none py-1 text-xs",
                  isSidebarEntrySelected(entry) || isEntryMenuOpen
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                disabled={isSwitchingBranch}
                onClick={() => {
                  handleSidebarEntryClick(entry);
                }}
                onDoubleClick={() => {
                  handleSidebarEntryDoubleClick(entry);
                }}
              >
                {renderSidebarEntryLeadIndicator(groupKey, entry)}
                {renderEntryIcon(entry)}
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="min-w-0 flex-1 truncate" />}
                  >
                    {renderHighlightedEntryName(entry.name)}
                  </TooltipTrigger>
                  <TooltipContent align="start" side="right" sideOffset={6}>
                    {entry.name}
                  </TooltipContent>
                </Tooltip>
                {renderSidebarBranchCounts(entry)}
                <DropdownMenu
                  onOpenChange={(open) => {
                    handleEntryDropdownMenuOpenChange(entryMenuKey, open);
                  }}
                  open={isEntryDropdownMenuOpen}
                >
                  <DropdownMenuTrigger
                    render={
                      <button
                        aria-label={`More options for ${entry.name}`}
                        className={cn(
                          "ml-0.5 inline-flex size-4 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-accent/80 focus-visible:opacity-100 group-hover:opacity-100",
                          isEntryMenuOpen && "opacity-100",
                          entry.active && "hover:bg-accent-foreground/10"
                        )}
                        onClick={(event) => event.stopPropagation()}
                        type="button"
                      />
                    }
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="inline-flex items-center" />}
                      >
                        <DotsThreeVerticalIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent align="start" side="right" sideOffset={6}>
                        {entryActionsLabel}
                      </TooltipContent>
                    </Tooltip>
                  </DropdownMenuTrigger>
                  {isEntryDropdownMenuOpen
                    ? renderEntryDropdownMenuContent(entry)
                    : null}
                </DropdownMenu>
              </SidebarMenuButton>
            </ContextMenuTrigger>
            {isEntryContextMenuOpen
              ? renderEntryContextMenuContent(entry)
              : null}
          </ContextMenu>
        </SidebarMenuItem>
      );
    }

    return renderedEntries;
  };

  const handleCheckoutBranch = async (entry: SidebarEntry) => {
    if (
      entry.type === "stash" ||
      entry.active ||
      !activeRepoId ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsSwitchingBranch(true);

    try {
      await switchBranch(activeRepoId, entry.name);
      toast.success("Checkout Successful", {
        description: `refs/heads/${entry.name}`,
      });
    } catch (error) {
      toast.error("Failed to switch branch", {
        description: getCheckoutFailureReason(error),
      });
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  const handleCheckoutCommit = async (
    target: string,
    targetLabel: string,
    rowId?: string | null
  ) => {
    if (!activeRepoId || isCheckingOutCommit) {
      return;
    }

    setIsCheckingOutCommit(true);

    try {
      await checkoutCommit(activeRepoId, target);
      if (rowId) {
        setSelectedTimelineRowId(rowId);
        setSelectedCommitId(target);
      }
      toast.success("Checkout Successful", {
        description: targetLabel,
      });
    } catch (error) {
      toast.error("Failed to checkout commit", {
        description: getCommitActionFailureReason(error, "checkout"),
      });
    } finally {
      setIsCheckingOutCommit(false);
    }
  };

  const openCreateBranchAtReferenceDialog = (
    target: string,
    targetLabel: string
  ) => {
    if (isCreatingRefBranch) {
      return;
    }

    setCreateRefBranchTarget(target);
    setCreateRefBranchLabel(targetLabel);
    setCreateRefBranchName("");
    setIsCreateRefBranchDialogOpen(true);
  };

  const handleCreateBranchAtReference = async () => {
    if (!(activeRepoId && createRefBranchTarget) || isCreatingRefBranch) {
      return;
    }

    const trimmedBranchName = createRefBranchName.trim();

    if (trimmedBranchName.length === 0) {
      toast.error("Branch name is required");
      return;
    }

    setIsCreatingRefBranch(true);

    try {
      await createBranchAtReference(
        activeRepoId,
        trimmedBranchName,
        createRefBranchTarget
      );
      toast.success("Branch created", {
        description: `${trimmedBranchName} at ${createRefBranchLabel}`,
      });
      setIsCreateRefBranchDialogOpen(false);
      setCreateRefBranchTarget(null);
      setCreateRefBranchLabel("");
      setCreateRefBranchName("");
    } catch (error) {
      toast.error("Failed to create branch", {
        description: getCommitActionFailureReason(error, "create-branch"),
      });
    } finally {
      setIsCreatingRefBranch(false);
    }
  };

  const openCreateTagDialog = (
    target: string,
    targetLabel: string,
    annotated: boolean
  ) => {
    if (isCreatingTagAtReference) {
      return;
    }

    setCreateTagTarget(target);
    setCreateTagTargetLabel(targetLabel);
    setCreateTagAnnotated(annotated);
    setCreateTagNameValue("");
    setIsCreateTagDialogOpen(true);
  };

  const handleCreateTagAtReference = async () => {
    if (!(activeRepoId && createTagTarget) || isCreatingTagAtReference) {
      return;
    }

    const trimmedTagName = createTagNameValue.trim();

    if (trimmedTagName.length === 0) {
      toast.error("Tag name is required");
      return;
    }

    setIsCreatingTagAtReference(true);

    try {
      await createTag(
        activeRepoId,
        trimmedTagName,
        createTagTarget,
        createTagAnnotated,
        createTagAnnotated ? trimmedTagName : undefined
      );
      toast.success(
        createTagAnnotated ? "Annotated tag created" : "Tag created",
        {
          description: `${trimmedTagName} at ${createTagTargetLabel}`,
        }
      );
      setIsCreateTagDialogOpen(false);
      setCreateTagTarget(null);
      setCreateTagTargetLabel("");
      setCreateTagNameValue("");
      setCreateTagAnnotated(false);
    } catch (error) {
      toast.error("Failed to create tag", {
        description: getCommitActionFailureReason(error, "create-tag"),
      });
    } finally {
      setIsCreatingTagAtReference(false);
    }
  };

  const openResetConfirm = (
    target: string,
    targetLabel: string,
    mode: "hard" | "mixed" | "soft"
  ) => {
    if (isResettingToReference) {
      return;
    }

    setResetTarget(target);
    setResetTargetLabel(targetLabel);
    setResetTargetMode(mode);
    setIsResetConfirmOpen(true);
  };
  const openDropCommitConfirm = (target: string, targetLabel: string) => {
    if (isDroppingCommit) {
      return;
    }

    setPendingDropCommitHash(target);
    setPendingDropCommitLabel(targetLabel);
    setIsDropCommitConfirmOpen(true);
  };

  const handleResetToCommit = async () => {
    if (!(activeRepoId && resetTarget) || isResettingToReference) {
      return;
    }

    setIsResettingToReference(true);

    try {
      await resetToReference(activeRepoId, resetTarget, resetTargetMode);
      toast.success("Reset completed", {
        description: `${resetTargetMode} -> ${resetTargetLabel}`,
      });
      setIsResetConfirmOpen(false);
      setResetTarget(null);
      setResetTargetLabel("");
      setResetTargetMode("mixed");
    } catch (error) {
      toast.error("Failed to reset", {
        description: getCommitActionFailureReason(error, "reset"),
      });
    } finally {
      setIsResettingToReference(false);
    }
  };
  const handleDropCommit = async () => {
    if (!(activeRepoId && pendingDropCommitHash) || isDroppingCommit) {
      return;
    }

    setIsDroppingCommit(true);

    try {
      const result = await dropCommit(activeRepoId, pendingDropCommitHash);
      setIsDropCommitConfirmOpen(false);
      setPendingDropCommitHash(null);
      setPendingDropCommitLabel("");
      setSelectedCommitId(result.selectedCommitHash);
      setSelectedTimelineRowId(result.selectedCommitHash);
      toast.success("Commit dropped", {
        description:
          pendingDropCommitRebaseImpactCount > 0
            ? `Rebased ${pendingDropCommitRebaseImpactCount} descendant commit${pendingDropCommitRebaseImpactCount === 1 ? "" : "s"}`
            : "Removed the selected commit from the current history path",
      });
    } catch (error) {
      toast.error("Failed to drop commit", {
        description: getCommitActionFailureReason(error, "drop"),
      });
    } finally {
      setIsDroppingCommit(false);
    }
  };

  const handleCherryPickAtReference = async (
    target: string,
    targetLabel: string
  ) => {
    if (!activeRepoId || isCherryPickingCommit) {
      return;
    }

    setIsCherryPickingCommit(true);

    try {
      await cherryPickCommit(activeRepoId, target);
      toast.success("Cherry-pick completed", {
        description: targetLabel,
      });
    } catch (error) {
      toast.error("Failed to cherry-pick commit", {
        description: getCommitActionFailureReason(error, "cherry-pick"),
      });
    } finally {
      setIsCherryPickingCommit(false);
    }
  };

  const handleRevertAtReference = async (
    target: string,
    targetLabel: string
  ) => {
    if (!activeRepoId || isRevertingCommit) {
      return;
    }

    setIsRevertingCommit(true);

    try {
      await revertCommit(activeRepoId, target);
      toast.success("Revert completed", {
        description: targetLabel,
      });
    } catch (error) {
      toast.error("Failed to revert commit", {
        description: getCommitActionFailureReason(error, "revert"),
      });
    } finally {
      setIsRevertingCommit(false);
    }
  };
  const handleSubmitCommitReword = async () => {
    if (
      !(activeRepoId && selectedCommit) ||
      isRewordingCommitMessage ||
      rewordCommitSummary.trim().length === 0
    ) {
      return;
    }

    setIsRewordingCommitMessage(true);

    try {
      const result = await rewordCommitMessage(
        activeRepoId,
        selectedCommit.hash,
        rewordCommitSummary,
        rewordCommitDescription
      );
      setSelectedCommitId(result.updatedCommitHash);
      setSelectedTimelineRowId(result.updatedCommitHash);
      setIsEditingSelectedCommitMessage(false);
      toast.success("Commit message updated", {
        description:
          selectedCommitRebaseImpactCount > 0
            ? `Rebased ${selectedCommitRebaseImpactCount} descendant commit${selectedCommitRebaseImpactCount === 1 ? "" : "s"}`
            : "Updated the selected commit message",
      });
    } catch (error) {
      toast.error("Failed to update commit message", {
        description: getCommitActionFailureReason(error, "reword"),
      });
    } finally {
      setIsRewordingCommitMessage(false);
    }
  };

  const handleApplyStash = async (entry: SidebarEntry) => {
    if (
      entry.type !== "stash" ||
      !entry.stashRef ||
      !activeRepoId ||
      isApplyingStash
    ) {
      return;
    }

    setIsApplyingStash(true);
    const stashDraft = parseStashDraft(entry.stashMessage ?? "");

    const focusCommitSummaryInput = () => {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(() => {
          const summaryInput = commitSummaryInputRef.current;

          if (!summaryInput) {
            return;
          }

          summaryInput.focus();
          summaryInput.select();
        });
      });
    };

    try {
      await applyStash(activeRepoId, entry.stashRef);
      setDraftCommitSummary(stashDraft.summary);
      setDraftCommitDescription(stashDraft.description);
      setSelectedTimelineRowId(WORKING_TREE_ROW_ID);
      setSelectedCommitId(WORKING_TREE_ROW_ID);
      setIsRightSidebarOpen(true);
      focusCommitSummaryInput();
    } finally {
      setIsApplyingStash(false);
    }
  };

  const handlePopStash = async (entry: SidebarEntry) => {
    if (
      entry.type !== "stash" ||
      !entry.stashRef ||
      !activeRepoId ||
      isPoppingStash
    ) {
      return;
    }

    setIsPoppingStash(true);
    const stashDraft = parseStashDraft(entry.stashMessage ?? "");

    const focusCommitSummaryInput = () => {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(() => {
          const summaryInput = commitSummaryInputRef.current;

          if (!summaryInput) {
            return;
          }

          summaryInput.focus();
          summaryInput.select();
        });
      });
    };

    try {
      await popStash(activeRepoId, entry.stashRef);
      setDraftCommitSummary(stashDraft.summary);
      setDraftCommitDescription(stashDraft.description);
      setSelectedTimelineRowId(WORKING_TREE_ROW_ID);
      setSelectedCommitId(WORKING_TREE_ROW_ID);
      setIsRightSidebarOpen(true);
      focusCommitSummaryInput();
    } finally {
      setIsPoppingStash(false);
    }
  };

  const handleCreateStash = async () => {
    if (!activeRepoId || isCreatingStash || !canCreateStash) {
      return;
    }

    setIsCreatingStash(true);

    try {
      await createStash(
        activeRepoId,
        draftCommitSummary.trim(),
        draftCommitDescription.trim()
      );
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
      setPushAfterCommit(false);
      setSkipCommitHooks(false);
      setLastAiCommitGeneration(null);
      preAmendDraftRef.current = null;
    } finally {
      setIsCreatingStash(false);
    }
  };

  const handlePopCurrentStash = async () => {
    if (!activeRepoId || isPoppingStash || !canPopCurrentStash) {
      return;
    }

    setIsPoppingStash(true);
    const currentStash =
      stashes.find((stash) => stash.ref === "stash@{0}") ?? stashes[0] ?? null;
    const stashDraft = parseStashDraft(currentStash?.message ?? "");

    const focusCommitSummaryInput = () => {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(() => {
          const summaryInput = commitSummaryInputRef.current;

          if (!summaryInput) {
            return;
          }

          summaryInput.focus();
          summaryInput.select();
        });
      });
    };

    try {
      await popStash(activeRepoId, "stash@{0}");
      setDraftCommitSummary(stashDraft.summary);
      setDraftCommitDescription(stashDraft.description);
      setSelectedTimelineRowId(WORKING_TREE_ROW_ID);
      setSelectedCommitId(WORKING_TREE_ROW_ID);
      setIsRightSidebarOpen(true);
      focusCommitSummaryInput();
    } finally {
      setIsPoppingStash(false);
    }
  };

  const handleDropStash = async (entry: SidebarEntry) => {
    if (
      entry.type !== "stash" ||
      !entry.stashRef ||
      !activeRepoId ||
      isDroppingStash
    ) {
      return;
    }

    setIsDroppingStash(true);

    try {
      await dropStash(activeRepoId, entry.stashRef);
    } finally {
      setIsDroppingStash(false);
    }
  };

  const handlePullAction = async (mode: PullActionMode) => {
    if (!activeRepoId || isPulling) {
      return;
    }
    setIsPulling(true);
    setPullActionMode(mode);
    try {
      const result = await pullBranch(activeRepoId, mode);
      if (result.headChanged) {
        toast.success("Pull completed", {
          description: pullActionLabelByMode[mode],
        });
      } else {
        toast.success("Already up to date", {
          description: pullActionLabelByMode[mode],
        });
      }
    } finally {
      setIsPulling(false);
    }
  };
  const handleUndoAction = async () => {
    if (!(activeRepoId && canUndoAction) || isUndoRedoBusy) {
      return;
    }

    setIsUndoRedoBusy(true);

    try {
      await undoRepoAction(activeRepoId);
    } catch (error) {
      toast.error("Failed to undo action", {
        description: getErrorMessage(error),
      });
    } finally {
      setIsUndoRedoBusy(false);
    }
  };
  const handleRedoAction = async () => {
    if (!(activeRepoId && canRedoAction) || isUndoRedoBusy) {
      return;
    }

    setIsUndoRedoBusy(true);

    try {
      await redoRepoAction(activeRepoId);
    } catch (error) {
      toast.error("Failed to redo action", {
        description: getErrorMessage(error),
      });
    } finally {
      setIsUndoRedoBusy(false);
    }
  };
  useEffect(() => {
    const handleUndoRedoHotkeys = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;

      if (!hasPrimaryModifier || event.altKey) {
        return;
      }

      const shouldUndo = key === "z" && !event.shiftKey;
      const runtimePlatform = getRuntimePlatform();
      const isMacRuntime =
        runtimePlatform === "macos" || runtimePlatform === "ios";
      const shouldRedo =
        (key === "z" && event.shiftKey) ||
        (!isMacRuntime && key === "y" && !event.shiftKey);

      if (!(shouldUndo || shouldRedo)) {
        return;
      }

      event.preventDefault();

      if (shouldRedo) {
        handleRedoAction().catch(() => undefined);
        return;
      }

      handleUndoAction().catch(() => undefined);
    };

    globalThis.addEventListener("keydown", handleUndoRedoHotkeys);

    return () => {
      globalThis.removeEventListener("keydown", handleUndoRedoHotkeys);
    };
  });
  const handlePullWithSelectedMode = async () => {
    await handlePullAction(pullActionMode);
  };
  const handlePullActionForEntry = async (
    entry: SidebarEntry,
    mode: PullActionMode
  ) => {
    if (
      entry.type !== "branch" ||
      !activeRepoId ||
      isPulling ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsPulling(true);
    setPullActionMode(mode);

    try {
      if (!entry.active) {
        setIsSwitchingBranch(true);

        try {
          await switchBranch(activeRepoId, entry.name);
        } catch (error) {
          toast.error("Failed to switch branch", {
            description: getCheckoutFailureReason(error),
          });
          return;
        } finally {
          setIsSwitchingBranch(false);
        }
      }

      const result = await pullBranch(activeRepoId, mode);
      if (result.headChanged) {
        toast.success("Pull completed", {
          description: `${entry.name} - ${pullActionLabelByMode[mode]}`,
        });
      } else {
        toast.success("Already up to date", {
          description: `${entry.name} - ${pullActionLabelByMode[mode]}`,
        });
      }
    } finally {
      setIsPulling(false);
    }
  };

  const handleMergeAction = async (
    targetRef: string,
    targetLabel: string,
    mode: MergeActionMode
  ) => {
    if (
      !activeRepoId ||
      targetRef.trim().length === 0 ||
      isRunningMergeAction ||
      isPulling ||
      isPushing ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsRunningMergeAction(true);

    try {
      const result = await mergeReference(activeRepoId, targetRef, mode);
      if (result.headChanged) {
        toast.success(`${mergeActionLabelByMode[mode]} completed`, {
          description: `${currentBranch} <- ${targetLabel}`,
        });
      } else {
        toast.success("Already up to date", {
          description: `${currentBranch} <- ${targetLabel}`,
        });
      }
    } catch (error) {
      toast.error(`${mergeActionLabelByMode[mode]} failed`, {
        description: getMergeFailureReason(error, mode),
      });
    } finally {
      setIsRunningMergeAction(false);
    }
  };

  const handleMergeActionForEntry = async (
    entry: SidebarEntry,
    mode: MergeActionMode
  ) => {
    if (entry.type === "stash") {
      return;
    }

    await handleMergeAction(entry.name, entry.name, mode);
  };

  const handlePushAction = async () => {
    if (!activeRepoId || isPushing) {
      return;
    }

    if (!hasRemoteConfigured) {
      openPublishRepoConfirm(async (publishOptions) => {
        setIsPushing(true);

        try {
          await pushBranch(activeRepoId, false, publishOptions);
        } catch (error) {
          if (isMissingRemoteRepositoryError(error)) {
            setPublishRepoFormError(null);
            setIsPublishRepoConfirmOpen(true);
            return;
          }

          throw error;
        } finally {
          setIsPushing(false);
        }
      });
      return;
    }

    const hasDivergedBranch =
      (currentLocalBranch?.aheadCount ?? 0) > 0 &&
      (currentLocalBranch?.behindCount ?? 0) > 0;
    const shouldForcePushAfterUndoRewrite =
      requiresForcePushAfterHistoryRewrite &&
      (currentLocalBranch?.behindCount ?? 0) > 0;

    if (hasDivergedBranch || shouldForcePushAfterUndoRewrite) {
      openForcePushConfirm("push", async () => {
        setIsPushing(true);

        try {
          await pushBranch(activeRepoId, true);
        } finally {
          setIsPushing(false);
        }
      });
      return;
    }

    setIsPushing(true);

    try {
      if ((currentLocalBranch?.behindCount ?? 0) > 0) {
        await pullBranch(activeRepoId, pullActionMode);
      }
      await pushBranch(activeRepoId);
    } catch (error) {
      if (isMissingRemoteRepositoryError(error)) {
        openPublishRepoConfirm(async (publishOptions) => {
          setIsPushing(true);

          try {
            await pushBranch(activeRepoId, false, publishOptions);
          } finally {
            setIsPushing(false);
          }
        });
        return;
      }

      throw error;
    } finally {
      setIsPushing(false);
    }
  };
  const handlePushActionForEntry = async (entry: SidebarEntry) => {
    if (
      entry.type !== "branch" ||
      !activeRepoId ||
      isPushing ||
      isSwitchingBranch
    ) {
      return;
    }

    if (!hasRemoteConfigured) {
      openPublishRepoConfirm(async (publishOptions) => {
        setIsPushing(true);

        try {
          if (!entry.active) {
            setIsSwitchingBranch(true);

            try {
              await switchBranch(activeRepoId, entry.name);
            } catch (error) {
              toast.error("Failed to switch branch", {
                description: getCheckoutFailureReason(error),
              });
              return;
            } finally {
              setIsSwitchingBranch(false);
            }
          }

          await pushBranch(activeRepoId, false, publishOptions);
        } catch (error) {
          if (isMissingRemoteRepositoryError(error)) {
            setPublishRepoFormError(null);
            setIsPublishRepoConfirmOpen(true);
            return;
          }

          throw error;
        } finally {
          setIsPushing(false);
        }
      });
      return;
    }

    const hasDivergedBranch =
      (entry.pendingPushCount ?? 0) > 0 && (entry.pendingSyncCount ?? 0) > 0;
    const shouldForcePushAfterUndoRewrite =
      requiresForcePushAfterHistoryRewrite && (entry.pendingSyncCount ?? 0) > 0;

    if (hasDivergedBranch || shouldForcePushAfterUndoRewrite) {
      openForcePushConfirm("push", async () => {
        setIsPushing(true);

        try {
          if (!entry.active) {
            setIsSwitchingBranch(true);

            try {
              await switchBranch(activeRepoId, entry.name);
            } catch (error) {
              toast.error("Failed to switch branch", {
                description: getCheckoutFailureReason(error),
              });
              return;
            } finally {
              setIsSwitchingBranch(false);
            }
          }

          await pushBranch(activeRepoId, true);
        } finally {
          setIsPushing(false);
        }
      });
      return;
    }

    setIsPushing(true);

    try {
      if (!entry.active) {
        setIsSwitchingBranch(true);

        try {
          await switchBranch(activeRepoId, entry.name);
        } catch (error) {
          toast.error("Failed to switch branch", {
            description: getCheckoutFailureReason(error),
          });
          return;
        } finally {
          setIsSwitchingBranch(false);
        }
      }

      if ((entry.pendingSyncCount ?? 0) > 0) {
        await pullBranch(activeRepoId, pullActionMode);
      }

      await pushBranch(activeRepoId);
    } catch (error) {
      if (isMissingRemoteRepositoryError(error)) {
        openPublishRepoConfirm(async (publishOptions) => {
          setIsPushing(true);

          try {
            if (!entry.active) {
              setIsSwitchingBranch(true);

              try {
                await switchBranch(activeRepoId, entry.name);
              } catch (switchError) {
                toast.error("Failed to switch branch", {
                  description: getCheckoutFailureReason(switchError),
                });
                return;
              } finally {
                setIsSwitchingBranch(false);
              }
            }

            await pushBranch(activeRepoId, false, publishOptions);
          } finally {
            setIsPushing(false);
          }
        });
        return;
      }

      throw error;
    } finally {
      setIsPushing(false);
    }
  };

  const copyToClipboard = useCallback(
    async (value: string, label: "branch name" | "commit SHA") => {
      const trimmedValue = value.trim();

      if (trimmedValue.length === 0) {
        toast.error(`No ${label} available to copy`);
        return;
      }

      try {
        await navigator.clipboard.writeText(trimmedValue);
        toast.success(`${label} copied`, {
          description: trimmedValue,
        });
      } catch {
        toast.error(`Failed to copy ${label}`);
      }
    },
    []
  );

  const getCommitHashForEntry = useCallback(
    (entry: SidebarEntry): string | null => {
      let entryKey: string | null = `${entry.type}:${entry.name}`;

      if (entry.type === "stash") {
        entryKey = entry.stashRef ? `stash:${entry.stashRef}` : null;
      }

      return entryKey
        ? (referenceModel.commitHashByEntryKey[entryKey] ?? null)
        : null;
    },
    [referenceModel.commitHashByEntryKey]
  );

  const getTimelineRowIdForEntry = useCallback(
    (entry: SidebarEntry): string | null => {
      let entryKey: string | null = `${entry.type}:${entry.name}`;

      if (entry.type === "stash") {
        entryKey = entry.stashRef ? `stash:${entry.stashRef}` : null;
      }

      if (!entryKey) {
        return null;
      }

      return (
        referenceModel.timelineRowIdByEntryKey[entryKey] ??
        (entry.type === "branch" ? getCommitHashForEntry(entry) : null)
      );
    },
    [getCommitHashForEntry, referenceModel.timelineRowIdByEntryKey]
  );

  const scrollTimelineRowIntoView = useCallback(
    (rowId: string) => {
      globalThis.requestAnimationFrame(() => {
        const rowElement = timelineRowElementsRef.current.get(rowId);
        const scroller = mainScrollContainerRef.current;

        if (!scroller) {
          return;
        }

        if (!rowElement) {
          const displayRowIndex = timelineDisplayRowIndexById.get(rowId);

          if (typeof displayRowIndex !== "number") {
            return;
          }

          timelineVirtualizer.scrollToIndex(displayRowIndex, {
            align: "center",
          });
          return;
        }

        const rowTop = rowElement.offsetTop;
        const rowBottom = rowTop + rowElement.offsetHeight;
        const visibleTop = scroller.scrollTop;
        const visibleBottom = visibleTop + scroller.clientHeight;

        if (rowTop >= visibleTop && rowBottom <= visibleBottom) {
          return;
        }

        const targetScrollTop =
          rowTop - (scroller.clientHeight - rowElement.offsetHeight) / 2;

        scroller.scrollTo({
          top: Math.max(0, targetScrollTop),
        });
      });
    },
    [timelineDisplayRowIndexById, timelineVirtualizer]
  );

  const setTimelineRowElement = useCallback(
    (rowId: string, element: HTMLButtonElement | null) => {
      if (element) {
        timelineRowElementsRef.current.set(rowId, element);
        return;
      }

      timelineRowElementsRef.current.delete(rowId);
    },
    []
  );

  const isSidebarEntrySelected = useCallback(
    (entry: SidebarEntry): boolean => {
      if (entry.type === "branch") {
        return entry.active ?? false;
      }

      const rowId = getTimelineRowIdForEntry(entry);
      return rowId !== null && rowId === selectedTimelineRowId;
    },
    [getTimelineRowIdForEntry, selectedTimelineRowId]
  );

  const getSidebarEntryForTimelineRow = useCallback(
    (row: GitTimelineRow): SidebarEntry | null => {
      return referenceModel.sidebarEntryByTimelineRowId[row.id] ?? null;
    },
    [referenceModel.sidebarEntryByTimelineRowId]
  );

  const renderEntryDropdownMenuContent = (entry: SidebarEntry) => {
    const entryCommitHash = getCommitHashForEntry(entry);
    const targetRef = entryCommitHash ?? entry.name;
    const targetLabel =
      entryCommitHash === null ? entry.name : `commit ${targetRef.slice(0, 7)}`;

    if (entry.type === "tag") {
      return (
        <DropdownMenuContent
          align="end"
          className="w-80"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
          side="right"
          sideOffset={6}
        >
          <DropdownMenuItem
            disabled={
              isRunningMergeAction ||
              isPulling ||
              isPushing ||
              isSwitchingBranch
            }
            onClick={() => {
              handleMergeActionForEntry(entry, "ff-only").catch(
                () => undefined
              );
            }}
          >
            Fast-forward {currentBranch} to {entry.name}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              isRunningMergeAction ||
              isPulling ||
              isPushing ||
              isSwitchingBranch
            }
            onClick={() => {
              handleMergeActionForEntry(entry, "merge").catch(() => undefined);
            }}
          >
            Merge {entry.name} into {currentBranch}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              isRunningMergeAction ||
              isPulling ||
              isPushing ||
              isSwitchingBranch
            }
            onClick={() => {
              handleMergeActionForEntry(entry, "rebase").catch(() => undefined);
            }}
          >
            Rebase {currentBranch} onto {entry.name}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isCheckingOutCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                handleCheckoutCommit(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }
            }}
          >
            Checkout this commit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isCreatingRefBranch || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openCreateBranchAtReferenceDialog(entryCommitHash, targetLabel);
              }
            }}
          >
            Create branch here
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isCherryPickingCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                handleCherryPickAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }
            }}
          >
            Cherry-pick commit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openResetConfirm(entryCommitHash, targetLabel, "soft");
              }
            }}
          >
            Reset {currentBranch} here: Soft
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openResetConfirm(entryCommitHash, targetLabel, "mixed");
              }
            }}
          >
            Reset {currentBranch} here: Mixed
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openResetConfirm(entryCommitHash, targetLabel, "hard");
              }
            }}
          >
            Reset {currentBranch} here: Hard
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isRevertingCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                handleRevertAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }
            }}
          >
            Revert commit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isDroppingCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openDropCommitConfirm(entryCommitHash, targetLabel);
              }
            }}
          >
            Drop commit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard.writeText(entry.name).catch(() => undefined);
            }}
          >
            Copy tag name
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                copyToClipboard(entryCommitHash, "commit SHA").catch(
                  () => undefined
                );
              }
            }}
          >
            Copy commit sha
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openCreateTagDialog(entryCommitHash, targetLabel, false);
              }
            }}
          >
            Create tag here
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openCreateTagDialog(entryCommitHash, targetLabel, true);
              }
            }}
          >
            Create annotated tag here
          </DropdownMenuItem>
        </DropdownMenuContent>
      );
    }

    if (entry.type === "stash") {
      return (
        <DropdownMenuContent
          align="start"
          className="w-56"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
          side="right"
          sideOffset={6}
        >
          <DropdownMenuItem
            disabled={isApplyingStash}
            onClick={() => {
              handleApplyStash(entry).catch(() => undefined);
            }}
          >
            Apply Stash
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isPoppingStash}
            onClick={() => {
              handlePopStash(entry).catch(() => undefined);
            }}
          >
            Pop Stash
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isDroppingStash}
            onClick={() => {
              handleDropStash(entry).catch(() => undefined);
            }}
          >
            Delete Stash
          </DropdownMenuItem>
        </DropdownMenuContent>
      );
    }

    const canShowMergeActions = !entry.active;

    return (
      <DropdownMenuContent
        align="end"
        className="w-80"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
        side="right"
        sideOffset={6}
      >
        <DropdownMenuItem
          disabled={isPulling || isSwitchingBranch}
          onClick={() => {
            handlePullActionForEntry(entry, "pull-ff-possible").catch(
              () => undefined
            );
          }}
        >
          Pull (fast-forward if possible)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isPushing || isSwitchingBranch}
          onClick={() => {
            handlePushActionForEntry(entry).catch(() => undefined);
          }}
        >
          Push
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={entry.isRemote || isSettingUpstream || isSwitchingBranch}
          onClick={() => {
            openSetUpstreamDialog(entry);
          }}
        >
          Set Upstream
        </DropdownMenuItem>
        {canShowMergeActions ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeActionForEntry(entry, "ff-only").catch(
                  () => undefined
                );
              }}
            >
              Fast-forward {currentBranch} to {entry.name}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeActionForEntry(entry, "merge").catch(
                  () => undefined
                );
              }}
            >
              Merge {entry.name} into {currentBranch}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeActionForEntry(entry, "rebase").catch(
                  () => undefined
                );
              }}
            >
              Rebase {currentBranch} onto {entry.name}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={entry.active || isSwitchingBranch}
          onClick={() => {
            handleCheckoutBranch(entry).catch(() => undefined);
          }}
        >
          Checkout {entry.name}
        </DropdownMenuItem>
        {entryCommitHash ? (
          <>
            <DropdownMenuItem
              disabled={isCreatingRefBranch}
              onClick={() => {
                openCreateBranchAtReferenceDialog(entryCommitHash, targetLabel);
              }}
            >
              Create branch here
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isCherryPickingCommit}
              onClick={() => {
                handleCherryPickAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }}
            >
              Cherry-pick commit
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Reset {currentBranch} to this commit
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => {
                    openResetConfirm(entryCommitHash, targetLabel, "soft");
                  }}
                >
                  Soft - keep all changes
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    openResetConfirm(entryCommitHash, targetLabel, "mixed");
                  }}
                >
                  Mixed - keep working copy but reset index
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    openResetConfirm(entryCommitHash, targetLabel, "hard");
                  }}
                >
                  Hard - discard all changes
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              disabled={isRevertingCommit}
              onClick={() => {
                handleRevertAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }}
            >
              Revert commit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isDroppingCommit}
              onClick={() => {
                openDropCommitConfirm(entryCommitHash, targetLabel);
              }}
            >
              Drop commit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isCreatingTagAtReference}
              onClick={() => {
                openCreateTagDialog(entryCommitHash, targetLabel, false);
              }}
            >
              Create tag here
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isCreatingTagAtReference}
              onClick={() => {
                openCreateTagDialog(entryCommitHash, targetLabel, true);
              }}
            >
              Create annotated tag here
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {entry.isRemote ? null : (
          <DropdownMenuItem
            onClick={() => {
              openRenameBranchDialog(entry);
            }}
          >
            Rename {entry.name}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            openDeleteBranchConfirm(entry);
          }}
        >
          Delete {entry.name}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            copyToClipboard(entry.name, "branch name").catch(() => undefined);
          }}
        >
          Copy branch name
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!entryCommitHash}
          onClick={() => {
            if (entryCommitHash) {
              copyToClipboard(entryCommitHash, "commit SHA").catch(
                () => undefined
              );
            }
          }}
        >
          Copy commit sha
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const renderEntryContextMenuContent = (entry: SidebarEntry) => {
    const entryCommitHash = getCommitHashForEntry(entry);
    const targetRef = entryCommitHash ?? entry.name;
    const targetLabel =
      entryCommitHash === null ? entry.name : `commit ${targetRef.slice(0, 7)}`;

    if (entry.type === "tag") {
      return (
        <ContextMenuContent
          className="w-80"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          <ContextMenuItem
            disabled={
              isRunningMergeAction ||
              isPulling ||
              isPushing ||
              isSwitchingBranch
            }
            onClick={() => {
              handleMergeActionForEntry(entry, "ff-only").catch(
                () => undefined
              );
            }}
          >
            Fast-forward {currentBranch} to {entry.name}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={
              isRunningMergeAction ||
              isPulling ||
              isPushing ||
              isSwitchingBranch
            }
            onClick={() => {
              handleMergeActionForEntry(entry, "merge").catch(() => undefined);
            }}
          >
            Merge {entry.name} into {currentBranch}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={
              isRunningMergeAction ||
              isPulling ||
              isPushing ||
              isSwitchingBranch
            }
            onClick={() => {
              handleMergeActionForEntry(entry, "rebase").catch(() => undefined);
            }}
          >
            Rebase {currentBranch} onto {entry.name}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={isCheckingOutCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                handleCheckoutCommit(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }
            }}
          >
            Checkout this commit
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isCreatingRefBranch || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openCreateBranchAtReferenceDialog(entryCommitHash, targetLabel);
              }
            }}
          >
            Create branch here
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isCherryPickingCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                handleCherryPickAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }
            }}
          >
            Cherry-pick commit
          </ContextMenuItem>
          {entryCommitHash
            ? renderCommitResetSubmenu(entryCommitHash, targetLabel, false)
            : null}
          <ContextMenuItem
            disabled={isRevertingCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                handleRevertAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }
            }}
          >
            Revert commit
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isDroppingCommit || entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openDropCommitConfirm(entryCommitHash, targetLabel);
              }
            }}
          >
            Drop commit
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              navigator.clipboard.writeText(entry.name).catch(() => undefined);
            }}
          >
            Copy tag name
          </ContextMenuItem>
          <ContextMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                copyToClipboard(entryCommitHash, "commit SHA").catch(
                  () => undefined
                );
              }
            }}
          >
            Copy commit sha
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openCreateTagDialog(entryCommitHash, targetLabel, false);
              }
            }}
          >
            Create tag here
          </ContextMenuItem>
          <ContextMenuItem
            disabled={entryCommitHash === null}
            onClick={() => {
              if (entryCommitHash) {
                openCreateTagDialog(entryCommitHash, targetLabel, true);
              }
            }}
          >
            Create annotated tag here
          </ContextMenuItem>
        </ContextMenuContent>
      );
    }

    if (entry.type === "stash") {
      return (
        <ContextMenuContent
          className="w-56"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          <ContextMenuItem
            disabled={isApplyingStash}
            onClick={() => {
              handleApplyStash(entry).catch(() => undefined);
            }}
          >
            Apply Stash
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isPoppingStash}
            onClick={() => {
              handlePopStash(entry).catch(() => undefined);
            }}
          >
            Pop Stash
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isDroppingStash}
            onClick={() => {
              handleDropStash(entry).catch(() => undefined);
            }}
          >
            Delete Stash
          </ContextMenuItem>
        </ContextMenuContent>
      );
    }

    const canShowMergeActions = !entry.active;

    return (
      <ContextMenuContent
        className="w-80"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
      >
        <ContextMenuItem
          disabled={isPulling || isSwitchingBranch}
          onClick={() => {
            handlePullActionForEntry(entry, "pull-ff-possible").catch(
              () => undefined
            );
          }}
        >
          Pull (fast-forward if possible)
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isPushing || isSwitchingBranch}
          onClick={() => {
            handlePushActionForEntry(entry).catch(() => undefined);
          }}
        >
          Push
        </ContextMenuItem>
        <ContextMenuItem
          disabled={entry.isRemote || isSettingUpstream || isSwitchingBranch}
          onClick={() => {
            openSetUpstreamDialog(entry);
          }}
        >
          Set Upstream
        </ContextMenuItem>
        {canShowMergeActions ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeActionForEntry(entry, "ff-only").catch(
                  () => undefined
                );
              }}
            >
              Fast-forward {currentBranch} to {entry.name}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeActionForEntry(entry, "merge").catch(
                  () => undefined
                );
              }}
            >
              Merge {entry.name} into {currentBranch}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeActionForEntry(entry, "rebase").catch(
                  () => undefined
                );
              }}
            >
              Rebase {currentBranch} onto {entry.name}
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={entry.active || isSwitchingBranch}
          onClick={() => {
            handleCheckoutBranch(entry).catch(() => undefined);
          }}
        >
          Checkout {entry.name}
        </ContextMenuItem>
        {entryCommitHash ? (
          <>
            <ContextMenuItem
              disabled={isCreatingRefBranch}
              onClick={() => {
                openCreateBranchAtReferenceDialog(entryCommitHash, targetLabel);
              }}
            >
              Create branch here
            </ContextMenuItem>
            <ContextMenuItem
              disabled={isCherryPickingCommit}
              onClick={() => {
                handleCherryPickAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }}
            >
              Cherry-pick commit
            </ContextMenuItem>
            {renderCommitResetSubmenu(entryCommitHash, targetLabel, false)}
            <ContextMenuItem
              disabled={isRevertingCommit}
              onClick={() => {
                handleRevertAtReference(entryCommitHash, targetLabel).catch(
                  () => undefined
                );
              }}
            >
              Revert commit
            </ContextMenuItem>
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isDroppingCommit}
              onClick={() => {
                openDropCommitConfirm(entryCommitHash, targetLabel);
              }}
            >
              Drop commit
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={isCreatingTagAtReference}
              onClick={() => {
                openCreateTagDialog(entryCommitHash, targetLabel, false);
              }}
            >
              Create tag here
            </ContextMenuItem>
            <ContextMenuItem
              disabled={isCreatingTagAtReference}
              onClick={() => {
                openCreateTagDialog(entryCommitHash, targetLabel, true);
              }}
            >
              Create annotated tag here
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        {entry.isRemote ? null : (
          <ContextMenuItem
            onClick={() => {
              openRenameBranchDialog(entry);
            }}
          >
            Rename {entry.name}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            openDeleteBranchConfirm(entry);
          }}
        >
          Delete {entry.name}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            copyToClipboard(entry.name, "branch name").catch(() => undefined);
          }}
        >
          Copy branch name
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!entryCommitHash}
          onClick={() => {
            if (entryCommitHash) {
              copyToClipboard(entryCommitHash, "commit SHA").catch(
                () => undefined
              );
            }
          }}
        >
          Copy commit sha
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };

  const renderCommitResetSubmenu = (
    target: string,
    targetLabel: string,
    disabled: boolean
  ) => (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        Reset {currentBranch} to this commit
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuItem
          disabled={disabled}
          onClick={() => {
            openResetConfirm(target, targetLabel, "soft");
          }}
        >
          Soft - keep all changes
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled}
          onClick={() => {
            openResetConfirm(target, targetLabel, "mixed");
          }}
        >
          Mixed - keep working copy but reset index
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          disabled={disabled}
          onClick={() => {
            openResetConfirm(target, targetLabel, "hard");
          }}
        >
          Hard - discard all changes
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );

  const renderCommitRowContextMenuContent = (commit: RepositoryCommit) => {
    const commitRefEntries =
      referenceModel.commitRefEntriesByCommitHash[commit.hash] ?? [];
    const mergeTargetEntry =
      commitRefEntries.find(
        (entry) =>
          entry.type === "branch" &&
          !entry.isRemote &&
          entry.name !== currentBranch
      ) ??
      commitRefEntries.find(
        (entry) => entry.type === "branch" && entry.name !== currentBranch
      ) ??
      null;
    const mergeTargetRef = mergeTargetEntry?.name ?? commit.hash;
    const mergeTargetLabel =
      mergeTargetEntry?.name ?? `commit ${commit.shortHash}`;
    const hasMergeActions = commit.parentHashes.length > 1;

    return (
      <ContextMenuContent
        className="w-80"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
      >
        {hasMergeActions ? (
          <>
            <ContextMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeAction(
                  mergeTargetRef,
                  mergeTargetLabel,
                  "ff-only"
                ).catch(() => undefined);
              }}
            >
              Fast-forward {currentBranch} to {mergeTargetLabel}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeAction(
                  mergeTargetRef,
                  mergeTargetLabel,
                  "merge"
                ).catch(() => undefined);
              }}
            >
              Merge {mergeTargetLabel} into {currentBranch}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={
                isRunningMergeAction ||
                isPulling ||
                isPushing ||
                isSwitchingBranch
              }
              onClick={() => {
                handleMergeAction(
                  mergeTargetRef,
                  mergeTargetLabel,
                  "rebase"
                ).catch(() => undefined);
              }}
            >
              Rebase {currentBranch} onto {mergeTargetLabel}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem
          disabled={isCheckingOutCommit}
          onClick={() => {
            handleCheckoutCommit(
              commit.hash,
              `commit ${commit.shortHash}`,
              commit.hash
            ).catch(() => undefined);
          }}
        >
          Checkout this commit
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isCreatingRefBranch}
          onClick={() => {
            openCreateBranchAtReferenceDialog(
              commit.hash,
              `commit ${commit.shortHash}`
            );
          }}
        >
          Create branch here
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isCherryPickingCommit}
          onClick={() => {
            handleCherryPickAtReference(
              commit.hash,
              `commit ${commit.shortHash}`
            ).catch(() => undefined);
          }}
        >
          Cherry-pick commit
        </ContextMenuItem>
        {renderCommitResetSubmenu(
          commit.hash,
          `commit ${commit.shortHash}`,
          false
        )}
        <ContextMenuItem
          disabled={isRevertingCommit}
          onClick={() => {
            handleRevertAtReference(
              commit.hash,
              `commit ${commit.shortHash}`
            ).catch(() => undefined);
          }}
        >
          Revert commit
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          disabled={isDroppingCommit}
          onClick={() => {
            openDropCommitConfirm(commit.hash, `commit ${commit.shortHash}`);
          }}
        >
          Drop commit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            copyToClipboard(commit.hash, "commit SHA").catch(() => undefined);
          }}
        >
          Copy commit sha
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isCreatingTagAtReference}
          onClick={() => {
            openCreateTagDialog(
              commit.hash,
              `commit ${commit.shortHash}`,
              false
            );
          }}
        >
          Create tag here
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isCreatingTagAtReference}
          onClick={() => {
            openCreateTagDialog(
              commit.hash,
              `commit ${commit.shortHash}`,
              true
            );
          }}
        >
          Create annotated tag here
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };
  const renderGraphNodeContextMenuContent = (row: GitTimelineRow) => {
    if (row.type === "commit" && row.commitHash) {
      const commit = timelineCommits.find(
        (item) => item.hash === row.commitHash
      );
      return commit ? renderCommitRowContextMenuContent(commit) : null;
    }

    const timelineEntry = getSidebarEntryForTimelineRow(row);
    return timelineEntry ? renderEntryContextMenuContent(timelineEntry) : null;
  };

  const handleGraphNodeMenuOpenChange = (rowId: string, open: boolean) => {
    const row = timelineRowById.get(rowId);

    if (!row) {
      return;
    }

    if (row.type === "commit" && row.commitHash) {
      handleCommitMenuOpenChange(row.commitHash, open);
    }

    if (open) {
      if (row.type === "commit" && row.commitHash) {
        setSelectedTimelineRowId(row.id);
        setSelectedCommitId(row.commitHash);
      } else if (row.anchorCommitHash) {
        setSelectedTimelineRowId(row.id);
        setSelectedCommitId(row.anchorCommitHash);
      }
    }
  };

  const handleGraphNodeSelect = (row: GitTimelineRow) => {
    if (row.type === "commit" && row.commitHash) {
      handleCommitRowClick(row.commitHash);
      return;
    }

    if (row.anchorCommitHash) {
      selectTimelineReferenceRow(row.id, row.anchorCommitHash, false);
    }
  };
  const getTreeNodeStateKey = (section: ChangeTreeSection, nodePath: string) =>
    `${section}:${nodePath}`;

  const toggleTreeNode = (section: ChangeTreeSection, nodePath: string) => {
    const key = getTreeNodeStateKey(section, nodePath);

    setExpandedTreeNodePaths((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };
  const collectExpandableTreeKeys = (
    nodes: ChangeTreeNode[],
    section: ChangeTreeSection
  ): Record<string, boolean> => {
    return collectExpandableTreeKeysModel(nodes, section, getTreeNodeStateKey);
  };

  const getStatusCodes = (
    item: RepositoryWorkingTreeItem,
    section: "staged" | "unstaged"
  ) => {
    if (section === "staged") {
      if (item.stagedStatus === " " || item.stagedStatus === "?") {
        return [] as string[];
      }

      return [item.stagedStatus];
    }

    if (item.isUntracked) {
      return ["?"];
    }

    if (item.unstagedStatus === " ") {
      return [] as string[];
    }

    return [item.unstagedStatus];
  };

  const renderStatusBadges = (
    item: RepositoryWorkingTreeItem,
    section: "staged" | "unstaged"
  ) => {
    const statusCodes = getStatusCodes(item, section);

    if (statusCodes.length === 0) {
      return null;
    }

    return statusCodes.map((code) => {
      const descriptor = getStatusDescriptor(code);

      if (!descriptor) {
        return null;
      }

      return (
        <span
          className={cn(
            "inline-flex items-center justify-center",
            descriptor.className
          )}
          key={`${item.path}-${section}-${descriptor.label}`}
        >
          {code === "M" ? (
            <PencilSimpleIcon className="size-3" />
          ) : (
            <span className="font-semibold text-xs leading-none">
              {descriptor.short}
            </span>
          )}
        </span>
      );
    });
  };

  const collectTreeStatusCounts = (
    node: ChangeTreeNode,
    section: "staged" | "unstaged"
  ) => {
    return collectTreeStatusCountsModel(node, section);
  };

  const collectCommitTreeChangeSummary = (node: CommitFileTreeNode) => {
    return collectCommitTreeChangeSummaryModel(node);
  };

  const handleUnstageAll = async () => {
    if (!activeRepoId || isUnstagingAll || !hasStagedChanges) {
      return;
    }

    setIsUnstagingAll(true);

    try {
      await unstageAll(activeRepoId);
    } finally {
      setIsUnstagingAll(false);
    }
  };

  const handleFileStageToggle = async (
    filePath: string,
    mode: "stage" | "unstage"
  ) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    setIsUpdatingFilePath(filePath);

    try {
      if (mode === "stage") {
        await stageFile(activeRepoId, filePath);
      } else {
        await unstageFile(activeRepoId, filePath);
      }
    } finally {
      setIsUpdatingFilePath(null);
    }
  };

  const handleDiscardAllChanges = async () => {
    if (!activeRepoId || isDiscardingAllChanges || !hasAnyWorkingTreeChanges) {
      return;
    }

    setIsDiscardingAllChanges(true);

    try {
      await discardAllChanges(activeRepoId);
      setIsDiscardAllConfirmOpen(false);
    } finally {
      setIsDiscardingAllChanges(false);
    }
  };
  const handleDiscardPathChanges = async (filePath: string) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    setIsUpdatingFilePath(filePath);

    try {
      await discardPathChanges(activeRepoId, filePath);
    } finally {
      setIsUpdatingFilePath(null);
    }
  };
  const handleAddIgnoreRule = async (pattern: string) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    setIsUpdatingFilePath(pattern);

    try {
      await addIgnoreRule(activeRepoId, pattern);
    } finally {
      setIsUpdatingFilePath(null);
    }
  };
  const isEditDirty =
    workspaceMode === "edit" && editBuffer !== editInitialBuffer;
  const closeDiffPreviewPanel = useCallback(() => {
    setDiffPreviewPanelState({ kind: "idle" });
    setWorkspaceMode(DEFAULT_DIFF_WORKSPACE_MODE);
    setWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    setWorkspaceFilePresentation(DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION);
    setIgnoreTrimWhitespace(false);
    setWorkspaceEncoding(DEFAULT_DIFF_WORKSPACE_ENCODING);
    setOpenedDiffContext(null);
    setHasRequestedDiffSurface(false);
    setIsDiffEditorReady(false);
    setHasRequestedFileSurface(false);
    setOpenedDiff(null);
    setOpenedDiffPath(null);
    setOpenedDiffStatusCode(null);
    setActiveHunks([]);
    setActiveHunkIndex(0);
    setIsLoadingHunks(false);
    setHunkLoadError(null);
    setHistoryEntries([]);
    setSelectedHistoryCommitHash(null);
    setIsLoadingFileHistory(false);
    setFileHistoryError(null);
    setBlameLines([]);
    setIsLoadingBlame(false);
    setBlameError(null);
    setEditBuffer("");
    setEditInitialBuffer("");
    setIsLoadingEditBuffer(false);
    setIsSavingEditBuffer(false);
    setEditLoadError(null);
    setPendingWorkspaceMode(null);
    setPendingOpenDiffContext(null);
    setPendingCloseDiffPanel(false);
    setIsUnsavedEditConfirmOpen(false);
    setOpenedCommitDiff(null);
    setOpenedCommitDiffStatusCode(null);
    setIsLoadingDiffPath(null);
    setIsLoadingCommitDiffPath(null);
  }, []);

  const openWorkingDiffContent = useCallback(
    async (
      context: Extract<DiffPreviewOpenContext, { source: "working" }>,
      previewMode: "diff" | "file",
      forceRender: boolean
    ) => {
      if (!activeRepoId) {
        return;
      }

      setDiffPreviewPanelState({
        kind: "contentLoading",
        path: context.filePath,
        forceRender,
      });

      const diff = await getFileContent(
        activeRepoId,
        context.filePath,
        previewMode,
        forceRender,
        requestedWorkspaceEncoding
      );

      if (!diff) {
        setDiffPreviewPanelState({
          kind:
            previewMode === "file" ? "errorLoadingFile" : "errorRenderingDiff",
          path: context.filePath,
        });
        return;
      }

      setOpenedDiff(diff);
      setOpenedDiffPath(context.filePath);
      setOpenedDiffStatusCode(
        resolveWorkingTreePreviewStatusCode(context.item)
      );
      setDiffPreviewPanelState({ kind: "ready", path: context.filePath });
    },
    [activeRepoId, getFileContent, requestedWorkspaceEncoding]
  );

  const openCommitDiffContent = useCallback(
    async (
      context: Extract<DiffPreviewOpenContext, { source: "commit" }>,
      previewMode: "diff" | "file",
      forceRender: boolean
    ) => {
      if (!activeRepoId) {
        return;
      }

      const cacheKey = `${previewMode}:${workspaceEncoding}:${context.commitHash}:${context.filePath}`;

      if (!forceRender && previewMode === "diff") {
        const cachedDiff = commitDiffCacheRef.current.get(cacheKey);

        if (cachedDiff) {
          setOpenedCommitDiff(cachedDiff);
          setOpenedCommitDiffStatusCode(
            resolveCommitPreviewStatusCode(context.status)
          );
          setDiffPreviewPanelState({ kind: "ready", path: context.filePath });
          return;
        }
      }

      setDiffPreviewPanelState({
        kind: "contentLoading",
        path: context.filePath,
        forceRender,
      });

      const diff = await getCommitFileContent(
        activeRepoId,
        context.commitHash,
        context.filePath,
        previewMode,
        forceRender,
        requestedWorkspaceEncoding
      );

      if (!diff) {
        setDiffPreviewPanelState({
          kind:
            previewMode === "file" ? "errorLoadingFile" : "errorRenderingDiff",
          path: context.filePath,
        });
        return;
      }

      if (previewMode === "diff") {
        commitDiffCacheRef.current.set(cacheKey, diff);
      }

      if (commitDiffCacheRef.current.size > COMMIT_DIFF_CACHE_LIMIT) {
        const oldestCacheKey = commitDiffCacheRef.current.keys().next().value;

        if (typeof oldestCacheKey === "string") {
          commitDiffCacheRef.current.delete(oldestCacheKey);
        }
      }

      setOpenedCommitDiff(diff);
      setOpenedCommitDiffStatusCode(
        resolveCommitPreviewStatusCode(context.status)
      );
      setDiffPreviewPanelState({ kind: "ready", path: context.filePath });
    },
    [
      activeRepoId,
      getCommitFileContent,
      requestedWorkspaceEncoding,
      workspaceEncoding,
    ]
  );

  const runDiffPreviewPreflight = useCallback(
    async (
      context: DiffPreviewOpenContext,
      previewMode: "diff" | "file",
      forceRender = false
    ) => {
      if (!activeRepoId) {
        return;
      }

      if (hasUnsupportedWorkspaceTextEncoding) {
        setDiffPreviewPanelState({
          kind:
            previewMode === "file" ? "errorLoadingFile" : "errorRenderingDiff",
          message: UNSUPPORTED_ENCODING_MESSAGE,
          path: context.filePath,
        });
        return;
      }

      if (context.source === "working") {
        const preflight = await getFilePreflight(
          activeRepoId,
          context.filePath,
          previewMode
        );
        const nextState = resolveDiffPreviewUiState(
          preflight as RepositoryFilePreflight | null,
          context.filePath,
          previewMode
        );
        setDiffPreviewPanelState(nextState);

        if (nextState.kind === "ready") {
          await openWorkingDiffContent(context, previewMode, forceRender);
        }

        return;
      }

      const preflight = await getCommitFilePreflight(
        activeRepoId,
        context.commitHash,
        context.filePath,
        previewMode
      );
      const nextState = resolveDiffPreviewUiState(
        preflight,
        context.filePath,
        previewMode
      );
      setDiffPreviewPanelState(nextState);

      if (nextState.kind === "ready") {
        await openCommitDiffContent(context, previewMode, forceRender);
      }
    },
    [
      activeRepoId,
      getCommitFilePreflight,
      getFilePreflight,
      hasUnsupportedWorkspaceTextEncoding,
      openCommitDiffContent,
      openWorkingDiffContent,
    ]
  );

  const detectAndApplyGuessedWorkspaceEncoding = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      const detectedEncoding = await getFileDetectedEncoding(
        activeRepoId,
        context.filePath,
        context.source === "commit" ? context.commitHash : null
      );

      const resolvedDetectedEncoding = detectedEncoding
        ? resolveDiffWorkspaceEncodingValue(detectedEncoding.encoding)
        : DEFAULT_DIFF_WORKSPACE_ENCODING;
      const nextEncoding =
        resolvedDetectedEncoding === DIFF_WORKSPACE_GUESS_ENCODING_VALUE
          ? DEFAULT_DIFF_WORKSPACE_ENCODING
          : resolvedDetectedEncoding;

      setWorkspaceEncoding(nextEncoding);
    },
    [activeRepoId, getFileDetectedEncoding]
  );

  const loadDiffHunks = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      setIsLoadingHunks(true);
      setHunkLoadError(null);

      try {
        const payload =
          context.source === "working"
            ? await getFileHunks(
                activeRepoId,
                context.filePath,
                ignoreTrimWhitespace
              )
            : await getCommitFileHunks(
                activeRepoId,
                context.commitHash,
                context.filePath,
                ignoreTrimWhitespace
              );

        if (!payload) {
          setActiveHunks([]);
          setHunkLoadError("Error rendering diff");
          return;
        }

        setActiveHunks(payload.hunks);
        setActiveHunkIndex(0);
      } finally {
        setIsLoadingHunks(false);
      }
    },
    [activeRepoId, getCommitFileHunks, getFileHunks, ignoreTrimWhitespace]
  );

  const loadHistorySurface = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      const cacheKey = `${activeRepoId}:history:${context.filePath}:${FILE_HISTORY_LIMIT}`;
      const cachedEntries = readCachedValue(
        fileHistoryCacheRef.current,
        cacheKey
      );

      if (cachedEntries) {
        setHistoryEntries(cachedEntries);
        setFileHistoryError(null);
        setIsLoadingFileHistory(false);

        const nextSelectedCommitHash =
          cachedEntries.find(
            (entry) => entry.commitHash === selectedHistoryCommitHash
          )?.commitHash ??
          cachedEntries.at(0)?.commitHash ??
          null;
        setSelectedHistoryCommitHash(nextSelectedCommitHash);

        if (nextSelectedCommitHash) {
          const previewContext: DiffPreviewOpenContext = {
            source: "commit",
            mode: "diff",
            commitHash: nextSelectedCommitHash,
            filePath: context.filePath,
            status: "M",
          };
          setOpenedDiffContext(previewContext);
          await runDiffPreviewPreflight(previewContext, "diff");
        } else {
          setOpenedCommitDiff(null);
          setOpenedCommitDiffStatusCode(null);
          setDiffPreviewPanelState({ kind: "idle" });
        }

        return;
      }

      setIsLoadingFileHistory(true);
      setFileHistoryError(null);

      try {
        const payload = await getFileHistory(
          activeRepoId,
          context.filePath,
          FILE_HISTORY_LIMIT
        );

        if (!payload) {
          setHistoryEntries([]);
          setSelectedHistoryCommitHash(null);
          setFileHistoryError("Error loading file history");
          setOpenedCommitDiff(null);
          setOpenedCommitDiffStatusCode(null);
          setDiffPreviewPanelState({ kind: "idle" });
          return;
        }

        setHistoryEntries(payload.entries);
        writeCachedValue(
          fileHistoryCacheRef.current,
          cacheKey,
          payload.entries,
          DIFF_WORKSPACE_PAYLOAD_CACHE_LIMIT
        );

        const nextSelectedCommitHash =
          payload.entries.find(
            (entry) => entry.commitHash === selectedHistoryCommitHash
          )?.commitHash ??
          payload.entries.at(0)?.commitHash ??
          null;
        setSelectedHistoryCommitHash(nextSelectedCommitHash);

        if (nextSelectedCommitHash) {
          const previewContext: DiffPreviewOpenContext = {
            source: "commit",
            mode: "diff",
            commitHash: nextSelectedCommitHash,
            filePath: context.filePath,
            status: "M",
          };
          setOpenedDiffContext(previewContext);
          await runDiffPreviewPreflight(previewContext, "diff");
        } else {
          setOpenedCommitDiff(null);
          setOpenedCommitDiffStatusCode(null);
          setDiffPreviewPanelState({ kind: "idle" });
        }
      } finally {
        setIsLoadingFileHistory(false);
      }
    },
    [
      activeRepoId,
      getFileHistory,
      runDiffPreviewPreflight,
      selectedHistoryCommitHash,
    ]
  );

  const loadBlameSurface = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      const resolvedRevision =
        context.source === "commit" ? context.commitHash : "HEAD";
      const cacheKey = `${activeRepoId}:blame:${context.filePath}:${resolvedRevision}`;
      const cachedLines = readCachedValue(fileBlameCacheRef.current, cacheKey);

      if (cachedLines) {
        setBlameLines(cachedLines);
        setBlameError(null);
        setIsLoadingBlame(false);
        return;
      }

      setIsLoadingBlame(true);
      setBlameError(null);

      try {
        const payload = await getFileBlame(
          activeRepoId,
          context.filePath,
          context.source === "commit" ? context.commitHash : null
        );

        if (!payload) {
          setBlameLines([]);
          setBlameError("Error loading blame");
          return;
        }

        setBlameLines(payload.lines);
        writeCachedValue(
          fileBlameCacheRef.current,
          cacheKey,
          payload.lines,
          DIFF_WORKSPACE_PAYLOAD_CACHE_LIMIT
        );
      } finally {
        setIsLoadingBlame(false);
      }
    },
    [activeRepoId, getFileBlame]
  );

  const loadEditSurface = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      setIsLoadingEditBuffer(true);
      setEditLoadError(null);

      if (hasUnsupportedWorkspaceTextEncoding) {
        setEditBuffer("");
        setEditInitialBuffer("");
        setEditLoadError(UNSUPPORTED_ENCODING_MESSAGE);
        setIsLoadingEditBuffer(false);
        return;
      }

      try {
        const text = await getFileText(
          activeRepoId,
          context.filePath,
          requestedWorkspaceEncoding
        );

        if (text === null) {
          setEditBuffer("");
          setEditInitialBuffer("");
          setEditLoadError("Error loading file");
          return;
        }

        setEditBuffer(text);
        setEditInitialBuffer(text);
      } finally {
        setIsLoadingEditBuffer(false);
      }
    },
    [
      activeRepoId,
      getFileText,
      hasUnsupportedWorkspaceTextEncoding,
      requestedWorkspaceEncoding,
    ]
  );

  const loadWorkspaceMode = useCallback(
    async (context: DiffPreviewOpenContext, mode: DiffWorkspaceMode) => {
      if (mode === "diff" || mode === "file") {
        await runDiffPreviewPreflight(context, mode);
        return;
      }

      if (mode === "history") {
        await loadHistorySurface(context);
        return;
      }

      if (mode === "blame") {
        await loadBlameSurface(context);
        return;
      }

      await loadEditSurface(context);
    },
    [
      loadBlameSurface,
      loadEditSurface,
      loadHistorySurface,
      runDiffPreviewPreflight,
    ]
  );

  const applyWorkspaceModeChange = useCallback(
    async (nextMode: DiffWorkspaceMode) => {
      if (!openedDiffContext) {
        return;
      }

      setWorkspaceMode(nextMode);
      await loadWorkspaceMode(openedDiffContext, nextMode);
    },
    [loadWorkspaceMode, openedDiffContext]
  );

  const requestWorkspaceModeChange = useCallback(
    async (nextMode: DiffWorkspaceMode) => {
      if (nextMode === workspaceMode) {
        return;
      }

      if (isEditDirty) {
        setPendingWorkspaceMode(nextMode);
        setPendingOpenDiffContext(null);
        setPendingCloseDiffPanel(false);
        setIsUnsavedEditConfirmOpen(true);
        return;
      }

      await applyWorkspaceModeChange(nextMode);
    },
    [applyWorkspaceModeChange, isEditDirty, workspaceMode]
  );

  const handleSaveEditedFile = useCallback(async () => {
    if (!(activeRepoId && openedDiffContext) || isSavingEditBuffer) {
      return;
    }

    setIsSavingEditBuffer(true);

    try {
      const didSave = await saveFileText(
        activeRepoId,
        openedDiffContext.filePath,
        editBuffer,
        requestedWorkspaceEncoding
      );

      if (!didSave) {
        return;
      }

      setEditInitialBuffer(editBuffer);
      await runDiffPreviewPreflight(
        openedDiffContext,
        workspaceMode === "file" ? "file" : "diff"
      );
    } finally {
      setIsSavingEditBuffer(false);
    }
  }, [
    activeRepoId,
    editBuffer,
    isSavingEditBuffer,
    openedDiffContext,
    runDiffPreviewPreflight,
    saveFileText,
    requestedWorkspaceEncoding,
    workspaceMode,
  ]);

  const handleOpenFileDiff = async (item: RepositoryWorkingTreeItem) => {
    if (!activeRepoId || isLoadingDiffPath !== null) {
      return;
    }

    const filePath = item.path;
    const initialMode = resolveDefaultWorkspacePreviewMode(filePath);
    const isTogglingCurrentDiff =
      openedDiffContext !== null &&
      openedDiffContext.source === "working" &&
      openedDiffContext.filePath === filePath &&
      diffPreviewPanelState.kind !== "idle";

    if (isTogglingCurrentDiff) {
      closeDiffPreviewPanel();
      return;
    }

    if (isEditDirty) {
      setPendingWorkspaceMode(initialMode);
      setPendingOpenDiffContext({
        source: "working",
        mode: initialMode,
        filePath,
        item,
      });
      setPendingCloseDiffPanel(false);
      setIsUnsavedEditConfirmOpen(true);
      return;
    }

    setWorkspaceMode(initialMode);
    setWorkspaceFilePresentation(
      initialMode === "file" ? DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION : "code"
    );
    setWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    setIgnoreTrimWhitespace(false);
    setOpenedCommitDiff(null);
    setOpenedCommitDiffStatusCode(null);
    setOpenedDiff(null);
    setOpenedDiffPath(null);
    setOpenedDiffStatusCode(null);
    setActiveHunks([]);
    setActiveHunkIndex(0);
    setHistoryEntries([]);
    setSelectedHistoryCommitHash(null);
    setBlameLines([]);
    setEditBuffer("");
    setEditInitialBuffer("");
    setEditLoadError(null);
    setPendingOpenDiffContext(null);

    const nextContext: DiffPreviewOpenContext = {
      source: "working",
      mode: initialMode,
      filePath,
      item,
    };
    setOpenedDiffContext(nextContext);
    setDiffPreviewPanelState({ kind: "preflightLoading", path: filePath });
    setIsLoadingDiffPath(filePath);

    try {
      await loadWorkspaceMode(nextContext, initialMode);
    } finally {
      setIsLoadingDiffPath(null);
    }
  };

  const openedDiffActionMode = useMemo<"stage" | "unstage" | null>(() => {
    if (openedDiffPath === null) {
      return null;
    }

    const isInStaged = stagedItems.some((item) => item.path === openedDiffPath);
    const isInUnstaged = unstagedItems.some(
      (item) => item.path === openedDiffPath
    );

    if (isInStaged) {
      return "unstage";
    }

    if (isInUnstaged) {
      return "stage";
    }

    return null;
  }, [openedDiffPath, stagedItems, unstagedItems]);

  const openedDiffActionLabel = useMemo(() => {
    if (openedDiffActionMode === null) {
      return null;
    }

    return openedDiffActionMode === "stage" ? "Stage File" : "Unstage File";
  }, [openedDiffActionMode]);
  const openedDiffStageBadgeLabel = useMemo(() => {
    if (openedDiffActionMode === null) {
      return null;
    }

    return openedDiffActionMode === "stage" ? "Unstaged" : "Staged";
  }, [openedDiffActionMode]);
  const activeDiff =
    openedDiffContext?.source === "commit"
      ? openedCommitDiff
      : (openedDiff ?? openedCommitDiff);
  const activeDiffPath = activeDiff?.path ?? openedDiffContext?.filePath ?? "";
  const modelBasePath = activeDiffPath
    ? `inmemory://litgit/${activeDiffPath}`
    : null;
  const diffMonacoModelBasePath =
    modelBasePath === null ? null : `${modelBasePath}?surface=diff`;
  const fileMonacoModelPath =
    modelBasePath === null ? null : `${modelBasePath}?surface=file`;
  const editMonacoModelPath =
    modelBasePath === null ? null : `${modelBasePath}?surface=edit`;
  const blameMonacoModelPath =
    modelBasePath === null ? null : `${modelBasePath}?surface=blame`;
  const isWorkspaceAttributionMode =
    openedDiffContext !== null &&
    (workspaceMode === "blame" || workspaceMode === "history");
  const isLeftSidebarVisible = isLeftSidebarOpen && !isWorkspaceAttributionMode;
  const isRightSidebarVisible =
    isRightSidebarOpen && !isWorkspaceAttributionMode;
  const activeDiffStatusCode =
    openedDiffContext?.source === "commit"
      ? openedCommitDiffStatusCode
      : (openedDiffStatusCode ?? openedCommitDiffStatusCode);
  const activeDiffViewerKind = activeDiff?.viewerKind ?? "unsupported";
  const isMarkdownPreviewableFile =
    activeDiffViewerKind === "text" &&
    isMarkdownPreviewablePath(activeDiffPath);
  const isMarkdownFileWorkspaceMode =
    workspaceMode === "file" && isMarkdownPreviewableFile;
  const shouldShowMarkdownPreviewSurface =
    isMarkdownFileWorkspaceMode && workspaceFilePresentation === "preview";
  const resolvedPresentation = resolvePresentationForViewerKind(
    workspacePresentation,
    activeDiffViewerKind
  );
  const activeDiffOldImageDataUrl = activeDiff?.oldImageDataUrl ?? null;
  const activeDiffNewImageDataUrl = activeDiff?.newImageDataUrl ?? null;
  const shouldForceSingleImageView =
    activeDiffStatusCode === "A" || activeDiffStatusCode === "D";
  const hasBothImageSides =
    activeDiffOldImageDataUrl !== null && activeDiffNewImageDataUrl !== null;
  const hasImageContentChanged =
    hasBothImageSides &&
    activeDiffOldImageDataUrl !== activeDiffNewImageDataUrl;
  const useImageSplitView =
    activeDiffViewerKind === "image" &&
    hasBothImageSides &&
    !shouldForceSingleImageView &&
    hasImageContentChanged;
  const centeredImageDataUrl =
    activeDiffStatusCode === "D"
      ? (activeDiffOldImageDataUrl ?? activeDiffNewImageDataUrl)
      : (activeDiffNewImageDataUrl ?? activeDiffOldImageDataUrl);
  const unsupportedExtension =
    activeDiff?.unsupportedExtension?.trim().toLowerCase() ??
    resolveFileExtension(activeDiffPath);
  const isUnsupportedImagePreview =
    activeDiffViewerKind === "unsupported" &&
    unsupportedExtension !== null &&
    IMAGE_PREVIEWABLE_EXTENSIONS.has(unsupportedExtension);
  const unsupportedTitle = isUnsupportedImagePreview
    ? "Preview unavailable"
    : "Unsupported file extension";
  const unsupportedAsciiArt = isUnsupportedImagePreview
    ? PREVIEW_UNAVAILABLE_ASCII_ART
    : UNSUPPORTED_FILE_ASCII_ART;
  const unsupportedDiffLabel = activeDiff
    ? formatUnsupportedExtensionLabel(
        activeDiff.path,
        activeDiff.unsupportedExtension
      )
    : "This file type is not previewable in File View.";
  const unsupportedDescription = isUnsupportedImagePreview
    ? "Image preview could not be generated."
    : unsupportedDiffLabel;
  const shouldMountDiffMonacoSurface =
    workspaceMode === "diff" &&
    resolvedPresentation !== "hunk" &&
    shouldMountMonaco(diffPreviewPanelState, activeDiffViewerKind);
  const shouldMountFileMonacoSurface =
    workspaceMode === "file" &&
    diffPreviewPanelState.kind === "ready" &&
    activeDiffViewerKind === "text" &&
    !shouldShowMarkdownPreviewSurface;
  const shouldMountAttributionMonacoSurface =
    workspaceMode === "history" || workspaceMode === "blame";
  const shouldMountEditMonacoSurface =
    workspaceMode === "edit" &&
    openedDiffContext !== null &&
    !isLoadingEditBuffer &&
    editLoadError === null;
  const isDiffPanelOpen =
    openedDiffContext !== null ||
    diffPreviewPanelState.kind !== "idle" ||
    openedDiff !== null ||
    openedCommitDiff !== null;

  useEffect(() => {
    if (isMarkdownPreviewableFile) {
      setWorkspaceFilePresentation(DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION);
      return;
    }

    setWorkspaceFilePresentation("code");
  }, [isMarkdownPreviewableFile]);

  useEffect(() => {
    if (!shouldMountDiffMonacoSurface) {
      openedDiffEditorRef.current = null;
      setIsDiffEditorReady(false);
    }
  }, [shouldMountDiffMonacoSurface]);

  useEffect(() => {
    if (
      !(shouldMountFileMonacoSurface || shouldMountAttributionMonacoSurface)
    ) {
      openedFileEditorRef.current = null;
    }
  }, [shouldMountAttributionMonacoSurface, shouldMountFileMonacoSurface]);

  useEffect(() => {
    if (!shouldMountEditMonacoSurface) {
      openedEditEditorRef.current = null;
    }
  }, [shouldMountEditMonacoSurface]);

  useEffect(() => {
    if (shouldMountDiffMonacoSurface) {
      setHasRequestedDiffSurface(true);
    }
  }, [shouldMountDiffMonacoSurface]);

  useEffect(() => {
    if (shouldMountFileMonacoSurface) {
      setHasRequestedFileSurface(true);
    }
  }, [shouldMountFileMonacoSurface]);

  useEffect(() => {
    if (
      workspaceMode !== "diff" ||
      resolvedPresentation !== "hunk" ||
      openedDiffContext === null
    ) {
      return;
    }

    loadDiffHunks(openedDiffContext).catch(() => undefined);
  }, [loadDiffHunks, openedDiffContext, resolvedPresentation, workspaceMode]);

  useEffect(() => {
    if (resolvedPresentation === workspacePresentation) {
      return;
    }

    setWorkspacePresentation(resolvedPresentation);
  }, [resolvedPresentation, workspacePresentation]);

  useEffect(() => {
    if (
      workspaceEncoding !== DIFF_WORKSPACE_GUESS_ENCODING_VALUE ||
      !openedDiffContext
    ) {
      return;
    }

    detectAndApplyGuessedWorkspaceEncoding(openedDiffContext).catch(() => {
      setWorkspaceEncoding(DEFAULT_DIFF_WORKSPACE_ENCODING);
    });
  }, [
    detectAndApplyGuessedWorkspaceEncoding,
    openedDiffContext,
    workspaceEncoding,
  ]);

  useEffect(() => {
    if (previousWorkspaceEncodingRef.current === workspaceEncoding) {
      return;
    }

    previousWorkspaceEncodingRef.current = workspaceEncoding;

    if (!openedDiffContext) {
      return;
    }

    if (workspaceEncoding === DIFF_WORKSPACE_GUESS_ENCODING_VALUE) {
      return;
    }

    if (workspaceMode === "diff" || workspaceMode === "file") {
      runDiffPreviewPreflight(openedDiffContext, workspaceMode).catch(
        () => undefined
      );
      return;
    }

    if (workspaceMode === "edit") {
      loadEditSurface(openedDiffContext).catch(() => undefined);
    }
  }, [
    loadEditSurface,
    openedDiffContext,
    runDiffPreviewPreflight,
    workspaceEncoding,
    workspaceMode,
  ]);

  const handleOpenedDiffShortcutAction = async () => {
    if (openedDiffPath === null || openedDiffActionMode === null) {
      return;
    }

    await handleFileStageToggle(openedDiffPath, openedDiffActionMode);
  };

  const handleRetryDiffPreview = async () => {
    if (!openedDiffContext) {
      return;
    }

    if (workspaceMode === "file" || workspaceMode === "diff") {
      setDiffPreviewPanelState({
        kind: "preflightLoading",
        path: openedDiffContext.filePath,
      });
      await runDiffPreviewPreflight(openedDiffContext, workspaceMode);
      return;
    }

    if (workspaceMode === "history") {
      await loadHistorySurface(openedDiffContext);
      return;
    }

    if (workspaceMode === "blame") {
      await loadBlameSurface(openedDiffContext);
      return;
    }

    await loadEditSurface(openedDiffContext);
  };

  const handleRenderDiffPreviewAnyway = async () => {
    if (!openedDiffContext) {
      return;
    }

    if (workspaceMode !== "diff" && workspaceMode !== "file") {
      return;
    }

    if (openedDiffContext.source === "working") {
      await openWorkingDiffContent(openedDiffContext, workspaceMode, true);
      return;
    }

    await openCommitDiffContent(openedDiffContext, workspaceMode, true);
  };

  const handlePreviousChange = () => {
    if (workspaceMode !== "diff") {
      return;
    }

    navigateDiffEditor(openedDiffEditorRef.current, "previous");
  };

  const handleNextChange = () => {
    if (workspaceMode !== "diff") {
      return;
    }

    navigateDiffEditor(openedDiffEditorRef.current, "next");
  };

  const handleOpenHistoryEntry = async (entry: RepositoryFileHistoryEntry) => {
    if (!openedDiffContext) {
      return;
    }

    const nextContext: DiffPreviewOpenContext = {
      source: "commit",
      mode: "diff",
      commitHash: entry.commitHash,
      filePath: openedDiffContext.filePath,
      status: "M",
    };

    setOpenedDiffContext(nextContext);
    setSelectedHistoryCommitHash(entry.commitHash);
    setDiffPreviewPanelState({
      kind: "preflightLoading",
      path: nextContext.filePath,
    });
    await runDiffPreviewPreflight(nextContext, "diff");
  };

  const handleWorkspaceCloseRequest = useCallback(() => {
    if (isEditDirty) {
      setPendingWorkspaceMode(null);
      setPendingOpenDiffContext(null);
      setPendingCloseDiffPanel(true);
      setIsUnsavedEditConfirmOpen(true);
      return;
    }

    closeDiffPreviewPanel();
  }, [closeDiffPreviewPanel, isEditDirty]);

  const toolbarControls = resolveToolbarControlState({
    hasDiffEditor: isDiffEditorReady,
    hasHunks: activeHunks.length > 0,
    isWorkingTreeSource: openedDiffContext?.source === "working",
    mode: workspaceMode,
    presentation: resolvedPresentation,
    viewerKind: activeDiffViewerKind,
  });
  const editButtonLabel =
    openedDiffContext?.source === "working"
      ? "Edit This File"
      : "Edit in Working Directory";
  const stageActionLabel =
    openedDiffContext?.source === "working" ? openedDiffActionLabel : null;
  const isStageActionDisabled =
    openedDiffActionMode === null || isUpdatingFilePath !== null;
  let activeToolbarPrimaryMode: "diff" | "file" = "diff";

  if (isWorkspaceAttributionMode) {
    activeToolbarPrimaryMode = workspaceMode === "blame" ? "file" : "diff";
  } else if (workspaceMode === "file") {
    activeToolbarPrimaryMode = "file";
  }

  const handleDiscardUnsavedEditChanges = async () => {
    setIsUnsavedEditConfirmOpen(false);

    if (pendingCloseDiffPanel) {
      closeDiffPreviewPanel();
      return;
    }

    if (pendingOpenDiffContext) {
      const nextContext = pendingOpenDiffContext;
      setPendingOpenDiffContext(null);
      setPendingWorkspaceMode(null);
      setWorkspaceMode(nextContext.mode);
      setWorkspaceFilePresentation(
        nextContext.mode === "file"
          ? DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION
          : "code"
      );
      setWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
      setOpenedDiffContext(nextContext);
      setDiffPreviewPanelState({
        kind: "preflightLoading",
        path: nextContext.filePath,
      });
      await runDiffPreviewPreflight(nextContext, nextContext.mode);
      return;
    }

    if (pendingWorkspaceMode) {
      const nextMode = pendingWorkspaceMode;
      setPendingWorkspaceMode(null);
      await applyWorkspaceModeChange(nextMode);
    }
  };

  const handleOpenCommitFileDiff = async (
    commitHash: string,
    filePath: string,
    status: string
  ) => {
    if (!activeRepoId || isLoadingCommitDiffPath !== null) {
      return;
    }

    const initialMode = resolveDefaultWorkspacePreviewMode(filePath);
    const isTogglingCurrentDiff =
      openedDiffContext !== null &&
      openedDiffContext.source === "commit" &&
      openedDiffContext.commitHash === commitHash &&
      openedDiffContext.filePath === filePath &&
      diffPreviewPanelState.kind !== "idle";

    if (isTogglingCurrentDiff) {
      closeDiffPreviewPanel();
      return;
    }

    if (isEditDirty) {
      setPendingWorkspaceMode(initialMode);
      setPendingOpenDiffContext({
        source: "commit",
        mode: initialMode,
        commitHash,
        filePath,
        status,
      });
      setPendingCloseDiffPanel(false);
      setIsUnsavedEditConfirmOpen(true);
      return;
    }

    setWorkspaceMode(initialMode);
    setWorkspaceFilePresentation(
      initialMode === "file" ? DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION : "code"
    );
    setWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    setIgnoreTrimWhitespace(false);
    setOpenedDiff(null);
    setOpenedDiffPath(null);
    setOpenedDiffStatusCode(null);
    setOpenedCommitDiff(null);
    setOpenedCommitDiffStatusCode(null);
    setActiveHunks([]);
    setActiveHunkIndex(0);
    setHistoryEntries([]);
    setSelectedHistoryCommitHash(null);
    setBlameLines([]);
    setEditBuffer("");
    setEditInitialBuffer("");
    setEditLoadError(null);
    setPendingOpenDiffContext(null);

    const nextContext: DiffPreviewOpenContext = {
      source: "commit",
      mode: initialMode,
      commitHash,
      filePath,
      status,
    };
    setOpenedDiffContext(nextContext);
    setDiffPreviewPanelState({ kind: "preflightLoading", path: filePath });

    setIsLoadingCommitDiffPath(`${commitHash}:${filePath}`);

    try {
      await loadWorkspaceMode(nextContext, initialMode);
    } finally {
      setIsLoadingCommitDiffPath(null);
    }
  };

  const openWorkingPathWorkspaceMode = async (
    filePath: string,
    mode: DiffWorkspaceMode
  ) => {
    const context: DiffPreviewOpenContext = {
      source: "working",
      mode: "diff",
      filePath,
      item: workingTreeItemByPath.get(filePath) ?? {
        isUntracked: false,
        path: filePath,
        stagedStatus: " ",
        unstagedStatus: " ",
      },
    };

    setOpenedDiff(null);
    setOpenedCommitDiff(null);
    setOpenedDiffPath(null);
    setOpenedDiffStatusCode(null);
    setOpenedCommitDiffStatusCode(null);
    setActiveHunks([]);
    setHistoryEntries([]);
    setSelectedHistoryCommitHash(null);
    setBlameLines([]);
    setEditBuffer("");
    setEditInitialBuffer("");
    setEditLoadError(null);
    setPendingWorkspaceMode(null);
    setPendingOpenDiffContext(null);
    setPendingCloseDiffPanel(false);
    setOpenedDiffContext(context);
    setWorkspaceMode(mode);
    setWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    setDiffPreviewPanelState({ kind: "preflightLoading", path: filePath });

    if (mode === "diff" || mode === "file") {
      await runDiffPreviewPreflight(context, mode);
      return;
    }

    await loadWorkspaceMode(context, mode);
  };

  const getCommitTreeNodeStateKey = (commitHash: string, nodePath: string) =>
    `${commitHash}:${nodePath}`;

  const toggleCommitTreeNode = (commitHash: string, nodePath: string) => {
    const key = getCommitTreeNodeStateKey(commitHash, nodePath);

    setExpandedCommitTreeNodePaths((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };
  const collectExpandableCommitTreeKeys = (
    nodes: CommitFileTreeNode[],
    commitHash: string
  ): Record<string, boolean> => {
    return collectExpandableCommitTreeKeysModel(
      nodes,
      commitHash,
      getCommitTreeNodeStateKey
    );
  };
  const collapseCommitTree = (commitHash: string) => {
    setExpandedCommitTreeNodePaths((current) => {
      const nextEntries = Object.entries(current).filter(
        ([key]) => !key.startsWith(`${commitHash}:`)
      );

      return Object.fromEntries(nextEntries);
    });
  };
  const expandCommitTree = (
    commitHash: string,
    nodes: CommitFileTreeNode[]
  ) => {
    setExpandedCommitTreeNodePaths((current) => ({
      ...current,
      ...collectExpandableCommitTreeKeys(nodes, commitHash),
    }));
  };

  const renderCommitStatusBadge = (status: string): ReactNode => {
    const descriptor = getStatusDescriptor(status.charAt(0));

    if (!descriptor) {
      return null;
    }

    return (
      <span className={cn("inline-flex items-center", descriptor.className)}>
        {status.charAt(0) === "M" ? (
          <PencilSimpleIcon className="size-3" />
        ) : (
          <span className="font-semibold text-xs leading-none">
            {descriptor.short}
          </span>
        )}
      </span>
    );
  };

  const renderCommitTreeNodes = (
    nodes: CommitFileTreeNode[],
    commitHash: string,
    depth = 0,
    budget: RenderBudget = createRenderBudget(Number.POSITIVE_INFINITY)
  ): ReactNode => {
    const renderedNodes: ReactNode[] = [];

    for (const node of nodes) {
      if (budget.remaining <= 0) {
        break;
      }

      budget.remaining -= 1;
      const nodeStateKey = getCommitTreeNodeStateKey(commitHash, node.fullPath);
      const isExpanded = expandedCommitTreeNodePaths[nodeStateKey] ?? depth < 1;
      const hasChildren = node.children.size > 0;
      const collapsedChangeSummary =
        hasChildren && !isExpanded
          ? collectCommitTreeChangeSummary(node)
          : null;

      if (node.file) {
        const file = node.file;
        const loadingKey = `${commitHash}:${file.path}`;
        const canOpenDiff = showAllCommitFiles || file.status.trim().length > 0;
        let diffRowStateClassName = "";

        if (
          openedCommitDiff?.commitHash === commitHash &&
          openedCommitDiff.path === file.path
        ) {
          diffRowStateClassName = "bg-accent/30";
        } else if (canOpenDiff) {
          diffRowStateClassName = "hover:bg-accent/20";
        }

        renderedNodes.push(
          <button
            className={cn(
              "focus-visible:desktop-focus flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-xs transition-colors",
              !canOpenDiff && "cursor-default opacity-80",
              diffRowStateClassName
            )}
            disabled={!canOpenDiff}
            key={`${commitHash}-${file.path}`}
            onClick={() => {
              if (!canOpenDiff) {
                return;
              }

              handleOpenCommitFileDiff(
                commitHash,
                file.path,
                file.status
              ).catch(() => undefined);
            }}
            style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            type="button"
          >
            <span className="w-4" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              {file.additions > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-300">
                  +{file.additions}
                </span>
              ) : null}
              {file.deletions > 0 ? (
                <span className="text-rose-700 dark:text-rose-300">
                  -{file.deletions}
                </span>
              ) : null}
            </span>
            {isLoadingCommitDiffPath === loadingKey ? (
              <SpinnerGapIcon className="size-3 animate-spin text-muted-foreground" />
            ) : (
              renderCommitStatusBadge(node.file.status)
            )}
          </button>
        );

        continue;
      }

      renderedNodes.push(
        <div key={`${commitHash}-${node.fullPath}`}>
          <button
            className="focus-visible:desktop-focus flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-muted-foreground text-xs hover:bg-accent/20 hover:text-foreground"
            onClick={() => toggleCommitTreeNode(commitHash, node.fullPath)}
            style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            type="button"
          >
            {isExpanded ? (
              <CaretDownIcon className="size-3" />
            ) : (
              <CaretRightIcon className="size-3" />
            )}
            <span className="min-w-0 truncate">{node.name}</span>
            {collapsedChangeSummary ? (
              <span className="ml-auto inline-flex items-center gap-2 text-xs leading-none">
                {collapsedChangeSummary.modifiedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <PencilSimpleIcon className="size-2.5" />
                    {collapsedChangeSummary.modifiedCount}
                  </span>
                ) : null}
                {collapsedChangeSummary.addedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    +{collapsedChangeSummary.addedCount}
                  </span>
                ) : null}
                {collapsedChangeSummary.removedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                    -{collapsedChangeSummary.removedCount}
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
          {isExpanded
            ? renderCommitTreeNodes(
                Array.from(node.children.values()),
                commitHash,
                depth + 1,
                budget
              )
            : null}
        </div>
      );

      if (budget.remaining <= 0) {
        break;
      }
    }

    return renderedNodes;
  };
  const renderCommitPathRows = (
    files: RepositoryCommitFile[],
    commitHash: string,
    budget: RenderBudget = createRenderBudget(Number.POSITIVE_INFINITY)
  ): ReactNode => {
    const renderedRows: ReactNode[] = [];

    for (const file of files) {
      if (budget.remaining <= 0) {
        break;
      }

      budget.remaining -= 1;
      const loadingKey = `${commitHash}:${file.path}`;
      const canOpenDiff = showAllCommitFiles || file.status.trim().length > 0;
      let diffRowStateClassName = "";

      if (
        openedCommitDiff?.commitHash === commitHash &&
        openedCommitDiff.path === file.path
      ) {
        diffRowStateClassName = "bg-accent/30";
      } else if (canOpenDiff) {
        diffRowStateClassName = "hover:bg-accent/20";
      }

      renderedRows.push(
        <button
          className={cn(
            "focus-visible:desktop-focus flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-xs transition-colors",
            !canOpenDiff && "cursor-default opacity-80",
            diffRowStateClassName
          )}
          disabled={!canOpenDiff}
          key={`${commitHash}-${file.path}`}
          onClick={() => {
            if (!canOpenDiff) {
              return;
            }

            handleOpenCommitFileDiff(commitHash, file.path, file.status).catch(
              () => undefined
            );
          }}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">{file.path}</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
            {file.additions > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-300">
                +{file.additions}
              </span>
            ) : null}
            {file.deletions > 0 ? (
              <span className="text-rose-700 dark:text-rose-300">
                -{file.deletions}
              </span>
            ) : null}
          </span>
          {isLoadingCommitDiffPath === loadingKey ? (
            <SpinnerGapIcon className="size-3 animate-spin text-muted-foreground" />
          ) : (
            renderCommitStatusBadge(file.status)
          )}
        </button>
      );
    }

    return renderedRows;
  };

  useEffect(() => {
    if (!isDiffPanelOpen) {
      return;
    }

    const handleEscapeToCloseDiff = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      handleWorkspaceCloseRequest();
    };

    globalThis.addEventListener("keydown", handleEscapeToCloseDiff);

    return () => {
      globalThis.removeEventListener("keydown", handleEscapeToCloseDiff);
    };
  }, [handleWorkspaceCloseRequest, isDiffPanelOpen]);
  const renderChangeContextMenuContent = (
    targetPath: string,
    section: "staged" | "unstaged",
    options?: { isFolder?: boolean; folderName?: string }
  ) => {
    const isFolder = options?.isFolder ?? false;
    const fileName = targetPath.split("/").at(-1) ?? targetPath;
    const lastDotIndex = fileName.lastIndexOf(".");
    const fileExtension =
      lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1) : null;
    const primaryActionLabel =
      section === "unstaged" ? "Stage folder" : "Unstage folder";
    const discardLabel = isFolder
      ? "Discard all changes in folder"
      : "Discard changes";
    const pathSegments = targetPath
      .split("/")
      .filter((segment) => segment.length > 0);
    const ignoreTarget = isFolder
      ? `${options?.folderName ?? targetPath.split("/").at(-1) ?? targetPath}/`
      : targetPath;
    const parentFolderName = pathSegments.at(-2) ?? null;
    const stashLabel = isFolder ? "Stash folder" : "Stash file";
    const patchLabel = isFolder
      ? "Create Patch from changes in directory"
      : "Create patch from file changes";

    if (!isFolder) {
      return (
        <ContextMenuContent
          className="w-72"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          <ContextMenuItem
            disabled={isUpdatingFilePath !== null}
            onClick={(event) => {
              event.stopPropagation();
              handleFileStageToggle(
                targetPath,
                section === "unstaged" ? "stage" : "unstage"
              ).catch(() => undefined);
            }}
          >
            {section === "unstaged" ? "Stage" : "Unstage"}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isUpdatingFilePath !== null}
            onClick={() => {
              handleDiscardPathChanges(targetPath).catch(() => undefined);
            }}
          >
            {discardLabel}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Ignore</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                disabled={isUpdatingFilePath !== null}
                onClick={() => {
                  handleAddIgnoreRule(fileName).catch(() => undefined);
                }}
              >{`Ignore '${fileName}'`}</ContextMenuItem>
              {fileExtension ? (
                <ContextMenuItem
                  disabled={isUpdatingFilePath !== null}
                  onClick={() => {
                    handleAddIgnoreRule(`*.${fileExtension}`).catch(
                      () => undefined
                    );
                  }}
                >
                  {`All files with the extension '.${fileExtension}'`}
                </ContextMenuItem>
              ) : null}
              {parentFolderName ? (
                <ContextMenuItem
                  disabled={isUpdatingFilePath !== null}
                  onClick={() => {
                    handleAddIgnoreRule(`${parentFolderName}/`).catch(
                      () => undefined
                    );
                  }}
                >
                  {`All files in '${parentFolderName}/'`}
                </ContextMenuItem>
              ) : null}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>{stashLabel}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              openWorkingPathWorkspaceMode(targetPath, "history").catch(
                () => undefined
              );
            }}
          >
            File History
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              openWorkingPathWorkspaceMode(targetPath, "blame").catch(
                () => undefined
              );
            }}
          >
            File Blame
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Open in external diff tool</ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Open in external editor</ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Open file in default program
          </ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Show in folder</ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Copy file path</ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>{patchLabel}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              openWorkingPathWorkspaceMode(targetPath, "edit").catch(
                () => undefined
              );
            }}
          >
            Edit file
          </ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Delete file</ContextMenuItem>
        </ContextMenuContent>
      );
    }

    return (
      <ContextMenuContent
        className="w-72"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
      >
        <ContextMenuItem
          disabled={isUpdatingFilePath !== null}
          onClick={(event) => {
            event.stopPropagation();
            handleFileStageToggle(
              targetPath,
              section === "unstaged" ? "stage" : "unstage"
            ).catch(() => undefined);
          }}
        >
          {primaryActionLabel}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isUpdatingFilePath !== null}
          onClick={() => {
            handleDiscardPathChanges(targetPath).catch(() => undefined);
          }}
        >
          {discardLabel}
        </ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem
          disabled
        >{`Ignore all files in '${ignoreTarget}'`}</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>{stashLabel}</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>{patchLabel}</ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Open folder</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Create a file in this folder</ContextMenuItem>
      </ContextMenuContent>
    );
  };
  const renderChangeTreeNodes = (
    nodes: ChangeTreeNode[],
    section: ChangeTreeSection,
    depth = 0,
    budget: RenderBudget = createRenderBudget(Number.POSITIVE_INFINITY)
  ): ReactNode => {
    const renderedNodes: ReactNode[] = [];

    for (const node of nodes) {
      if (budget.remaining <= 0) {
        break;
      }

      budget.remaining -= 1;
      const hasChildren = node.children.size > 0;
      const nodeStateKey = getTreeNodeStateKey(section, node.fullPath);
      const isExpanded = expandedTreeNodePaths[nodeStateKey] ?? depth < 1;
      const collapsedStatusCounts = (() => {
        if (!(section !== "all" && hasChildren && !isExpanded)) {
          return null;
        }

        return collectTreeStatusCounts(node, section);
      })();

      if (node.item) {
        const item = node.item;
        const actionMode = section === "unstaged" ? "stage" : "unstage";
        const actionLabel = section === "unstaged" ? "Stage" : "Unstage";
        const isBusy = isUpdatingFilePath === item.path;
        const isLoadingDiff = isLoadingDiffPath === item.path;
        const isDiffOpened = openedDiffPath === item.path;
        const canToggleStage = section !== "all";

        renderedNodes.push(
          <ContextMenu key={`${section}-${node.fullPath}`}>
            <ContextMenuTrigger>
              <div
                className={cn(
                  "group focus-within:desktop-focus relative flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/20",
                  isDiffOpened && "bg-accent/30"
                )}
                style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
              >
                <button
                  aria-label={`Open diff for ${item.path}`}
                  className="absolute inset-0 z-0"
                  onClick={() => {
                    handleOpenFileDiff(item).catch(() => undefined);
                  }}
                  type="button"
                />
                <div className="pointer-events-none inline-flex min-w-3 items-center justify-center">
                  {section === "all"
                    ? renderStatusBadges(item, "unstaged")
                    : renderStatusBadges(item, section)}
                </div>
                <div className="pointer-events-none min-w-0 flex-1">
                  <p className="truncate">{node.name}</p>
                </div>
                {canToggleStage ? (
                  <Button
                    className={cn(
                      "relative z-10 h-6 px-2 text-xs transition-opacity",
                      isBusy
                        ? "opacity-100"
                        : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                    )}
                    disabled={isBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleFileStageToggle(item.path, actionMode).catch(
                        () => undefined
                      );
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {isBusy ? "..." : actionLabel}
                  </Button>
                ) : null}
                {isLoadingDiff ? (
                  <SpinnerGapIcon className="relative z-10 size-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </ContextMenuTrigger>
            {section === "all"
              ? null
              : renderChangeContextMenuContent(item.path, section)}
          </ContextMenu>
        );

        continue;
      }

      renderedNodes.push(
        <div key={`${section}-${node.fullPath}`}>
          <ContextMenu>
            <ContextMenuTrigger>
              <button
                className="focus-visible:desktop-focus flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-muted-foreground text-xs hover:bg-accent/20 hover:text-foreground"
                onClick={() => toggleTreeNode(section, node.fullPath)}
                style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
                type="button"
              >
                {isExpanded ? (
                  <CaretDownIcon className="size-3" />
                ) : (
                  <CaretRightIcon className="size-3" />
                )}
                <span className="truncate">{node.name}</span>
                {collapsedStatusCounts ? (
                  <span className="ml-1 inline-flex items-center gap-2">
                    {TREE_STATUS_SUMMARY_ORDER.map((code) => {
                      const count = collapsedStatusCounts.get(code) ?? 0;

                      if (count <= 0) {
                        return null;
                      }

                      const descriptor = getStatusDescriptor(code);

                      if (!descriptor) {
                        return null;
                      }

                      return (
                        <span
                          className="inline-flex items-center gap-1"
                          key={`${node.fullPath}-${code}`}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center justify-center",
                              descriptor.className
                            )}
                          >
                            {code === "M" ? (
                              <PencilSimpleIcon className="size-3" />
                            ) : (
                              <span className="font-semibold text-xs leading-none">
                                {descriptor.short}
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-muted-foreground text-xs leading-none">
                            {count}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                ) : null}
              </button>
            </ContextMenuTrigger>
            {section === "all"
              ? null
              : renderChangeContextMenuContent(node.fullPath, section, {
                  folderName: node.name,
                  isFolder: true,
                })}
          </ContextMenu>
          {hasChildren && isExpanded ? (
            <div>
              {renderChangeTreeNodes(
                Array.from(node.children.values()),
                section,
                depth + 1,
                budget
              )}
            </div>
          ) : null}
        </div>
      );

      if (budget.remaining <= 0) {
        break;
      }
    }

    return renderedNodes;
  };

  const renderFlatChangeRows = (
    items: RepositoryWorkingTreeItem[],
    section: "staged" | "unstaged",
    budget: RenderBudget = createRenderBudget(Number.POSITIVE_INFINITY)
  ) => {
    const renderedRows: ReactNode[] = [];

    for (const item of items) {
      if (budget.remaining <= 0) {
        break;
      }

      budget.remaining -= 1;
      const isBusy = isUpdatingFilePath === item.path;
      const nextAction = section === "unstaged" ? "stage" : "unstage";
      const nextLabel = section === "unstaged" ? "Stage" : "Unstage";
      const isLoadingDiff = isLoadingDiffPath === item.path;
      const isDiffOpened = openedDiffPath === item.path;

      renderedRows.push(
        <ContextMenu key={`${section}-${item.path}`}>
          <ContextMenuTrigger>
            <div
              className={cn(
                "group focus-within:desktop-focus relative flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/20",
                isDiffOpened && "bg-accent/30"
              )}
            >
              <button
                aria-label={`Open diff for ${item.path}`}
                className="absolute inset-0 z-0"
                onClick={() => {
                  handleOpenFileDiff(item).catch(() => undefined);
                }}
                type="button"
              />
              <div className="pointer-events-none inline-flex min-w-3 items-center justify-center">
                {renderStatusBadges(item, section)}
              </div>
              <p className="pointer-events-none min-w-0 flex-1 truncate">
                {item.path}
              </p>
              <Button
                className={cn(
                  "relative z-10 h-6 px-2 text-xs transition-opacity",
                  isBusy
                    ? "opacity-100"
                    : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                )}
                disabled={isBusy}
                onClick={(event) => {
                  event.stopPropagation();
                  handleFileStageToggle(item.path, nextAction).catch(
                    () => undefined
                  );
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {isBusy ? "..." : nextLabel}
              </Button>
              {isLoadingDiff ? (
                <SpinnerGapIcon className="relative z-10 size-3 animate-spin text-muted-foreground" />
              ) : null}
            </div>
          </ContextMenuTrigger>
          {renderChangeContextMenuContent(item.path, section)}
        </ContextMenu>
      );
    }

    return renderedRows;
  };

  const renderChangesSectionContent = (
    items: RepositoryWorkingTreeItem[],
    tree: ChangeTreeNode[],
    section: "staged" | "unstaged"
  ) => {
    const renderLimit =
      section === "unstaged" ? unstagedRenderLimit : stagedRenderLimit;
    const totalVisibleCount =
      section === "unstaged"
        ? unstagedVisibleNodeCount
        : stagedVisibleNodeCount;
    const renderBudget = createRenderBudget(renderLimit);

    if (items.length === 0) {
      return (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          {section === "unstaged" ? "No unstaged files." : "No staged files."}
        </p>
      );
    }

    if (changesViewMode === "tree") {
      return (
        <>
          {renderChangeTreeNodes(tree, section, 0, renderBudget)}
          {renderLimit < totalVisibleCount
            ? renderProgressiveLoadingMessage("files")
            : null}
        </>
      );
    }

    return (
      <>
        {renderFlatChangeRows(items, section, renderBudget)}
        {renderLimit < totalVisibleCount
          ? renderProgressiveLoadingMessage("files")
          : null}
      </>
    );
  };
  const renderAllFilesSectionContent = () => {
    if (allRepositoryFiles.length === 0) {
      return (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          No tracked or untracked files found.
        </p>
      );
    }

    if (filteredRepositoryFiles.length === 0) {
      return (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          No files match this filter.
        </p>
      );
    }

    const renderBudget = createRenderBudget(allFilesRenderLimit);

    return (
      <>
        {renderChangeTreeNodes(allFilesTree, "all", 0, renderBudget)}
        {allFilesRenderLimit < allFilesVisibleNodeCount
          ? renderProgressiveLoadingMessage("files")
          : null}
      </>
    );
  };

  const handleWorkingTreeRowClick = () => {
    if (!hasAnyWorkingTreeChanges) {
      return;
    }

    const isSameRow = selectedTimelineRowId === WORKING_TREE_ROW_ID;

    if (isSameRow && isRightSidebarVisible) {
      setIsRightSidebarOpen(false);
      return;
    }

    setSelectedTimelineRowId(WORKING_TREE_ROW_ID);
    setSelectedCommitId(WORKING_TREE_ROW_ID);
    if (!isWorkspaceAttributionMode) {
      setIsRightSidebarOpen(true);
    }
  };

  const handleCommitRowClick = (commitHash: string) => {
    const isSameCommit = selectedTimelineRowId === commitHash;

    if (isSameCommit && isRightSidebarVisible) {
      setIsRightSidebarOpen(false);
      return;
    }

    setSelectedTimelineRowId(commitHash);
    setSelectedCommitId(commitHash);
    if (!isWorkspaceAttributionMode) {
      setIsRightSidebarOpen(true);
    }
  };

  const selectTimelineReferenceRow = useCallback(
    (rowId: string, anchorCommitHash: string, shouldScroll: boolean) => {
      const isSameRow = selectedTimelineRowId === rowId;

      if (isSameRow && isRightSidebarVisible) {
        setIsRightSidebarOpen(false);
        return;
      }

      setSelectedTimelineRowId(rowId);
      setSelectedCommitId(anchorCommitHash);
      if (!isWorkspaceAttributionMode) {
        setIsRightSidebarOpen(true);
      }
      if (shouldScroll) {
        scrollTimelineRowIntoView(rowId);
      }
    },
    [
      isRightSidebarVisible,
      isWorkspaceAttributionMode,
      scrollTimelineRowIntoView,
      selectedTimelineRowId,
    ]
  );

  const focusSidebarEntryInGraph = useCallback(
    (entry: SidebarEntry) => {
      const rowId = getTimelineRowIdForEntry(entry);
      const anchorCommitHash = getCommitHashForEntry(entry);

      if (!(rowId && anchorCommitHash)) {
        return;
      }

      setSelectedTimelineRowId(rowId);
      setSelectedCommitId(anchorCommitHash);
      scrollTimelineRowIntoView(rowId);
    },
    [getCommitHashForEntry, getTimelineRowIdForEntry, scrollTimelineRowIntoView]
  );

  const handleSidebarEntryClick = (entry: SidebarEntry) => {
    focusSidebarEntryInGraph(entry);
  };

  const handleSidebarEntryDoubleClick = (entry: SidebarEntry) => {
    if (entry.type === "branch") {
      handleCheckoutBranch(entry).catch(() => undefined);
      return;
    }

    focusSidebarEntryInGraph(entry);
  };

  const handleTimelineReferenceRowClick = (row: GitTimelineRow) => {
    if (
      !((row.type === "stash" || row.type === "tag") && row.anchorCommitHash)
    ) {
      return;
    }

    selectTimelineReferenceRow(row.id, row.anchorCommitHash, false);
  };

  const openForcePushConfirm = (
    mode: "commit" | "push",
    action: () => Promise<void>
  ) => {
    pendingForcePushActionRef.current = action;
    setForcePushConfirmMode(mode);
    setIsForcePushConfirmOpen(true);
  };

  const openPublishRepoConfirm = (
    action: (options: PublishRepositoryOptions) => Promise<void>
  ) => {
    pendingPublishPushActionRef.current = action;
    setPublishRepoFormError(null);
    setIsPublishRepoConfirmOpen(true);
  };

  const handleStageAll = async () => {
    if (!activeRepoId || isStagingAll || !hasUnstagedChanges) {
      return;
    }

    setIsStagingAll(true);

    try {
      await stageAll(activeRepoId);
    } finally {
      setIsStagingAll(false);
    }
  };

  const handleGenerateAiCommitMessage = async () => {
    if (
      !activeRepoId ||
      isGeneratingAiCommitMessage ||
      aiSelectedModel.trim().length === 0
    ) {
      return;
    }

    setIsGeneratingAiCommitMessage(true);
    aiCommitGenerationStatusMessageRef.current =
      "Preparing AI commit generation";
    aiCommitGenerationPreviewRef.current = "";
    setAiCommitGenerationStatusMessage("Preparing AI commit generation");
    setAiCommitGenerationPreview("");
    let generationSucceeded = false;

    try {
      const generatedCommit = await generateAiCommitMessage(activeRepoId, "");

      setDraftCommitSummary(generatedCommit.title);
      setDraftCommitDescription(generatedCommit.body);
      setLastAiCommitGeneration({
        promptMode: generatedCommit.promptMode,
        providerKind: generatedCommit.providerKind,
        schemaFallbackUsed: generatedCommit.schemaFallbackUsed,
      });
      generationSucceeded = true;
    } finally {
      const nextState = finalizeAiCommitGenerationState(
        {
          preview: aiCommitGenerationPreviewRef.current,
          statusMessage: aiCommitGenerationStatusMessageRef.current,
        },
        generationSucceeded
      );
      aiCommitGenerationStatusMessageRef.current = nextState.statusMessage;
      aiCommitGenerationPreviewRef.current = nextState.preview;
      setAiCommitGenerationStatusMessage(nextState.statusMessage);
      setAiCommitGenerationPreview(nextState.preview);
      setIsGeneratingAiCommitMessage(false);
    }
  };
  const handleGenerateAiRewordMessage = async () => {
    if (
      !activeRepoId ||
      isGeneratingAiRewordMessage ||
      isRewordingCommitMessage ||
      aiSelectedModel.trim().length === 0
    ) {
      return;
    }

    setIsGeneratingAiRewordMessage(true);

    try {
      const generatedCommit = await generateAiCommitMessage(activeRepoId, "");

      setRewordCommitSummary(generatedCommit.title);
      setRewordCommitDescription(generatedCommit.body);
      setLastAiRewordGeneration({
        promptMode: generatedCommit.promptMode,
        providerKind: generatedCommit.providerKind,
        schemaFallbackUsed: generatedCommit.schemaFallbackUsed,
      });
    } finally {
      setIsGeneratingAiRewordMessage(false);
    }
  };

  const handleCommit = async () => {
    if (!activeRepoId || isCommitting || !canCommit) {
      return;
    }

    const hasDivergedBranch =
      (currentLocalBranch?.aheadCount ?? 0) > 0 &&
      (currentLocalBranch?.behindCount ?? 0) > 0;

    if (pushAfterCommit && !hasRemoteConfigured) {
      openPublishRepoConfirm(async (publishOptions) => {
        await executeCommit(false, publishOptions);
      });
      return;
    }

    if (
      pushAfterCommit &&
      hasRemoteConfigured &&
      (amendPreviousCommit || hasDivergedBranch)
    ) {
      openForcePushConfirm("commit", async () => {
        await executeCommit(true);
      });
      return;
    }

    await executeCommit(false);
  };

  const executeCommit = async (
    forceWithLease: boolean,
    publishOptions?: PublishRepositoryOptions
  ) => {
    if (!activeRepoId || isCommitting || !canCommit) {
      return;
    }

    setIsCommitting(true);

    try {
      await commitChanges(
        activeRepoId,
        draftCommitSummary.trim(),
        draftCommitDescription.trim(),
        false,
        amendPreviousCommit,
        skipCommitHooks
      );
      if (pushAfterCommit) {
        if (hasRemoteConfigured) {
          if (!forceWithLease && (currentLocalBranch?.behindCount ?? 0) > 0) {
            await pullBranch(activeRepoId, pullActionMode);
          }

          try {
            await pushBranch(activeRepoId, forceWithLease);
          } catch (error) {
            if (isMissingRemoteRepositoryError(error)) {
              openPublishRepoConfirm(async (resolvedPublishOptions) => {
                await pushBranch(activeRepoId, false, resolvedPublishOptions);
              });
              return;
            }

            throw error;
          }
        } else {
          if (!publishOptions) {
            throw new Error("Publish options are required before first push.");
          }

          await pushBranch(activeRepoId, false, publishOptions);
        }
      }
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
      setPushAfterCommit(false);
      setSkipCommitHooks(false);
      setLastAiCommitGeneration(null);
      preAmendDraftRef.current = null;
    } finally {
      setIsCommitting(false);
    }
  };

  const executeConfirmedForcePush = async () => {
    const pendingAction = pendingForcePushActionRef.current;

    if (!pendingAction) {
      setIsForcePushConfirmOpen(false);
      return;
    }

    try {
      await pendingAction();
    } finally {
      pendingForcePushActionRef.current = null;
      setIsForcePushConfirmOpen(false);
    }
  };
  let forcePushConfirmActionLabel = "Force push";

  if (isCommitting) {
    forcePushConfirmActionLabel = "Committing...";
  } else if (isPushing) {
    forcePushConfirmActionLabel = "Pushing...";
  }

  if (!activeRepo) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-muted-foreground">No repository selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isLeftSidebarVisible ? (
          <>
            <Sidebar
              className="shrink-0"
              style={{ width: `${leftSidebarWidth}px` }}
            >
              <SidebarHeader className="border-border/70 border-b p-2.5">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">
                    Repository
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <GithubLogoIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <p
                        className="max-w-56 truncate font-semibold text-sm"
                        title={activeRepo.name}
                      >
                        {activeRepo.name}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Viewing {filteredSidebarEntryCount}
                    </span>
                  </div>
                </div>
                <div className="relative mt-1.5">
                  <Input
                    className="focus-visible:desktop-focus h-7 pr-7 text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSidebarFilterInputValue(nextValue);
                      scheduleSidebarFilterUpdate(nextValue);
                    }}
                    placeholder="Filter (Ctrl + Alt + f)"
                    ref={sidebarFilterInputRef}
                    value={sidebarFilterInputValue}
                  />
                  {sidebarFilterInputValue.length > 0 ? (
                    <Button
                      aria-label="Clear filter"
                      className="focus-visible:desktop-focus-strong absolute top-0.5 right-0.5 focus-visible:ring-0! focus-visible:ring-offset-0!"
                      onClick={clearSidebarFilter}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3" />
                    </Button>
                  ) : null}
                </div>
              </SidebarHeader>

              <SidebarContent className="px-2.5 py-2.5">
                {(() => {
                  const sidebarBudget = createRenderBudget(sidebarRenderLimit);

                  return filteredSidebarGroups.map((group) => (
                    <SidebarGroup className="mt-2 first:mt-0" key={group.key}>
                      <SidebarGroupLabel className="px-0 py-0">
                        <button
                          className="flex w-full items-center justify-between py-0.5"
                          onClick={() =>
                            setCollapsedGroupKeys((current) => ({
                              ...current,
                              [group.key]: !current[group.key],
                            }))
                          }
                          type="button"
                        >
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
                            {collapsedGroupKeys[group.key] ? (
                              <CaretRightIcon className="size-3" />
                            ) : (
                              <CaretDownIcon className="size-3" />
                            )}
                            {renderSidebarGroupSectionIcon(group.key)}
                            {group.name}
                          </span>
                          <span className="font-medium text-muted-foreground text-xs">
                            {group.count}
                          </span>
                        </button>
                      </SidebarGroupLabel>

                      {!collapsedGroupKeys[group.key] && (
                        <SidebarGroupContent>
                          <SidebarMenu>
                            {group.treeNodes
                              ? renderSidebarBranchTreeNodes(
                                  group.key,
                                  group.treeNodes,
                                  0,
                                  sidebarBudget
                                )
                              : renderSidebarFlatEntries(
                                  group.key,
                                  group.entries,
                                  sidebarBudget
                                )}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      )}
                    </SidebarGroup>
                  ));
                })()}
                {sidebarRenderLimit < sidebarVisibleNodeCount
                  ? renderProgressiveLoadingMessage("items")
                  : null}
              </SidebarContent>
            </Sidebar>
            <button
              aria-label="Resize left sidebar"
              className="desktop-resize-handle-vertical-focus h-full w-1.5 shrink-0 cursor-col-resize border-border/70 border-r bg-transparent transition-colors hover:bg-accent/30"
              onMouseDown={startSidebarResize("left")}
              type="button"
            />
          </>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 border-border/60 border-b bg-background px-2 py-1 text-foreground">
            <div className="flex min-w-0 items-center justify-start gap-1">
              <TooltipProvider delay={1000} timeout={0}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Undo"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={!canUndoAction || isUndoRedoBusy}
                        onClick={() => {
                          handleUndoAction().catch(() => undefined);
                        }}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <ArrowCounterClockwiseIcon className="size-4 text-muted-foreground" />
                    <span className={cn(!toolbarLabels && "hidden")}>Undo</span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    {undoActionLabel ? `Undo: ${undoActionLabel}` : "Undo"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Redo"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={!canRedoAction || isUndoRedoBusy}
                        onClick={() => {
                          handleRedoAction().catch(() => undefined);
                        }}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <ArrowClockwiseIcon className="size-4 text-muted-foreground" />
                    <span className={cn(!toolbarLabels && "hidden")}>Redo</span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    {redoActionLabel ? `Redo: ${redoActionLabel}` : "Redo"}
                  </TooltipContent>
                </Tooltip>

                <Separator
                  className="!self-center mx-1 h-3.5"
                  orientation="vertical"
                />

                <DropdownMenu>
                  <div className="flex items-stretch">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            aria-label={`Run ${selectedPullActionLabel}`}
                            className="focus-visible:desktop-focus h-7 gap-1 rounded-r-none border-border/60 px-2 text-[0.7rem] focus-visible:ring-0! focus-visible:ring-offset-0!"
                            disabled={isPulling}
                            onClick={handlePullWithSelectedMode}
                            size={toolbarLabels ? "sm" : "icon-sm"}
                            type="button"
                            variant="outline"
                          />
                        }
                      >
                        {isPulling ? (
                          <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <ArrowLineDownIcon className="size-4 text-muted-foreground" />
                        )}
                        <span
                          className={cn("text-xs", !toolbarLabels && "hidden")}
                        >
                          Pull
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        className={cn(toolbarLabels && "hidden")}
                        side="bottom"
                      >
                        {selectedPullActionLabel}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label="Select pull mode"
                          className="focus-visible:desktop-focus-strong h-7 min-w-0 rounded-l-none border-border/60 border-l-0 px-1.5 focus-visible:ring-0! focus-visible:ring-offset-0!"
                          disabled={isPulling}
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <CaretDownIcon className="size-3" />
                        </Button>
                      }
                    />
                  </div>
                  <DropdownMenuContent
                    align="end"
                    className="min-w-44"
                    side="bottom"
                  >
                    <DropdownMenuItem
                      className={cn(
                        "cursor-pointer gap-1.5",
                        pullActionMode === "fetch-all" &&
                          "bg-accent text-accent-foreground"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("fetch-all")}
                    >
                      Fetch All
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "cursor-pointer gap-1.5",
                        pullActionMode === "pull-ff-possible" &&
                          "bg-accent text-accent-foreground"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-ff-possible")}
                    >
                      Pull (fast-forward if possible)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "cursor-pointer gap-1.5",
                        pullActionMode === "pull-ff-only" &&
                          "bg-accent text-accent-foreground"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-ff-only")}
                    >
                      Pull (fast-forward only)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "cursor-pointer gap-1.5",
                        pullActionMode === "pull-rebase" &&
                          "bg-accent text-accent-foreground"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-rebase")}
                    >
                      Pull (rebase)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Push"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={isPushing}
                        onClick={() => {
                          handlePushAction().catch(() => undefined);
                        }}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isPushing ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ArrowLineUpIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className={cn(!toolbarLabels && "hidden")}>Push</span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    Push
                  </TooltipContent>
                </Tooltip>

                <Separator
                  className="!self-center mx-1 h-3.5"
                  orientation="vertical"
                />

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Branch"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={
                          !activeRepoId || isCreatingBranch || isSwitchingBranch
                        }
                        onClick={openBranchCreateInput}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <GitBranchIcon className="size-4 text-muted-foreground" />
                    <span className={cn(!toolbarLabels && "hidden")}>
                      Branch
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    Branch
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Stash"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={isCreatingStash || !canCreateStash}
                        onClick={() => {
                          handleCreateStash().catch(() => undefined);
                        }}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isCreatingStash ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <TrayArrowDownIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className={cn(!toolbarLabels && "hidden")}>
                      Stash
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    Stash
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Pop"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={isPoppingStash || !canPopCurrentStash}
                        onClick={() => {
                          handlePopCurrentStash().catch(() => undefined);
                        }}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isPoppingStash ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <TrayArrowUpIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className={cn(!toolbarLabels && "hidden")}>Pop</span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    Pop
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="w-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center justify-end gap-1">
                {tauriRuntime ? (
                  <div className="flex items-stretch">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            aria-label={
                              selectedLauncher
                                ? `Open active repository with ${selectedLauncher.label}`
                                : "Open active repository in external application"
                            }
                            className="focus-visible:desktop-focus h-7 gap-1 rounded-r-none border-border/60 px-2 text-[0.7rem] focus-visible:ring-0! focus-visible:ring-offset-0!"
                            disabled={!activeRepoPath}
                            onClick={() => {
                              if (selectedLauncher) {
                                handleOpenPath(selectedLauncher.id).catch(
                                  () => undefined
                                );
                              } else if (launcherApplications[0]) {
                                handleOpenPath(
                                  launcherApplications[0].id
                                ).catch(() => undefined);
                              }
                            }}
                            size="sm"
                            variant="outline"
                          >
                            {selectedLauncher ? (
                              <LauncherItemIcon
                                application={selectedLauncher.id}
                              />
                            ) : (
                              <DesktopIcon className="size-3.5" />
                            )}
                            <span
                              className={cn(
                                "text-xs",
                                !toolbarLabels && "hidden"
                              )}
                            >
                              {selectedLauncher?.label ?? "Open"}
                            </span>
                          </Button>
                        }
                      />
                      <TooltipContent
                        className={cn(toolbarLabels && "hidden")}
                        side="bottom"
                      >
                        {selectedLauncher
                          ? `Open with ${selectedLauncher.label}`
                          : "Open with external app"}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label="Choose external application"
                            className="focus-visible:desktop-focus-strong h-7 min-w-0 rounded-l-none border-border/60 border-l-0 px-1.5 focus-visible:ring-0! focus-visible:ring-offset-0!"
                            disabled={!activeRepoPath}
                            size="sm"
                            variant="outline"
                          >
                            <CaretDownIcon className="size-3" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="min-w-44">
                        {launcherApplications.map((launcher) => (
                          <DropdownMenuItem
                            className="cursor-pointer gap-2"
                            key={launcher.id}
                            onClick={() => {
                              setSelectedLauncherId(launcher.id);
                              handleOpenPath(launcher.id).catch(
                                () => undefined
                              );
                            }}
                          >
                            <LauncherItemIcon application={launcher.id} />
                            <span>{launcher.label}</span>
                          </DropdownMenuItem>
                        ))}
                        {hasLauncherItems ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          onClick={() => {
                            handleCopyRepoPath().catch(() => undefined);
                          }}
                        >
                          <CopyIcon className="size-3.5" />
                          <span>Copy path</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Toggle terminal panel"
                        className="focus-visible:desktop-focus shrink-0 focus-visible:ring-0! focus-visible:ring-offset-0!"
                        disabled={!activeRepoPath}
                        onClick={toggleTerminalPanel}
                        size={toolbarLabels ? "sm" : "icon-sm"}
                        variant="ghost"
                      >
                        <TerminalWindowIcon
                          className={cn(
                            "size-4",
                            isTerminalPanelOpen && "text-primary"
                          )}
                        />
                        <span className={cn(!toolbarLabels && "hidden")}>
                          Terminal
                        </span>
                      </Button>
                    }
                  />
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    Terminal
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <section className="relative flex min-w-0 flex-1 flex-col">
              {isDiffPanelOpen ? null : (
                <div className="flex items-center overflow-hidden border-border/60 border-b">
                  <div
                    className="grid min-w-0 flex-1 px-2 py-1 text-muted-foreground text-xs/3 uppercase tracking-wide"
                    style={{ gridTemplateColumns: timelineGridTemplateColumns }}
                  >
                    {timelineColumnDefinitions.map((column) => (
                      <span
                        className={cn(
                          "flex items-center truncate px-2",
                          column.align === "center"
                            ? "justify-center"
                            : "justify-start"
                        )}
                        key={column.id}
                      >
                        {column.label}
                      </span>
                    ))}
                  </div>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <DropdownMenuTrigger
                            render={
                              <button
                                aria-label="Timeline settings"
                                className="focus-visible:desktop-focus-strong inline-flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-accent/40 focus-visible:bg-accent/40"
                                type="button"
                              />
                            }
                          />
                        }
                      >
                        <GearIcon className="size-3" />
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        Timeline settings
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent
                      align="end"
                      className="w-60"
                      sideOffset={6}
                    >
                      <DropdownMenuCheckboxItem
                        checked={repoTimelinePreferences.visibleColumns.branch}
                        onCheckedChange={(checked) => {
                          setTimelineColumnVisibility(
                            "branch",
                            checked === true
                          );
                        }}
                      >
                        Branch / Tag
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={repoTimelinePreferences.visibleColumns.graph}
                        onCheckedChange={(checked) => {
                          setTimelineColumnVisibility(
                            "graph",
                            checked === true
                          );
                        }}
                      >
                        Graph
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={
                          repoTimelinePreferences.visibleColumns.commitMessage
                        }
                        onCheckedChange={(checked) => {
                          setTimelineColumnVisibility(
                            "commitMessage",
                            checked === true
                          );
                        }}
                      >
                        Commit message
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={repoTimelinePreferences.visibleColumns.author}
                        onCheckedChange={(checked) => {
                          setTimelineColumnVisibility(
                            "author",
                            checked === true
                          );
                        }}
                      >
                        Author
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={
                          repoTimelinePreferences.visibleColumns.dateTime
                        }
                        onCheckedChange={(checked) => {
                          setTimelineColumnVisibility(
                            "dateTime",
                            checked === true
                          );
                        }}
                      >
                        Date / Time
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={repoTimelinePreferences.visibleColumns.sha}
                        onCheckedChange={(checked) => {
                          setTimelineColumnVisibility("sha", checked === true);
                        }}
                      >
                        Sha
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem
                        checked={isTimelineGraphCompactMode}
                        disabled={
                          isTimelineGraphAutoCompact ||
                          !repoTimelinePreferences.visibleColumns.graph
                        }
                        onCheckedChange={(checked) => {
                          setTimelineGraphCompactMode(checked === true);
                        }}
                      >
                        {isTimelineGraphAutoCompact
                          ? "Compact Graph Column (Auto)"
                          : "Compact Graph Column"}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={repoTimelinePreferences.smartBranchVisibility}
                        onCheckedChange={(checked) => {
                          setRepoTimelinePreferences({
                            smartBranchVisibility: checked === true,
                          });
                        }}
                      >
                        Smart Branch Visibility
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          resetTimelineLayout("default");
                        }}
                      >
                        Reset columns to default layout
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          resetTimelineLayout("compact");
                        }}
                      >
                        Reset columns to compact layout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <div
                className={cn(
                  "relative min-h-0 flex-1 overflow-y-auto",
                  isTerminalPanelOpen && "pb-52"
                )}
                ref={mainScrollContainerRef}
              >
                {isBranchCreateInputOpen ? (
                  <div
                    className="grid items-center border-border/35 border-b bg-muted/16 px-2 py-1.5"
                    ref={branchCreateRowRef}
                    style={{ gridTemplateColumns: timelineGridTemplateColumns }}
                  >
                    {timelineVisibleColumns.map((columnId) => (
                      <Fragment key={columnId}>
                        {renderTimelineCell(columnId, {
                          branchCell:
                            columnId === "branch" ? (
                              <div className="min-w-0 truncate">
                                <span
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium text-[0.7rem] leading-none shadow-sm"
                                  style={{
                                    backgroundColor:
                                      "color-mix(in srgb, canvas 90%, transparent)",
                                    boxShadow: `inset 0 0 0 1px ${currentBranchLaneColor}66`,
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    className="size-1.5 rounded-full"
                                    style={{
                                      backgroundColor: currentBranchLaneColor,
                                    }}
                                  />
                                  {currentBranch}
                                </span>
                              </div>
                            ) : undefined,
                          commitMessageCell:
                            columnId === "commitMessage" ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <div
                                  className="flex h-8 w-full max-w-72 items-center bg-background/95 pr-1 shadow-sm transition-shadow focus-within:shadow-md"
                                  style={{
                                    boxShadow: `inset 0 0 0 1px ${currentBranchLaneColor}66`,
                                  }}
                                >
                                  <Input
                                    className="focus-visible:desktop-focus h-full border-0 bg-transparent px-3 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
                                    disabled={isCreatingBranch}
                                    onChange={(event) =>
                                      setNewBranchName(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        closeBranchCreateInput();
                                        return;
                                      }

                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        handleCreateBranchFromToolbar().catch(
                                          () => undefined
                                        );
                                      }
                                    }}
                                    placeholder="enter branch name"
                                    ref={branchCreateInputRef}
                                    value={newBranchName}
                                  />
                                </div>
                                <Button
                                  className="focus-visible:desktop-focus h-7 px-3 shadow-sm focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  disabled={
                                    isCreatingBranch ||
                                    newBranchName.trim().length === 0
                                  }
                                  onClick={() => {
                                    handleCreateBranchFromToolbar().catch(
                                      () => undefined
                                    );
                                  }}
                                  size="sm"
                                  style={{
                                    borderColor: `${currentBranchLaneColor}66`,
                                    boxShadow: `inset 0 0 0 1px ${currentBranchLaneColor}22`,
                                  }}
                                  type="button"
                                  variant="outline"
                                >
                                  {isCreatingBranch ? "Creating..." : "Create"}
                                </Button>
                                <Button
                                  className="focus-visible:desktop-focus h-7 px-3 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  disabled={isCreatingBranch}
                                  onClick={closeBranchCreateInput}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : undefined,
                        })}
                      </Fragment>
                    ))}
                  </div>
                ) : null}
                <div className="relative">
                  {hasAnyWorkingTreeChanges ? (
                    <button
                      className={cn(
                        "group relative z-10 grid h-9 w-full cursor-pointer items-center border-border/35 border-b px-2 text-left transition-colors",
                        selectedTimelineRowId === WORKING_TREE_ROW_ID
                          ? "bg-muted"
                          : "hover:bg-muted/35"
                      )}
                      onClick={handleWorkingTreeRowClick}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleWorkingTreeRowClick();
                        }
                      }}
                      ref={workingTreeTimelineRowRef}
                      style={{
                        gridTemplateColumns: timelineGridTemplateColumns,
                      }}
                      type="button"
                    >
                      {timelineVisibleColumns.map((columnId) => (
                        <Fragment key={columnId}>
                          {renderTimelineCell(columnId, {
                            commitMessageCell:
                              columnId === "commitMessage" ? (
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <Input
                                    className="h-7 w-full min-w-0 max-w-52"
                                    disabled
                                    placeholder="// WIP"
                                    value={draftCommitSummary}
                                  />
                                  <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                                    {workingTreeIndicators.editedCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 text-amber-700 text-xs dark:text-amber-300">
                                        <PencilSimpleIcon
                                          aria-hidden
                                          className="size-2.5"
                                        />
                                        {workingTreeIndicators.editedCount}
                                      </span>
                                    ) : null}
                                    {workingTreeIndicators.addedCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs dark:text-emerald-300">
                                        <PlusIcon
                                          aria-hidden
                                          className="size-2.5"
                                        />
                                        {workingTreeIndicators.addedCount}
                                      </span>
                                    ) : null}
                                    {workingTreeIndicators.removedCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 text-rose-700 text-xs dark:text-rose-300">
                                        <MinusIcon
                                          aria-hidden
                                          className="size-2.5"
                                        />
                                        {workingTreeIndicators.removedCount}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : undefined,
                          })}
                        </Fragment>
                      ))}
                    </button>
                  ) : null}
                  <div
                    style={{
                      height: Math.max(
                        timelineVirtualizer.getTotalSize(),
                        TIMELINE_ROW_HEIGHT
                      ),
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        left: 0,
                        position: "absolute",
                        top: 0,
                        transform: `translateY(${timelineVirtualRowsOffset}px)`,
                        width: "100%",
                      }}
                    >
                      {repoTimelinePreferences.visibleColumns.graph ? (
                        <Suspense
                          fallback={
                            <div
                              className="pointer-events-none absolute top-0 right-0 left-0 z-20 animate-pulse border-border/35 border-b bg-muted/20"
                              style={{
                                height: Math.max(
                                  TIMELINE_ROW_HEIGHT *
                                    visibleTimelineRows.length,
                                  TIMELINE_ROW_HEIGHT
                                ),
                              }}
                            />
                          }
                        >
                          <LazyGitGraphOverlay
                            branchColumnWidth={
                              resolvedTimelineBranchColumnWidth
                            }
                            commits={visibleTimelineCommits}
                            graph={visibleHistoryGraph}
                            graphColumnWidth={effectiveTimelineGraphColumnWidth}
                            onNodeMenuOpenChange={handleGraphNodeMenuOpenChange}
                            onNodeSelect={handleGraphNodeSelect}
                            renderNodeContextMenu={
                              renderGraphNodeContextMenuContent
                            }
                            rowHeight={TIMELINE_ROW_HEIGHT}
                            rows={visibleTimelineRows}
                            selectedRowId={selectedTimelineRowId}
                          />
                        </Suspense>
                      ) : null}
                      {visibleTimelineRows.map((row) => {
                        if (row.type === "commit" && row.commitHash) {
                          const item = commitByHash.get(row.commitHash);

                          if (!item) {
                            return null;
                          }

                          const commitMessageSummary = (
                            item.messageSummary ?? ""
                          ).trim();
                          const commitTitle =
                            commitMessageSummary.length > 0
                              ? commitMessageSummary
                              : (item.message ?? "");
                          const commitDescription = (
                            item.messageDescription ?? ""
                          ).trim();
                          const laneColor = getCommitLaneColor(
                            visibleHistoryGraph,
                            item.hash
                          );
                          const isPullableCommit =
                            item.syncState === "pullable";
                          const commitRefs = item.refs
                            .map(
                              (ref) =>
                                normalizeCommitRefLabel(ref) ?? ref.trim()
                            )
                            .filter(
                              (ref) =>
                                ref.length > 0 && !isReferenceHiddenInGraph(ref)
                            );
                          const visibleRefCount =
                            repoTimelinePreferences.smartBranchVisibility ||
                            timelineVisibleColumns.some(
                              (columnId) =>
                                columnId === "author" ||
                                columnId === "dateTime" ||
                                columnId === "sha"
                            )
                              ? 1
                              : 2;
                          const visibleCommitRefs = commitRefs.slice(
                            0,
                            visibleRefCount
                          );
                          const hiddenCommitRefs =
                            commitRefs.slice(visibleRefCount);
                          const hiddenCommitRefCount = Math.max(
                            0,
                            commitRefs.length - visibleCommitRefs.length
                          );

                          return (
                            <ContextMenu
                              key={item.hash}
                              onOpenChange={(open) => {
                                handleCommitMenuOpenChange(item.hash, open);
                              }}
                            >
                              <ContextMenuTrigger>
                                <button
                                  className={cn(
                                    "group relative z-10 grid h-9 w-full items-center border-border/35 border-b px-2 text-left transition-colors",
                                    selectedTimelineRowId === item.hash ||
                                      openCommitMenuHash === item.hash
                                      ? "bg-muted hover:bg-muted"
                                      : "hover:bg-muted/35"
                                  )}
                                  onClick={() => {
                                    handleCommitRowClick(item.hash);
                                  }}
                                  ref={(element) => {
                                    setTimelineRowElement(item.hash, element);
                                  }}
                                  style={{
                                    gridTemplateColumns:
                                      timelineGridTemplateColumns,
                                  }}
                                  type="button"
                                >
                                  {timelineVisibleColumns.map((columnId) => (
                                    <Fragment key={columnId}>
                                      {renderTimelineCell(columnId, {
                                        branchCell:
                                          columnId === "branch" ? (
                                            <div className="min-w-0 truncate pr-2">
                                              {visibleCommitRefs.length > 0 ? (
                                                <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                                                  {isPullableCommit ? (
                                                    <Tooltip>
                                                      <TooltipTrigger
                                                        render={
                                                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-sky-700 text-xs leading-none dark:text-sky-300" />
                                                        }
                                                      >
                                                        <ArrowLineDownIcon className="size-3" />
                                                        Pull
                                                      </TooltipTrigger>
                                                      <TooltipContent side="bottom">
                                                        Commit available from
                                                        upstream
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  ) : null}
                                                  {visibleCommitRefs.map(
                                                    (ref, index) => (
                                                      <Tooltip key={ref}>
                                                        <TooltipTrigger
                                                          render={
                                                            <span
                                                              className={cn(
                                                                "inline-flex min-w-0 shrink items-center rounded border bg-muted/40 px-1.5 py-0.5 text-xs leading-none",
                                                                index === 0
                                                                  ? "max-w-24"
                                                                  : "max-w-16"
                                                              )}
                                                              style={{
                                                                borderColor: `${laneColor}80`,
                                                              }}
                                                            />
                                                          }
                                                        >
                                                          <span className="truncate">
                                                            {ref}
                                                          </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="bottom">
                                                          {ref}
                                                        </TooltipContent>
                                                      </Tooltip>
                                                    )
                                                  )}
                                                  {hiddenCommitRefCount > 0 ? (
                                                    <Tooltip>
                                                      <TooltipTrigger
                                                        render={
                                                          <span
                                                            className="inline-flex shrink-0 items-center rounded border bg-muted/40 px-1.5 py-0.5 font-medium text-xs leading-none"
                                                            style={{
                                                              borderColor: `${laneColor}66`,
                                                            }}
                                                          />
                                                        }
                                                      >
                                                        +{hiddenCommitRefCount}
                                                      </TooltipTrigger>
                                                      <TooltipContent side="bottom">
                                                        {hiddenCommitRefs.join(
                                                          ", "
                                                        )}
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  ) : null}
                                                </div>
                                              ) : (
                                                <span className="text-muted-foreground/70 text-xs">
                                                  <span className="sr-only">
                                                    No refs
                                                  </span>
                                                </span>
                                              )}
                                            </div>
                                          ) : undefined,
                                        commit: item,
                                        commitMessageCell:
                                          columnId === "commitMessage" ? (
                                            <div className="relative min-w-0 self-stretch">
                                              <div
                                                className="absolute top-0 bottom-0 left-0 rounded-full"
                                                style={{
                                                  background: isPullableCommit
                                                    ? `repeating-linear-gradient(to bottom, ${laneColor} 0 2px, transparent 2px 6px)`
                                                    : laneColor,
                                                  width:
                                                    TIMELINE_COMMIT_MESSAGE_BAR_WIDTH,
                                                }}
                                              />
                                              <div
                                                className="flex h-full min-w-0 items-center gap-1"
                                                style={{
                                                  paddingLeft:
                                                    TIMELINE_COMMIT_MESSAGE_BAR_WIDTH +
                                                    TIMELINE_COMMIT_MESSAGE_BAR_GAP,
                                                }}
                                              >
                                                <p className="min-w-0 flex-1 truncate pr-2 text-xs leading-4">
                                                  <span>{commitTitle}</span>
                                                  {commitDescription.length >
                                                  0 ? (
                                                    <span className="text-muted-foreground/80">
                                                      {" "}
                                                      {commitDescription}
                                                    </span>
                                                  ) : null}
                                                </p>
                                              </div>
                                            </div>
                                          ) : undefined,
                                      })}
                                    </Fragment>
                                  ))}
                                </button>
                              </ContextMenuTrigger>
                              {openCommitMenuHash === item.hash
                                ? renderCommitRowContextMenuContent(item)
                                : null}
                            </ContextMenu>
                          );
                        }

                        if (!(row.type === "stash" || row.type === "tag")) {
                          return null;
                        }

                        const laneColor = getCommitLaneColor(
                          visibleHistoryGraph,
                          row.anchorCommitHash ?? ""
                        );
                        const timelineEntry =
                          getSidebarEntryForTimelineRow(row);
                        const rowCommit = resolveTimelineRowCommit(row);
                        const rowLabel = row.label ?? "";
                        const rowKindLabel =
                          row.type === "stash"
                            ? "Stash snapshot"
                            : "Tag reference";

                        const rowButton = (
                          <button
                            className={cn(
                              "group relative z-10 grid h-9 w-full items-center border-border/35 border-b px-2 text-left transition-colors",
                              selectedTimelineRowId === row.id
                                ? "bg-muted"
                                : "hover:bg-muted/35"
                            )}
                            key={row.id}
                            onClick={() => {
                              handleTimelineReferenceRowClick(row);
                            }}
                            ref={(element) => {
                              setTimelineRowElement(row.id, element);
                            }}
                            style={{
                              gridTemplateColumns: timelineGridTemplateColumns,
                            }}
                            type="button"
                          >
                            {timelineVisibleColumns.map((columnId) => (
                              <Fragment key={columnId}>
                                {renderTimelineCell(columnId, {
                                  branchCell:
                                    columnId === "branch" ? (
                                      <div className="min-w-0 truncate pr-2">
                                        <span
                                          className="inline-flex min-w-0 max-w-24 shrink items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-xs leading-none"
                                          style={{
                                            borderColor: `${laneColor}80`,
                                          }}
                                        >
                                          {row.type === "stash" ? (
                                            <StackSimpleIcon className="size-2.5 shrink-0" />
                                          ) : (
                                            <TagIcon className="size-2.5 shrink-0" />
                                          )}
                                          <span className="truncate">
                                            {rowLabel}
                                          </span>
                                        </span>
                                      </div>
                                    ) : undefined,
                                  commit: rowCommit,
                                  commitMessageCell:
                                    columnId === "commitMessage" ? (
                                      <div className="relative min-w-0 self-stretch">
                                        <div
                                          className="absolute top-0 bottom-0 left-0 rounded-full"
                                          style={{
                                            backgroundColor: laneColor,
                                            width:
                                              TIMELINE_COMMIT_MESSAGE_BAR_WIDTH,
                                          }}
                                        />
                                        <div
                                          className="flex h-full min-w-0 items-center gap-1"
                                          style={{
                                            paddingLeft:
                                              TIMELINE_COMMIT_MESSAGE_BAR_WIDTH +
                                              TIMELINE_COMMIT_MESSAGE_BAR_GAP,
                                          }}
                                        >
                                          <p className="min-w-0 flex-1 truncate pr-2 text-xs leading-4">
                                            <span>{rowLabel}</span>
                                            <span className="text-muted-foreground/80">
                                              {" "}
                                              {rowKindLabel}
                                            </span>
                                          </p>
                                        </div>
                                      </div>
                                    ) : undefined,
                                })}
                              </Fragment>
                            ))}
                          </button>
                        );

                        if (!timelineEntry) {
                          return rowButton;
                        }

                        return (
                          <ContextMenu key={row.id}>
                            <ContextMenuTrigger>{rowButton}</ContextMenuTrigger>
                            {renderEntryContextMenuContent(timelineEntry)}
                          </ContextMenu>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {commits.length === 0 && !isLoadingHistory ? (
                  <div className="px-2 py-3 text-muted-foreground text-xs">
                    No commits found.
                  </div>
                ) : null}
                {isLoadingHistory ? (
                  <div className="px-2 py-3 text-muted-foreground text-xs">
                    Loading commits...
                  </div>
                ) : null}
              </div>
              <IntegratedTerminalPanel
                contextKey={`${activeTabIdFromUrl}:${activeRepoId ?? "repo:none"}`}
                cwd={activeRepo?.path ?? ""}
              />
              {isDiffPanelOpen ? (
                <div className="absolute inset-0 z-20 flex flex-col bg-background">
                  <DiffWorkspaceToolbar
                    activePath={activeDiffPath}
                    activePrimaryMode={activeToolbarPrimaryMode}
                    controls={toolbarControls}
                    editLabel={editButtonLabel}
                    encoding={resolvedWorkspaceEncoding}
                    encodingOptions={DIFF_WORKSPACE_ENCODING_OPTIONS}
                    isCompactImageToolbar={activeDiffViewerKind === "image"}
                    isIgnoreTrimWhitespace={ignoreTrimWhitespace}
                    isMarkdownFileView={isMarkdownFileWorkspaceMode}
                    isStageActionDisabled={isStageActionDisabled}
                    markdownFilePresentation={workspaceFilePresentation}
                    mode={workspaceMode}
                    onClose={handleWorkspaceCloseRequest}
                    onEdit={() => {
                      requestWorkspaceModeChange("edit").catch(() => undefined);
                    }}
                    onEncodingChange={(encoding) => {
                      setWorkspaceEncoding(
                        resolveDiffWorkspaceEncodingValue(encoding)
                      );
                    }}
                    onMarkdownFilePresentationChange={(mode) => {
                      setWorkspaceFilePresentation(mode);
                    }}
                    onModeChange={(mode) => {
                      requestWorkspaceModeChange(mode).catch(() => undefined);
                    }}
                    onNextChange={handleNextChange}
                    onPresentationChange={(mode) => {
                      if (
                        workspaceMode !== "diff" &&
                        workspaceMode !== "history"
                      ) {
                        return;
                      }

                      setWorkspacePresentation(mode);
                    }}
                    onPreviousChange={handlePreviousChange}
                    onPrimaryModeChange={(primaryMode) => {
                      let nextMode: DiffWorkspaceMode = primaryMode;

                      if (
                        workspaceMode === "history" ||
                        workspaceMode === "blame"
                      ) {
                        nextMode = primaryMode === "file" ? "blame" : "history";
                      }

                      if (
                        nextMode === "file" &&
                        isMarkdownPreviewablePath(activeDiffPath)
                      ) {
                        setWorkspaceFilePresentation(
                          DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION
                        );
                      }

                      requestWorkspaceModeChange(nextMode).catch(
                        () => undefined
                      );
                    }}
                    onStageAction={() => {
                      handleOpenedDiffShortcutAction().catch(() => undefined);
                    }}
                    onToggleWhitespace={() => {
                      setIgnoreTrimWhitespace((current) => !current);
                    }}
                    presentation={resolvedPresentation}
                    stageActionLabel={stageActionLabel}
                    stageBadgeLabel={
                      openedDiffContext?.source === "working"
                        ? openedDiffStageBadgeLabel
                        : null
                    }
                  />
                  <div className="relative min-h-0 flex-1">
                    {(workspaceMode === "diff" || workspaceMode === "file") &&
                    (diffPreviewPanelState.kind !== "ready" || !activeDiff) ? (
                      <DiffPreviewSurface
                        onCancel={handleWorkspaceCloseRequest}
                        onRenderAnyway={() => {
                          handleRenderDiffPreviewAnyway().catch(
                            () => undefined
                          );
                        }}
                        onRetry={() => {
                          handleRetryDiffPreview().catch(() => undefined);
                        }}
                        state={diffPreviewPanelState}
                      />
                    ) : null}
                    {workspaceMode === "diff" &&
                    diffPreviewPanelState.kind === "ready" &&
                    activeDiff ? (
                      <>
                        {resolvedPresentation === "hunk" &&
                        activeDiffViewerKind === "text" ? (
                          <Suspense
                            fallback={
                              <div className="h-full w-full bg-muted/30" />
                            }
                          >
                            <LazyDiffWorkspaceHunkSurface
                              DiffEditorComponent={LazyCodeEditorDiff}
                              fontFamily={editorPreferences.fontFamily}
                              fontSize={editorPreferences.fontSize}
                              hunks={activeHunks}
                              ignoreTrimWhitespace={ignoreTrimWhitespace}
                              isLoading={isLoadingDiffHunks}
                              language={resolveLanguage(activeDiffPath)}
                              lineNumbers={editorPreferences.lineNumbers}
                              modelPathBase={
                                diffMonacoModelBasePath ??
                                "inmemory://litgit/unknown?diff-hunks"
                              }
                              modified={activeDiff.newText}
                              onMount={(editor) => {
                                openedDiffEditorRef.current =
                                  editor as DiffEditorInstance;
                              }}
                              onRetry={() => {
                                handleRetryDiffPreview().catch(() => undefined);
                              }}
                              original={activeDiff.oldText}
                              renderError={diffHunksError}
                              syntaxHighlighting={
                                editorPreferences.syntaxHighlighting
                              }
                              tabSize={editorPreferences.tabSize}
                              theme={
                                resolvedTheme === "light" ? "light" : "dark"
                              }
                              wordWrap={editorPreferences.wordWrap}
                            />
                          </Suspense>
                        ) : null}
                        {resolvedPresentation !== "hunk" &&
                        shouldMountDiffMonacoSurface &&
                        hasRequestedDiffSurface ? (
                          <Suspense
                            fallback={
                              <div className="h-full w-full bg-muted/30" />
                            }
                          >
                            <LazyCodeEditorDiff
                              fontFamily={editorPreferences.fontFamily}
                              fontSize={editorPreferences.fontSize}
                              ignoreTrimWhitespace={ignoreTrimWhitespace}
                              language={
                                editorPreferences.syntaxHighlighting
                                  ? resolveLanguage(activeDiffPath)
                                  : "plaintext"
                              }
                              lineNumbers={editorPreferences.lineNumbers}
                              mode="diff"
                              modelPath={
                                diffMonacoModelBasePath ??
                                "inmemory://litgit/unknown?diff"
                              }
                              modified={activeDiff.newText}
                              onMount={(mergeView) => {
                                openedDiffEditorRef.current = mergeView;
                              }}
                              original={activeDiff.oldText}
                              renderSideBySide={
                                resolvedPresentation === "split"
                              }
                              syntaxHighlighting={
                                editorPreferences.syntaxHighlighting
                              }
                              tabSize={editorPreferences.tabSize}
                              theme={
                                resolvedTheme === "light" ? "light" : "dark"
                              }
                              wordWrap={editorPreferences.wordWrap}
                            />
                          </Suspense>
                        ) : null}
                        {resolvedPresentation !== "hunk" &&
                        shouldMountDiffMonacoSurface &&
                        !hasRequestedDiffSurface ? (
                          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                            <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                            Preparing diff surface...
                          </div>
                        ) : null}
                        {activeDiffViewerKind === "image" ? (
                          <ImageDiffViewer
                            filePath={activeDiffPath}
                            newImageSrc={activeDiffNewImageDataUrl}
                            oldImageSrc={activeDiffOldImageDataUrl}
                            splitView={useImageSplitView}
                          />
                        ) : null}
                        {activeDiffViewerKind === "unsupported" ? (
                          <div className="flex h-full items-center justify-center px-6">
                            <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
                              <pre
                                aria-hidden="true"
                                className="overflow-auto font-mono text-muted-foreground/90 text-xs leading-tight"
                              >
                                {unsupportedAsciiArt}
                              </pre>
                              <p className="font-medium text-sm">
                                {unsupportedTitle}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {unsupportedDescription}
                              </p>
                              {unsupportedExtension ? (
                                <p className="text-muted-foreground/80 text-xs">
                                  Detected extension: .{unsupportedExtension}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {workspaceMode === "file" &&
                    diffPreviewPanelState.kind === "ready" &&
                    activeDiff ? (
                      <>
                        {shouldShowMarkdownPreviewSurface ? (
                          <Suspense
                            fallback={
                              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                                Loading markdown preview...
                              </div>
                            }
                          >
                            <LazyDiffWorkspaceMarkdownPreviewSurface
                              markdown={activeDiff.newText}
                            />
                          </Suspense>
                        ) : null}
                        {!shouldShowMarkdownPreviewSurface &&
                        shouldMountFileMonacoSurface &&
                        hasRequestedFileSurface ? (
                          <Suspense
                            fallback={
                              <div className="h-full w-full bg-muted/30" />
                            }
                          >
                            <LazyCodeEditorView
                              blameDecorations={undefined}
                              fontFamily={editorPreferences.fontFamily}
                              fontSize={editorPreferences.fontSize}
                              language={resolveLanguage(activeDiffPath)}
                              lineNumbers={editorPreferences.lineNumbers}
                              mode="view"
                              modelPath={fileMonacoModelPath ?? "untitled"}
                              onMount={(editor) => {
                                openedFileEditorRef.current = editor;
                              }}
                              syntaxHighlighting={
                                editorPreferences.syntaxHighlighting
                              }
                              tabSize={editorPreferences.tabSize}
                              theme={
                                resolvedTheme === "light" ? "light" : "dark"
                              }
                              value={activeDiff.newText ?? "Loading..."}
                              wordWrap={editorPreferences.wordWrap}
                            />
                          </Suspense>
                        ) : null}
                        {!shouldShowMarkdownPreviewSurface &&
                        shouldMountFileMonacoSurface &&
                        !hasRequestedFileSurface ? (
                          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                            <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                            Preparing file view...
                          </div>
                        ) : null}
                        {activeDiffViewerKind === "image" ? (
                          <ImageDiffViewer
                            filePath={activeDiffPath}
                            newImageSrc={centeredImageDataUrl}
                            oldImageSrc={null}
                            splitView={false}
                          />
                        ) : null}
                        {activeDiffViewerKind === "unsupported" ? (
                          <div className="flex h-full items-center justify-center px-6">
                            <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
                              <pre
                                aria-hidden="true"
                                className="overflow-auto font-mono text-muted-foreground/90 text-xs leading-tight"
                              >
                                {unsupportedAsciiArt}
                              </pre>
                              <p className="font-medium text-sm">
                                {unsupportedTitle}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {unsupportedDescription}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {workspaceMode === "history" ? (
                      <Suspense
                        fallback={
                          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                            <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                            Loading history surface...
                          </div>
                        }
                      >
                        <LazyDiffWorkspaceHistorySurface
                          avatarUrlByCommitHash={commitAvatarUrlByHash}
                          DiffEditorComponent={LazyCodeEditorDiff}
                          diff={
                            activeDiff && openedDiffContext?.source === "commit"
                              ? {
                                  commitHash: openedDiffContext.commitHash,
                                  newImageDataUrl: activeDiff.newImageDataUrl,
                                  newText: activeDiff.newText,
                                  oldImageDataUrl: activeDiff.oldImageDataUrl,
                                  oldText: activeDiff.oldText,
                                  path: activeDiff.path,
                                  unsupportedExtension:
                                    activeDiff.unsupportedExtension,
                                  viewerKind: activeDiff.viewerKind,
                                }
                              : null
                          }
                          diffModelPathBase={
                            modelBasePath ??
                            "inmemory://litgit/unknown?history-diff"
                          }
                          diffState={diffPreviewPanelState}
                          entries={historyEntries}
                          fontFamily={editorPreferences.fontFamily}
                          fontSize={editorPreferences.fontSize}
                          ignoreTrimWhitespace={ignoreTrimWhitespace}
                          isLoading={isLoadingFileHistory}
                          language={
                            editorPreferences.syntaxHighlighting
                              ? resolveLanguage(activeDiffPath)
                              : "plaintext"
                          }
                          lineNumbers={editorPreferences.lineNumbers}
                          onCancelDiff={handleWorkspaceCloseRequest}
                          onDiffEditorMount={(editor) => {
                            openedDiffEditorRef.current =
                              editor as DiffEditorInstance;
                          }}
                          onRenderDiffAnyway={() => {
                            handleRenderDiffPreviewAnyway().catch(
                              () => undefined
                            );
                          }}
                          onRetry={() => {
                            handleRetryDiffPreview().catch(() => undefined);
                          }}
                          onRetryDiff={() => {
                            if (!openedDiffContext) {
                              return;
                            }

                            runDiffPreviewPreflight(
                              openedDiffContext,
                              "diff"
                            ).catch(() => undefined);
                          }}
                          onSelectEntry={(entry) => {
                            handleOpenHistoryEntry(entry).catch(
                              () => undefined
                            );
                          }}
                          renderError={fileHistoryError}
                          renderSideBySide={resolvedPresentation === "split"}
                          selectedCommitHash={selectedHistoryCommitHash}
                          syntaxHighlighting={
                            editorPreferences.syntaxHighlighting
                          }
                          tabSize={editorPreferences.tabSize}
                          theme={resolvedTheme === "light" ? "light" : "dark"}
                          wordWrap={editorPreferences.wordWrap as "off" | "on"}
                        />
                      </Suspense>
                    ) : null}
                    {workspaceMode === "blame" ? (
                      <Suspense
                        fallback={
                          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                            <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                            Loading blame surface...
                          </div>
                        }
                      >
                        <LazyDiffWorkspaceBlameSurface
                          avatarUrlByCommitHash={commitAvatarUrlByHash}
                          EditorComponent={LazyCodeEditorView}
                          fontFamily={editorPreferences.fontFamily}
                          fontSize={editorPreferences.fontSize}
                          isLoading={isLoadingBlame}
                          language={
                            editorPreferences.syntaxHighlighting
                              ? resolveLanguage(activeDiffPath)
                              : "plaintext"
                          }
                          lineNumbers={editorPreferences.lineNumbers}
                          lines={blameLines}
                          modelPath={
                            blameMonacoModelPath ??
                            "inmemory://litgit/unknown?blame"
                          }
                          onPreviewEditorMount={(editor) => {
                            openedFileEditorRef.current = editor as EditorView;
                          }}
                          onRetry={() => {
                            handleRetryDiffPreview().catch(() => undefined);
                          }}
                          renderError={blameError}
                          syntaxHighlighting={
                            editorPreferences.syntaxHighlighting
                          }
                          tabSize={editorPreferences.tabSize}
                          theme={resolvedTheme === "light" ? "light" : "dark"}
                          wordWrap={editorPreferences.wordWrap as "off" | "on"}
                        />
                      </Suspense>
                    ) : null}
                    {workspaceMode === "edit" ? (
                      <>
                        {isLoadingEditBuffer ? (
                          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                            <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                            Loading file...
                          </div>
                        ) : null}
                        {editLoadError ? (
                          <div className="flex h-full items-center justify-center px-6">
                            <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
                              <p className="font-medium text-sm">
                                Error loading file
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {editLoadError}
                              </p>
                              <Button
                                className="h-7 px-3 text-xs"
                                onClick={() => {
                                  handleRetryDiffPreview().catch(
                                    () => undefined
                                  );
                                }}
                                size="sm"
                                type="button"
                              >
                                Retry
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {isLoadingEditBuffer || editLoadError ? null : (
                          <>
                            {shouldMountEditMonacoSurface && (
                              <Suspense
                                fallback={
                                  <div className="h-full w-full bg-muted/30" />
                                }
                              >
                                <LazyCodeEditorEdit
                                  fontFamily={editorPreferences.fontFamily}
                                  fontSize={editorPreferences.fontSize}
                                  language={resolveLanguage(activeDiffPath)}
                                  lineNumbers={editorPreferences.lineNumbers}
                                  mode="edit"
                                  modelPath={editMonacoModelPath ?? "untitled"}
                                  onChange={setEditBuffer}
                                  onMount={(editor) => {
                                    openedEditEditorRef.current = editor;
                                  }}
                                  onSave={() => {
                                    handleSaveEditedFile().catch(
                                      () => undefined
                                    );
                                  }}
                                  syntaxHighlighting={
                                    editorPreferences.syntaxHighlighting
                                  }
                                  tabSize={editorPreferences.tabSize}
                                  theme={
                                    resolvedTheme === "light" ? "light" : "dark"
                                  }
                                  value={editBuffer}
                                  wordWrap={editorPreferences.wordWrap}
                                />
                              </Suspense>
                            )}
                            <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
                              <Button
                                className="h-7 px-2 text-xs"
                                disabled={isSavingEditBuffer || !isEditDirty}
                                onClick={() => {
                                  handleSaveEditedFile().catch(() => undefined);
                                }}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                {isSavingEditBuffer ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>

            {isRightSidebarVisible ? (
              <button
                aria-label="Resize right sidebar"
                className="desktop-resize-handle-vertical-focus h-full w-1.5 shrink-0 cursor-col-resize border-border/70 border-l bg-transparent transition-colors hover:bg-accent/30"
                onMouseDown={startSidebarResize("right")}
                type="button"
              />
            ) : null}

            <aside
              className={cn(
                "flex h-full shrink-0 flex-col overflow-hidden border-border/70 border-l bg-muted/20",
                !isRightSidebarVisible && "hidden"
              )}
              style={{ width: `${rightSidebarWidth}px` }}
            >
              {(() => {
                if (
                  !isWorkingTreeSelection &&
                  isSelectedCommitRow &&
                  selectedCommit
                ) {
                  return (
                    <>
                      <header className="border-border/70 border-b px-2.5 py-2">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="font-medium text-sm">
                            Commit {selectedCommit.shortHash}
                          </p>
                          <span className="truncate text-muted-foreground text-xs">
                            parent:{" "}
                            {selectedCommit.parentHashes.at(0)?.slice(0, 7) ??
                              "none"}
                          </span>
                        </div>
                      </header>

                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="space-y-2.5 border-border/70 border-b px-2.5 py-2.5 text-sm">
                          {isEditingSelectedCommitMessage ? (
                            <div className="space-y-2 border border-border/70 bg-background/50 p-2.5">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Label
                                      className="text-xs"
                                      htmlFor="reword-summary"
                                    >
                                      Title
                                    </Label>
                                    {lastAiRewordGeneration ? (
                                      <span className="inline-flex items-center rounded border border-border/70 px-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
                                        AI {lastAiRewordGeneration.promptMode}
                                      </span>
                                    ) : null}
                                  </div>
                                  <Button
                                    className="h-6 px-2 text-xs"
                                    disabled={
                                      isGeneratingAiRewordMessage ||
                                      isRewordingCommitMessage ||
                                      aiSelectedModel.trim().length === 0
                                    }
                                    onClick={() => {
                                      handleGenerateAiRewordMessage().catch(
                                        () => undefined
                                      );
                                    }}
                                    size="xs"
                                    type="button"
                                    variant="outline"
                                  >
                                    <SparkleIcon className="size-3" />
                                    {isGeneratingAiRewordMessage
                                      ? "Generating..."
                                      : "Generate with AI"}
                                  </Button>
                                </div>
                                <Input
                                  className="focus-visible:desktop-focus h-7 text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  id="reword-summary"
                                  onChange={(event) => {
                                    setRewordCommitSummary(event.target.value);
                                    setLastAiRewordGeneration(null);
                                  }}
                                  placeholder="Describe your changes"
                                  value={rewordCommitSummary}
                                />
                              </div>
                              {lastAiRewordGeneration?.promptMode === "fast" ? (
                                <p className="text-[11px] text-muted-foreground leading-4">
                                  AI used summary context instead of full patch
                                  hunks because the staged diff was large.
                                </p>
                              ) : null}
                              <div className="space-y-1.5">
                                <Label
                                  className="text-xs"
                                  htmlFor="reword-description"
                                >
                                  Commit description
                                </Label>
                                <Textarea
                                  className="focus-visible:desktop-focus h-20 resize-none overflow-y-scroll text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  id="reword-description"
                                  onChange={(event) => {
                                    setRewordCommitDescription(
                                      event.target.value
                                    );
                                    setLastAiRewordGeneration(null);
                                  }}
                                  placeholder="Add more detail for this commit"
                                  value={rewordCommitDescription}
                                />
                              </div>
                              {selectedCommitRebaseImpactCount > 0 ? (
                                <p className="text-muted-foreground text-sm leading-snug">
                                  Rewording this commit message will cause{" "}
                                  {selectedCommitRebaseImpactCount} commit
                                  {selectedCommitRebaseImpactCount === 1
                                    ? ""
                                    : "s"}{" "}
                                  to be rebased.
                                </p>
                              ) : null}
                              <div className="flex items-center gap-2">
                                <Button
                                  className="focus-visible:desktop-focus h-8 flex-1 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  disabled={
                                    isRewordingCommitMessage ||
                                    rewordCommitSummary.trim().length === 0
                                  }
                                  onClick={() => {
                                    handleSubmitCommitReword().catch(
                                      () => undefined
                                    );
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {isRewordingCommitMessage
                                    ? "Updating..."
                                    : "Update Message"}
                                </Button>
                                <Button
                                  className="focus-visible:desktop-focus h-8 flex-1 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  disabled={isRewordingCommitMessage}
                                  onClick={() => {
                                    setIsEditingSelectedCommitMessage(false);
                                    setLastAiRewordGeneration(null);
                                    setRewordCommitSummary(
                                      selectedCommit.messageSummary
                                    );
                                    setRewordCommitDescription(
                                      selectedCommit.messageDescription
                                    );
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  Cancel Reword
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="border border-border/70 bg-background/70 transition-colors hover:border-primary/60">
                              <div
                                className="overflow-y-auto px-2.5 pt-2.5"
                                ref={commitDetailsLayoutRef}
                                style={{
                                  height: `${commitDetailsPanelHeight}px`,
                                }}
                              >
                                <button
                                  className="w-full cursor-pointer text-left"
                                  onClick={() => {
                                    setIsEditingSelectedCommitMessage(true);
                                  }}
                                  type="button"
                                >
                                  <div className="space-y-2 pb-2">
                                    <p className="font-medium leading-snug">
                                      {selectedCommitMessageSections.summary}
                                    </p>
                                    {selectedCommitMessageSections.detailLines
                                      .length > 0 ? (
                                      <ul className="space-y-1.5 text-muted-foreground text-sm">
                                        {selectedCommitMessageSections.detailLines.map(
                                          (line) => (
                                            <li
                                              className="leading-snug"
                                              key={line}
                                            >
                                              - {line}
                                            </li>
                                          )
                                        )}
                                      </ul>
                                    ) : null}
                                  </div>
                                </button>
                              </div>
                              <button
                                aria-label="Resize commit message"
                                className="desktop-resize-handle-horizontal-focus h-1.5 w-full cursor-row-resize border-border/70 border-t bg-transparent transition-colors hover:bg-accent/30"
                                onMouseDown={startCommitDetailsResize}
                                type="button"
                              />
                            </div>
                          )}
                          <div className="border border-border/70 bg-background/50 p-2">
                            <div className="flex items-start gap-2">
                              <Avatar className="size-8 shrink-0">
                                <AvatarImage
                                  alt={selectedCommit.author}
                                  src={
                                    selectedCommit.authorAvatarUrl ?? undefined
                                  }
                                />
                                <AvatarFallback className="text-xs">
                                  {selectedCommit.author
                                    .split(" ")
                                    .map((part) => part[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="truncate font-medium text-foreground text-sm">
                                    {selectedCommit.author}
                                  </span>
                                  <span className="shrink-0 truncate text-muted-foreground">
                                    parent:{" "}
                                    {selectedCommit.parentHashes
                                      .at(0)
                                      ?.slice(0, 7) ?? "none"}
                                  </span>
                                </div>
                                <p className="text-muted-foreground">
                                  authored{" "}
                                  {formatCommitDate(selectedCommit.date)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {selectedCommitFileSummary.modifiedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                <PencilSimpleIcon className="size-3" />
                                {selectedCommitFileSummary.modifiedCount}{" "}
                                modified
                              </span>
                            ) : null}
                            {selectedCommitFileSummary.addedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                + {selectedCommitFileSummary.addedCount} added
                              </span>
                            ) : null}
                            {selectedCommitFileSummary.removedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                                - {selectedCommitFileSummary.removedCount}{" "}
                                deleted
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      aria-label={`Sort by filename ${commitFileSortOrder === "asc" ? "descending" : "ascending"}`}
                                      className="focus-visible:desktop-focus-strong h-7 w-7 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                                      onClick={() => {
                                        setCommitFileSortOrder((current) =>
                                          current === "asc" ? "desc" : "asc"
                                        );
                                      }}
                                      size="icon-sm"
                                      type="button"
                                      variant="ghost"
                                    />
                                  }
                                >
                                  {commitFileSortOrder === "asc" ? (
                                    <SortDescendingIcon className="size-3.5" />
                                  ) : (
                                    <SortAscendingIcon className="size-3.5" />
                                  )}
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Sort filenames in{" "}
                                  {commitFileSortOrder === "asc"
                                    ? "descending"
                                    : "ascending"}{" "}
                                  order
                                </TooltipContent>
                              </Tooltip>
                              <div className="inline-flex h-7 border border-border/80 bg-background/70 p-0.5">
                                {showAllCommitFiles ? null : (
                                  <button
                                    className={cn(
                                      "h-full px-2.5 font-medium text-xs transition-colors",
                                      commitDetailsViewMode === "path"
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() =>
                                      setCommitDetailsViewMode("path")
                                    }
                                    type="button"
                                  >
                                    Path
                                  </button>
                                )}
                                <button
                                  className={cn(
                                    "h-full px-2.5 font-medium text-xs transition-colors",
                                    commitDetailsViewMode === "tree"
                                      ? "bg-accent text-accent-foreground"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                  onClick={() =>
                                    setCommitDetailsViewMode("tree")
                                  }
                                  type="button"
                                >
                                  Tree
                                </button>
                              </div>
                            </div>
                            <label className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                              <Checkbox
                                checked={showAllCommitFiles}
                                className="shrink-0"
                                onCheckedChange={(checked) => {
                                  setShowAllCommitFilesState(checked === true);
                                }}
                              />
                              View all files
                            </label>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden">
                          {(() => {
                            if (
                              isLoadingCommitFilesHash === selectedCommit.hash
                            ) {
                              return (
                                <div className="px-2.5 py-3 text-muted-foreground text-xs">
                                  Loading changed files...
                                </div>
                              );
                            }

                            if (selectedCommitFiles.length === 0) {
                              return (
                                <div className="px-2.5 py-3 text-muted-foreground text-xs">
                                  No changed files for this commit.
                                </div>
                              );
                            }

                            return (
                              <div className="h-full overflow-hidden px-1.5 py-1.5">
                                <div className="flex h-full min-h-0 flex-col border border-border/70 bg-background/50">
                                  {showAllCommitFiles ? (
                                    <div className="border-border/70 border-b px-2 py-2">
                                      <Input
                                        className="focus-visible:desktop-focus h-7 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                        onChange={(event) => {
                                          setCommitFileFilterInputValue(
                                            event.target.value
                                          );
                                        }}
                                        placeholder="Filter files..."
                                        value={commitFileFilterInputValue}
                                      />
                                    </div>
                                  ) : null}
                                  {commitDetailsViewMode === "tree" &&
                                  filteredCommitFiles.length > 0 ? (
                                    <div className="flex items-center gap-1.5 border-border/70 border-b px-2 py-1.5">
                                      {(() => {
                                        const expandableNodeKeys = Object.keys(
                                          collectExpandableCommitTreeKeys(
                                            selectedCommitTree,
                                            selectedCommit.hash
                                          )
                                        );
                                        const isCommitTreeFullyExpanded =
                                          expandableNodeKeys.length > 0 &&
                                          expandableNodeKeys.every(
                                            (key) =>
                                              expandedCommitTreeNodePaths[
                                                key
                                              ] === true
                                          );

                                        return (
                                          <Button
                                            className="focus-visible:desktop-focus h-7 border border-border/70 bg-background/60 px-2 text-foreground text-xs hover:bg-accent/40 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                            onClick={() => {
                                              if (isCommitTreeFullyExpanded) {
                                                collapseCommitTree(
                                                  selectedCommit.hash
                                                );
                                                return;
                                              }

                                              expandCommitTree(
                                                selectedCommit.hash,
                                                selectedCommitTree
                                              );
                                            }}
                                            type="button"
                                            variant="ghost"
                                          >
                                            {isCommitTreeFullyExpanded
                                              ? "Collapse"
                                              : "Expand"}
                                          </Button>
                                        );
                                      })()}
                                    </div>
                                  ) : null}
                                  <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                                    {(() => {
                                      if (filteredCommitFiles.length === 0) {
                                        return (
                                          <p className="px-2 py-1.5 text-muted-foreground text-xs">
                                            No files match this filter.
                                          </p>
                                        );
                                      }

                                      if (commitDetailsViewMode === "tree") {
                                        const renderBudget = createRenderBudget(
                                          selectedCommitRenderLimit
                                        );

                                        return (
                                          <>
                                            {renderCommitTreeNodes(
                                              selectedCommitTree,
                                              selectedCommit.hash,
                                              0,
                                              renderBudget
                                            )}
                                            {selectedCommitRenderLimit <
                                            selectedCommitVisibleNodeCount
                                              ? renderProgressiveLoadingMessage(
                                                  "files"
                                                )
                                              : null}
                                          </>
                                        );
                                      }

                                      const renderBudget = createRenderBudget(
                                        selectedCommitRenderLimit
                                      );

                                      return (
                                        <>
                                          {renderCommitPathRows(
                                            sortedCommitPathRows,
                                            selectedCommit.hash,
                                            renderBudget
                                          )}
                                          {selectedCommitRenderLimit <
                                          selectedCommitVisibleNodeCount
                                            ? renderProgressiveLoadingMessage(
                                                "files"
                                              )
                                            : null}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </>
                  );
                }

                if (isSelectedReferenceRow && selectedTimelineRow) {
                  return (
                    <>
                      <header className="border-border/70 border-b px-2.5 py-2">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="font-medium text-sm">
                            {selectedTimelineRow.type === "stash"
                              ? "Stash"
                              : "Tag"}{" "}
                            {selectedTimelineRow.label ?? ""}
                          </p>
                          <span className="truncate text-muted-foreground text-xs">
                            {selectedReferenceBadgeLabel}
                          </span>
                        </div>
                      </header>

                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="space-y-2.5 border-border/70 border-b px-2.5 py-2.5 text-sm">
                          <div className="border border-border/70 bg-background/70">
                            <div
                              className="overflow-y-auto px-2.5 pt-2.5"
                              ref={commitDetailsLayoutRef}
                              style={{
                                height: `${commitDetailsPanelHeight}px`,
                              }}
                            >
                              {selectedTimelineRow.type === "stash" ? (
                                <div className="space-y-2">
                                  <p className="font-medium leading-snug">
                                    {selectedStashDraft?.summary ||
                                      (selectedStash
                                        ? formatStashLabel(selectedStash)
                                        : null) ||
                                      selectedTimelineRow.label}
                                  </p>
                                  {selectedStashDraft?.description ? (
                                    <p className="whitespace-pre-wrap text-muted-foreground text-sm leading-snug">
                                      {selectedStashDraft.description}
                                    </p>
                                  ) : null}
                                  <div className="space-y-1 pb-1 text-muted-foreground text-xs">
                                    <p>
                                      ref: {selectedStash?.ref ?? "unknown"}
                                    </p>
                                    <p>
                                      based on commit:{" "}
                                      {selectedReferenceCommit?.shortHash ??
                                        selectedReferenceCommit?.hash.slice(
                                          0,
                                          7
                                        ) ??
                                        "unknown"}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="font-medium leading-snug">
                                    {selectedTimelineRow.label}
                                  </p>
                                  <div className="space-y-1 pb-1 text-muted-foreground text-xs">
                                    <p>type: lightweight tag reference</p>
                                    <p>
                                      points to commit:{" "}
                                      {selectedReferenceCommit?.shortHash ??
                                        selectedReferenceCommit?.hash.slice(
                                          0,
                                          7
                                        ) ??
                                        "unknown"}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              aria-label="Resize commit message"
                              className="desktop-resize-handle-horizontal-focus h-1.5 w-full cursor-row-resize border-border/70 border-t bg-transparent transition-colors hover:bg-accent/30"
                              onMouseDown={startCommitDetailsResize}
                              type="button"
                            />
                          </div>
                          {selectedReferenceCommit ? (
                            <div className="border border-border/70 bg-background/50 p-2">
                              <div className="flex items-start gap-2">
                                <Avatar className="size-8 shrink-0">
                                  <AvatarImage
                                    alt={selectedReferenceCommit.author}
                                    src={
                                      selectedReferenceCommit.authorAvatarUrl ??
                                      undefined
                                    }
                                  />
                                  <AvatarFallback className="text-xs">
                                    {selectedReferenceCommit.author
                                      .split(" ")
                                      .map((part) => part[0])
                                      .join("")
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="truncate font-medium text-foreground text-sm">
                                      {selectedReferenceCommit.author}
                                    </span>
                                    <span className="shrink-0 truncate text-muted-foreground">
                                      commit {selectedReferenceCommit.shortHash}
                                    </span>
                                  </div>
                                  <p className="text-muted-foreground">
                                    authored{" "}
                                    {formatCommitDate(
                                      selectedReferenceCommit.date
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {selectedTimelineRow.type === "stash" &&
                          selectedStash ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                className="focus-visible:desktop-focus h-7 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                disabled={isApplyingStash}
                                onClick={() => {
                                  handleApplyStash({
                                    name: formatStashLabel(selectedStash),
                                    searchName:
                                      formatStashLabel(
                                        selectedStash
                                      ).toLowerCase(),
                                    stashMessage: selectedStash.message,
                                    stashRef: selectedStash.ref,
                                    type: "stash",
                                  }).catch(() => undefined);
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Apply
                              </Button>
                              <Button
                                className="focus-visible:desktop-focus h-7 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                disabled={isPoppingStash}
                                onClick={() => {
                                  handlePopStash({
                                    name: formatStashLabel(selectedStash),
                                    searchName:
                                      formatStashLabel(
                                        selectedStash
                                      ).toLowerCase(),
                                    stashMessage: selectedStash.message,
                                    stashRef: selectedStash.ref,
                                    type: "stash",
                                  }).catch(() => undefined);
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Pop
                              </Button>
                              <Button
                                className="focus-visible:desktop-focus h-7 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                disabled={isDroppingStash}
                                onClick={() => {
                                  handleDropStash({
                                    name: formatStashLabel(selectedStash),
                                    searchName:
                                      formatStashLabel(
                                        selectedStash
                                      ).toLowerCase(),
                                    stashMessage: selectedStash.message,
                                    stashRef: selectedStash.ref,
                                    type: "stash",
                                  }).catch(() => undefined);
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Delete
                              </Button>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {selectedReferenceFileSummary.modifiedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                <PencilSimpleIcon className="size-3" />
                                {selectedReferenceFileSummary.modifiedCount}{" "}
                                modified
                              </span>
                            ) : null}
                            {selectedReferenceFileSummary.addedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                + {selectedReferenceFileSummary.addedCount}{" "}
                                added
                              </span>
                            ) : null}
                            {selectedReferenceFileSummary.removedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                                - {selectedReferenceFileSummary.removedCount}{" "}
                                deleted
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden px-1.5 py-1.5">
                          <div className="flex h-full min-h-0 flex-col border border-border/70 bg-background/50">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-border/70 border-b px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        aria-label={`Sort by filename ${commitFileSortOrder === "asc" ? "descending" : "ascending"}`}
                                        className="focus-visible:desktop-focus-strong h-7 w-7 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                                        onClick={() => {
                                          setCommitFileSortOrder((current) =>
                                            current === "asc" ? "desc" : "asc"
                                          );
                                        }}
                                        size="icon-sm"
                                        type="button"
                                        variant="ghost"
                                      />
                                    }
                                  >
                                    {commitFileSortOrder === "asc" ? (
                                      <SortDescendingIcon className="size-3.5" />
                                    ) : (
                                      <SortAscendingIcon className="size-3.5" />
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Sort filenames in{" "}
                                    {commitFileSortOrder === "asc"
                                      ? "descending"
                                      : "ascending"}{" "}
                                    order
                                  </TooltipContent>
                                </Tooltip>
                                <div className="inline-flex h-7 border border-border/80 bg-background/70 p-0.5">
                                  {showAllCommitFiles ? null : (
                                    <button
                                      className={cn(
                                        "h-full px-2.5 font-medium text-xs transition-colors",
                                        commitDetailsViewMode === "path"
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:text-foreground"
                                      )}
                                      onClick={() =>
                                        setCommitDetailsViewMode("path")
                                      }
                                      type="button"
                                    >
                                      Path
                                    </button>
                                  )}
                                  <button
                                    className={cn(
                                      "h-full px-2.5 font-medium text-xs transition-colors",
                                      commitDetailsViewMode === "tree"
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() =>
                                      setCommitDetailsViewMode("tree")
                                    }
                                    type="button"
                                  >
                                    Tree
                                  </button>
                                </div>
                              </div>
                              <label className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                                <Checkbox
                                  checked={showAllCommitFiles}
                                  className="shrink-0"
                                  onCheckedChange={(checked) => {
                                    setShowAllCommitFilesState(
                                      checked === true
                                    );
                                  }}
                                />
                                View all files
                              </label>
                            </div>
                            {showAllCommitFiles ? (
                              <div className="border-border/70 border-b px-2 py-2">
                                <Input
                                  className="focus-visible:desktop-focus h-7 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  onChange={(event) => {
                                    setCommitFileFilterInputValue(
                                      event.target.value
                                    );
                                  }}
                                  placeholder="Filter files..."
                                  value={commitFileFilterInputValue}
                                />
                              </div>
                            ) : null}
                            {commitDetailsViewMode === "tree" &&
                            filteredReferenceFiles.length > 0 &&
                            selectedReferenceRevision ? (
                              <div className="flex items-center gap-1.5 border-border/70 border-b px-2 py-1.5">
                                {(() => {
                                  const expandableNodeKeys = Object.keys(
                                    collectExpandableCommitTreeKeys(
                                      selectedReferenceTree,
                                      selectedReferenceRevision
                                    )
                                  );
                                  const isReferenceTreeFullyExpanded =
                                    expandableNodeKeys.length > 0 &&
                                    expandableNodeKeys.every(
                                      (key) =>
                                        expandedCommitTreeNodePaths[key] ===
                                        true
                                    );

                                  return (
                                    <Button
                                      className="focus-visible:desktop-focus h-7 border border-border/70 bg-background/60 px-2 text-foreground text-xs hover:bg-accent/40 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                      onClick={() => {
                                        if (isReferenceTreeFullyExpanded) {
                                          collapseCommitTree(
                                            selectedReferenceRevision
                                          );
                                          return;
                                        }

                                        expandCommitTree(
                                          selectedReferenceRevision,
                                          selectedReferenceTree
                                        );
                                      }}
                                      size="sm"
                                      type="button"
                                      variant="ghost"
                                    >
                                      {isReferenceTreeFullyExpanded
                                        ? "Collapse All"
                                        : "Expand All"}
                                    </Button>
                                  );
                                })()}
                              </div>
                            ) : null}
                            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                              {(() => {
                                if (
                                  selectedReferenceRevision &&
                                  isLoadingCommitFilesHash ===
                                    selectedReferenceRevision
                                ) {
                                  return (
                                    <div className="px-2 py-1.5 text-muted-foreground text-xs">
                                      Loading changed files...
                                    </div>
                                  );
                                }

                                if (!selectedReferenceRevision) {
                                  return (
                                    <div className="px-2 py-1.5 text-muted-foreground text-xs">
                                      No changed files found for this{" "}
                                      {selectedTimelineRow.type === "stash"
                                        ? "stash"
                                        : "tag"}
                                      .
                                    </div>
                                  );
                                }

                                if (selectedReferenceFiles.length === 0) {
                                  return (
                                    <div className="px-2 py-1.5 text-muted-foreground text-xs">
                                      No changed files found for this{" "}
                                      {selectedTimelineRow.type === "stash"
                                        ? "stash"
                                        : "tag"}
                                      .
                                    </div>
                                  );
                                }

                                if (filteredReferenceFiles.length === 0) {
                                  return (
                                    <p className="px-2 py-1.5 text-muted-foreground text-xs">
                                      No files match this filter.
                                    </p>
                                  );
                                }

                                if (commitDetailsViewMode === "tree") {
                                  const renderBudget = createRenderBudget(
                                    selectedReferenceRenderLimit
                                  );

                                  return (
                                    <>
                                      {renderCommitTreeNodes(
                                        selectedReferenceTree,
                                        selectedReferenceRevision,
                                        0,
                                        renderBudget
                                      )}
                                      {selectedReferenceRenderLimit <
                                      selectedReferenceVisibleNodeCount
                                        ? renderProgressiveLoadingMessage(
                                            "files"
                                          )
                                        : null}
                                    </>
                                  );
                                }

                                const renderBudget = createRenderBudget(
                                  selectedReferenceRenderLimit
                                );

                                return (
                                  <>
                                    {renderCommitPathRows(
                                      sortedSelectedReferencePathRows,
                                      selectedReferenceRevision,
                                      renderBudget
                                    )}
                                    {selectedReferenceRenderLimit <
                                    selectedReferenceVisibleNodeCount
                                      ? renderProgressiveLoadingMessage("files")
                                      : null}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    <header className="shrink-0 space-y-2.5 border-border/70 border-b px-2.5 py-2.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <Button
                          aria-label="Discard all changes"
                          className="focus-visible:desktop-focus-strong h-7 w-7 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                          disabled={
                            !hasAnyWorkingTreeChanges || isDiscardingAllChanges
                          }
                          onClick={() => setIsDiscardAllConfirmOpen(true)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                        <p className="truncate text-xs">
                          <span className="font-medium">
                            {showAllFiles
                              ? `${allRepositoryFiles.length} repository files`
                              : `${workingTreeItems.length} file changes`}
                          </span>{" "}
                          on{" "}
                          <span className="bg-accent px-1.5 py-0.5 font-medium text-accent-foreground text-xs">
                            {currentBranch}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  aria-label={`Sort by filename ${fileTreeSortOrder === "asc" ? "descending" : "ascending"}`}
                                  className="focus-visible:desktop-focus-strong h-7 w-7 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  onClick={toggleFileTreeSortOrder}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                />
                              }
                            >
                              {fileTreeSortOrder === "asc" ? (
                                <SortDescendingIcon className="size-3.5" />
                              ) : (
                                <SortAscendingIcon className="size-3.5" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Sort as{" "}
                              {fileTreeSortOrder === "asc"
                                ? "descending"
                                : "ascending"}
                            </TooltipContent>
                          </Tooltip>
                          <div className="inline-flex h-7 border border-border/80 bg-background/70 p-0.5">
                            <button
                              className={cn(
                                "h-full px-2.5 font-medium text-xs transition-colors",
                                changesViewMode === "path"
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                                showAllFiles && "pointer-events-none opacity-50"
                              )}
                              disabled={showAllFiles}
                              onClick={() => setChangesViewMode("path")}
                              type="button"
                            >
                              Path
                            </button>
                            <button
                              className={cn(
                                "h-full px-2.5 font-medium text-xs transition-colors",
                                changesViewMode === "tree"
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                              onClick={() => setChangesViewMode("tree")}
                              type="button"
                            >
                              Tree
                            </button>
                          </div>
                        </div>
                      </div>
                    </header>

                    <div
                      className="flex min-h-0 flex-1 flex-col"
                      ref={workingTreeFilesPanelLayoutRef}
                    >
                      <div
                        className={cn(
                          "min-h-0 overflow-hidden px-2.5 py-2.5",
                          workingTreeFilesPanelHeight === null
                            ? "flex-1"
                            : "shrink-0"
                        )}
                        ref={workingTreeFilesPanelRef}
                        style={
                          workingTreeFilesPanelHeight === null
                            ? undefined
                            : { height: `${workingTreeFilesPanelHeight}px` }
                        }
                      >
                        <div className="flex h-full min-h-0 flex-col border border-border/70 bg-background/50">
                          {showAllFiles ? (
                            <section className="flex min-h-0 flex-1 flex-col">
                              <div className="border-border/70 border-b px-2 py-2">
                                <Input
                                  className="focus-visible:desktop-focus h-7 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  onChange={(event) => {
                                    setRepositoryFileFilterInputValue(
                                      event.target.value
                                    );
                                  }}
                                  placeholder="Filter files..."
                                  value={repositoryFileFilterInputValue}
                                />
                              </div>
                              {filteredRepositoryFiles.length > 0 ? (
                                <div className="flex items-center gap-1.5 border-border/70 border-b px-2 py-1.5">
                                  {(() => {
                                    const expandableNodeState =
                                      collectExpandableTreeKeys(
                                        allFilesTree,
                                        "all"
                                      );
                                    const expandableNodeKeys =
                                      Object.keys(expandableNodeState);
                                    const isAllFilesTreeFullyExpanded =
                                      expandableNodeKeys.length > 0 &&
                                      expandableNodeKeys.every(
                                        (key) =>
                                          expandedTreeNodePaths[key] === true
                                      );

                                    return (
                                      <Button
                                        className="focus-visible:desktop-focus h-7 border border-border/70 bg-background/60 px-2 text-foreground text-xs hover:bg-accent/40 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                        onClick={() => {
                                          if (isAllFilesTreeFullyExpanded) {
                                            setExpandedTreeNodePaths(
                                              (current) => {
                                                const nextEntries =
                                                  Object.entries(
                                                    current
                                                  ).filter(
                                                    ([key]) =>
                                                      !key.startsWith("all:")
                                                  );

                                                return Object.fromEntries(
                                                  nextEntries
                                                );
                                              }
                                            );
                                            return;
                                          }

                                          setExpandedTreeNodePaths(
                                            (current) => ({
                                              ...current,
                                              ...expandableNodeState,
                                            })
                                          );
                                        }}
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                      >
                                        {isAllFilesTreeFullyExpanded
                                          ? "Collapse All"
                                          : "Expand All"}
                                      </Button>
                                    );
                                  })()}
                                </div>
                              ) : null}
                              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                                {renderAllFilesSectionContent()}
                              </div>
                            </section>
                          ) : (
                            <div
                              className="flex min-h-0 flex-1 flex-col"
                              ref={changesSectionsLayoutRef}
                            >
                              <section
                                className={cn(
                                  "flex min-h-0 flex-col",
                                  isUnstagedSectionCollapsed ||
                                    isChangesSectionsResizable
                                    ? "shrink-0"
                                    : "flex-1"
                                )}
                                style={
                                  isChangesSectionsResizable
                                    ? { height: `${unstagedSectionHeight}px` }
                                    : undefined
                                }
                              >
                                <div className="flex items-center gap-1.5 border-border/70 border-b px-2 py-1.5">
                                  <button
                                    className="focus-visible:desktop-focus inline-flex items-center gap-1 text-left font-medium text-xs"
                                    onClick={() =>
                                      setIsUnstagedSectionCollapsed(
                                        (current) => !current
                                      )
                                    }
                                    type="button"
                                  >
                                    {isUnstagedSectionCollapsed ? (
                                      <CaretRightIcon className="size-3" />
                                    ) : (
                                      <CaretDownIcon className="size-3" />
                                    )}
                                    Unstaged Files ({unstagedItems.length})
                                  </button>
                                  <Button
                                    className="focus-visible:desktop-focus ml-auto h-7 border border-border/70 bg-background/60 px-2 text-foreground text-xs hover:bg-accent/40 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                    disabled={
                                      !hasUnstagedChanges || isStagingAll
                                    }
                                    onClick={() => {
                                      handleStageAll().catch(() => undefined);
                                    }}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    {isStagingAll
                                      ? "Staging..."
                                      : "Stage All Changes"}
                                  </Button>
                                </div>

                                {isUnstagedSectionCollapsed ? null : (
                                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                                    {renderChangesSectionContent(
                                      unstagedItems,
                                      unstagedTree,
                                      "unstaged"
                                    )}
                                  </div>
                                )}
                              </section>

                              {isChangesSectionsResizable ? (
                                <button
                                  aria-label="Resize unstaged and staged sections"
                                  className="desktop-resize-handle-horizontal-focus h-2 w-full shrink-0 cursor-row-resize border-border/70 border-t bg-transparent transition-colors hover:bg-accent/30"
                                  onMouseDown={startChangesSectionsResize}
                                  type="button"
                                />
                              ) : null}

                              <section
                                className={cn(
                                  "flex min-h-0 flex-col border-border/70",
                                  !isChangesSectionsResizable && "border-t",
                                  isStagedSectionCollapsed
                                    ? "mt-auto shrink-0"
                                    : "flex-1"
                                )}
                              >
                                <div className="flex items-center gap-1.5 border-border/70 border-b px-2 py-1.5">
                                  <button
                                    className="focus-visible:desktop-focus inline-flex items-center gap-1 text-left font-medium text-xs"
                                    onClick={() =>
                                      setIsStagedSectionCollapsed(
                                        (current) => !current
                                      )
                                    }
                                    type="button"
                                  >
                                    {isStagedSectionCollapsed ? (
                                      <CaretRightIcon className="size-3" />
                                    ) : (
                                      <CaretDownIcon className="size-3" />
                                    )}
                                    Staged Files ({stagedItems.length})
                                  </button>
                                  <Button
                                    className="focus-visible:desktop-focus ml-auto h-7 border border-border/70 bg-background/60 px-2 text-foreground text-xs hover:bg-accent/40 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                    disabled={
                                      !hasStagedChanges || isUnstagingAll
                                    }
                                    onClick={() => {
                                      handleUnstageAll().catch(() => undefined);
                                    }}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    {isUnstagingAll
                                      ? "Unstaging..."
                                      : "Unstage All Changes"}
                                  </Button>
                                </div>

                                {isStagedSectionCollapsed ? null : (
                                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                                    {renderChangesSectionContent(
                                      stagedItems,
                                      stagedTree,
                                      "staged"
                                    )}
                                  </div>
                                )}
                              </section>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        aria-label="Resize changed files section"
                        className="desktop-resize-handle-horizontal-focus h-1.5 w-full shrink-0 cursor-row-resize border-border/70 border-t bg-transparent transition-colors hover:bg-accent/30"
                        onMouseDown={startWorkingTreeFilesPanelResize}
                        type="button"
                      />
                      <form
                        className="shrink-0 border-border/70 border-t px-3 py-3"
                        ref={commitComposerFormRef}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Label
                                className="text-xs"
                                htmlFor="commit-summary"
                              >
                                Title
                              </Label>
                              {lastAiCommitGeneration ? (
                                <span className="inline-flex items-center rounded border border-border/70 px-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
                                  AI {lastAiCommitGeneration.promptMode}
                                </span>
                              ) : null}
                            </div>
                            <Button
                              className="h-6 px-2 text-xs"
                              disabled={
                                isGeneratingAiCommitMessage ||
                                aiSelectedModel.trim().length === 0 ||
                                !hasStagedChanges
                              }
                              onClick={() => {
                                handleGenerateAiCommitMessage().catch(
                                  () => undefined
                                );
                              }}
                              size="xs"
                              type="button"
                              variant="outline"
                            >
                              <SparkleIcon className="size-3" />
                              {isGeneratingAiCommitMessage
                                ? "Generating..."
                                : "Generate with AI"}
                            </Button>
                          </div>
                          <Input
                            className="focus-visible:desktop-focus h-7 text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                            id="commit-summary"
                            onChange={(event) => {
                              setDraftCommitSummary(event.target.value);
                              setLastAiCommitGeneration(null);
                            }}
                            placeholder="Describe your changes"
                            ref={commitSummaryInputRef}
                            value={draftCommitSummary}
                          />
                          {lastAiCommitGeneration?.promptMode === "fast" ? (
                            <p className="text-[11px] text-muted-foreground leading-4">
                              AI used summary context instead of full patch
                              hunks because the staged diff was large.
                            </p>
                          ) : null}
                          {isGeneratingAiCommitMessage &&
                          aiCommitGenerationStatusMessage ? (
                            <p className="text-[11px] text-muted-foreground leading-4">
                              {aiCommitGenerationStatusMessage}
                            </p>
                          ) : null}
                          {isGeneratingAiCommitMessage &&
                          aiCommitGenerationPreview.length > 0 ? (
                            <p className="line-clamp-3 break-words rounded border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground leading-4">
                              {aiCommitGenerationPreview}
                            </p>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-2">
                          <Label
                            className="text-xs"
                            htmlFor="commit-description"
                          >
                            Description
                          </Label>
                          <textarea
                            className="focus-visible:desktop-focus h-20 w-full resize-none overflow-y-scroll border border-input bg-background px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground placeholder:text-xs"
                            id="commit-description"
                            onChange={(event) => {
                              setDraftCommitDescription(event.target.value);
                              setLastAiCommitGeneration(null);
                            }}
                            placeholder="Optional details..."
                            value={draftCommitDescription}
                          />
                        </div>
                        <div className="mt-3 border border-border/70 px-3 py-2">
                          <button
                            className="focus-visible:desktop-focus inline-flex items-center gap-1 font-medium text-muted-foreground text-xs"
                            onClick={() =>
                              setIsCommitOptionsCollapsed((current) => !current)
                            }
                            type="button"
                          >
                            {isCommitOptionsCollapsed ? (
                              <CaretRightIcon className="size-3" />
                            ) : (
                              <CaretDownIcon className="size-3" />
                            )}
                            Commit options
                          </button>
                          {isCommitOptionsCollapsed ? null : (
                            <div className="mt-2 space-y-2">
                              <label className="inline-flex min-h-5 items-center gap-2 text-xs">
                                <Checkbox
                                  checked={amendPreviousCommit}
                                  className="shrink-0"
                                  onCheckedChange={(checked) => {
                                    const shouldAmend = checked === true;
                                    setAmendPreviousCommit(shouldAmend);

                                    if (!shouldAmend) {
                                      const previousDraft =
                                        preAmendDraftRef.current;

                                      if (previousDraft) {
                                        setDraftCommitSummary(
                                          previousDraft.summary
                                        );
                                        setDraftCommitDescription(
                                          previousDraft.description
                                        );
                                      } else {
                                        setDraftCommitSummary("");
                                        setDraftCommitDescription("");
                                      }

                                      preAmendDraftRef.current = null;
                                      return;
                                    }

                                    if (!activeRepoId) {
                                      return;
                                    }

                                    preAmendDraftRef.current = {
                                      description: draftCommitDescription,
                                      summary: draftCommitSummary,
                                    };

                                    getLatestCommitMessage(activeRepoId)
                                      .then((latestCommitMessage) => {
                                        if (!latestCommitMessage) {
                                          return;
                                        }

                                        setDraftCommitSummary(
                                          latestCommitMessage.summary
                                        );
                                        setDraftCommitDescription(
                                          latestCommitMessage.description
                                        );
                                      })
                                      .catch(() => undefined);
                                  }}
                                />
                                Amend previous commit
                              </label>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <label className="inline-flex min-h-5 items-center gap-2 text-xs">
                                  <Checkbox
                                    checked={pushAfterCommit}
                                    className="shrink-0"
                                    onCheckedChange={(checked) =>
                                      setPushAfterCommit(checked === true)
                                    }
                                  />
                                  Push after committing
                                </label>
                                <label className="inline-flex min-h-5 items-center gap-2 text-xs">
                                  <Checkbox
                                    checked={skipCommitHooks}
                                    className="shrink-0"
                                    onCheckedChange={(checked) =>
                                      setSkipCommitHooks(checked === true)
                                    }
                                  />
                                  Skip Git hooks
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                        <Button
                          className="focus-visible:desktop-focus mt-3 h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                          disabled={isCommitting || !canCommit}
                          onClick={handleCommit}
                          size="sm"
                          type="button"
                        >
                          <DotOutlineIcon className="size-3.5" />
                          Commit staged changes
                        </Button>
                      </form>
                    </div>
                  </>
                );
              })()}
            </aside>
          </div>
        </div>
      </div>
      <Dialog
        onOpenChange={(open) => {
          if (isRenamingBranch && !open) {
            return;
          }

          setIsRenameBranchDialogOpen(open);

          if (!open) {
            setRenameBranchSourceName(null);
            setRenameBranchTargetName("");
          }
        }}
        open={isRenameBranchDialogOpen}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!isRenamingBranch}
        >
          <DialogHeader>
            <DialogTitle>Rename branch</DialogTitle>
            <DialogDescription>
              Rename the local branch and keep your current checkout state.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-branch-name">New branch name</Label>
            <Input
              autoCapitalize="none"
              autoCorrect="off"
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isRenamingBranch}
              id="rename-branch-name"
              onChange={(event) =>
                setRenameBranchTargetName(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleRenameBranch().catch(() => undefined);
                }
              }}
              spellCheck={false}
              value={renameBranchTargetName}
            />
            {renameBranchSourceName ? (
              <p className="text-muted-foreground text-xs">
                Source branch:{" "}
                <span className="font-medium">{renameBranchSourceName}</span>
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isRenamingBranch}
              onClick={() => {
                setIsRenameBranchDialogOpen(false);
                setRenameBranchSourceName(null);
                setRenameBranchTargetName("");
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={
                isRenamingBranch || renameBranchTargetName.trim().length === 0
              }
              onClick={() => {
                handleRenameBranch().catch(() => undefined);
              }}
              type="button"
            >
              {isRenamingBranch ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (isSettingUpstream && !open) {
            return;
          }

          setIsSetUpstreamDialogOpen(open);

          if (!open) {
            setSetUpstreamLocalBranchName(null);
            setSetUpstreamRemoteName("");
            setSetUpstreamRemoteBranchName("");
            setSetUpstreamFormError(null);
          }
        }}
        open={isSetUpstreamDialogOpen}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!isSettingUpstream}
        >
          <DialogHeader>
            <DialogTitle>Set upstream branch</DialogTitle>
            <DialogDescription>
              What remote/branch should "{setUpstreamLocalBranchName ?? ""}"
              push to and pull from?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="set-upstream-target-branch">Remote / branch</Label>
            <div className="flex items-center gap-2">
              <Select
                disabled={isSettingUpstream}
                onValueChange={(value) => {
                  setSetUpstreamRemoteName(value ?? "");
                  setSetUpstreamFormError(null);
                }}
                value={setUpstreamRemoteName}
              >
                <SelectTrigger className="focus-visible:desktop-focus h-9 w-44 focus-visible:ring-0! focus-visible:ring-offset-0!">
                  <SelectValue placeholder="Select remote" />
                </SelectTrigger>
                <SelectContent>
                  {activeRepoRemoteNames.map((remoteName) => (
                    <SelectItem key={remoteName} value={remoteName}>
                      {remoteName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-sm">/</span>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                className="focus-visible:desktop-focus h-9 focus-visible:ring-0! focus-visible:ring-offset-0!"
                disabled={isSettingUpstream}
                id="set-upstream-target-branch"
                onChange={(event) => {
                  setSetUpstreamRemoteBranchName(event.target.value);
                  setSetUpstreamFormError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSetUpstream().catch(() => undefined);
                  }
                }}
                placeholder="remote branch"
                spellCheck={false}
                value={setUpstreamRemoteBranchName}
              />
            </div>
            {setUpstreamFormError ? (
              <p className="text-destructive text-sm">{setUpstreamFormError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isSettingUpstream}
              onClick={() => {
                setIsSetUpstreamDialogOpen(false);
                setSetUpstreamLocalBranchName(null);
                setSetUpstreamRemoteName("");
                setSetUpstreamRemoteBranchName("");
                setSetUpstreamFormError(null);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={
                isSettingUpstream ||
                setUpstreamRemoteName.trim().length === 0 ||
                setUpstreamRemoteBranchName.trim().length === 0
              }
              onClick={() => {
                handleSetUpstream().catch(() => undefined);
              }}
              type="button"
            >
              {isSettingUpstream ? "Setting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (isCreatingRefBranch && !open) {
            return;
          }

          setIsCreateRefBranchDialogOpen(open);

          if (!open) {
            setCreateRefBranchTarget(null);
            setCreateRefBranchLabel("");
            setCreateRefBranchName("");
          }
        }}
        open={isCreateRefBranchDialogOpen}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!isCreatingRefBranch}
        >
          <DialogHeader>
            <DialogTitle>Create branch here</DialogTitle>
            <DialogDescription>
              Create and switch to a new branch at{" "}
              {createRefBranchLabel || "the selected commit"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="create-ref-branch-name">Branch name</Label>
            <Input
              autoCapitalize="none"
              autoCorrect="off"
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isCreatingRefBranch}
              id="create-ref-branch-name"
              onChange={(event) => {
                setCreateRefBranchName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreateBranchAtReference().catch(() => undefined);
                }
              }}
              spellCheck={false}
              value={createRefBranchName}
            />
          </div>
          <DialogFooter>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isCreatingRefBranch}
              onClick={() => {
                setIsCreateRefBranchDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={
                isCreatingRefBranch || createRefBranchName.trim().length === 0
              }
              onClick={() => {
                handleCreateBranchAtReference().catch(() => undefined);
              }}
              type="button"
            >
              {isCreatingRefBranch ? "Creating..." : "Create branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (isCreatingTagAtReference && !open) {
            return;
          }

          setIsCreateTagDialogOpen(open);

          if (!open) {
            setCreateTagTarget(null);
            setCreateTagTargetLabel("");
            setCreateTagNameValue("");
            setCreateTagAnnotated(false);
          }
        }}
        open={isCreateTagDialogOpen}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!isCreatingTagAtReference}
        >
          <DialogHeader>
            <DialogTitle>
              {createTagAnnotated
                ? "Create annotated tag here"
                : "Create tag here"}
            </DialogTitle>
            <DialogDescription>
              Create {createTagAnnotated ? "an annotated tag" : "a tag"} at{" "}
              {createTagTargetLabel || "the selected commit"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="create-tag-name">Tag name</Label>
            <Input
              autoCapitalize="none"
              autoCorrect="off"
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isCreatingTagAtReference}
              id="create-tag-name"
              onChange={(event) => {
                setCreateTagNameValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreateTagAtReference().catch(() => undefined);
                }
              }}
              spellCheck={false}
              value={createTagNameValue}
            />
          </div>
          <DialogFooter>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isCreatingTagAtReference}
              onClick={() => {
                setIsCreateTagDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={
                isCreatingTagAtReference ||
                createTagNameValue.trim().length === 0
              }
              onClick={() => {
                handleCreateTagAtReference().catch(() => undefined);
              }}
              type="button"
            >
              {isCreatingTagAtReference ? "Creating..." : "Create tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PublishRepositoryDialog
        errorMessage={publishRepoFormError}
        initialRepoName={activeRepo?.name ?? ""}
        isSubmitting={isSubmittingPublishRepo}
        onConfirm={async (publishOptions) => {
          const pendingAction = pendingPublishPushActionRef.current;
          if (!pendingAction || isSubmittingPublishRepo) {
            return;
          }

          setIsSubmittingPublishRepo(true);
          setPublishRepoFormError(null);

          try {
            await pendingAction(publishOptions);
            pendingPublishPushActionRef.current = null;
            setIsPublishRepoConfirmOpen(false);
          } catch (error) {
            setPublishRepoFormError(getErrorMessage(error));
            throw error;
          } finally {
            setIsSubmittingPublishRepo(false);
          }
        }}
        onOpenChange={(open) => {
          if (isSubmittingPublishRepo && !open) {
            return;
          }

          setIsPublishRepoConfirmOpen(open);

          if (!open) {
            pendingPublishPushActionRef.current = null;
            setPublishRepoFormError(null);
          }
        }}
        open={isPublishRepoConfirmOpen}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (isResettingToReference && !open) {
            return;
          }

          setIsResetConfirmOpen(open);

          if (!open) {
            setResetTarget(null);
            setResetTargetLabel("");
            setResetTargetMode("mixed");
          }
        }}
        open={isResetConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {currentBranch} to {resetTargetLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resetTargetDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingToReference} size="sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isResettingToReference || !resetTarget}
              onClick={() => {
                handleResetToCommit().catch(() => undefined);
              }}
              size="sm"
              variant={resetTargetMode === "hard" ? "destructive" : "default"}
            >
              {isResettingToReference
                ? "Resetting..."
                : `Reset ${resetTargetMode}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (isDroppingCommit && !open) {
            return;
          }

          setIsDropCommitConfirmOpen(open);

          if (!open) {
            setPendingDropCommitHash(null);
            setPendingDropCommitLabel("");
          }
        }}
        open={isDropCommitConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Drop {pendingDropCommitLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This rewrites the current branch history to remove the selected
              commit.
              {pendingDropCommitRebaseImpactCount > 0
                ? ` ${pendingDropCommitRebaseImpactCount} descendant commit${pendingDropCommitRebaseImpactCount === 1 ? "" : "s"} will be replayed on top of the rewritten history.`
                : " The surrounding commit content stays the same, but hashes may change."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDroppingCommit} size="sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDroppingCommit || !pendingDropCommitHash}
              onClick={() => {
                handleDropCommit().catch(() => undefined);
              }}
              size="sm"
              variant="destructive"
            >
              {isDroppingCommit ? "Dropping..." : "Drop commit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          setIsUnsavedEditConfirmOpen(open);

          if (!open) {
            setPendingWorkspaceMode(null);
            setPendingOpenDiffContext(null);
            setPendingCloseDiffPanel(false);
          }
        }}
        open={isUnsavedEditConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in edit mode. Discard them and continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleDiscardUnsavedEditChanges().catch(() => undefined);
              }}
              size="sm"
              variant="destructive"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (isDiscardingAllChanges && !open) {
            return;
          }

          setIsDiscardAllConfirmOpen(open);
        }}
        open={isDiscardAllConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard all working tree changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently discard all staged, unstaged, and untracked
              changes in this repository.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDiscardingAllChanges} size="sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDiscardingAllChanges}
              onClick={() => {
                handleDiscardAllChanges().catch(() => undefined);
              }}
              size="sm"
              variant="destructive"
            >
              {isDiscardingAllChanges ? "Discarding..." : "Discard all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (isDeletingBranch && !open) {
            return;
          }

          setIsDeleteBranchConfirmOpen(open);

          if (!open) {
            setPendingDeleteBranchName(null);
            setPendingDeleteBranchRemoteName(null);
            setIsDeleteRemoteBranch(false);
          }
        }}
        open={isDeleteBranchConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDeleteRemoteBranch
                ? `Delete remote branch ${pendingDeleteBranchRemoteName ?? "origin"}/${pendingDeleteBranchName ?? ""}?`
                : `Delete branch ${pendingDeleteBranchName ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDeleteRemoteBranch
                ? "This removes the branch from the remote repository. Your local branches remain unchanged."
                : "This deletes the local branch only. The remote branch (if any) will stay on origin."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingBranch} size="sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingBranch || !pendingDeleteBranchName}
              onClick={() => {
                handleDeleteBranch().catch(() => undefined);
              }}
              size="sm"
              variant="destructive"
            >
              {isDeletingBranch ? "Deleting..." : "Delete branch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if ((isCommitting || isPushing) && !open) {
            return;
          }

          setIsForcePushConfirmOpen(open);

          if (!open) {
            pendingForcePushActionRef.current = null;
          }
        }}
        open={isForcePushConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {forcePushConfirmMode === "commit"
                ? "Force push amended commit?"
                : "Force push diverged branch?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {forcePushConfirmMode === "commit"
                ? "You are amending the previous commit and pushing immediately. This rewrites branch history and requires a force push with lease."
                : "This branch is both ahead and behind its upstream. A regular push will fail, so this action will push with force-with-lease."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <AlertDialogFooter className="sm:grid-cols-[auto_auto] sm:justify-end">
              <AlertDialogCancel
                className="w-full sm:w-auto"
                disabled={isCommitting || isPushing}
                size="sm"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="w-full sm:w-auto"
                disabled={isCommitting || isPushing}
                onClick={() => {
                  executeConfirmedForcePush().catch(() => undefined);
                }}
                size="sm"
                variant="destructive"
              >
                {forcePushConfirmActionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
