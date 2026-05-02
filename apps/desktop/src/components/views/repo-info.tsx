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
  CalendarBlankIcon,
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
  HashIcon,
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
  UserCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { intlFormat } from "date-fns";
import { useTheme } from "next-themes";
import {
  Fragment,
  lazy,
  type ReactNode,
  type SetStateAction,
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
  TIMELINE_BRANCH_COLUMN_WIDTH,
} from "@/components/views/git-graph-layout";
import {
  buildGitGraphRenderRows,
  collectVisibleGitTimelineRows,
} from "@/components/views/git-graph-model";
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
import { getAiGenerationDisplayState } from "@/components/views/repo-info-ai-generation";
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
import { useReducerState } from "@/hooks/use-reducer-state";
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
  useRepoHistoryPagination,
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

function getSidebarGroupSectionIcon(groupKey: string): ReactNode {
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

function resolveStateAction<Value>(
  value: SetStateAction<Value>,
  current: Value
): Value {
  if (typeof value === "function") {
    return (value as (currentValue: Value) => Value)(current);
  }

  return value;
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
const TIMELINE_ROW_HEIGHT = 30;
const TIMELINE_GRAPH_COLUMN_MIN_WIDTH = 60;
const TIMELINE_GRAPH_COLUMN_MAX_WIDTH = 320;
const TIMELINE_COMMIT_MESSAGE_BAR_WIDTH = 3;
const TIMELINE_COMMIT_MESSAGE_BAR_GAP = 8;
const TIMELINE_AUTO_COMPACT_BREAKPOINT = 1200;
const TIMELINE_AUTHOR_COLUMN_WIDTH = 160;
const TIMELINE_DATE_TIME_COLUMN_WIDTH = 190;
const TIMELINE_SHA_COLUMN_WIDTH = 110;
const TIMELINE_COMPACT_AUTHOR_COLUMN_WIDTH = 92;
const TIMELINE_COMPACT_DATE_TIME_COLUMN_WIDTH = 88;
const TIMELINE_COMPACT_SHA_COLUMN_WIDTH = 64;
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

interface CodeMirrorEditorViewLike {
  dispatch: (...transactions: never[]) => void;
  focus: () => void;
  state: unknown;
}

type DiffEditorInstance =
  | CodeMirrorEditorViewLike
  | {
      a: CodeMirrorEditorViewLike;
      b: CodeMirrorEditorViewLike;
    };

function isEditorViewInstance(
  value: DiffEditorInstance | null
): value is CodeMirrorEditorViewLike {
  return value !== null && "dispatch" in value && "state" in value;
}

function isMergeViewInstance(
  value: DiffEditorInstance | null
): value is { a: CodeMirrorEditorViewLike; b: CodeMirrorEditorViewLike } {
  return value !== null && "a" in value && "b" in value;
}

interface TimelineReferenceCardsProps {
  entries: SidebarEntry[];
  isPullableCommit?: boolean;
  laneColor: string;
  opacity?: number;
}

interface TimelineReferenceGroup {
  active: boolean;
  entries: SidebarEntry[];
  hasLocalBranch: boolean;
  hasRemoteBranch: boolean;
  hasTag: boolean;
  key: string;
  label: string;
}

interface TimelineReferenceLabelProps {
  label: string;
  tooltipLabel: string;
}

function getTimelineReferenceEntryIcon(entry: SidebarEntry) {
  if (entry.type === "tag") {
    return <TagIcon className="size-3 shrink-0" />;
  }

  if (entry.isRemote) {
    return <CloudIcon className="size-3 shrink-0" />;
  }

  return <LaptopIcon className="size-3 shrink-0" />;
}

function getTimelineReferenceGroupKey(entry: SidebarEntry): string {
  if (entry.type !== "branch") {
    return `${entry.type}:${entry.name}`;
  }

  if (!entry.isRemote) {
    return `branch:${entry.name}`;
  }

  const [, ...branchNameSegments] = entry.name.split("/");
  const branchName = branchNameSegments.join("/");

  return `branch:${branchName.length > 0 ? branchName : entry.name}`;
}

function getTimelineReferenceGroupLabel(entry: SidebarEntry): string {
  if (entry.type !== "branch" || !entry.isRemote) {
    return entry.name;
  }

  const [, ...branchNameSegments] = entry.name.split("/");
  const branchName = branchNameSegments.join("/");

  return branchName.length > 0 ? branchName : entry.name;
}

function groupTimelineReferenceEntries(
  entries: SidebarEntry[]
): TimelineReferenceGroup[] {
  const groupByKey = new Map<string, TimelineReferenceGroup>();

  for (const entry of entries) {
    const key = getTimelineReferenceGroupKey(entry);
    const existing = groupByKey.get(key);

    if (existing) {
      existing.entries.push(entry);
      existing.active ||= entry.active === true;
      existing.hasLocalBranch ||= entry.type === "branch" && !entry.isRemote;
      existing.hasRemoteBranch ||=
        entry.type === "branch" && entry.isRemote === true;
      existing.hasTag ||= entry.type === "tag";
      continue;
    }

    groupByKey.set(key, {
      active: entry.active === true,
      entries: [entry],
      hasLocalBranch: entry.type === "branch" && !entry.isRemote,
      hasRemoteBranch: entry.type === "branch" && entry.isRemote === true,
      hasTag: entry.type === "tag",
      key,
      label: getTimelineReferenceGroupLabel(entry),
    });
  }

  return Array.from(groupByKey.values());
}

function TimelineReferenceLabel({
  label,
  tooltipLabel,
}: TimelineReferenceLabelProps) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = labelRef.current;

    if (!element) {
      return;
    }

    const updateIsTruncated = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth);
    };

    updateIsTruncated();

    const observer = new ResizeObserver(updateIsTruncated);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  });

  return (
    <Tooltip disabled={!isTruncated}>
      <TooltipTrigger
        render={<span className="min-w-0 truncate" ref={labelRef} />}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

function TimelineReferenceCards({
  entries,
  isPullableCommit = false,
  laneColor,
  opacity = 1,
}: TimelineReferenceCardsProps) {
  const groupedEntries = groupTimelineReferenceEntries(entries);
  const [primaryGroup, ...overflowGroups] = groupedEntries;

  if (!primaryGroup) {
    return (
      <span className="text-muted-foreground/70 text-xs">
        <span className="sr-only">No refs</span>
      </span>
    );
  }

  const primaryTooltipLabel = primaryGroup.entries
    .map((entry) => entry.name)
    .join(", ");

  return (
    <div className="group/reference-card relative flex h-full min-w-0 items-center gap-1 overflow-visible pr-2">
      {isPullableCommit ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-sky-700 text-xs leading-none dark:text-sky-300"
                style={{ opacity }}
              />
            }
          >
            <ArrowLineDownIcon className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Commit available from upstream
          </TooltipContent>
        </Tooltip>
      ) : null}
      <span
        className="relative z-10 inline-flex min-w-0 max-w-[7rem] shrink items-center gap-1 rounded border bg-background/95 px-1.5 py-0.5 text-xs leading-none shadow-sm"
        style={{ borderColor: `${laneColor}99`, opacity }}
      >
        <TimelineReferenceLabel
          label={primaryGroup.label}
          tooltipLabel={primaryTooltipLabel}
        />
        {primaryGroup.hasLocalBranch ? (
          <LaptopIcon className="size-2.5 shrink-0" />
        ) : null}
        {primaryGroup.hasRemoteBranch ? (
          <CloudIcon className="size-2.5 shrink-0" />
        ) : null}
        {primaryGroup.hasTag ? <TagIcon className="size-2.5 shrink-0" /> : null}
      </span>
      {overflowGroups.length > 0 ? (
        <>
          <span
            className="relative z-20 inline-flex items-center rounded border bg-background/95 px-1.5 py-0.5 font-medium text-xs leading-none shadow-sm"
            style={{ borderColor: `${laneColor}80`, opacity }}
          >
            +{overflowGroups.length}
          </span>
          <span className="absolute top-full left-0 z-50 mt-1 hidden min-w-40 overflow-hidden rounded border bg-popover py-1 text-popover-foreground opacity-100 shadow-md group-hover/reference-card:block">
            {groupedEntries.map((group) => {
              const iconEntry = group.entries[0];

              return (
                <span
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
                  key={group.key}
                >
                  {iconEntry ? getTimelineReferenceEntryIcon(iconEntry) : null}
                  <span className="min-w-0 truncate">{group.label}</span>
                </span>
              );
            })}
          </span>
        </>
      ) : null}
    </div>
  );
}

async function navigateDiffEditor(
  editor: DiffEditorInstance | null,
  direction: "next" | "previous"
): Promise<void> {
  const { goToNextChunk, goToPreviousChunk } = await import(
    "@codemirror/merge"
  );
  const command = direction === "next" ? goToNextChunk : goToPreviousChunk;

  if (isMergeViewInstance(editor)) {
    const target = {
      dispatch: editor.a.dispatch,
      state: editor.a.state,
    } as Parameters<typeof command>[0];
    command(target);
    editor.a.focus();
    return;
  }

  if (!isEditorViewInstance(editor)) {
    return;
  }

  const target = {
    dispatch: editor.dispatch,
    state: editor.state,
  } as Parameters<typeof command>[0];
  command(target);
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
  const { repoId: routeRepoId } = useParams({ from: "/repo/$repoId" });
  const { activeRepoId: storeActiveRepoId, openedRepos } =
    useRepoActiveContext();
  const activeRepoId = openedRepos.some((repo) => repo.id === routeRepoId)
    ? routeRepoId
    : storeActiveRepoId;
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
    loadMoreRepoHistory,
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
    setActiveRepo,
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
  const allRepositoryFiles = useRepoFiles(activeRepoId);
  const activeRepoIdentity = useRepoGitIdentity(activeRepoId);
  const requiresForcePushAfterHistoryRewrite =
    useRepoHistoryRewriteHint(activeRepoId);
  const { hasMore: historyHasMore, isLoadingMore: isLoadingMoreHistory } =
    useRepoHistoryPagination(activeRepoId);
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
  const [collapsedGroupKeys, updateCollapsedGroupKeysState] = useReducerState<
    Record<string, boolean>
  >({
    local: true,
    remote: true,
    stashes: true,
    tags: true,
  });
  const [remoteAvatarUrlByName, updateRemoteAvatarUrlByName] = useReducerState<
    Record<string, string | null>
  >({});
  const [collapsedBranchFolderKeys, updateCollapsedBranchFolderKeysState] =
    useReducerState<Record<string, boolean>>({});
  const [selectedCommitId, updateSelectedCommitIdState] = useReducerState<
    string | null
  >(null);
  const [selectedTimelineRowId, updateSelectedTimelineRowIdState] =
    useReducerState<string | null>(null);
  const [hoveredGraphRowId, updateHoveredGraphRowId] = useReducerState<
    string | null
  >(null);
  const isLeftSidebarOpen = true;
  const [isRightSidebarOpen, updateIsRightSidebarOpenState] =
    useReducerState(true);
  const [leftSidebarWidth, updateLeftSidebarWidthState] = useReducerState(
    LEFT_SIDEBAR_DEFAULT_WIDTH
  );
  const [rightSidebarWidth, updateRightSidebarWidthState] = useReducerState(
    RIGHT_SIDEBAR_DEFAULT_WIDTH
  );
  const [isTimelineGraphAutoCompact, updateIsTimelineGraphAutoCompact] =
    useReducerState(false);
  const [isSwitchingBranch, updateIsSwitchingBranch] = useReducerState(false);
  const [isCreatingBranch, updateIsCreatingBranch] = useReducerState(false);
  const [isBranchCreateInputOpen, updateIsBranchCreateInputOpen] =
    useReducerState(false);
  const [newBranchName, updateNewBranchName] = useReducerState("");
  const [isStagingAll, updateIsStagingAll] = useReducerState(false);
  const [isUnstagingAll, updateIsUnstagingAll] = useReducerState(false);
  const [isUpdatingFilePath, updateIsUpdatingFilePath] = useReducerState<
    string | null
  >(null);
  const [isCommitting, updateIsCommitting] = useReducerState(false);
  const [isGeneratingAiCommitMessage, updateIsGeneratingAiCommitMessage] =
    useReducerState(false);
  const [
    aiCommitGenerationStatusMessage,
    updateAiCommitGenerationStatusMessage,
  ] = useReducerState<string | null>(null);
  const [aiCommitGenerationPreview, updateAiCommitGenerationPreview] =
    useReducerState("");
  const aiCommitGenerationStatusMessageRef = useRef<string | null>(null);
  const aiCommitGenerationPreviewRef = useRef("");
  const [lastAiCommitGeneration, updateLastAiCommitGeneration] =
    useReducerState<null | {
      promptMode: string;
      providerKind: string;
      schemaFallbackUsed: boolean;
    }>(null);
  const [isDiscardingAllChanges, updateIsDiscardingAllChanges] =
    useReducerState(false);
  const [isDiscardAllConfirmOpen, updateIsDiscardAllConfirmOpen] =
    useReducerState(false);
  const [isDeleteBranchConfirmOpen, updateIsDeleteBranchConfirmOpen] =
    useReducerState(false);
  const [pendingDeleteBranchName, updatePendingDeleteBranchName] =
    useReducerState<string | null>(null);
  const [pendingDeleteBranchRemoteName, updatePendingDeleteBranchRemoteName] =
    useReducerState<string | null>(null);
  const [isDeleteRemoteBranch, updateIsDeleteRemoteBranch] =
    useReducerState(false);
  const [isDeletingBranch, updateIsDeletingBranch] = useReducerState(false);
  const [isRenameBranchDialogOpen, updateIsRenameBranchDialogOpen] =
    useReducerState(false);
  const [renameBranchSourceName, updateRenameBranchSourceName] =
    useReducerState<string | null>(null);
  const [renameBranchTargetName, updateRenameBranchTargetName] =
    useReducerState("");
  const [isRenamingBranch, updateIsRenamingBranch] = useReducerState(false);
  const [isSetUpstreamDialogOpen, updateIsSetUpstreamDialogOpen] =
    useReducerState(false);
  const [setUpstreamLocalBranchName, updateSetUpstreamLocalBranchName] =
    useReducerState<string | null>(null);
  const [setUpstreamRemoteName, updateSetUpstreamRemoteName] =
    useReducerState("");
  const [setUpstreamRemoteBranchName, updateSetUpstreamRemoteBranchName] =
    useReducerState("");
  const [setUpstreamFormError, updateSetUpstreamFormError] = useReducerState<
    string | null
  >(null);
  const [isSettingUpstream, updateIsSettingUpstream] = useReducerState(false);
  const [isCreateRefBranchDialogOpen, updateIsCreateRefBranchDialogOpen] =
    useReducerState(false);
  const [createRefBranchName, updateCreateRefBranchName] = useReducerState("");
  const [createRefBranchTarget, updateCreateRefBranchTarget] = useReducerState<
    string | null
  >(null);
  const [createRefBranchLabel, updateCreateRefBranchLabel] =
    useReducerState("");
  const [isCreatingRefBranch, updateIsCreatingRefBranch] =
    useReducerState(false);
  const [isCreateTagDialogOpen, updateIsCreateTagDialogOpen] =
    useReducerState(false);
  const [createTagNameValue, updateCreateTagNameValue] = useReducerState("");
  const [createTagTarget, updateCreateTagTarget] = useReducerState<
    string | null
  >(null);
  const [createTagTargetLabel, updateCreateTagTargetLabel] =
    useReducerState("");
  const [createTagAnnotated, updateCreateTagAnnotated] = useReducerState(false);
  const [isCreatingTagAtReference, updateIsCreatingTagAtReference] =
    useReducerState(false);
  const [resetTarget, updateResetTarget] = useReducerState<string | null>(null);
  const [resetTargetLabel, updateResetTargetLabel] = useReducerState("");
  const [resetTargetMode, updateResetTargetMode] = useReducerState<
    "hard" | "mixed" | "soft"
  >("mixed");
  const [isResetConfirmOpen, updateIsResetConfirmOpen] = useReducerState(false);
  const [isResettingToReference, updateIsResettingToReference] =
    useReducerState(false);
  const [isForcePushConfirmOpen, updateIsForcePushConfirmOpen] =
    useReducerState(false);
  const [isPublishRepoConfirmOpen, updateIsPublishRepoConfirmOpen] =
    useReducerState(false);
  const [publishRepoFormError, updatePublishRepoFormError] = useReducerState<
    string | null
  >(null);
  const [isSubmittingPublishRepo, updateIsSubmittingPublishRepo] =
    useReducerState(false);
  const [forcePushConfirmMode, updateForcePushConfirmMode] = useReducerState<
    "commit" | "push"
  >("push");
  const [isPulling, updateIsPulling] = useReducerState(false);
  const [isRunningMergeAction, updateIsRunningMergeAction] =
    useReducerState(false);
  const [isPushing, updateIsPushing] = useReducerState(false);
  const [isUndoRedoBusy, updateIsUndoRedoBusy] = useReducerState(false);
  const [isApplyingStash, updateIsApplyingStash] = useReducerState(false);
  const [isCreatingStash, updateIsCreatingStash] = useReducerState(false);
  const [isPoppingStash, updateIsPoppingStash] = useReducerState(false);
  const [isDroppingStash, updateIsDroppingStash] = useReducerState(false);
  const [isCheckingOutCommit, updateIsCheckingOutCommit] =
    useReducerState(false);
  const [isCherryPickingCommit, updateIsCherryPickingCommit] =
    useReducerState(false);
  const [isRevertingCommit, updateIsRevertingCommit] = useReducerState(false);
  const [isEditingSelectedCommitMessage, updateIsEditingSelectedCommitMessage] =
    useReducerState(false);
  const [rewordCommitSummary, updateRewordCommitSummary] = useReducerState("");
  const [rewordCommitDescription, updateRewordCommitDescription] =
    useReducerState("");
  const [isGeneratingAiRewordMessage, updateIsGeneratingAiRewordMessage] =
    useReducerState(false);
  const [lastAiRewordGeneration, updateLastAiRewordGeneration] =
    useReducerState<null | {
      promptMode: string;
      providerKind: string;
      schemaFallbackUsed: boolean;
    }>(null);
  const [isRewordingCommitMessage, updateIsRewordingCommitMessage] =
    useReducerState(false);
  const [isDropCommitConfirmOpen, updateIsDropCommitConfirmOpen] =
    useReducerState(false);
  const [pendingDropCommitHash, updatePendingDropCommitHash] = useReducerState<
    string | null
  >(null);
  const [pendingDropCommitLabel, updatePendingDropCommitLabel] =
    useReducerState("");
  const [isDroppingCommit, updateIsDroppingCommit] = useReducerState(false);
  const lastAiCommitGenerationDisplayState = lastAiCommitGeneration
    ? getAiGenerationDisplayState(lastAiCommitGeneration.promptMode)
    : null;
  const lastAiRewordGenerationDisplayState = lastAiRewordGeneration
    ? getAiGenerationDisplayState(lastAiRewordGeneration.promptMode)
    : null;
  let resetTargetDescription =
    "Hard reset discards staged and working tree changes after moving HEAD. Use this carefully.";

  if (resetTargetMode === "soft") {
    resetTargetDescription =
      "Move HEAD to the selected commit and keep all staged and working tree changes.";
  } else if (resetTargetMode === "mixed") {
    resetTargetDescription =
      "Move HEAD to the selected commit, keep working tree changes, and unstage them.";
  }
  const [draftCommitSummary, updateDraftCommitSummary] = useReducerState("");
  const [draftCommitDescription, updateDraftCommitDescription] =
    useReducerState("");
  const [amendPreviousCommit, updateAmendPreviousCommit] =
    useReducerState(false);
  const [pushAfterCommit, updatePushAfterCommit] = useReducerState(false);
  const [skipCommitHooks, updateSkipCommitHooks] = useReducerState(false);
  const [isCommitOptionsCollapsed, updateIsCommitOptionsCollapsed] =
    useReducerState(true);
  const [commitDetailsViewMode, updateCommitDetailsViewMode] =
    useReducerState<ChangesViewMode>("tree");
  const [showAllCommitFiles, updateShowAllCommitFiles] = useReducerState(false);
  const [commitDetailsPanelHeight, updateCommitDetailsPanelHeight] =
    useReducerState(COMMIT_DETAILS_PANEL_DEFAULT_HEIGHT);
  const [workingTreeFilesPanelHeight, updateWorkingTreeFilesPanelHeight] =
    useReducerState<number | null>(null);
  const [unstagedSectionHeight, updateUnstagedSectionHeight] = useReducerState(
    CHANGES_SECTIONS_DEFAULT_HEIGHT
  );
  const [commitFileFilterInputValue, updateCommitFileFilterInputValue] =
    useReducerState("");
  const debouncedCommitFileFilterInputValue = useDebouncedValue(
    commitFileFilterInputValue,
    FILE_FILTER_DEBOUNCE_MS
  );
  const [commitFileSortOrder, updateCommitFileSortOrder] =
    useReducerState<RepoFileBrowserSortOrder>("asc");
  const [expandedCommitTreeNodePaths, updateExpandedCommitTreeNodePathsState] =
    useReducerState<Record<string, boolean>>({});
  const [isLoadingDiffPath, updateIsLoadingDiffPath] = useReducerState<
    string | null
  >(null);
  const [diffPreviewPanelState, updateDiffPreviewPanelState] =
    useReducerState<DiffPreviewPanelState>({ kind: "idle" });
  const [workspaceMode, updateWorkspaceMode] =
    useReducerState<DiffWorkspaceMode>(DEFAULT_DIFF_WORKSPACE_MODE);
  const [workspacePresentation, updateWorkspacePresentation] =
    useReducerState<DiffWorkspacePresentationMode>(
      DEFAULT_DIFF_WORKSPACE_PRESENTATION
    );
  const [workspaceFilePresentation, updateWorkspaceFilePresentation] =
    useReducerState<DiffWorkspaceFilePresentationMode>(
      DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION
    );
  const [ignoreTrimWhitespace, updateIgnoreTrimWhitespace] =
    useReducerState(false);
  const [workspaceEncoding, updateWorkspaceEncoding] = useReducerState(
    DEFAULT_DIFF_WORKSPACE_ENCODING
  );
  const [openedDiffContext, updateOpenedDiffContext] =
    useReducerState<DiffPreviewOpenContext | null>(null);
  const [hasRequestedDiffSurface, updateHasRequestedDiffSurface] =
    useReducerState(false);
  const [isDiffEditorReady, updateIsDiffEditorReady] = useReducerState(false);
  const [hasRequestedFileSurface, updateHasRequestedFileSurface] =
    useReducerState(false);
  const [openedDiff, updateOpenedDiff] =
    useReducerState<RepositoryFileDiff | null>(null);
  const [openedDiffPath, updateOpenedDiffPath] = useReducerState<string | null>(
    null
  );
  const [openedDiffStatusCode, updateOpenedDiffStatusCode] = useReducerState<
    string | null
  >(null);
  const [activeHunks, updateActiveHunks] = useReducerState<
    RepositoryFileHunk[]
  >([]);
  const [_activeHunkIndex, updateActiveHunkIndex] = useReducerState(0);
  const [isLoadingDiffHunks, updateIsLoadingHunks] = useReducerState(false);
  const [diffHunksError, updateHunkLoadError] = useReducerState<string | null>(
    null
  );
  const [historyEntries, updateHistoryEntries] = useReducerState<
    RepositoryFileHistoryEntry[]
  >([]);
  const [selectedHistoryCommitHash, updateSelectedHistoryCommitHash] =
    useReducerState<string | null>(null);
  const [isLoadingFileHistory, updateIsLoadingFileHistory] =
    useReducerState(false);
  const [fileHistoryError, updateFileHistoryError] = useReducerState<
    string | null
  >(null);
  const [blameLines, updateBlameLines] = useReducerState<
    RepositoryFileBlameLine[]
  >([]);
  const [isLoadingBlame, updateIsLoadingBlame] = useReducerState(false);
  const [blameError, updateBlameError] = useReducerState<string | null>(null);
  const [editBuffer, updateEditBuffer] = useReducerState("");
  const [editInitialBuffer, updateEditInitialBuffer] = useReducerState("");
  const [isLoadingEditBuffer, updateIsLoadingEditBuffer] =
    useReducerState(false);
  const [isSavingEditBuffer, updateIsSavingEditBuffer] = useReducerState(false);
  const [editLoadError, updateEditLoadError] = useReducerState<string | null>(
    null
  );
  const [pendingWorkspaceMode, updatePendingWorkspaceMode] =
    useReducerState<DiffWorkspaceMode | null>(null);
  const [pendingOpenDiffContext, updatePendingOpenDiffContext] =
    useReducerState<DiffPreviewOpenContext | null>(null);
  const [pendingCloseDiffPanel, updatePendingCloseDiffPanel] =
    useReducerState(false);
  const [isUnsavedEditConfirmOpen, updateIsUnsavedEditConfirmOpen] =
    useReducerState(false);
  const [commitFilesByHash, updateCommitFilesByHash] = useReducerState<
    Record<string, RepositoryCommitFile[]>
  >({});
  const [isLoadingCommitFilesHash, updateIsLoadingCommitFilesHash] =
    useReducerState<string | null>(null);
  const [openedCommitDiff, updateOpenedCommitDiff] =
    useReducerState<RepositoryCommitFileDiff | null>(null);
  const [openedCommitDiffStatusCode, updateOpenedCommitDiffStatusCode] =
    useReducerState<string | null>(null);
  const [isLoadingCommitDiffPath, updateIsLoadingCommitDiffPath] =
    useReducerState<string | null>(null);
  const [pullActionMode, updatePullActionMode] =
    useReducerState<PullActionMode>("pull-ff-possible");
  const [openEntryContextMenuKey, updateOpenEntryContextMenuKey] =
    useReducerState<string | null>(null);
  const [openEntryDropdownMenuKey, updateOpenEntryDropdownMenuKey] =
    useReducerState<string | null>(null);
  const [openCommitMenuHash, updateOpenCommitMenuHash] = useReducerState<
    string | null
  >(null);
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
  const [sidebarFilterInputValue, updateSidebarFilterInputValue] =
    useReducerState("");
  const [sidebarFilterQuery, updateSidebarFilterQuery] = useReducerState("");
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
  const [selectedLauncherId, updateSelectedLauncherId] =
    useReducerState<ExternalLauncherApplication>("file-manager");

  const [launcherApplications, updateLauncherApplications] = useReducerState<
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
          updateLauncherApplications(applications);
        }
      })
      .catch(() => {
        if (!cancelled) {
          updateLauncherApplications([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tauriRuntime, updateLauncherApplications]);

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
  const openedFileEditorRef = useRef<CodeMirrorEditorViewLike | null>(null);
  const openedEditEditorRef = useRef<CodeMirrorEditorViewLike | null>(null);
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
    if (!activeRepo || storeActiveRepoId === activeRepo.id) {
      return;
    }

    setActiveRepo(activeRepo.id, { background: true }).catch(() => undefined);
  }, [activeRepo, setActiveRepo, storeActiveRepoId]);

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
      updateAiCommitGenerationStatusMessage(nextState.statusMessage);
      updateAiCommitGenerationPreview(nextState.preview);
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
      updateAiCommitGenerationPreview(payload.content);
    });

    return () => {
      disposed = true;
      unlistenProgressPromise.then((unlisten) => unlisten());
      unlistenChunkPromise.then((unlisten) => unlisten());
    };
  }, [
    activeRepoPath,
    tauriRuntime,
    updateAiCommitGenerationPreview,
    updateAiCommitGenerationStatusMessage,
  ]);

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
      updateRemoteAvatarUrlByName({});
      return;
    }

    let cancelled = false;

    getRepositoryRemoteAvatars(activeRepoPath)
      .then((avatarsByRemote) => {
        if (!cancelled) {
          updateRemoteAvatarUrlByName(avatarsByRemote);
        }
      })
      .catch(() => {
        if (!cancelled) {
          updateRemoteAvatarUrlByName({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRepoPath, updateRemoteAvatarUrlByName]);
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
  const persistRepoFileBrowserState = useCallback(
    (
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
    },
    [activeRepoId, setRepoFileBrowserState]
  );
  const updateCollapsedGroupKeys = useCallback(
    (value: SetStateAction<Record<string, boolean>>) => {
      updateCollapsedGroupKeysState(value);
      persistRepoFileBrowserState((current) => ({
        collapsedSidebarGroupKeys: resolveStateAction(
          value,
          current.collapsedSidebarGroupKeys
        ),
      }));
    },
    [persistRepoFileBrowserState, updateCollapsedGroupKeysState]
  );
  const updateCollapsedBranchFolderKeys = useCallback(
    (value: SetStateAction<Record<string, boolean>>) => {
      updateCollapsedBranchFolderKeysState(value);
      persistRepoFileBrowserState((current) => ({
        collapsedBranchFolderKeys: resolveStateAction(
          value,
          current.collapsedBranchFolderKeys
        ),
      }));
    },
    [persistRepoFileBrowserState, updateCollapsedBranchFolderKeysState]
  );
  const updateExpandedCommitTreeNodePaths = useCallback(
    (value: SetStateAction<Record<string, boolean>>) => {
      updateExpandedCommitTreeNodePathsState(value);
      persistRepoFileBrowserState((current) => ({
        expandedCommitTreeNodePaths: resolveStateAction(
          value,
          current.expandedCommitTreeNodePaths
        ),
      }));
    },
    [persistRepoFileBrowserState, updateExpandedCommitTreeNodePathsState]
  );
  const updateSelectedCommitId = useCallback(
    (value: SetStateAction<string | null>) => {
      updateSelectedCommitIdState(value);
      persistRepoFileBrowserState((current) => ({
        selectedCommitId: resolveStateAction(value, current.selectedCommitId),
      }));
    },
    [persistRepoFileBrowserState, updateSelectedCommitIdState]
  );
  const updateSelectedTimelineRowId = useCallback(
    (value: SetStateAction<string | null>) => {
      updateSelectedTimelineRowIdState(value);
      persistRepoFileBrowserState((current) => ({
        selectedTimelineRowId: resolveStateAction(
          value,
          current.selectedTimelineRowId
        ),
      }));
    },
    [persistRepoFileBrowserState, updateSelectedTimelineRowIdState]
  );
  const updateIsRightSidebarOpen = useCallback(
    (value: SetStateAction<boolean>) => {
      updateIsRightSidebarOpenState(value);
      persistRepoFileBrowserState((current) => ({
        isRightSidebarOpen: resolveStateAction(
          value,
          current.isRightSidebarOpen
        ),
      }));
    },
    [persistRepoFileBrowserState, updateIsRightSidebarOpenState]
  );
  const updateLeftSidebarWidth = useCallback(
    (value: SetStateAction<number>) => {
      updateLeftSidebarWidthState(value);
      persistRepoFileBrowserState((current) => ({
        leftSidebarWidth: resolveStateAction(value, current.leftSidebarWidth),
      }));
    },
    [persistRepoFileBrowserState, updateLeftSidebarWidthState]
  );
  const updateRightSidebarWidth = useCallback(
    (value: SetStateAction<number>) => {
      updateRightSidebarWidthState(value);
      persistRepoFileBrowserState((current) => ({
        rightSidebarWidth: resolveStateAction(value, current.rightSidebarWidth),
      }));
    },
    [persistRepoFileBrowserState, updateRightSidebarWidthState]
  );

  useEffect(() => {
    updateCollapsedGroupKeysState(
      repoFileBrowserPreferences.collapsedSidebarGroupKeys
    );
    updateCollapsedBranchFolderKeysState(
      repoFileBrowserPreferences.collapsedBranchFolderKeys
    );
    updateExpandedCommitTreeNodePathsState(
      repoFileBrowserPreferences.expandedCommitTreeNodePaths
    );
    updateSelectedCommitIdState(repoFileBrowserPreferences.selectedCommitId);
    updateSelectedTimelineRowIdState(
      repoFileBrowserPreferences.selectedTimelineRowId
    );
    updateIsRightSidebarOpenState(
      repoFileBrowserPreferences.isRightSidebarOpen
    );
    updateLeftSidebarWidthState(repoFileBrowserPreferences.leftSidebarWidth);
    updateRightSidebarWidthState(repoFileBrowserPreferences.rightSidebarWidth);
  }, [
    repoFileBrowserPreferences.collapsedBranchFolderKeys,
    repoFileBrowserPreferences.collapsedSidebarGroupKeys,
    repoFileBrowserPreferences.expandedCommitTreeNodePaths,
    repoFileBrowserPreferences.isRightSidebarOpen,
    repoFileBrowserPreferences.leftSidebarWidth,
    repoFileBrowserPreferences.rightSidebarWidth,
    repoFileBrowserPreferences.selectedCommitId,
    repoFileBrowserPreferences.selectedTimelineRowId,
    updateCollapsedBranchFolderKeysState,
    updateCollapsedGroupKeysState,
    updateExpandedCommitTreeNodePathsState,
    updateIsRightSidebarOpenState,
    updateLeftSidebarWidthState,
    updateRightSidebarWidthState,
    updateSelectedCommitIdState,
    updateSelectedTimelineRowIdState,
  ]);

  const setChangesViewMode = (viewMode: ChangesViewMode) => {
    persistRepoFileBrowserState({ viewMode });
  };
  const setShowAllCommitFilesState = (shouldShowAll: boolean) => {
    updateShowAllCommitFiles(shouldShowAll);

    if (shouldShowAll) {
      updateCommitDetailsViewMode("tree");
      return;
    }

    updateCommitFileFilterInputValue("");
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
  const [workingTreeModel, updateWorkingTreeModel] = useReducerState<
    ReturnType<typeof buildRepoInfoWorkingTreeModel>
  >(() => buildRepoInfoWorkingTreeModel(workingTreeModelInput));
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
  const [allFilesModel, updateAllFilesModel] = useReducerState<
    ReturnType<typeof buildRepoInfoAllFilesModel>
  >(() => buildRepoInfoAllFilesModel(allFilesModelInput));
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
          updateWorkingTreeModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [workingTreeModelInput, updateWorkingTreeModel]);

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
          updateAllFilesModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [allFilesModelInput, updateAllFilesModel]);

  const currentBranch =
    branches.find((branch) => branch.isCurrent)?.name ?? "HEAD";
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
      updateIsEditingSelectedCommitMessage(false);
      updateRewordCommitSummary("");
      updateRewordCommitDescription("");
      updateLastAiRewordGeneration(null);
      return;
    }

    updateIsEditingSelectedCommitMessage(false);
    updateRewordCommitSummary(selectedCommit.messageSummary);
    updateRewordCommitDescription(selectedCommit.messageDescription);
    updateLastAiRewordGeneration(null);
  }, [
    selectedCommit,
    updateRewordCommitSummary,
    updateIsEditingSelectedCommitMessage,
    updateRewordCommitDescription,
    updateLastAiRewordGeneration,
  ]);
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
  const [selectedCommitFilesModel, updateSelectedCommitFilesModel] =
    useReducerState<ReturnType<typeof buildRepoInfoCommitFilesModel>>(
      EMPTY_COMMIT_FILES_MODEL
    );
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
  const [timelineRows, updateTimelineRows] = useReducerState<GitTimelineRow[]>(
    []
  );

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
          updateTimelineRows(rows);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [timelineRowsInput, updateTimelineRows]);
  const timelineRowById = useMemo(
    () => new Map(timelineRows.map((row) => [row.id, row])),
    [timelineRows]
  );
  const timelineDisplayRows = useMemo(
    () => timelineRows.filter((row) => row.type !== "wip"),
    [timelineRows]
  );
  const visibleGraphModelInput = useMemo<BuildRepoInfoVisibleGraphModelInput>(
    () => ({
      localHeadCommitHash: localHeadCommit?.hash ?? null,
      timelineCommits: timelineCommits.map(({ hash, parentHashes }) => ({
        hash,
        parentHashes,
      })),
      timelineRows: timelineDisplayRows.map((row) => ({
        anchorCommitHash: row.anchorCommitHash,
        author: row.author,
        authorAvatarUrl: row.authorAvatarUrl,
        commitHash: row.commitHash,
        id: row.id,
        label: row.label,
        syncState: row.syncState,
        type: row.type,
      })),
    }),
    [localHeadCommit?.hash, timelineCommits, timelineDisplayRows]
  );
  const visibleGraphWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      BuildRepoInfoVisibleGraphModelInput,
      ReturnType<typeof buildRepoInfoVisibleGraphModel>
    >
  > | null>(null);
  const [visibleGraphModel, updateVisibleGraphModel] = useReducerState<
    ReturnType<typeof buildRepoInfoVisibleGraphModel>
  >(() => buildRepoInfoVisibleGraphModel(visibleGraphModelInput));

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
        { label: "repo-info:visible-graph", requestTimeoutMs: 15_000 }
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
          updateVisibleGraphModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [visibleGraphModelInput, updateVisibleGraphModel]);

  const {
    commitColorByHash,
    currentBranchLaneColor,
    graphRows,
    graphWidth,
    rowColorById,
  } = visibleGraphModel;
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
  const visibleTimelineStartIndex = virtualTimelineRows[0]?.index ?? 0;
  const visibleTimelineEndIndex =
    virtualTimelineRows.at(-1)?.index ?? visibleTimelineStartIndex;
  const visibleTimelineRows = useMemo(
    () =>
      collectVisibleGitTimelineRows({
        rows: timelineDisplayRows,
        virtualRows: virtualTimelineRows,
      }),
    [timelineDisplayRows, virtualTimelineRows]
  );
  const graphRenderRows = useMemo(
    () =>
      buildGitGraphRenderRows({
        rows: timelineDisplayRows,
        visibleEndIndex: visibleTimelineEndIndex,
        visibleStartIndex: visibleTimelineStartIndex,
      }),
    [timelineDisplayRows, visibleTimelineEndIndex, visibleTimelineStartIndex]
  );

  useEffect(() => {
    if (!(activeRepoId && historyHasMore) || isLoadingMoreHistory) {
      return;
    }

    const remainingRows =
      timelineDisplayRows.length - visibleTimelineEndIndex - 1;

    if (remainingRows > 32) {
      return;
    }

    loadMoreRepoHistory(activeRepoId).catch(() => undefined);
  }, [
    activeRepoId,
    historyHasMore,
    isLoadingMoreHistory,
    loadMoreRepoHistory,
    timelineDisplayRows.length,
    visibleTimelineEndIndex,
  ]);
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
  const [selectedReferenceFilesModel, updateSelectedReferenceFilesModel] =
    useReducerState<ReturnType<typeof buildRepoInfoCommitFilesModel>>(
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
          updateSelectedCommitFilesModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [commitFilesModelInput, updateSelectedCommitFilesModel]);

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
          updateSelectedReferenceFilesModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [referenceFilesModelInput, updateSelectedReferenceFilesModel]);
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
  const [referenceModel, updateReferenceModel] = useReducerState<
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
          updateReferenceModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [referenceModelInput, updateReferenceModel]);

  const commitByHash = useMemo(
    () => new Map(timelineCommits.map((commit) => [commit.hash, commit])),
    [timelineCommits]
  );
  const parentHashesByCommitHash = useMemo(
    () =>
      new Map(
        timelineCommits.map((commit) => [commit.hash, commit.parentHashes])
      ),
    [timelineCommits]
  );
  const referenceEntryByKey = useMemo(() => {
    const entries = new Map<string, SidebarEntry>();

    for (const commitEntries of Object.values(
      referenceModel.commitRefEntriesByCommitHash
    )) {
      for (const entry of commitEntries) {
        entries.set(`${entry.type}:${entry.name}`, entry);
      }
    }

    return entries;
  }, [referenceModel.commitRefEntriesByCommitHash]);
  const relatedReferenceEntriesByCommitHash = useMemo(() => {
    const entriesByCommitHash: Record<string, SidebarEntry[]> = {};

    for (const commit of timelineCommits) {
      const relatedEntriesWithDistance: {
        distance: number;
        entry: SidebarEntry;
      }[] = [];

      for (const [entryKey, headCommitHash] of Object.entries(
        referenceModel.commitHashByEntryKey
      )) {
        if (entryKey.startsWith("stash:")) {
          continue;
        }

        const entry = referenceEntryByKey.get(entryKey);

        if (!entry) {
          continue;
        }

        const pendingHashes = [{ distance: 0, hash: headCommitHash }];
        const visitedHashes = new Set<string>();
        let relatedDistance: number | null = null;

        while (pendingHashes.length > 0) {
          const current = pendingHashes.shift();
          const currentHash = current?.hash;

          if (!currentHash || visitedHashes.has(currentHash)) {
            continue;
          }

          if (currentHash === commit.hash) {
            relatedDistance = current.distance;
            break;
          }

          visitedHashes.add(currentHash);
          for (const parentHash of parentHashesByCommitHash.get(currentHash) ??
            []) {
            pendingHashes.push({
              distance: current.distance + 1,
              hash: parentHash,
            });
          }
        }

        const commitColor = commitColorByHash[commit.hash] ?? null;
        const headColor = commitColorByHash[headCommitHash] ?? null;

        if (
          relatedDistance !== null &&
          commitColor !== null &&
          headColor === commitColor
        ) {
          relatedEntriesWithDistance.push({
            distance: relatedDistance,
            entry,
          });
        }
      }

      entriesByCommitHash[commit.hash] = relatedEntriesWithDistance
        .sort((first, second) => {
          if (first.distance !== second.distance) {
            return first.distance - second.distance;
          }

          if (first.entry.active !== second.entry.active) {
            return first.entry.active ? -1 : 1;
          }

          if (first.entry.type !== second.entry.type) {
            return first.entry.type === "branch" ? -1 : 1;
          }

          if (first.entry.isRemote !== second.entry.isRemote) {
            return first.entry.isRemote ? 1 : -1;
          }

          return first.entry.name.localeCompare(second.entry.name);
        })
        .map((match) => match.entry);
    }

    return entriesByCommitHash;
  }, [
    commitColorByHash,
    parentHashesByCommitHash,
    referenceEntryByKey,
    referenceModel.commitHashByEntryKey,
    timelineCommits,
  ]);
  const timelineVisibleColumns = TIMELINE_COLUMN_ORDER;
  const isTimelineMetadataCompact =
    isRightSidebarOpen ||
    isTimelineGraphAutoCompact ||
    repoTimelinePreferences.compactGraph;
  const resolvedTimelineBranchColumnWidth = timelineVisibleColumns.includes(
    "branch"
  )
    ? TIMELINE_BRANCH_COLUMN_WIDTH
    : 0;
  const resolvedTimelineGraphColumnWidth = useMemo(
    () => (timelineVisibleColumns.includes("graph") ? graphWidth : 0),
    [graphWidth]
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
            width: "minmax(160px,0.72fr)",
          });
          break;
        }
        case "author": {
          definitions.push({
            id: columnId,
            label: "Author",
            width: `${
              isTimelineMetadataCompact
                ? TIMELINE_COMPACT_AUTHOR_COLUMN_WIDTH
                : TIMELINE_AUTHOR_COLUMN_WIDTH
            }px`,
          });
          break;
        }
        case "dateTime": {
          definitions.push({
            id: columnId,
            label: "Date / Time",
            width: `${
              isTimelineMetadataCompact
                ? TIMELINE_COMPACT_DATE_TIME_COLUMN_WIDTH
                : TIMELINE_DATE_TIME_COLUMN_WIDTH
            }px`,
          });
          break;
        }
        case "sha": {
          definitions.push({
            id: columnId,
            label: "Sha",
            width: `${
              isTimelineMetadataCompact
                ? TIMELINE_COMPACT_SHA_COLUMN_WIDTH
                : TIMELINE_SHA_COLUMN_WIDTH
            }px`,
          });
          break;
        }
        default: {
          break;
        }
      }
    }

    return definitions;
  }, [effectiveTimelineGraphColumnWidth, isTimelineMetadataCompact]);
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
  const [sidebarResults, updateSidebarResults] = useReducerState<
    ReturnType<typeof buildRepoInfoSidebarGroups>
  >(() => buildRepoInfoSidebarGroups(sidebarGroupsInput));

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
          updateSidebarResults(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [sidebarGroupsInput, updateSidebarResults]);

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
  const [visibleCountsModel, updateVisibleCountsModel] = useReducerState<
    ReturnType<typeof buildRepoInfoVisibleCountsModel>
  >(() => buildRepoInfoVisibleCountsModel(visibleCountsModelInput));

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
          updateVisibleCountsModel(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [visibleCountsModelInput, updateVisibleCountsModel]);

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
  const getTimelineCell = useCallback(
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="min-w-0 truncate px-2 text-xs">
                    {input.commit?.author ?? ""}
                  </div>
                }
              />
              {input.commit?.author ? (
                <TooltipContent side="bottom">
                  {input.commit.author}
                </TooltipContent>
              ) : null}
            </Tooltip>
          );
        }
        case "dateTime": {
          const formattedDate = input.commit
            ? formatCommitDate(input.commit.date)
            : "";

          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="min-w-0 truncate px-2 text-muted-foreground text-xs">
                    {formattedDate}
                  </div>
                }
              />
              {formattedDate.length > 0 ? (
                <TooltipContent side="bottom">{formattedDate}</TooltipContent>
              ) : null}
            </Tooltip>
          );
        }
        case "sha": {
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="min-w-0 truncate px-2 font-mono text-[11px] text-muted-foreground">
                    {input.commit?.shortHash ?? ""}
                  </div>
                }
              />
              {input.commit?.shortHash ? (
                <TooltipContent side="bottom">
                  {input.commit.shortHash}
                </TooltipContent>
              ) : null}
            </Tooltip>
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

    updateIsBranchCreateInputOpen(true);
    updateNewBranchName("");
  };

  const closeBranchCreateInput = () => {
    if (isCreatingBranch) {
      return;
    }

    updateIsBranchCreateInputOpen(false);
    updateNewBranchName("");
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

    updateIsCreatingBranch(true);

    try {
      await createBranch(activeRepoId, trimmedBranchName);
      updateIsBranchCreateInputOpen(false);
      updateNewBranchName("");
      toast.success("Branch created", {
        description: `refs/heads/${trimmedBranchName}`,
      });
    } catch (error) {
      toast.error("Failed to create branch", {
        description: getCreateBranchFailureReason(error),
      });
    } finally {
      updateIsCreatingBranch(false);
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

      updatePendingDeleteBranchRemoteName(remoteName);
      updatePendingDeleteBranchName(remoteBranchName);
      updateIsDeleteRemoteBranch(true);
      updateIsDeleteBranchConfirmOpen(true);
      return;
    }

    updatePendingDeleteBranchRemoteName(null);
    updateIsDeleteRemoteBranch(false);
    updatePendingDeleteBranchName(entry.name);
    updateIsDeleteBranchConfirmOpen(true);
  };

  const handleDeleteBranch = async () => {
    if (!(activeRepoId && pendingDeleteBranchName) || isDeletingBranch) {
      return;
    }

    updateIsDeletingBranch(true);

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

      updateIsDeleteBranchConfirmOpen(false);
      updatePendingDeleteBranchName(null);
      updatePendingDeleteBranchRemoteName(null);
      updateIsDeleteRemoteBranch(false);
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
      updateIsDeletingBranch(false);
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

    updateRenameBranchSourceName(entry.name);
    updateRenameBranchTargetName(entry.name);
    updateIsRenameBranchDialogOpen(true);
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
      updateIsRenameBranchDialogOpen(false);
      return;
    }

    updateIsRenamingBranch(true);

    try {
      await renameBranch(
        activeRepoId,
        renameBranchSourceName,
        trimmedNewBranchName
      );
      toast.success("Branch renamed", {
        description: `${renameBranchSourceName} -> ${trimmedNewBranchName}`,
      });
      updateIsRenameBranchDialogOpen(false);
      updateRenameBranchSourceName(null);
      updateRenameBranchTargetName("");
    } catch (error) {
      toast.error("Failed to rename branch", {
        description: getRenameBranchFailureReason(error),
      });
    } finally {
      updateIsRenamingBranch(false);
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

    updateSetUpstreamLocalBranchName(entry.name);
    updateSetUpstreamRemoteName(defaultRemoteName);
    updateSetUpstreamRemoteBranchName(entry.name);
    updateSetUpstreamFormError(null);
    updateIsSetUpstreamDialogOpen(true);
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
      updateSetUpstreamFormError("Remote and branch are required.");
      return;
    }

    updateIsSettingUpstream(true);
    updateSetUpstreamFormError(null);

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
      updateIsSetUpstreamDialogOpen(false);
      updateSetUpstreamLocalBranchName(null);
      updateSetUpstreamRemoteName("");
      updateSetUpstreamRemoteBranchName("");
      updateSetUpstreamFormError(null);
    } catch (error) {
      updateSetUpstreamFormError(getSetUpstreamFailureReason(error));
    } finally {
      updateIsSettingUpstream(false);
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
        updateSelectedCommitId(WORKING_TREE_ROW_ID);
      }
      return;
    }

    if (timelineCommits.length === 0) {
      const fallbackRowId = hasAnyWorkingTreeChanges
        ? WORKING_TREE_ROW_ID
        : null;

      if (selectedTimelineRowId !== fallbackRowId) {
        updateSelectedTimelineRowId(fallbackRowId);
      }

      if (selectedCommitId !== fallbackRowId) {
        updateSelectedCommitId(fallbackRowId);
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
          updateSelectedCommitId(resolvedCommitHash);
        }

        return;
      }
    }

    if (
      selectedCommitId &&
      timelineCommits.some((commit) => commit.hash === selectedCommitId)
    ) {
      if (selectedTimelineRowId !== selectedCommitId) {
        updateSelectedTimelineRowId(selectedCommitId);
      }
      return;
    }

    const fallbackCommitHash = hasAnyWorkingTreeChanges
      ? WORKING_TREE_ROW_ID
      : (localHeadCommit?.hash ?? timelineCommits[0]?.hash ?? null);

    if (selectedTimelineRowId !== fallbackCommitHash) {
      updateSelectedTimelineRowId(fallbackCommitHash);
    }

    if (selectedCommitId !== fallbackCommitHash) {
      updateSelectedCommitId(fallbackCommitHash);
    }
  }, [
    timelineCommits,
    hasAnyWorkingTreeChanges,
    localHeadCommit,
    selectedCommitId,
    selectedTimelineRowId,
    timelineRowById,
    updateSelectedCommitId,
    updateSelectedTimelineRowId,
  ]);

  useEffect(() => {
    if (activeRepoId === null) {
      updateDraftCommitSummary("");
      updateDraftCommitDescription("");
      updateAmendPreviousCommit(false);
      updateLastAiCommitGeneration(null);
      return;
    }

    updateDraftCommitSummary("");
    updateDraftCommitDescription("");
    updateAmendPreviousCommit(false);
    updateLastAiCommitGeneration(null);
  }, [
    activeRepoId,
    updateLastAiCommitGeneration,
    updateDraftCommitSummary,
    updateDraftCommitDescription,
    updateAmendPreviousCommit,
  ]);

  useEffect(() => {
    if (activeRepoId === null) {
      return;
    }

    if (!commitDraftPrefill) {
      return;
    }

    updateDraftCommitSummary(commitDraftPrefill.summary);
    updateDraftCommitDescription(commitDraftPrefill.description);
    updateAmendPreviousCommit(false);
    updateLastAiCommitGeneration(null);
    clearRepoCommitDraftPrefill(activeRepoId);
  }, [
    activeRepoId,
    clearRepoCommitDraftPrefill,
    commitDraftPrefill,
    updateAmendPreviousCommit,
    updateDraftCommitSummary,
    updateDraftCommitDescription,
    updateLastAiCommitGeneration,
  ]);

  useEffect(() => {
    if (activeRepoId === null) {
      updateIsLoadingDiffPath(null);
      updateDiffPreviewPanelState({ kind: "idle" });
      updateOpenedDiffContext(null);
      updateHasRequestedDiffSurface(false);
      updateOpenedDiff(null);
      updateOpenedDiffPath(null);
      updateOpenedDiffStatusCode(null);
      updateOpenedCommitDiff(null);
      updateOpenedCommitDiffStatusCode(null);
      commitDiffCacheRef.current.clear();
      return;
    }

    updateIsLoadingDiffPath(null);
    updateDiffPreviewPanelState({ kind: "idle" });
    updateOpenedDiffContext(null);
    updateHasRequestedDiffSurface(false);
    updateOpenedDiff(null);
    updateOpenedDiffPath(null);
    updateOpenedDiffStatusCode(null);
    updateOpenedCommitDiff(null);
    updateOpenedCommitDiffStatusCode(null);
    commitDiffCacheRef.current.clear();
  }, [
    activeRepoId,
    updateOpenedCommitDiff,
    updateDiffPreviewPanelState,
    updateOpenedDiffPath,
    updateOpenedDiff,
    updateOpenedDiffContext,
    updateOpenedDiffStatusCode,
    updateOpenedCommitDiffStatusCode,
    updateIsLoadingDiffPath,
    updateHasRequestedDiffSurface,
  ]);

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

    updateShowAllCommitFiles(false);
    updateCommitFileFilterInputValue("");
    updateCommitFileSortOrder("asc");
  }, [
    isSelectedCommitRow,
    isSelectedReferenceRow,
    isWorkingTreeSelection,
    selectedCommit,
    selectedReferenceRevision,
    updateCommitFileSortOrder,
    updateCommitFileFilterInputValue,
    updateShowAllCommitFiles,
  ]);

  useEffect(() => {
    if (
      !activeRepoId ||
      isWorkingTreeSelection ||
      !selectedCommit ||
      !isSelectedCommitRow
    ) {
      updateOpenedCommitDiff(null);
      updateOpenedCommitDiffStatusCode(null);
      updateIsLoadingCommitFilesHash(null);
      return;
    }

    if (commitFilesByHash[selectedCommit.hash]) {
      return;
    }

    let cancelled = false;
    updateIsLoadingCommitFilesHash(selectedCommit.hash);

    getCommitFiles(activeRepoId, selectedCommit.hash)
      .then((files) => {
        if (cancelled) {
          return;
        }

        updateCommitFilesByHash((current) => ({
          ...current,
          [selectedCommit.hash]: files,
        }));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        updateIsLoadingCommitFilesHash((current) =>
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
    updateOpenedCommitDiffStatusCode,
    updateIsLoadingCommitFilesHash,
    updateOpenedCommitDiff,
    updateCommitFilesByHash,
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
    updateIsLoadingCommitFilesHash(selectedReferenceRevision);

    getCommitFiles(activeRepoId, selectedReferenceRevision)
      .then((files) => {
        if (cancelled) {
          return;
        }

        updateCommitFilesByHash((current) => ({
          ...current,
          [selectedReferenceRevision]: files,
        }));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        updateIsLoadingCommitFilesHash((current) =>
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
    updateIsLoadingCommitFilesHash,
    updateCommitFilesByHash,
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

      updateIsTimelineGraphAutoCompact((current) =>
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
        updateLeftSidebarWidth(nextLeftWidth);
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
        updateRightSidebarWidth(nextRightWidth);
      }
    };

    clampSidebarWidths();
    globalThis.addEventListener("resize", clampSidebarWidths);

    return () => {
      globalThis.removeEventListener("resize", clampSidebarWidths);
    };
  }, [
    isRightSidebarOpen,
    workspaceMode,
    updateIsTimelineGraphAutoCompact,
    updateLeftSidebarWidth,
    updateRightSidebarWidth,
  ]);

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
        updateLeftSidebarWidth(
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
      updateRightSidebarWidth(
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
  }, [updateLeftSidebarWidth, updateRightSidebarWidth]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = commitDetailsResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      updateCommitDetailsPanelHeight(
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
  }, [updateCommitDetailsPanelHeight]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = changesSectionsResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      updateUnstagedSectionHeight(
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
  }, [updateUnstagedSectionHeight]);

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

      updateUnstagedSectionHeight((current) =>
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
  }, [isChangesSectionsResizable, updateUnstagedSectionHeight]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = workingTreeFilesPanelResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      updateWorkingTreeFilesPanelHeight(
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
  }, [updateWorkingTreeFilesPanelHeight]);

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
        updateWorkingTreeFilesPanelHeight(WORKING_TREE_FILES_PANEL_MIN_HEIGHT);
        return;
      }

      updateWorkingTreeFilesPanelHeight((value) =>
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
  }, [isWorkingTreeSelection, updateWorkingTreeFilesPanelHeight]);

  const scheduleSidebarFilterUpdate = (nextValue: string) => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
    }

    sidebarFilterDebounceRef.current = globalThis.setTimeout(() => {
      startSidebarFilterTransition(() => {
        updateSidebarFilterQuery(nextValue);
      });
      sidebarFilterDebounceRef.current = null;
    }, SIDEBAR_FILTER_DEBOUNCE_MS);
  };

  const clearSidebarFilter = () => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
      sidebarFilterDebounceRef.current = null;
    }

    updateSidebarFilterInputValue("");
    updateSidebarFilterQuery("");
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
        updateOpenEntryDropdownMenuKey(null);
      }

      updateOpenEntryContextMenuKey((current) => {
        if (open) {
          return entryMenuKey;
        }

        if (current === entryMenuKey) {
          return null;
        }

        return current;
      });
    },
    [updateOpenEntryDropdownMenuKey, updateOpenEntryContextMenuKey]
  );

  const handleEntryDropdownMenuOpenChange = useCallback(
    (entryMenuKey: string, open: boolean) => {
      if (open) {
        updateOpenEntryContextMenuKey(null);
      }

      updateOpenEntryDropdownMenuKey((current) => {
        if (open) {
          return entryMenuKey;
        }

        if (current === entryMenuKey) {
          return null;
        }

        return current;
      });
    },
    [updateOpenEntryContextMenuKey, updateOpenEntryDropdownMenuKey]
  );

  const handleCommitMenuOpenChange = useCallback(
    (commitHash: string, open: boolean) => {
      updateOpenCommitMenuHash((current) => {
        if (open) {
          return commitHash;
        }

        if (current === commitHash) {
          return null;
        }

        return current;
      });
    },
    [updateOpenCommitMenuHash]
  );

  const getEntryIcon = (entry: SidebarEntry) => {
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

  const getSidebarEntryLeadIndicator = (
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

  const getHighlightedEntryName = (name: string) => {
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

    updateCollapsedBranchFolderKeys((current) => ({
      ...current,
      [stateKey]: !current[stateKey],
    }));
  };
  const getSidebarBranchCounts = (entry: SidebarEntry) => (
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
  const renderProgressiveLoadingMessage = (label: string) => (
    <p className="px-2 py-1 text-muted-foreground text-xs">
      Loading more {label}...
    </p>
  );
  const getSidebarBranchTreeNodes = (
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
                  {getSidebarEntryLeadIndicator(groupKey, entry)}
                  {getEntryIcon(entry)}
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="min-w-0 flex-1 truncate" />}
                    >
                      {getHighlightedEntryName(node.name)}
                    </TooltipTrigger>
                    <TooltipContent align="start" side="right" sideOffset={6}>
                      {entry.name}
                    </TooltipContent>
                  </Tooltip>
                  {getSidebarBranchCounts(entry)}
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
                ? getEntryContextMenuContent(entry)
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
              {getHighlightedEntryName(node.name)}
            </span>
          </button>
          {hasChildren && !isCollapsed ? (
            <div>
              {getSidebarBranchTreeNodes(
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
                {getSidebarEntryLeadIndicator(groupKey, entry)}
                {getEntryIcon(entry)}
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="min-w-0 flex-1 truncate" />}
                  >
                    {getHighlightedEntryName(entry.name)}
                  </TooltipTrigger>
                  <TooltipContent align="start" side="right" sideOffset={6}>
                    {entry.name}
                  </TooltipContent>
                </Tooltip>
                {getSidebarBranchCounts(entry)}
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
            {isEntryContextMenuOpen ? getEntryContextMenuContent(entry) : null}
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

    updateIsSwitchingBranch(true);

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
      updateIsSwitchingBranch(false);
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

    updateIsCheckingOutCommit(true);

    try {
      await checkoutCommit(activeRepoId, target);
      if (rowId) {
        updateSelectedTimelineRowId(rowId);
        updateSelectedCommitId(target);
      }
      toast.success("Checkout Successful", {
        description: targetLabel,
      });
    } catch (error) {
      toast.error("Failed to checkout commit", {
        description: getCommitActionFailureReason(error, "checkout"),
      });
    } finally {
      updateIsCheckingOutCommit(false);
    }
  };

  const openCreateBranchAtReferenceDialog = (
    target: string,
    targetLabel: string
  ) => {
    if (isCreatingRefBranch) {
      return;
    }

    updateCreateRefBranchTarget(target);
    updateCreateRefBranchLabel(targetLabel);
    updateCreateRefBranchName("");
    updateIsCreateRefBranchDialogOpen(true);
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

    updateIsCreatingRefBranch(true);

    try {
      await createBranchAtReference(
        activeRepoId,
        trimmedBranchName,
        createRefBranchTarget
      );
      toast.success("Branch created", {
        description: `${trimmedBranchName} at ${createRefBranchLabel}`,
      });
      updateIsCreateRefBranchDialogOpen(false);
      updateCreateRefBranchTarget(null);
      updateCreateRefBranchLabel("");
      updateCreateRefBranchName("");
    } catch (error) {
      toast.error("Failed to create branch", {
        description: getCommitActionFailureReason(error, "create-branch"),
      });
    } finally {
      updateIsCreatingRefBranch(false);
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

    updateCreateTagTarget(target);
    updateCreateTagTargetLabel(targetLabel);
    updateCreateTagAnnotated(annotated);
    updateCreateTagNameValue("");
    updateIsCreateTagDialogOpen(true);
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

    updateIsCreatingTagAtReference(true);

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
      updateIsCreateTagDialogOpen(false);
      updateCreateTagTarget(null);
      updateCreateTagTargetLabel("");
      updateCreateTagNameValue("");
      updateCreateTagAnnotated(false);
    } catch (error) {
      toast.error("Failed to create tag", {
        description: getCommitActionFailureReason(error, "create-tag"),
      });
    } finally {
      updateIsCreatingTagAtReference(false);
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

    updateResetTarget(target);
    updateResetTargetLabel(targetLabel);
    updateResetTargetMode(mode);
    updateIsResetConfirmOpen(true);
  };
  const openDropCommitConfirm = (target: string, targetLabel: string) => {
    if (isDroppingCommit) {
      return;
    }

    updatePendingDropCommitHash(target);
    updatePendingDropCommitLabel(targetLabel);
    updateIsDropCommitConfirmOpen(true);
  };

  const handleResetToCommit = async () => {
    if (!(activeRepoId && resetTarget) || isResettingToReference) {
      return;
    }

    updateIsResettingToReference(true);

    try {
      await resetToReference(activeRepoId, resetTarget, resetTargetMode);
      toast.success("Reset completed", {
        description: `${resetTargetMode} -> ${resetTargetLabel}`,
      });
      updateIsResetConfirmOpen(false);
      updateResetTarget(null);
      updateResetTargetLabel("");
      updateResetTargetMode("mixed");
    } catch (error) {
      toast.error("Failed to reset", {
        description: getCommitActionFailureReason(error, "reset"),
      });
    } finally {
      updateIsResettingToReference(false);
    }
  };
  const handleDropCommit = async () => {
    if (!(activeRepoId && pendingDropCommitHash) || isDroppingCommit) {
      return;
    }

    updateIsDroppingCommit(true);

    try {
      const result = await dropCommit(activeRepoId, pendingDropCommitHash);
      updateIsDropCommitConfirmOpen(false);
      updatePendingDropCommitHash(null);
      updatePendingDropCommitLabel("");
      updateSelectedCommitId(result.selectedCommitHash);
      updateSelectedTimelineRowId(result.selectedCommitHash);
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
      updateIsDroppingCommit(false);
    }
  };

  const handleCherryPickAtReference = async (
    target: string,
    targetLabel: string
  ) => {
    if (!activeRepoId || isCherryPickingCommit) {
      return;
    }

    updateIsCherryPickingCommit(true);

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
      updateIsCherryPickingCommit(false);
    }
  };

  const handleRevertAtReference = async (
    target: string,
    targetLabel: string
  ) => {
    if (!activeRepoId || isRevertingCommit) {
      return;
    }

    updateIsRevertingCommit(true);

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
      updateIsRevertingCommit(false);
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

    updateIsRewordingCommitMessage(true);

    try {
      const result = await rewordCommitMessage(
        activeRepoId,
        selectedCommit.hash,
        rewordCommitSummary,
        rewordCommitDescription
      );
      updateSelectedCommitId(result.updatedCommitHash);
      updateSelectedTimelineRowId(result.updatedCommitHash);
      updateIsEditingSelectedCommitMessage(false);
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
      updateIsRewordingCommitMessage(false);
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

    updateIsApplyingStash(true);
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
      updateDraftCommitSummary(stashDraft.summary);
      updateDraftCommitDescription(stashDraft.description);
      updateSelectedTimelineRowId(WORKING_TREE_ROW_ID);
      updateSelectedCommitId(WORKING_TREE_ROW_ID);
      updateIsRightSidebarOpen(true);
      focusCommitSummaryInput();
    } finally {
      updateIsApplyingStash(false);
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

    updateIsPoppingStash(true);
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
      updateDraftCommitSummary(stashDraft.summary);
      updateDraftCommitDescription(stashDraft.description);
      updateSelectedTimelineRowId(WORKING_TREE_ROW_ID);
      updateSelectedCommitId(WORKING_TREE_ROW_ID);
      updateIsRightSidebarOpen(true);
      focusCommitSummaryInput();
    } finally {
      updateIsPoppingStash(false);
    }
  };

  const handleCreateStash = async () => {
    if (!activeRepoId || isCreatingStash || !canCreateStash) {
      return;
    }

    updateIsCreatingStash(true);

    try {
      await createStash(
        activeRepoId,
        draftCommitSummary.trim(),
        draftCommitDescription.trim()
      );
      updateDraftCommitSummary("");
      updateDraftCommitDescription("");
      updateAmendPreviousCommit(false);
      updatePushAfterCommit(false);
      updateSkipCommitHooks(false);
      updateLastAiCommitGeneration(null);
      preAmendDraftRef.current = null;
    } finally {
      updateIsCreatingStash(false);
    }
  };

  const handlePopCurrentStash = async () => {
    if (!activeRepoId || isPoppingStash || !canPopCurrentStash) {
      return;
    }

    updateIsPoppingStash(true);
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
      updateDraftCommitSummary(stashDraft.summary);
      updateDraftCommitDescription(stashDraft.description);
      updateSelectedTimelineRowId(WORKING_TREE_ROW_ID);
      updateSelectedCommitId(WORKING_TREE_ROW_ID);
      updateIsRightSidebarOpen(true);
      focusCommitSummaryInput();
    } finally {
      updateIsPoppingStash(false);
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

    updateIsDroppingStash(true);

    try {
      await dropStash(activeRepoId, entry.stashRef);
    } finally {
      updateIsDroppingStash(false);
    }
  };

  const handlePullAction = async (mode: PullActionMode) => {
    if (!activeRepoId || isPulling) {
      return;
    }
    updateIsPulling(true);
    updatePullActionMode(mode);
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
      updateIsPulling(false);
    }
  };
  const handleUndoAction = async () => {
    if (!(activeRepoId && canUndoAction) || isUndoRedoBusy) {
      return;
    }

    updateIsUndoRedoBusy(true);

    try {
      await undoRepoAction(activeRepoId);
    } catch (error) {
      toast.error("Failed to undo action", {
        description: getErrorMessage(error),
      });
    } finally {
      updateIsUndoRedoBusy(false);
    }
  };
  const handleRedoAction = async () => {
    if (!(activeRepoId && canRedoAction) || isUndoRedoBusy) {
      return;
    }

    updateIsUndoRedoBusy(true);

    try {
      await redoRepoAction(activeRepoId);
    } catch (error) {
      toast.error("Failed to redo action", {
        description: getErrorMessage(error),
      });
    } finally {
      updateIsUndoRedoBusy(false);
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

    updateIsPulling(true);
    updatePullActionMode(mode);

    try {
      if (!entry.active) {
        updateIsSwitchingBranch(true);

        try {
          await switchBranch(activeRepoId, entry.name);
        } catch (error) {
          toast.error("Failed to switch branch", {
            description: getCheckoutFailureReason(error),
          });
          return;
        } finally {
          updateIsSwitchingBranch(false);
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
      updateIsPulling(false);
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

    updateIsRunningMergeAction(true);

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
      updateIsRunningMergeAction(false);
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
        updateIsPushing(true);

        try {
          await pushBranch(activeRepoId, false, publishOptions);
        } catch (error) {
          if (isMissingRemoteRepositoryError(error)) {
            updatePublishRepoFormError(null);
            updateIsPublishRepoConfirmOpen(true);
            return;
          }

          throw error;
        } finally {
          updateIsPushing(false);
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
        updateIsPushing(true);

        try {
          await pushBranch(activeRepoId, true);
        } finally {
          updateIsPushing(false);
        }
      });
      return;
    }

    updateIsPushing(true);

    try {
      if ((currentLocalBranch?.behindCount ?? 0) > 0) {
        await pullBranch(activeRepoId, pullActionMode);
      }
      await pushBranch(activeRepoId);
    } catch (error) {
      if (isMissingRemoteRepositoryError(error)) {
        openPublishRepoConfirm(async (publishOptions) => {
          updateIsPushing(true);

          try {
            await pushBranch(activeRepoId, false, publishOptions);
          } finally {
            updateIsPushing(false);
          }
        });
        return;
      }

      throw error;
    } finally {
      updateIsPushing(false);
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
        updateIsPushing(true);

        try {
          if (!entry.active) {
            updateIsSwitchingBranch(true);

            try {
              await switchBranch(activeRepoId, entry.name);
            } catch (error) {
              toast.error("Failed to switch branch", {
                description: getCheckoutFailureReason(error),
              });
              return;
            } finally {
              updateIsSwitchingBranch(false);
            }
          }

          await pushBranch(activeRepoId, false, publishOptions);
        } catch (error) {
          if (isMissingRemoteRepositoryError(error)) {
            updatePublishRepoFormError(null);
            updateIsPublishRepoConfirmOpen(true);
            return;
          }

          throw error;
        } finally {
          updateIsPushing(false);
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
        updateIsPushing(true);

        try {
          if (!entry.active) {
            updateIsSwitchingBranch(true);

            try {
              await switchBranch(activeRepoId, entry.name);
            } catch (error) {
              toast.error("Failed to switch branch", {
                description: getCheckoutFailureReason(error),
              });
              return;
            } finally {
              updateIsSwitchingBranch(false);
            }
          }

          await pushBranch(activeRepoId, true);
        } finally {
          updateIsPushing(false);
        }
      });
      return;
    }

    updateIsPushing(true);

    try {
      if (!entry.active) {
        updateIsSwitchingBranch(true);

        try {
          await switchBranch(activeRepoId, entry.name);
        } catch (error) {
          toast.error("Failed to switch branch", {
            description: getCheckoutFailureReason(error),
          });
          return;
        } finally {
          updateIsSwitchingBranch(false);
        }
      }

      if ((entry.pendingSyncCount ?? 0) > 0) {
        await pullBranch(activeRepoId, pullActionMode);
      }

      await pushBranch(activeRepoId);
    } catch (error) {
      if (isMissingRemoteRepositoryError(error)) {
        openPublishRepoConfirm(async (publishOptions) => {
          updateIsPushing(true);

          try {
            if (!entry.active) {
              updateIsSwitchingBranch(true);

              try {
                await switchBranch(activeRepoId, entry.name);
              } catch (switchError) {
                toast.error("Failed to switch branch", {
                  description: getCheckoutFailureReason(switchError),
                });
                return;
              } finally {
                updateIsSwitchingBranch(false);
              }
            }

            await pushBranch(activeRepoId, false, publishOptions);
          } finally {
            updateIsPushing(false);
          }
        });
        return;
      }

      throw error;
    } finally {
      updateIsPushing(false);
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
    (row: GitTimelineRow): SidebarEntry | null =>
      referenceModel.sidebarEntryByTimelineRowId[row.id] ?? null,
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

  const getEntryContextMenuContent = (entry: SidebarEntry) => {
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
            ? getCommitResetSubmenu(entryCommitHash, targetLabel, false)
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
            {getCommitResetSubmenu(entryCommitHash, targetLabel, false)}
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

  const getCommitResetSubmenu = (
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
        {getCommitResetSubmenu(
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
    return timelineEntry ? getEntryContextMenuContent(timelineEntry) : null;
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
        updateSelectedTimelineRowId(row.id);
        updateSelectedCommitId(row.commitHash);
      } else if (row.anchorCommitHash) {
        updateSelectedTimelineRowId(row.id);
        updateSelectedCommitId(row.anchorCommitHash);
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
  ): Record<string, boolean> =>
    collectExpandableTreeKeysModel(nodes, section, getTreeNodeStateKey);

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

  const getStatusBadges = (
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
  ) => collectTreeStatusCountsModel(node, section);

  const collectCommitTreeChangeSummary = (node: CommitFileTreeNode) =>
    collectCommitTreeChangeSummaryModel(node);

  const handleUnstageAll = async () => {
    if (!activeRepoId || isUnstagingAll || !hasStagedChanges) {
      return;
    }

    updateIsUnstagingAll(true);

    try {
      await unstageAll(activeRepoId);
    } finally {
      updateIsUnstagingAll(false);
    }
  };

  const handleFileStageToggle = async (
    filePath: string,
    mode: "stage" | "unstage"
  ) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    updateIsUpdatingFilePath(filePath);

    try {
      if (mode === "stage") {
        await stageFile(activeRepoId, filePath);
      } else {
        await unstageFile(activeRepoId, filePath);
      }
    } finally {
      updateIsUpdatingFilePath(null);
    }
  };

  const handleDiscardAllChanges = async () => {
    if (!activeRepoId || isDiscardingAllChanges || !hasAnyWorkingTreeChanges) {
      return;
    }

    updateIsDiscardingAllChanges(true);

    try {
      await discardAllChanges(activeRepoId);
      updateIsDiscardAllConfirmOpen(false);
    } finally {
      updateIsDiscardingAllChanges(false);
    }
  };
  const handleDiscardPathChanges = async (filePath: string) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    updateIsUpdatingFilePath(filePath);

    try {
      await discardPathChanges(activeRepoId, filePath);
    } finally {
      updateIsUpdatingFilePath(null);
    }
  };
  const handleAddIgnoreRule = async (pattern: string) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    updateIsUpdatingFilePath(pattern);

    try {
      await addIgnoreRule(activeRepoId, pattern);
    } finally {
      updateIsUpdatingFilePath(null);
    }
  };
  const isEditDirty =
    workspaceMode === "edit" && editBuffer !== editInitialBuffer;
  const closeDiffPreviewPanel = useCallback(() => {
    updateDiffPreviewPanelState({ kind: "idle" });
    updateWorkspaceMode(DEFAULT_DIFF_WORKSPACE_MODE);
    updateWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    updateWorkspaceFilePresentation(DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION);
    updateIgnoreTrimWhitespace(false);
    updateWorkspaceEncoding(DEFAULT_DIFF_WORKSPACE_ENCODING);
    updateOpenedDiffContext(null);
    updateHasRequestedDiffSurface(false);
    updateIsDiffEditorReady(false);
    updateHasRequestedFileSurface(false);
    updateOpenedDiff(null);
    updateOpenedDiffPath(null);
    updateOpenedDiffStatusCode(null);
    updateActiveHunks([]);
    updateActiveHunkIndex(0);
    updateIsLoadingHunks(false);
    updateHunkLoadError(null);
    updateHistoryEntries([]);
    updateSelectedHistoryCommitHash(null);
    updateIsLoadingFileHistory(false);
    updateFileHistoryError(null);
    updateBlameLines([]);
    updateIsLoadingBlame(false);
    updateBlameError(null);
    updateEditBuffer("");
    updateEditInitialBuffer("");
    updateIsLoadingEditBuffer(false);
    updateIsSavingEditBuffer(false);
    updateEditLoadError(null);
    updatePendingWorkspaceMode(null);
    updatePendingOpenDiffContext(null);
    updatePendingCloseDiffPanel(false);
    updateIsUnsavedEditConfirmOpen(false);
    updateOpenedCommitDiff(null);
    updateOpenedCommitDiffStatusCode(null);
    updateIsLoadingDiffPath(null);
    updateIsLoadingCommitDiffPath(null);
  }, [
    updateWorkspacePresentation,
    updateDiffPreviewPanelState,
    updateOpenedDiff,
    updateIsLoadingDiffPath,
    updatePendingCloseDiffPanel,
    updateOpenedDiffPath,
    updateBlameError,
    updateBlameLines,
    updateIsLoadingEditBuffer,
    updateIsLoadingFileHistory,
    updateIsLoadingHunks,
    updateIsSavingEditBuffer,
    updateIsUnsavedEditConfirmOpen,
    updateOpenedCommitDiff,
    updateOpenedCommitDiffStatusCode,
    updateOpenedDiffContext,
    updateOpenedDiffStatusCode,
    updatePendingOpenDiffContext,
    updatePendingWorkspaceMode,
    updateSelectedHistoryCommitHash,
    updateWorkspaceEncoding,
    updateWorkspaceFilePresentation,
    updateIsLoadingCommitDiffPath,
    updateWorkspaceMode,
    updateIsLoadingBlame,
    updateIsDiffEditorReady,
    updateIgnoreTrimWhitespace,
    updateHunkLoadError,
    updateHistoryEntries,
    updateFileHistoryError,
    updateHasRequestedFileSurface,
    updateEditLoadError,
    updateActiveHunks,
    updateHasRequestedDiffSurface,
    updateEditInitialBuffer,
    updateEditBuffer,
    updateActiveHunkIndex,
  ]);

  const openWorkingDiffContent = useCallback(
    async (
      context: Extract<DiffPreviewOpenContext, { source: "working" }>,
      previewMode: "diff" | "file",
      forceRender: boolean
    ) => {
      if (!activeRepoId) {
        return;
      }

      updateDiffPreviewPanelState({
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
        updateDiffPreviewPanelState({
          kind:
            previewMode === "file" ? "errorLoadingFile" : "errorRenderingDiff",
          path: context.filePath,
        });
        return;
      }

      updateOpenedDiff(diff);
      updateOpenedDiffPath(context.filePath);
      updateOpenedDiffStatusCode(
        resolveWorkingTreePreviewStatusCode(context.item)
      );
      updateDiffPreviewPanelState({ kind: "ready", path: context.filePath });
    },
    [
      activeRepoId,
      getFileContent,
      requestedWorkspaceEncoding,
      updateOpenedDiffStatusCode,
      updateOpenedDiffPath,
      updateOpenedDiff,
      updateDiffPreviewPanelState,
    ]
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
          updateOpenedCommitDiff(cachedDiff);
          updateOpenedCommitDiffStatusCode(
            resolveCommitPreviewStatusCode(context.status)
          );
          updateDiffPreviewPanelState({
            kind: "ready",
            path: context.filePath,
          });
          return;
        }
      }

      updateDiffPreviewPanelState({
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
        updateDiffPreviewPanelState({
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

      updateOpenedCommitDiff(diff);
      updateOpenedCommitDiffStatusCode(
        resolveCommitPreviewStatusCode(context.status)
      );
      updateDiffPreviewPanelState({ kind: "ready", path: context.filePath });
    },
    [
      activeRepoId,
      getCommitFileContent,
      requestedWorkspaceEncoding,
      workspaceEncoding,
      updateOpenedCommitDiffStatusCode,
      updateOpenedCommitDiff,
      updateDiffPreviewPanelState,
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
        updateDiffPreviewPanelState({
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
        updateDiffPreviewPanelState(nextState);

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
      updateDiffPreviewPanelState(nextState);

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
      updateDiffPreviewPanelState,
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

      updateWorkspaceEncoding(nextEncoding);
    },
    [activeRepoId, getFileDetectedEncoding, updateWorkspaceEncoding]
  );

  const loadDiffHunks = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      updateIsLoadingHunks(true);
      updateHunkLoadError(null);

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
          updateActiveHunks([]);
          updateHunkLoadError("Error rendering diff");
          return;
        }

        updateActiveHunks(payload.hunks);
        updateActiveHunkIndex(0);
      } finally {
        updateIsLoadingHunks(false);
      }
    },
    [
      activeRepoId,
      getCommitFileHunks,
      getFileHunks,
      ignoreTrimWhitespace,
      updateIsLoadingHunks,
      updateHunkLoadError,
      updateActiveHunks,
      updateActiveHunkIndex,
    ]
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
        updateHistoryEntries(cachedEntries);
        updateFileHistoryError(null);
        updateIsLoadingFileHistory(false);

        const nextSelectedCommitHash =
          cachedEntries.find(
            (entry) => entry.commitHash === selectedHistoryCommitHash
          )?.commitHash ??
          cachedEntries.at(0)?.commitHash ??
          null;
        updateSelectedHistoryCommitHash(nextSelectedCommitHash);

        if (nextSelectedCommitHash) {
          const previewContext: DiffPreviewOpenContext = {
            source: "commit",
            mode: "diff",
            commitHash: nextSelectedCommitHash,
            filePath: context.filePath,
            status: "M",
          };
          updateOpenedDiffContext(previewContext);
          await runDiffPreviewPreflight(previewContext, "diff");
        } else {
          updateOpenedCommitDiff(null);
          updateOpenedCommitDiffStatusCode(null);
          updateDiffPreviewPanelState({ kind: "idle" });
        }

        return;
      }

      updateIsLoadingFileHistory(true);
      updateFileHistoryError(null);

      try {
        const payload = await getFileHistory(
          activeRepoId,
          context.filePath,
          FILE_HISTORY_LIMIT
        );

        if (!payload) {
          updateHistoryEntries([]);
          updateSelectedHistoryCommitHash(null);
          updateFileHistoryError("Error loading file history");
          updateOpenedCommitDiff(null);
          updateOpenedCommitDiffStatusCode(null);
          updateDiffPreviewPanelState({ kind: "idle" });
          return;
        }

        updateHistoryEntries(payload.entries);
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
        updateSelectedHistoryCommitHash(nextSelectedCommitHash);

        if (nextSelectedCommitHash) {
          const previewContext: DiffPreviewOpenContext = {
            source: "commit",
            mode: "diff",
            commitHash: nextSelectedCommitHash,
            filePath: context.filePath,
            status: "M",
          };
          updateOpenedDiffContext(previewContext);
          await runDiffPreviewPreflight(previewContext, "diff");
        } else {
          updateOpenedCommitDiff(null);
          updateOpenedCommitDiffStatusCode(null);
          updateDiffPreviewPanelState({ kind: "idle" });
        }
      } finally {
        updateIsLoadingFileHistory(false);
      }
    },
    [
      activeRepoId,
      getFileHistory,
      runDiffPreviewPreflight,
      selectedHistoryCommitHash,
      updateOpenedCommitDiff,
      updateSelectedHistoryCommitHash,
      updateIsLoadingFileHistory,
      updateFileHistoryError,
      updateOpenedDiffContext,
      updateOpenedCommitDiffStatusCode,
      updateHistoryEntries,
      updateDiffPreviewPanelState,
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
        updateBlameLines(cachedLines);
        updateBlameError(null);
        updateIsLoadingBlame(false);
        return;
      }

      updateIsLoadingBlame(true);
      updateBlameError(null);

      try {
        const payload = await getFileBlame(
          activeRepoId,
          context.filePath,
          context.source === "commit" ? context.commitHash : null
        );

        if (!payload) {
          updateBlameLines([]);
          updateBlameError("Error loading blame");
          return;
        }

        updateBlameLines(payload.lines);
        writeCachedValue(
          fileBlameCacheRef.current,
          cacheKey,
          payload.lines,
          DIFF_WORKSPACE_PAYLOAD_CACHE_LIMIT
        );
      } finally {
        updateIsLoadingBlame(false);
      }
    },
    [
      activeRepoId,
      getFileBlame,
      updateIsLoadingBlame,
      updateBlameLines,
      updateBlameError,
    ]
  );

  const loadEditSurface = useCallback(
    async (context: DiffPreviewOpenContext) => {
      if (!activeRepoId) {
        return;
      }

      updateIsLoadingEditBuffer(true);
      updateEditLoadError(null);

      if (hasUnsupportedWorkspaceTextEncoding) {
        updateEditBuffer("");
        updateEditInitialBuffer("");
        updateEditLoadError(UNSUPPORTED_ENCODING_MESSAGE);
        updateIsLoadingEditBuffer(false);
        return;
      }

      try {
        const text = await getFileText(
          activeRepoId,
          context.filePath,
          requestedWorkspaceEncoding
        );

        if (text === null) {
          updateEditBuffer("");
          updateEditInitialBuffer("");
          updateEditLoadError("Error loading file");
          return;
        }

        updateEditBuffer(text);
        updateEditInitialBuffer(text);
      } finally {
        updateIsLoadingEditBuffer(false);
      }
    },
    [
      activeRepoId,
      getFileText,
      hasUnsupportedWorkspaceTextEncoding,
      requestedWorkspaceEncoding,
      updateIsLoadingEditBuffer,
      updateEditLoadError,
      updateEditInitialBuffer,
      updateEditBuffer,
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

      updateWorkspaceMode(nextMode);
      await loadWorkspaceMode(openedDiffContext, nextMode);
    },
    [loadWorkspaceMode, openedDiffContext, updateWorkspaceMode]
  );

  const requestWorkspaceModeChange = useCallback(
    async (nextMode: DiffWorkspaceMode) => {
      if (nextMode === workspaceMode) {
        return;
      }

      if (isEditDirty) {
        updatePendingWorkspaceMode(nextMode);
        updatePendingOpenDiffContext(null);
        updatePendingCloseDiffPanel(false);
        updateIsUnsavedEditConfirmOpen(true);
        return;
      }

      await applyWorkspaceModeChange(nextMode);
    },
    [
      applyWorkspaceModeChange,
      isEditDirty,
      workspaceMode,
      updatePendingWorkspaceMode,
      updatePendingOpenDiffContext,
      updatePendingCloseDiffPanel,
      updateIsUnsavedEditConfirmOpen,
    ]
  );

  const handleSaveEditedFile = useCallback(async () => {
    if (!(activeRepoId && openedDiffContext) || isSavingEditBuffer) {
      return;
    }

    updateIsSavingEditBuffer(true);

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

      updateEditInitialBuffer(editBuffer);
      await runDiffPreviewPreflight(
        openedDiffContext,
        workspaceMode === "file" ? "file" : "diff"
      );
    } finally {
      updateIsSavingEditBuffer(false);
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
    updateIsSavingEditBuffer,
    updateEditInitialBuffer,
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
      updatePendingWorkspaceMode(initialMode);
      updatePendingOpenDiffContext({
        source: "working",
        mode: initialMode,
        filePath,
        item,
      });
      updatePendingCloseDiffPanel(false);
      updateIsUnsavedEditConfirmOpen(true);
      return;
    }

    updateWorkspaceMode(initialMode);
    updateWorkspaceFilePresentation(
      initialMode === "file" ? DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION : "code"
    );
    updateWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    updateIgnoreTrimWhitespace(false);
    updateOpenedCommitDiff(null);
    updateOpenedCommitDiffStatusCode(null);
    updateOpenedDiff(null);
    updateOpenedDiffPath(null);
    updateOpenedDiffStatusCode(null);
    updateActiveHunks([]);
    updateActiveHunkIndex(0);
    updateHistoryEntries([]);
    updateSelectedHistoryCommitHash(null);
    updateBlameLines([]);
    updateEditBuffer("");
    updateEditInitialBuffer("");
    updateEditLoadError(null);
    updatePendingOpenDiffContext(null);

    const nextContext: DiffPreviewOpenContext = {
      source: "working",
      mode: initialMode,
      filePath,
      item,
    };
    updateOpenedDiffContext(nextContext);
    updateDiffPreviewPanelState({ kind: "preflightLoading", path: filePath });
    updateIsLoadingDiffPath(filePath);

    try {
      await loadWorkspaceMode(nextContext, initialMode);
    } finally {
      updateIsLoadingDiffPath(null);
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
      updateWorkspaceFilePresentation(DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION);
      return;
    }

    updateWorkspaceFilePresentation("code");
  }, [isMarkdownPreviewableFile, updateWorkspaceFilePresentation]);

  useEffect(() => {
    if (!shouldMountDiffMonacoSurface) {
      openedDiffEditorRef.current = null;
      updateIsDiffEditorReady(false);
    }
  }, [shouldMountDiffMonacoSurface, updateIsDiffEditorReady]);

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

  const markDiffSurfaceRequested = useCallback(() => {
    if (shouldMountDiffMonacoSurface) {
      updateHasRequestedDiffSurface(true);
    }
  }, [shouldMountDiffMonacoSurface, updateHasRequestedDiffSurface]);

  useEffect(markDiffSurfaceRequested, [markDiffSurfaceRequested]);

  const markFileSurfaceRequested = useCallback(() => {
    if (shouldMountFileMonacoSurface) {
      updateHasRequestedFileSurface(true);
    }
  }, [shouldMountFileMonacoSurface, updateHasRequestedFileSurface]);

  useEffect(markFileSurfaceRequested, [markFileSurfaceRequested]);

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

    updateWorkspacePresentation(resolvedPresentation);
  }, [
    resolvedPresentation,
    workspacePresentation,
    updateWorkspacePresentation,
  ]);

  useEffect(() => {
    if (
      workspaceEncoding !== DIFF_WORKSPACE_GUESS_ENCODING_VALUE ||
      !openedDiffContext
    ) {
      return;
    }

    detectAndApplyGuessedWorkspaceEncoding(openedDiffContext).catch(() => {
      updateWorkspaceEncoding(DEFAULT_DIFF_WORKSPACE_ENCODING);
    });
  }, [
    detectAndApplyGuessedWorkspaceEncoding,
    openedDiffContext,
    workspaceEncoding,
    updateWorkspaceEncoding,
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
      updateDiffPreviewPanelState({
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

    updateOpenedDiffContext(nextContext);
    updateSelectedHistoryCommitHash(entry.commitHash);
    updateDiffPreviewPanelState({
      kind: "preflightLoading",
      path: nextContext.filePath,
    });
    await runDiffPreviewPreflight(nextContext, "diff");
  };

  const handleWorkspaceCloseRequest = useCallback(() => {
    if (isEditDirty) {
      updatePendingWorkspaceMode(null);
      updatePendingOpenDiffContext(null);
      updatePendingCloseDiffPanel(true);
      updateIsUnsavedEditConfirmOpen(true);
      return;
    }

    closeDiffPreviewPanel();
  }, [
    closeDiffPreviewPanel,
    isEditDirty,
    updatePendingWorkspaceMode,
    updatePendingOpenDiffContext,
    updatePendingCloseDiffPanel,
    updateIsUnsavedEditConfirmOpen,
  ]);

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
    updateIsUnsavedEditConfirmOpen(false);

    if (pendingCloseDiffPanel) {
      closeDiffPreviewPanel();
      return;
    }

    if (pendingOpenDiffContext) {
      const nextContext = pendingOpenDiffContext;
      updatePendingOpenDiffContext(null);
      updatePendingWorkspaceMode(null);
      updateWorkspaceMode(nextContext.mode);
      updateWorkspaceFilePresentation(
        nextContext.mode === "file"
          ? DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION
          : "code"
      );
      updateWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
      updateOpenedDiffContext(nextContext);
      updateDiffPreviewPanelState({
        kind: "preflightLoading",
        path: nextContext.filePath,
      });
      await runDiffPreviewPreflight(nextContext, nextContext.mode);
      return;
    }

    if (pendingWorkspaceMode) {
      const nextMode = pendingWorkspaceMode;
      updatePendingWorkspaceMode(null);
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
      updatePendingWorkspaceMode(initialMode);
      updatePendingOpenDiffContext({
        source: "commit",
        mode: initialMode,
        commitHash,
        filePath,
        status,
      });
      updatePendingCloseDiffPanel(false);
      updateIsUnsavedEditConfirmOpen(true);
      return;
    }

    updateWorkspaceMode(initialMode);
    updateWorkspaceFilePresentation(
      initialMode === "file" ? DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION : "code"
    );
    updateWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    updateIgnoreTrimWhitespace(false);
    updateOpenedDiff(null);
    updateOpenedDiffPath(null);
    updateOpenedDiffStatusCode(null);
    updateOpenedCommitDiff(null);
    updateOpenedCommitDiffStatusCode(null);
    updateActiveHunks([]);
    updateActiveHunkIndex(0);
    updateHistoryEntries([]);
    updateSelectedHistoryCommitHash(null);
    updateBlameLines([]);
    updateEditBuffer("");
    updateEditInitialBuffer("");
    updateEditLoadError(null);
    updatePendingOpenDiffContext(null);

    const nextContext: DiffPreviewOpenContext = {
      source: "commit",
      mode: initialMode,
      commitHash,
      filePath,
      status,
    };
    updateOpenedDiffContext(nextContext);
    updateDiffPreviewPanelState({ kind: "preflightLoading", path: filePath });

    updateIsLoadingCommitDiffPath(`${commitHash}:${filePath}`);

    try {
      await loadWorkspaceMode(nextContext, initialMode);
    } finally {
      updateIsLoadingCommitDiffPath(null);
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

    updateOpenedDiff(null);
    updateOpenedCommitDiff(null);
    updateOpenedDiffPath(null);
    updateOpenedDiffStatusCode(null);
    updateOpenedCommitDiffStatusCode(null);
    updateActiveHunks([]);
    updateHistoryEntries([]);
    updateSelectedHistoryCommitHash(null);
    updateBlameLines([]);
    updateEditBuffer("");
    updateEditInitialBuffer("");
    updateEditLoadError(null);
    updatePendingWorkspaceMode(null);
    updatePendingOpenDiffContext(null);
    updatePendingCloseDiffPanel(false);
    updateOpenedDiffContext(context);
    updateWorkspaceMode(mode);
    updateWorkspacePresentation(DEFAULT_DIFF_WORKSPACE_PRESENTATION);
    updateDiffPreviewPanelState({ kind: "preflightLoading", path: filePath });

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

    updateExpandedCommitTreeNodePaths((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };
  const collectExpandableCommitTreeKeys = (
    nodes: CommitFileTreeNode[],
    commitHash: string
  ): Record<string, boolean> =>
    collectExpandableCommitTreeKeysModel(
      nodes,
      commitHash,
      getCommitTreeNodeStateKey
    );
  const collapseCommitTree = (commitHash: string) => {
    updateExpandedCommitTreeNodePaths((current) => {
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
    updateExpandedCommitTreeNodePaths((current) => ({
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

  const getCommitTreeNodes = (
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
            ? getCommitTreeNodes(
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
  const getCommitPathRows = (
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
  const getChangeContextMenuContent = (
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
  const getChangeTreeNodes = (
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
                    ? getStatusBadges(item, "unstaged")
                    : getStatusBadges(item, section)}
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
              : getChangeContextMenuContent(item.path, section)}
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
              : getChangeContextMenuContent(node.fullPath, section, {
                  folderName: node.name,
                  isFolder: true,
                })}
          </ContextMenu>
          {hasChildren && isExpanded ? (
            <div>
              {getChangeTreeNodes(
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

  const getFlatChangeRows = (
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
                {getStatusBadges(item, section)}
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
          {getChangeContextMenuContent(item.path, section)}
        </ContextMenu>
      );
    }

    return renderedRows;
  };

  const getChangesSectionContent = (
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
          {getChangeTreeNodes(tree, section, 0, renderBudget)}
          {renderLimit < totalVisibleCount
            ? renderProgressiveLoadingMessage("files")
            : null}
        </>
      );
    }

    return (
      <>
        {getFlatChangeRows(items, section, renderBudget)}
        {renderLimit < totalVisibleCount
          ? renderProgressiveLoadingMessage("files")
          : null}
      </>
    );
  };
  const getAllFilesSectionContent = () => {
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
        {getChangeTreeNodes(allFilesTree, "all", 0, renderBudget)}
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
      updateIsRightSidebarOpen(false);
      return;
    }

    updateSelectedTimelineRowId(WORKING_TREE_ROW_ID);
    updateSelectedCommitId(WORKING_TREE_ROW_ID);
    if (!isWorkspaceAttributionMode) {
      updateIsRightSidebarOpen(true);
    }
  };

  const handleCommitRowClick = (commitHash: string) => {
    const isSameCommit = selectedTimelineRowId === commitHash;

    if (isSameCommit && isRightSidebarVisible) {
      updateIsRightSidebarOpen(false);
      return;
    }

    updateSelectedTimelineRowId(commitHash);
    updateSelectedCommitId(commitHash);
    if (!isWorkspaceAttributionMode) {
      updateIsRightSidebarOpen(true);
    }
  };

  const selectTimelineReferenceRow = useCallback(
    (rowId: string, anchorCommitHash: string, shouldScroll: boolean) => {
      const isSameRow = selectedTimelineRowId === rowId;

      if (isSameRow && isRightSidebarVisible) {
        updateIsRightSidebarOpen(false);
        return;
      }

      updateSelectedTimelineRowId(rowId);
      updateSelectedCommitId(anchorCommitHash);
      if (!isWorkspaceAttributionMode) {
        updateIsRightSidebarOpen(true);
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
      updateSelectedTimelineRowId,
      updateSelectedCommitId,
      updateIsRightSidebarOpen,
    ]
  );

  const focusSidebarEntryInGraph = useCallback(
    (entry: SidebarEntry) => {
      const rowId = getTimelineRowIdForEntry(entry);
      const anchorCommitHash = getCommitHashForEntry(entry);

      if (!(rowId && anchorCommitHash)) {
        return;
      }

      updateSelectedTimelineRowId(rowId);
      updateSelectedCommitId(anchorCommitHash);
      scrollTimelineRowIntoView(rowId);
    },
    [
      getCommitHashForEntry,
      getTimelineRowIdForEntry,
      scrollTimelineRowIntoView,
      updateSelectedTimelineRowId,
      updateSelectedCommitId,
    ]
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
    updateForcePushConfirmMode(mode);
    updateIsForcePushConfirmOpen(true);
  };

  const openPublishRepoConfirm = (
    action: (options: PublishRepositoryOptions) => Promise<void>
  ) => {
    pendingPublishPushActionRef.current = action;
    updatePublishRepoFormError(null);
    updateIsPublishRepoConfirmOpen(true);
  };

  const handleStageAll = async () => {
    if (!activeRepoId || isStagingAll || !hasUnstagedChanges) {
      return;
    }

    updateIsStagingAll(true);

    try {
      await stageAll(activeRepoId);
    } finally {
      updateIsStagingAll(false);
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

    updateIsGeneratingAiCommitMessage(true);
    aiCommitGenerationStatusMessageRef.current =
      "Preparing AI commit generation";
    aiCommitGenerationPreviewRef.current = "";
    updateAiCommitGenerationStatusMessage("Preparing AI commit generation");
    updateAiCommitGenerationPreview("");
    let generationSucceeded = false;

    try {
      const generatedCommit = await generateAiCommitMessage(activeRepoId, "");

      updateDraftCommitSummary(generatedCommit.title);
      updateDraftCommitDescription(generatedCommit.body);
      updateLastAiCommitGeneration({
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
      updateAiCommitGenerationStatusMessage(nextState.statusMessage);
      updateAiCommitGenerationPreview(nextState.preview);
      updateIsGeneratingAiCommitMessage(false);
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

    updateIsGeneratingAiRewordMessage(true);

    try {
      const generatedCommit = await generateAiCommitMessage(activeRepoId, "");

      updateRewordCommitSummary(generatedCommit.title);
      updateRewordCommitDescription(generatedCommit.body);
      updateLastAiRewordGeneration({
        promptMode: generatedCommit.promptMode,
        providerKind: generatedCommit.providerKind,
        schemaFallbackUsed: generatedCommit.schemaFallbackUsed,
      });
    } finally {
      updateIsGeneratingAiRewordMessage(false);
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

    updateIsCommitting(true);

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
      updateDraftCommitSummary("");
      updateDraftCommitDescription("");
      updateAmendPreviousCommit(false);
      updatePushAfterCommit(false);
      updateSkipCommitHooks(false);
      updateLastAiCommitGeneration(null);
      preAmendDraftRef.current = null;
    } finally {
      updateIsCommitting(false);
    }
  };

  const executeConfirmedForcePush = async () => {
    const pendingAction = pendingForcePushActionRef.current;

    if (!pendingAction) {
      updateIsForcePushConfirmOpen(false);
      return;
    }

    try {
      await pendingAction();
    } finally {
      pendingForcePushActionRef.current = null;
      updateIsForcePushConfirmOpen(false);
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
                      updateSidebarFilterInputValue(nextValue);
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
                            updateCollapsedGroupKeys((current) => ({
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
                            {getSidebarGroupSectionIcon(group.key)}
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
                              ? getSidebarBranchTreeNodes(
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
                      onClick={() => updatePullActionMode("fetch-all")}
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
                      onClick={() => updatePullActionMode("pull-ff-possible")}
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
                      onClick={() => updatePullActionMode("pull-ff-only")}
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
                      onClick={() => updatePullActionMode("pull-rebase")}
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
                              updateSelectedLauncherId(launcher.id);
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
                <div className="sticky top-0 z-40 flex items-center overflow-hidden border-border/60 border-b bg-background/95">
                  <div
                    className="grid min-w-0 flex-1 px-2 py-1 text-muted-foreground text-xs/3 uppercase tracking-wide"
                    style={{ gridTemplateColumns: timelineGridTemplateColumns }}
                  >
                    {timelineColumnDefinitions.map((column) => {
                      const compactHeaderIcon =
                        isTimelineMetadataCompact &&
                        (column.id === "author" ||
                          column.id === "dateTime" ||
                          column.id === "sha")
                          ? column.id
                          : null;

                      return (
                        <span
                          className={cn(
                            "flex items-center truncate px-2",
                            column.align === "center" || compactHeaderIcon
                              ? "justify-center"
                              : "justify-start"
                          )}
                          key={column.id}
                        >
                          {compactHeaderIcon ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="inline-flex items-center" />
                                }
                              >
                                {compactHeaderIcon === "author" ? (
                                  <UserCircleIcon className="size-3.5" />
                                ) : null}
                                {compactHeaderIcon === "dateTime" ? (
                                  <CalendarBlankIcon className="size-3.5" />
                                ) : null}
                                {compactHeaderIcon === "sha" ? (
                                  <HashIcon className="size-3.5" />
                                ) : null}
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                {column.label}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            column.label
                          )}
                        </span>
                      );
                    })}
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
                        {getTimelineCell(columnId, {
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
                                      updateNewBranchName(event.target.value)
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
                        "group relative z-10 grid w-full cursor-pointer items-center border-border/35 border-b px-2 text-left transition-colors",
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
                        height: TIMELINE_ROW_HEIGHT,
                      }}
                      type="button"
                    >
                      {timelineVisibleColumns.map((columnId) => (
                        <Fragment key={columnId}>
                          {getTimelineCell(columnId, {
                            commitMessageCell:
                              columnId === "commitMessage" ? (
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <Input
                                    className="h-6 w-full min-w-0 max-w-52"
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
                      {timelineVisibleColumns.includes("graph") ? (
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
                            getNodeContextMenu={
                              renderGraphNodeContextMenuContent
                            }
                            graphColumnWidth={effectiveTimelineGraphColumnWidth}
                            graphRows={graphRows}
                            onNodeHoverChange={updateHoveredGraphRowId}
                            onNodeMenuOpenChange={handleGraphNodeMenuOpenChange}
                            onNodeSelect={handleGraphNodeSelect}
                            rowHeight={TIMELINE_ROW_HEIGHT}
                            rows={graphRenderRows}
                            selectedRowId={selectedTimelineRowId}
                            visibleStartIndex={visibleTimelineStartIndex}
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
                          const commitTooltipText =
                            commitDescription.length > 0
                              ? `${commitTitle}\n\n${commitDescription}`
                              : commitTitle;
                          const laneColor =
                            commitColorByHash[item.hash] ??
                            currentBranchLaneColor;
                          const isPullableCommit =
                            item.syncState === "pullable";
                          const commitRefEntries = (
                            referenceModel.commitRefEntriesByCommitHash[
                              item.hash
                            ] ?? []
                          ).filter(
                            (entry) => !isReferenceHiddenInGraph(entry.name)
                          );
                          const isHoveredGraphRow =
                            hoveredGraphRowId === item.hash;
                          const firstVisibleCommitHash =
                            timelineCommits[0]?.hash ?? null;
                          const relatedCommitRefEntries = (
                            relatedReferenceEntriesByCommitHash[item.hash] ?? []
                          ).filter(
                            (entry) => !isReferenceHiddenInGraph(entry.name)
                          );
                          let visibleCommitRefEntries = commitRefEntries;

                          if (
                            visibleCommitRefEntries.length === 0 &&
                            isHoveredGraphRow
                          ) {
                            const [nearestReferenceGroup] =
                              groupTimelineReferenceEntries(
                                relatedCommitRefEntries
                              );

                            visibleCommitRefEntries =
                              nearestReferenceGroup?.entries ?? [];
                          }
                          const referenceCardOpacity =
                            isHoveredGraphRow &&
                            firstVisibleCommitHash !== item.hash
                              ? 0.5
                              : 1;

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
                                    "group relative z-10 grid w-full items-center border-border/35 border-b px-2 text-left transition-colors",
                                    selectedTimelineRowId === item.hash ||
                                      openCommitMenuHash === item.hash
                                      ? "bg-muted hover:bg-muted"
                                      : "hover:bg-muted/35"
                                  )}
                                  onClick={() => {
                                    handleCommitRowClick(item.hash);
                                  }}
                                  onMouseEnter={() => {
                                    updateHoveredGraphRowId(item.hash);
                                  }}
                                  onMouseLeave={() => {
                                    updateHoveredGraphRowId(null);
                                  }}
                                  ref={(element) => {
                                    setTimelineRowElement(item.hash, element);
                                  }}
                                  style={{
                                    gridTemplateColumns:
                                      timelineGridTemplateColumns,
                                    height: TIMELINE_ROW_HEIGHT,
                                  }}
                                  type="button"
                                >
                                  {timelineVisibleColumns.map((columnId) => (
                                    <Fragment key={columnId}>
                                      {getTimelineCell(columnId, {
                                        branchCell:
                                          columnId === "branch" ? (
                                            <div className="h-full min-w-0 overflow-visible pr-2">
                                              <TimelineReferenceCards
                                                entries={
                                                  visibleCommitRefEntries
                                                }
                                                isPullableCommit={
                                                  isPullableCommit
                                                }
                                                laneColor={laneColor}
                                                opacity={referenceCardOpacity}
                                              />
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
                                                <Tooltip>
                                                  <TooltipTrigger
                                                    render={
                                                      <p className="min-w-0 flex-1 truncate pr-2 text-xs leading-4" />
                                                    }
                                                  >
                                                    <span>{commitTitle}</span>
                                                    {commitDescription.length >
                                                    0 ? (
                                                      <span className="text-muted-foreground/80">
                                                        {" "}
                                                        {commitDescription}
                                                      </span>
                                                    ) : null}
                                                  </TooltipTrigger>
                                                  {commitTooltipText.length >
                                                  0 ? (
                                                    <TooltipContent
                                                      className="max-w-lg whitespace-pre-wrap text-left"
                                                      side="bottom"
                                                    >
                                                      {commitTooltipText}
                                                    </TooltipContent>
                                                  ) : null}
                                                </Tooltip>
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

                        const laneColor =
                          rowColorById[row.id] ??
                          (row.anchorCommitHash
                            ? commitColorByHash[row.anchorCommitHash]
                            : undefined) ??
                          currentBranchLaneColor;
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
                              "group relative z-10 grid w-full items-center border-border/35 border-b px-2 text-left transition-colors",
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
                              height: TIMELINE_ROW_HEIGHT,
                            }}
                            type="button"
                          >
                            {timelineVisibleColumns.map((columnId) => (
                              <Fragment key={columnId}>
                                {getTimelineCell(columnId, {
                                  branchCell:
                                    columnId === "branch" ? (
                                      <div className="min-w-0 truncate pr-2">
                                        {row.type === "tag" ? (
                                          <span
                                            className="inline-flex min-w-0 max-w-24 shrink items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-xs leading-none"
                                            style={{
                                              borderColor: `${laneColor}80`,
                                            }}
                                          >
                                            <TagIcon className="size-2.5 shrink-0" />
                                            <span className="truncate">
                                              {rowLabel}
                                            </span>
                                          </span>
                                        ) : null}
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
                            {getEntryContextMenuContent(timelineEntry)}
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
                      updateWorkspaceEncoding(
                        resolveDiffWorkspaceEncodingValue(encoding)
                      );
                    }}
                    onMarkdownFilePresentationChange={(mode) => {
                      updateWorkspaceFilePresentation(mode);
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

                      updateWorkspacePresentation(mode);
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
                        updateWorkspaceFilePresentation(
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
                      updateIgnoreTrimWhitespace((current) => !current);
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
                            openedFileEditorRef.current =
                              editor as CodeMirrorEditorViewLike;
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
                                  onChange={updateEditBuffer}
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
                                    {lastAiRewordGenerationDisplayState ? (
                                      <span className="inline-flex items-center rounded border border-border/70 px-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
                                        {
                                          lastAiRewordGenerationDisplayState.badgeLabel
                                        }
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
                                    updateRewordCommitSummary(
                                      event.target.value
                                    );
                                    updateLastAiRewordGeneration(null);
                                  }}
                                  placeholder="Describe your changes"
                                  value={rewordCommitSummary}
                                />
                              </div>
                              {lastAiRewordGenerationDisplayState?.contextNote ? (
                                <p className="text-[11px] text-muted-foreground leading-4">
                                  {
                                    lastAiRewordGenerationDisplayState.contextNote
                                  }
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
                                    updateRewordCommitDescription(
                                      event.target.value
                                    );
                                    updateLastAiRewordGeneration(null);
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
                                    updateIsEditingSelectedCommitMessage(false);
                                    updateLastAiRewordGeneration(null);
                                    updateRewordCommitSummary(
                                      selectedCommit.messageSummary
                                    );
                                    updateRewordCommitDescription(
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
                                    updateIsEditingSelectedCommitMessage(true);
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
                                        updateCommitFileSortOrder((current) =>
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
                                      updateCommitDetailsViewMode("path")
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
                                    updateCommitDetailsViewMode("tree")
                                  }
                                  type="button"
                                >
                                  Tree
                                </button>
                              </div>
                            </div>
                            <label
                              className="inline-flex items-center gap-2 text-muted-foreground text-xs"
                              htmlFor="commit-file-panel-show-all-files"
                            >
                              <Checkbox
                                checked={showAllCommitFiles}
                                className="shrink-0"
                                id="commit-file-panel-show-all-files"
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
                                          updateCommitFileFilterInputValue(
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
                                            {getCommitTreeNodes(
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
                                          {getCommitPathRows(
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
                                          updateCommitFileSortOrder(
                                            (current) =>
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
                                        updateCommitDetailsViewMode("path")
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
                                      updateCommitDetailsViewMode("tree")
                                    }
                                    type="button"
                                  >
                                    Tree
                                  </button>
                                </div>
                              </div>
                              <label
                                className="inline-flex items-center gap-2 text-muted-foreground text-xs"
                                htmlFor="commit-details-panel-show-all-files"
                              >
                                <Checkbox
                                  checked={showAllCommitFiles}
                                  className="shrink-0"
                                  id="commit-details-panel-show-all-files"
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
                                    updateCommitFileFilterInputValue(
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
                                      {getCommitTreeNodes(
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
                                    {getCommitPathRows(
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

                if (!isWorkingTreeSelection && selectedTimelineRowId !== null) {
                  return (
                    <div className="px-2.5 py-3 text-muted-foreground text-xs">
                      Loading repository details...
                    </div>
                  );
                }

                if (selectedTimelineRowId === null && isLoadingHistory) {
                  return (
                    <div className="px-2.5 py-3 text-muted-foreground text-xs">
                      Loading repository details...
                    </div>
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
                          onClick={() => updateIsDiscardAllConfirmOpen(true)}
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
                                {getAllFilesSectionContent()}
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
                                    {getChangesSectionContent(
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
                                    {getChangesSectionContent(
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
                              {lastAiCommitGenerationDisplayState ? (
                                <span className="inline-flex items-center rounded border border-border/70 px-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
                                  {
                                    lastAiCommitGenerationDisplayState.badgeLabel
                                  }
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
                              updateDraftCommitSummary(event.target.value);
                              updateLastAiCommitGeneration(null);
                            }}
                            placeholder="Describe your changes"
                            ref={commitSummaryInputRef}
                            value={draftCommitSummary}
                          />
                          {lastAiCommitGenerationDisplayState?.contextNote ? (
                            <p className="text-[11px] text-muted-foreground leading-4">
                              {lastAiCommitGenerationDisplayState.contextNote}
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
                              updateDraftCommitDescription(event.target.value);
                              updateLastAiCommitGeneration(null);
                            }}
                            placeholder="Optional details..."
                            value={draftCommitDescription}
                          />
                        </div>
                        <div className="mt-3 border border-border/70 px-3 py-2">
                          <button
                            className="focus-visible:desktop-focus inline-flex items-center gap-1 font-medium text-muted-foreground text-xs"
                            onClick={() =>
                              updateIsCommitOptionsCollapsed(
                                (current) => !current
                              )
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
                              <label
                                className="inline-flex min-h-5 items-center gap-2 text-xs"
                                htmlFor="commit-option-amend-previous"
                              >
                                <Checkbox
                                  checked={amendPreviousCommit}
                                  className="shrink-0"
                                  id="commit-option-amend-previous"
                                  onCheckedChange={(checked) => {
                                    const shouldAmend = checked === true;
                                    updateAmendPreviousCommit(shouldAmend);

                                    if (!shouldAmend) {
                                      const previousDraft =
                                        preAmendDraftRef.current;

                                      if (previousDraft) {
                                        updateDraftCommitSummary(
                                          previousDraft.summary
                                        );
                                        updateDraftCommitDescription(
                                          previousDraft.description
                                        );
                                      } else {
                                        updateDraftCommitSummary("");
                                        updateDraftCommitDescription("");
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

                                        updateDraftCommitSummary(
                                          latestCommitMessage.summary
                                        );
                                        updateDraftCommitDescription(
                                          latestCommitMessage.description
                                        );
                                      })
                                      .catch(() => undefined);
                                  }}
                                />
                                Amend previous commit
                              </label>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <label
                                  className="inline-flex min-h-5 items-center gap-2 text-xs"
                                  htmlFor="commit-option-push-after"
                                >
                                  <Checkbox
                                    checked={pushAfterCommit}
                                    className="shrink-0"
                                    id="commit-option-push-after"
                                    onCheckedChange={(checked) =>
                                      updatePushAfterCommit(checked === true)
                                    }
                                  />
                                  Push after committing
                                </label>
                                <label
                                  className="inline-flex min-h-5 items-center gap-2 text-xs"
                                  htmlFor="commit-option-skip-hooks"
                                >
                                  <Checkbox
                                    checked={skipCommitHooks}
                                    className="shrink-0"
                                    id="commit-option-skip-hooks"
                                    onCheckedChange={(checked) =>
                                      updateSkipCommitHooks(checked === true)
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

          updateIsRenameBranchDialogOpen(open);

          if (!open) {
            updateRenameBranchSourceName(null);
            updateRenameBranchTargetName("");
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
                updateRenameBranchTargetName(event.target.value)
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
                updateIsRenameBranchDialogOpen(false);
                updateRenameBranchSourceName(null);
                updateRenameBranchTargetName("");
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

          updateIsSetUpstreamDialogOpen(open);

          if (!open) {
            updateSetUpstreamLocalBranchName(null);
            updateSetUpstreamRemoteName("");
            updateSetUpstreamRemoteBranchName("");
            updateSetUpstreamFormError(null);
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
                  updateSetUpstreamRemoteName(value ?? "");
                  updateSetUpstreamFormError(null);
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
                  updateSetUpstreamRemoteBranchName(event.target.value);
                  updateSetUpstreamFormError(null);
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
                updateIsSetUpstreamDialogOpen(false);
                updateSetUpstreamLocalBranchName(null);
                updateSetUpstreamRemoteName("");
                updateSetUpstreamRemoteBranchName("");
                updateSetUpstreamFormError(null);
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

          updateIsCreateRefBranchDialogOpen(open);

          if (!open) {
            updateCreateRefBranchTarget(null);
            updateCreateRefBranchLabel("");
            updateCreateRefBranchName("");
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
                updateCreateRefBranchName(event.target.value);
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
                updateIsCreateRefBranchDialogOpen(false);
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

          updateIsCreateTagDialogOpen(open);

          if (!open) {
            updateCreateTagTarget(null);
            updateCreateTagTargetLabel("");
            updateCreateTagNameValue("");
            updateCreateTagAnnotated(false);
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
                updateCreateTagNameValue(event.target.value);
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
                updateIsCreateTagDialogOpen(false);
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

          updateIsSubmittingPublishRepo(true);
          updatePublishRepoFormError(null);

          try {
            await pendingAction(publishOptions);
            pendingPublishPushActionRef.current = null;
            updateIsPublishRepoConfirmOpen(false);
          } catch (error) {
            updatePublishRepoFormError(getErrorMessage(error));
            throw error;
          } finally {
            updateIsSubmittingPublishRepo(false);
          }
        }}
        onOpenChange={(open) => {
          if (isSubmittingPublishRepo && !open) {
            return;
          }

          updateIsPublishRepoConfirmOpen(open);

          if (!open) {
            pendingPublishPushActionRef.current = null;
            updatePublishRepoFormError(null);
          }
        }}
        open={isPublishRepoConfirmOpen}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (isResettingToReference && !open) {
            return;
          }

          updateIsResetConfirmOpen(open);

          if (!open) {
            updateResetTarget(null);
            updateResetTargetLabel("");
            updateResetTargetMode("mixed");
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

          updateIsDropCommitConfirmOpen(open);

          if (!open) {
            updatePendingDropCommitHash(null);
            updatePendingDropCommitLabel("");
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
          updateIsUnsavedEditConfirmOpen(open);

          if (!open) {
            updatePendingWorkspaceMode(null);
            updatePendingOpenDiffContext(null);
            updatePendingCloseDiffPanel(false);
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

          updateIsDiscardAllConfirmOpen(open);
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

          updateIsDeleteBranchConfirmOpen(open);

          if (!open) {
            updatePendingDeleteBranchName(null);
            updatePendingDeleteBranchRemoteName(null);
            updateIsDeleteRemoteBranch(false);
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

          updateIsForcePushConfirmOpen(open);

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
