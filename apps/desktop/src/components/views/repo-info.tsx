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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@litgit/ui/components/combobox";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@litgit/ui/components/input-group";
import { Label } from "@litgit/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CircleIcon,
  DotOutlineIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  GearIcon,
  GitBranchIcon,
  GithubLogoIcon,
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
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useSearch } from "@tanstack/react-router";
import { intlFormat } from "date-fns";
import type { editor as MonacoEditor } from "monaco-editor";
import { useTheme } from "next-themes";
import {
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
import { IntegratedTerminalPanel } from "@/components/terminal/integrated-terminal-panel";
import {
  type GitTimelineRow,
  getCommitLaneColor,
  resolveGitGraphColumnWidth,
  TIMELINE_BRANCH_COLUMN_WIDTH,
} from "@/components/views/git-graph-layout";
import { GitGraphOverlay } from "@/components/views/git-graph-overlay";
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
import { buildMonacoModelBasePath } from "@/components/views/repo-info/diff-workspace-monaco-model";
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
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import { getRuntimePlatform } from "@/lib/runtime-platform";
import {
  DEFAULT_REPO_FILE_BROWSER_STATE,
  type RepoFileBrowserSortOrder,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
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
  RepositoryFileEntry,
  RepositoryFileHistoryEntry,
  RepositoryFileHunk,
  RepositoryFilePreflight,
  RepositoryStash,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

interface SidebarEntry {
  active?: boolean;
  isRemote?: boolean;
  name: string;
  pendingPushCount?: number;
  pendingSyncCount?: number;
  searchName: string;
  stashMessage?: string;
  stashRef?: string;
  type: "branch" | "stash" | "tag";
}

interface SidebarGroupItem {
  count: number;
  entries: SidebarEntry[];
  key: string;
  name: string;
}

interface TimelineReferenceRowData {
  anchorCommitHash: string;
  id: string;
  label: string;
  type: "stash" | "tag";
}

interface BranchComboboxOption {
  isRemote: boolean;
  name: string;
}

interface ChangeTreeNode {
  children: Map<string, ChangeTreeNode>;
  fullPath: string;
  item: RepositoryWorkingTreeItem | null;
  name: string;
}

interface CommitFileTreeNode {
  children: Map<string, CommitFileTreeNode>;
  file: RepositoryCommitFile | null;
  fullPath: string;
  name: string;
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

const LazyDiffPreviewMonacoSurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-preview-monaco-surface"
  );

  return {
    default: module.DiffPreviewMonacoSurface,
  };
});

const LazyDiffWorkspaceMonacoFileSurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-workspace-monaco-file-surface"
  );

  return {
    default: module.DiffWorkspaceMonacoFileSurface,
  };
});

const LazyDiffWorkspaceMonacoEditSurface = lazy(async () => {
  const module = await import(
    "@/components/views/repo-info/diff-workspace-monaco-edit-surface"
  );

  return {
    default: module.DiffWorkspaceMonacoEditSurface,
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

function resolveTagNameFromCommitRef(rawReference: string): string | null {
  const trimmedReference = rawReference.trim();

  if (!trimmedReference.startsWith("tag: ")) {
    return null;
  }

  return normalizeCommitRefLabel(trimmedReference);
}

const TREE_STATUS_SUMMARY_ORDER = ["M", "A", "D", "R", "C", "U", "T", "?"];
const GITHUB_NOREPLY_EMAIL_SUFFIX = "@users.noreply.github.com";
const ASCII_DIGITS_PATTERN = /^\d+$/;
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

function isValidGitHubUsername(username: string): boolean {
  const length = username.length;

  if (length === 0 || length > 39) {
    return false;
  }

  if (username.startsWith("-") || username.endsWith("-")) {
    return false;
  }

  for (const character of username) {
    const isAlphabet =
      (character >= "a" && character <= "z") ||
      (character >= "A" && character <= "Z");
    const isDigit = character >= "0" && character <= "9";

    if (!(isAlphabet || isDigit || character === "-")) {
      return false;
    }
  }

  return true;
}

function resolveGitHubAvatarFromIdentityEmail(
  email: string | null
): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  if (!normalizedEmail.endsWith(GITHUB_NOREPLY_EMAIL_SUFFIX)) {
    return null;
  }

  const localPart = normalizedEmail.slice(
    0,
    -GITHUB_NOREPLY_EMAIL_SUFFIX.length
  );

  if (localPart.length === 0) {
    return null;
  }

  const plusSeparatorIndex = localPart.indexOf("+");

  if (plusSeparatorIndex >= 0) {
    const left = localPart.slice(0, plusSeparatorIndex);
    const right = localPart.slice(plusSeparatorIndex + 1);
    let username: string | null = null;

    if (isValidGitHubUsername(right)) {
      username = right;
    } else if (isValidGitHubUsername(left)) {
      username = left;
    }

    if (ASCII_DIGITS_PATTERN.test(left)) {
      return `https://avatars.githubusercontent.com/u/${left}?v=4`;
    }

    return username ? `https://github.com/${username}.png` : null;
  }

  if (isValidGitHubUsername(localPart)) {
    return `https://github.com/${localPart}.png`;
  }

  return null;
}

function resolveWipAuthorAvatarUrl(
  commits: RepositoryCommit[],
  identityEmail: string | null,
  identityName: string | null
): string | null {
  const normalizedIdentityEmail = identityEmail?.trim().toLowerCase() ?? "";

  if (normalizedIdentityEmail.length > 0) {
    for (const commit of commits) {
      if (!(commit.authorAvatarUrl && commit.authorEmail)) {
        continue;
      }

      if (commit.authorEmail.trim().toLowerCase() === normalizedIdentityEmail) {
        return commit.authorAvatarUrl;
      }
    }
  }

  const normalizedIdentityName = identityName?.trim().toLowerCase() ?? "";

  if (normalizedIdentityName.length > 0) {
    for (const commit of commits) {
      if (!commit.authorAvatarUrl) {
        continue;
      }

      if (commit.author.trim().toLowerCase() === normalizedIdentityName) {
        return commit.authorAvatarUrl;
      }
    }
  }

  return resolveGitHubAvatarFromIdentityEmail(identityEmail);
}

function createEmptyTreeNode(name: string, fullPath: string): ChangeTreeNode {
  return {
    children: new Map<string, ChangeTreeNode>(),
    fullPath,
    item: null,
    name,
  };
}

function buildRepositoryFileTree(
  files: RepositoryFileEntry[],
  workingTreeItemByPath: Map<string, RepositoryWorkingTreeItem>,
  sortOrder: RepoFileBrowserSortOrder
): ChangeTreeNode[] {
  const items = files.map((file) => ({
    ...(workingTreeItemByPath.get(file.path) ?? {
      isUntracked: false,
      path: file.path,
      stagedStatus: " ",
      unstagedStatus: " ",
    }),
  })) satisfies RepositoryWorkingTreeItem[];

  return buildChangeTree(items, sortOrder);
}

function buildChangeTree(
  items: RepositoryWorkingTreeItem[],
  sortOrder: RepoFileBrowserSortOrder = "asc"
): ChangeTreeNode[] {
  const root = createEmptyTreeNode("", "");

  for (const item of items) {
    const normalizedPath = item.path.replaceAll("\\", "/");
    const segments = normalizedPath
      .split("/")
      .filter((segment) => segment.length > 0);

    let cursor = root;
    let segmentPath = "";

    for (const segment of segments) {
      segmentPath =
        segmentPath.length > 0 ? `${segmentPath}/${segment}` : segment;
      const existing = cursor.children.get(segment);

      if (existing) {
        cursor = existing;
        continue;
      }

      const nextNode = createEmptyTreeNode(segment, segmentPath);
      cursor.children.set(segment, nextNode);
      cursor = nextNode;
    }

    cursor.item = item;
  }

  const toSortedArray = (node: ChangeTreeNode): ChangeTreeNode[] =>
    Array.from(node.children.values())
      .map((childNode) => ({
        ...childNode,
        children: new Map(
          toSortedArray(childNode).map((entry) => [entry.name, entry])
        ),
      }))
      .sort((left, right) => {
        const leftIsFolder = left.item === null;
        const rightIsFolder = right.item === null;

        if (leftIsFolder !== rightIsFolder) {
          return leftIsFolder ? -1 : 1;
        }

        const comparison = left.name.localeCompare(right.name);

        return sortOrder === "asc" ? comparison : comparison * -1;
      });

  return toSortedArray(root);
}

function createEmptyCommitTreeNode(
  name: string,
  fullPath: string
): CommitFileTreeNode {
  return {
    children: new Map<string, CommitFileTreeNode>(),
    file: null,
    fullPath,
    name,
  };
}

function buildCommitFileTree(
  files: RepositoryCommitFile[],
  sortOrder: RepoFileBrowserSortOrder = "asc"
): CommitFileTreeNode[] {
  const root = createEmptyCommitTreeNode("", "");

  for (const file of files) {
    const normalizedPath = file.path.replaceAll("\\", "/");
    const segments = normalizedPath
      .split("/")
      .filter((segment) => segment.length > 0);

    let cursor = root;
    let segmentPath = "";

    for (const segment of segments) {
      segmentPath =
        segmentPath.length > 0 ? `${segmentPath}/${segment}` : segment;
      const existing = cursor.children.get(segment);

      if (existing) {
        cursor = existing;
        continue;
      }

      const nextNode = createEmptyCommitTreeNode(segment, segmentPath);
      cursor.children.set(segment, nextNode);
      cursor = nextNode;
    }

    cursor.file = file;
  }

  const toSortedArray = (node: CommitFileTreeNode): CommitFileTreeNode[] =>
    Array.from(node.children.values())
      .map((childNode) => ({
        ...childNode,
        children: new Map(
          toSortedArray(childNode).map((entry) => [entry.name, entry])
        ),
      }))
      .sort((left, right) => {
        const leftIsFolder = left.file === null;
        const rightIsFolder = right.file === null;

        if (leftIsFolder !== rightIsFolder) {
          return leftIsFolder ? -1 : 1;
        }

        const comparison = left.name.localeCompare(right.name);

        return sortOrder === "asc" ? comparison : comparison * -1;
      });

  return toSortedArray(root);
}

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;
const STASH_MESSAGE_SECTION_BREAK_PATTERN = /\r?\n\r?\n/;
const WORKING_TREE_ROW_ID = "__working_tree__";
const FILE_EXTENSION_PATTERN = /\.([a-z0-9]+)$/i;
const TIMELINE_ROW_HEIGHT = 44;
const TIMELINE_GRAPH_COLUMN_MIN_WIDTH = 60;
const TIMELINE_GRAPH_COLUMN_MAX_WIDTH = 320;
const TIMELINE_COMMIT_MESSAGE_BAR_WIDTH = 3;
const TIMELINE_COMMIT_MESSAGE_BAR_GAP = 8;
const TIMELINE_AUTO_COMPACT_BREAKPOINT = 1200;

const MONACO_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rs: "rust",
  sh: "shell",
  sql: "sql",
  svg: "xml",
  ts: "typescript",
  tsx: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const resolveSystemMonacoEol = (): MonacoEditor.EndOfLineSequence => {
  if (getRuntimePlatform() === "windows") {
    return 1;
  }

  return 0;
};

const resolveMonacoEol = (
  preference: "system" | "lf" | "crlf"
): MonacoEditor.EndOfLineSequence => {
  if (preference === "lf") {
    return 0;
  }

  if (preference === "crlf") {
    return 1;
  }

  return resolveSystemMonacoEol();
};

const applyDiffEditorPreferences = (
  editor: MonacoEditor.IStandaloneDiffEditor,
  lineNumbers: "on" | "off",
  tabSize: number,
  eolPreference: "system" | "lf" | "crlf"
) => {
  editor.getOriginalEditor().updateOptions({
    lineNumbers,
    tabSize,
  });
  editor.getModifiedEditor().updateOptions({
    lineNumbers,
    tabSize,
  });
  const eol = resolveMonacoEol(eolPreference);

  editor.getOriginalEditor().getModel()?.setEOL(eol);
  editor.getModifiedEditor().getModel()?.setEOL(eol);
};

const applyCodeEditorPreferences = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumbers: "on" | "off",
  tabSize: number,
  eolPreference: "system" | "lf" | "crlf"
) => {
  editor.updateOptions({
    lineNumbers,
    tabSize,
  });

  const eol = resolveMonacoEol(eolPreference);
  editor.getModel()?.setEOL(eol);
};

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

function resolveMonacoLanguage(filePath: string): string {
  const normalizedPath = filePath.toLowerCase();
  const extension = FILE_EXTENSION_PATTERN.exec(normalizedPath)?.[1] ?? "";

  if (extension.length === 0) {
    return "plaintext";
  }

  return MONACO_LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
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

function resolvePublishRepositoryNameError(name: string): string | null {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return "Repository name is required.";
  }

  if (trimmedName === "." || trimmedName === "..") {
    return "Repository name must be more specific.";
  }

  if (trimmedName.includes("/") || trimmedName.includes("\\")) {
    return "Repository name cannot contain path separators.";
  }

  if (
    [...trimmedName].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      return (
        character === "<" ||
        character === ">" ||
        character === ":" ||
        character === '"' ||
        character === "|" ||
        character === "?" ||
        character === "*" ||
        codePoint < 32
      );
    })
  ) {
    return "Repository name contains unsupported characters.";
  }

  return null;
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
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const repoCommits = useRepoStore((state) => state.repoCommits);
  const repoBranches = useRepoStore((state) => state.repoBranches);
  const repoStashes = useRepoStore((state) => state.repoStashes);
  const repoRemoteNames = useRepoStore((state) => state.repoRemoteNames);
  const repoWorkingTreeItems = useRepoStore(
    (state) => state.repoWorkingTreeItems
  );
  const repoFilesById = useRepoStore((state) => state.repoFilesById);
  const repoGitIdentities = useRepoStore((state) => state.repoGitIdentities);
  const isLoadingBranches = useRepoStore((state) => state.isLoadingBranches);
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const isLoadingStatus = useRepoStore((state) => state.isLoadingStatus);
  const isLoadingWip = useRepoStore((state) => state.isLoadingWip);
  const createBranch = useRepoStore((state) => state.createBranch);
  const createBranchAtReference = useRepoStore(
    (state) => state.createBranchAtReference
  );
  const createTag = useRepoStore((state) => state.createTag);
  const deleteBranch = useRepoStore((state) => state.deleteBranch);
  const deleteRemoteBranch = useRepoStore((state) => state.deleteRemoteBranch);
  const renameBranch = useRepoStore((state) => state.renameBranch);
  const checkoutCommit = useRepoStore((state) => state.checkoutCommit);
  const cherryPickCommit = useRepoStore((state) => state.cherryPickCommit);
  const revertCommit = useRepoStore((state) => state.revertCommit);
  const resetToReference = useRepoStore((state) => state.resetToReference);
  const setBranchUpstream = useRepoStore((state) => state.setBranchUpstream);
  const switchBranch = useRepoStore((state) => state.switchBranch);
  const applyStash = useRepoStore((state) => state.applyStash);
  const createStash = useRepoStore((state) => state.createStash);
  const popStash = useRepoStore((state) => state.popStash);
  const dropStash = useRepoStore((state) => state.dropStash);
  const addIgnoreRule = useRepoStore((state) => state.addIgnoreRule);
  const stageAll = useRepoStore((state) => state.stageAll);
  const unstageAll = useRepoStore((state) => state.unstageAll);
  const stageFile = useRepoStore((state) => state.stageFile);
  const unstageFile = useRepoStore((state) => state.unstageFile);
  const getFilePreflight = useRepoStore((state) => state.getFilePreflight);
  const getFileContent = useRepoStore((state) => state.getFileContent);
  const getFileHunks = useRepoStore((state) => state.getFileHunks);
  const getFileHistory = useRepoStore((state) => state.getFileHistory);
  const getFileBlame = useRepoStore((state) => state.getFileBlame);
  const getFileDetectedEncoding = useRepoStore(
    (state) => state.getFileDetectedEncoding
  );
  const getFileText = useRepoStore((state) => state.getFileText);
  const saveFileText = useRepoStore((state) => state.saveFileText);
  const getRepositoryFiles = useRepoStore((state) => state.getRepositoryFiles);
  const getLatestCommitMessage = useRepoStore(
    (state) => state.getLatestCommitMessage
  );
  const generateAiCommitMessage = useRepoStore(
    (state) => state.generateAiCommitMessage
  );
  const getCommitFiles = useRepoStore((state) => state.getCommitFiles);
  const getCommitFilePreflight = useRepoStore(
    (state) => state.getCommitFilePreflight
  );
  const getCommitFileContent = useRepoStore(
    (state) => state.getCommitFileContent
  );
  const getCommitFileHunks = useRepoStore((state) => state.getCommitFileHunks);
  const discardAllChanges = useRepoStore((state) => state.discardAllChanges);
  const discardPathChanges = useRepoStore((state) => state.discardPathChanges);
  const commitChanges = useRepoStore((state) => state.commitChanges);
  const pullBranch = useRepoStore((state) => state.pullBranch);
  const mergeReference = useRepoStore((state) => state.mergeReference);
  const pushBranch = useRepoStore((state) => state.pushBranch);
  const undoRepoAction = useRepoStore((state) => state.undoRepoAction);
  const redoRepoAction = useRepoStore((state) => state.redoRepoAction);
  const repoUndoDepthById = useRepoStore((state) => state.repoUndoDepthById);
  const repoRedoDepthById = useRepoStore((state) => state.repoRedoDepthById);
  const repoUndoLabelById = useRepoStore((state) => state.repoUndoLabelById);
  const repoRedoLabelById = useRepoStore((state) => state.repoRedoLabelById);
  const repoCommitDraftPrefillById = useRepoStore(
    (state) => state.repoCommitDraftPrefillById
  );
  const clearRepoCommitDraftPrefill = useRepoStore(
    (state) => state.clearRepoCommitDraftPrefill
  );
  const repoHistoryRewriteHintById = useRepoStore(
    (state) => state.repoHistoryRewriteHintById
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
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
  const [timelineGraphColumnWidth, setTimelineGraphColumnWidth] = useState<
    number | null
  >(null);
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
  const [publishRepoName, setPublishRepoName] = useState("");
  const [publishRepoVisibility, setPublishRepoVisibility] = useState<
    "private" | "public"
  >("private");
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
  const [hasRequestedEditSurface, setHasRequestedEditSurface] = useState(false);
  const [openedDiff, setOpenedDiff] = useState<RepositoryFileDiff | null>(null);
  const [openedDiffPath, setOpenedDiffPath] = useState<string | null>(null);
  const [openedDiffStatusCode, setOpenedDiffStatusCode] = useState<
    string | null
  >(null);
  const [activeHunks, setActiveHunks] = useState<RepositoryFileHunk[]>([]);
  const [_activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [isLoadingHunks, setIsLoadingHunks] = useState(false);
  const [hunkLoadError, setHunkLoadError] = useState<string | null>(null);
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
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const editorPreferences = usePreferencesStore((state) => state.editor);
  const openedDiffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(
    null
  );
  const openedFileEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(
    null
  );
  const openedEditEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(
    null
  );
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
  const commits = useMemo<RepositoryCommit[]>(
    () => (activeRepoId ? (repoCommits[activeRepoId] ?? []) : []),
    [activeRepoId, repoCommits]
  );
  const localHeadCommit = useMemo(() => resolveHeadCommit(commits), [commits]);
  const activeRepoIdentity = activeRepoId
    ? (repoGitIdentities[activeRepoId] ?? null)
    : null;
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
        commits,
        preferredWipEmail,
        preferredWipRawName
      ),
    [commits, preferredWipEmail, preferredWipRawName]
  );
  const branches = useMemo(
    () => (activeRepoId ? (repoBranches[activeRepoId] ?? []) : []),
    [activeRepoId, repoBranches]
  );
  const stashes = useMemo<RepositoryStash[]>(
    () => (activeRepoId ? (repoStashes[activeRepoId] ?? []) : []),
    [activeRepoId, repoStashes]
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

  const workingTreeItems = useMemo<RepositoryWorkingTreeItem[]>(
    () => (activeRepoId ? (repoWorkingTreeItems[activeRepoId] ?? []) : []),
    [activeRepoId, repoWorkingTreeItems]
  );
  const allRepositoryFiles = useMemo<RepositoryFileEntry[]>(
    () => (activeRepoId ? (repoFilesById[activeRepoId] ?? []) : []),
    [activeRepoId, repoFilesById]
  );
  const changesViewMode = repoFileBrowserPreferences.viewMode;
  const isUnstagedSectionCollapsed =
    repoFileBrowserPreferences.isUnstagedSectionCollapsed;
  const isStagedSectionCollapsed =
    repoFileBrowserPreferences.isStagedSectionCollapsed;
  const expandedTreeNodePaths =
    repoFileBrowserPreferences.expandedTreeNodePaths;
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
  const activeRepoRemoteNames = useMemo(
    () => (activeRepoId ? (repoRemoteNames[activeRepoId] ?? []) : []),
    [activeRepoId, repoRemoteNames]
  );
  const hasRemoteConfigured = activeRepoRemoteNames.length > 0;
  const canUndoAction = activeRepoId
    ? (repoUndoDepthById[activeRepoId] ?? 0) > 0
    : false;
  const canRedoAction = activeRepoId
    ? (repoRedoDepthById[activeRepoId] ?? 0) > 0
    : false;
  const undoActionLabel = activeRepoId
    ? (repoUndoLabelById[activeRepoId] ?? null)
    : null;
  const redoActionLabel = activeRepoId
    ? (repoRedoLabelById[activeRepoId] ?? null)
    : null;
  const requiresForcePushAfterHistoryRewrite = activeRepoId
    ? (repoHistoryRewriteHintById[activeRepoId] ?? false)
    : false;
  const unstagedTree = useMemo(
    () => buildChangeTree(unstagedItems, fileTreeSortOrder),
    [fileTreeSortOrder, unstagedItems]
  );
  const stagedTree = useMemo(
    () => buildChangeTree(stagedItems, fileTreeSortOrder),
    [fileTreeSortOrder, stagedItems]
  );
  const normalizedRepositoryFileFilter = debouncedRepositoryFileFilterInputValue
    .trim()
    .toLowerCase();
  const workingTreeItemByPath = useMemo(
    () => new Map(workingTreeItems.map((item) => [item.path, item])),
    [workingTreeItems]
  );
  const filteredRepositoryFiles = useMemo(
    () =>
      normalizedRepositoryFileFilter.length === 0
        ? allRepositoryFiles
        : allRepositoryFiles.filter((file) =>
            file.path.toLowerCase().includes(normalizedRepositoryFileFilter)
          ),
    [allRepositoryFiles, normalizedRepositoryFileFilter]
  );
  const allFilesTree = useMemo(
    () =>
      buildRepositoryFileTree(
        filteredRepositoryFiles,
        workingTreeItemByPath,
        fileTreeSortOrder
      ),
    [fileTreeSortOrder, filteredRepositoryFiles, workingTreeItemByPath]
  );
  const currentBranch =
    branches.find((branch) => branch.isCurrent)?.name ?? "HEAD";
  const currentBranchLaneColor = useMemo(
    () =>
      localHeadCommit?.hash
        ? getCommitLaneColor(commits, localHeadCommit.hash)
        : getCommitLaneColor(commits, ""),
    [commits, localHeadCommit?.hash]
  );
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
    () => commits.find((item) => item.hash === selectedCommitId) ?? null,
    [commits, selectedCommitId]
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
  const selectedCommitFiles = useMemo<RepositoryCommitFile[]>(
    () =>
      selectedCommit
        ? (commitFilesByHash[selectedCommit.hash] ?? [])
        : ([] as RepositoryCommitFile[]),
    [commitFilesByHash, selectedCommit]
  );
  const selectedCommitFileByPath = useMemo(
    () => new Map(selectedCommitFiles.map((file) => [file.path, file])),
    [selectedCommitFiles]
  );
  const commitViewFiles = useMemo<RepositoryCommitFile[]>(() => {
    if (!showAllCommitFiles) {
      return selectedCommitFiles;
    }

    return allRepositoryFiles.map((file) => {
      const matchingCommitFile = selectedCommitFileByPath.get(file.path);

      if (matchingCommitFile) {
        return matchingCommitFile;
      }

      return {
        additions: 0,
        deletions: 0,
        path: file.path,
        previousPath: null,
        status: " ",
      };
    });
  }, [
    allRepositoryFiles,
    selectedCommitFileByPath,
    selectedCommitFiles,
    showAllCommitFiles,
  ]);
  const normalizedCommitFileFilter = debouncedCommitFileFilterInputValue
    .trim()
    .toLowerCase();
  const filteredCommitFiles = useMemo(() => {
    if (!showAllCommitFiles) {
      return commitViewFiles;
    }

    return normalizedCommitFileFilter.length === 0
      ? commitViewFiles
      : commitViewFiles.filter((file) =>
          file.path.toLowerCase().includes(normalizedCommitFileFilter)
        );
  }, [commitViewFiles, normalizedCommitFileFilter, showAllCommitFiles]);
  const sortedCommitPathRows = useMemo(() => {
    const nextFiles = [...filteredCommitFiles];

    nextFiles.sort((left, right) => {
      const comparison = left.path.localeCompare(right.path);

      return commitFileSortOrder === "asc" ? comparison : comparison * -1;
    });

    return nextFiles;
  }, [commitFileSortOrder, filteredCommitFiles]);
  const selectedCommitTree = useMemo(
    () => buildCommitFileTree(filteredCommitFiles, commitFileSortOrder),
    [commitFileSortOrder, filteredCommitFiles]
  );
  const selectedCommitFileSummary = useMemo(() => {
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    for (const file of selectedCommitFiles) {
      const status = file.status.charAt(0);

      if (status === "A") {
        addedCount += 1;
        continue;
      }

      if (status === "D") {
        removedCount += 1;
        continue;
      }

      modifiedCount += 1;
    }

    return {
      addedCount,
      modifiedCount,
      removedCount,
      totalCount: selectedCommitFiles.length,
    };
  }, [selectedCommitFiles]);
  const [branchQuery, setBranchQuery] = useState("");
  const normalizedBranchQuery = useDebouncedValue(
    branchQuery,
    COMBOBOX_DEBOUNCE_DELAY_MS,
    normalizeComboboxQuery
  );
  const branchComboboxOptions = useMemo<BranchComboboxOption[]>(
    () =>
      branches
        .filter((branch) => branch.refType !== "tag")
        .map((branch) => ({
          isRemote: branch.isRemote,
          name: branch.name,
        })),
    [branches]
  );
  const selectedBranchOption = useMemo(
    () =>
      branchComboboxOptions.find((branch) => branch.name === currentBranch) ??
      null,
    [branchComboboxOptions, currentBranch]
  );
  const visibleBranchComboboxOptions = useMemo(() => {
    if (normalizedBranchQuery.length === 0) {
      return branchComboboxOptions;
    }

    const filteredOptions = branchComboboxOptions.filter((branch) =>
      branch.name.toLowerCase().includes(normalizedBranchQuery)
    );

    if (!selectedBranchOption) {
      return filteredOptions;
    }

    const hasSelectedOption = filteredOptions.some(
      (branch) => branch.name === selectedBranchOption.name
    );

    return hasSelectedOption
      ? filteredOptions
      : [selectedBranchOption, ...filteredOptions];
  }, [branchComboboxOptions, normalizedBranchQuery, selectedBranchOption]);
  const timelineReferenceRowsByCommitHash = useMemo(() => {
    const rowsByCommitHash = new Map<string, TimelineReferenceRowData[]>();
    const commitHashSet = new Set(commits.map((commit) => commit.hash));
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

    for (const commit of commits) {
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

    return rowsByCommitHash;
  }, [commits, stashes]);
  const timelineRows = useMemo<GitTimelineRow[]>(() => {
    const rows: GitTimelineRow[] = [];

    if (hasAnyWorkingTreeChanges) {
      rows.push({
        anchorCommitHash: localHeadCommit?.hash,
        author: wipAuthorName,
        authorAvatarUrl: wipAuthorAvatarUrl,
        id: WORKING_TREE_ROW_ID,
        type: "wip",
      });
    }

    for (const commit of commits) {
      const referenceRows =
        timelineReferenceRowsByCommitHash.get(commit.hash) ?? [];

      for (const referenceRow of referenceRows) {
        rows.push({
          anchorCommitHash: referenceRow.anchorCommitHash,
          id: referenceRow.id,
          label: referenceRow.label,
          type: referenceRow.type,
        });
      }

      rows.push({
        commitHash: commit.hash,
        id: commit.hash,
        syncState: commit.syncState,
        type: "commit",
      });
    }

    return rows;
  }, [
    hasAnyWorkingTreeChanges,
    localHeadCommit?.hash,
    timelineReferenceRowsByCommitHash,
    wipAuthorAvatarUrl,
    wipAuthorName,
    commits,
  ]);
  const timelineRowById = useMemo(
    () => new Map(timelineRows.map((row) => [row.id, row])),
    [timelineRows]
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
      commits.find(
        (item) => item.hash === selectedTimelineRow.anchorCommitHash
      ) ?? null
    );
  }, [commits, selectedTimelineRow]);
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
  const selectedReferenceFileByPath = useMemo(
    () => new Map(selectedReferenceFiles.map((file) => [file.path, file])),
    [selectedReferenceFiles]
  );
  const referenceViewFiles = useMemo<RepositoryCommitFile[]>(() => {
    if (!showAllCommitFiles) {
      return selectedReferenceFiles;
    }

    return allRepositoryFiles.map((file) => {
      const matchingReferenceFile = selectedReferenceFileByPath.get(file.path);

      if (matchingReferenceFile) {
        return matchingReferenceFile;
      }

      return {
        additions: 0,
        deletions: 0,
        path: file.path,
        previousPath: null,
        status: " ",
      };
    });
  }, [
    allRepositoryFiles,
    selectedReferenceFileByPath,
    selectedReferenceFiles,
    showAllCommitFiles,
  ]);
  const filteredReferenceFiles = useMemo(() => {
    if (!showAllCommitFiles) {
      return referenceViewFiles;
    }

    return normalizedCommitFileFilter.length === 0
      ? referenceViewFiles
      : referenceViewFiles.filter((file) =>
          file.path.toLowerCase().includes(normalizedCommitFileFilter)
        );
  }, [normalizedCommitFileFilter, referenceViewFiles, showAllCommitFiles]);
  const selectedReferenceFileSummary = useMemo(() => {
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    for (const file of selectedReferenceFiles) {
      const status = file.status.charAt(0);

      if (status === "A") {
        addedCount += 1;
        continue;
      }

      if (status === "D") {
        removedCount += 1;
        continue;
      }

      modifiedCount += 1;
    }

    return {
      addedCount,
      modifiedCount,
      removedCount,
      totalCount: selectedReferenceFiles.length,
    };
  }, [selectedReferenceFiles]);
  const sortedSelectedReferencePathRows = useMemo(() => {
    const nextFiles = [...filteredReferenceFiles];

    nextFiles.sort((left, right) => {
      const comparison = left.path.localeCompare(right.path);

      return commitFileSortOrder === "asc" ? comparison : comparison * -1;
    });

    return nextFiles;
  }, [commitFileSortOrder, filteredReferenceFiles]);
  const selectedReferenceTree = useMemo(
    () => buildCommitFileTree(filteredReferenceFiles, commitFileSortOrder),
    [commitFileSortOrder, filteredReferenceFiles]
  );
  const timelineRowIdByStashRef = useMemo(() => {
    const rowIds = new Map<string, string>();

    for (const stash of stashes) {
      rowIds.set(stash.ref, `stash:${stash.ref}`);
    }

    return rowIds;
  }, [stashes]);
  const timelineRowIdByTagName = useMemo(() => {
    const rowIds = new Map<string, string>();

    for (const row of timelineRows) {
      if (row.type === "tag" && row.label) {
        rowIds.set(row.label, row.id);
      }
    }

    return rowIds;
  }, [timelineRows]);
  const resolvedTimelineGraphColumnWidth = useMemo(
    () => resolveGitGraphColumnWidth(commits),
    [commits]
  );
  const effectiveTimelineGraphColumnWidth = clampWidth(
    isTimelineGraphAutoCompact
      ? TIMELINE_GRAPH_COLUMN_MIN_WIDTH
      : (timelineGraphColumnWidth ?? resolvedTimelineGraphColumnWidth),
    TIMELINE_GRAPH_COLUMN_MIN_WIDTH,
    TIMELINE_GRAPH_COLUMN_MAX_WIDTH
  );
  const isTimelineGraphCompactMode =
    isTimelineGraphAutoCompact ||
    timelineGraphColumnWidth === TIMELINE_GRAPH_COLUMN_MIN_WIDTH;
  const timelineGridTemplateColumns = `${TIMELINE_BRANCH_COLUMN_WIDTH}px ${effectiveTimelineGraphColumnWidth}px minmax(0,1fr)`;
  const commitAvatarUrlByHash = useMemo<Record<string, string | null>>(() => {
    const avatarByHash: Record<string, string | null> = {};

    for (const commit of commits) {
      avatarByHash[commit.hash] = commit.authorAvatarUrl ?? null;
    }

    return avatarByHash;
  }, [commits]);
  const sidebarGroups = useMemo<SidebarGroupItem[]>(() => {
    const localEntries: SidebarEntry[] = [];
    const remoteEntries: SidebarEntry[] = [];
    const stashByRef = new Map(stashes.map((stash) => [stash.ref, stash]));
    const stashEntries: SidebarEntry[] = timelineRows
      .filter((row) => row.type === "stash")
      .flatMap((row) => {
        const stashRef = row.id.slice("stash:".length);
        const stash = stashByRef.get(stashRef);

        if (!stash) {
          return [];
        }

        const label = formatStashLabel(stash);

        return {
          name: label,
          searchName: label.toLowerCase(),
          stashMessage: stash.message,
          stashRef: stash.ref,
          type: "stash",
        };
      });
    const tagEntries: SidebarEntry[] = [];

    for (const branch of branches) {
      if (branch.refType === "tag") {
        tagEntries.push({
          active: branch.isCurrent,
          name: branch.name,
          searchName: branch.name.toLowerCase(),
          type: "tag",
        });
        continue;
      }

      const branchEntry: SidebarEntry = {
        active: branch.isCurrent,
        isRemote: branch.isRemote,
        name: branch.name,
        pendingPushCount:
          (branch.aheadCount ?? 0) > 0 ? branch.aheadCount : undefined,
        pendingSyncCount:
          (branch.behindCount ?? 0) > 0 ? branch.behindCount : undefined,
        searchName: branch.name.toLowerCase(),
        type: "branch",
      };

      if (branch.isRemote) {
        remoteEntries.push(branchEntry);
        continue;
      }

      localEntries.push(branchEntry);
    }

    return [
      {
        count: localEntries.length,
        entries: localEntries,
        key: "local",
        name: "LOCAL",
      },
      {
        count: remoteEntries.length,
        entries: remoteEntries,
        key: "remote",
        name: "REMOTE",
      },
      {
        count: stashEntries.length,
        entries: stashEntries,
        key: "stashes",
        name: "STASHES",
      },
      {
        count: tagEntries.length,
        entries: tagEntries,
        key: "tags",
        name: "TAGS",
      },
    ];
  }, [branches, stashes, timelineRows]);
  const normalizedSidebarFilter = deferredSidebarFilterQuery
    .trim()
    .toLowerCase();
  const filteredSidebarGroups = useMemo<SidebarGroupItem[]>(() => {
    if (normalizedSidebarFilter.length === 0) {
      return sidebarGroups;
    }

    return sidebarGroups.map((group) => {
      const entries = group.entries.filter((entry) =>
        entry.searchName.includes(normalizedSidebarFilter)
      );

      return {
        ...group,
        count: entries.length,
        entries,
      };
    });
  }, [normalizedSidebarFilter, sidebarGroups]);
  const filteredSidebarEntryCount = useMemo(
    () =>
      filteredSidebarGroups.reduce((total, group) => total + group.count, 0),
    [filteredSidebarGroups]
  );

  useEffect(() => {
    const diffEditor = openedDiffEditorRef.current;
    const fileEditor = openedFileEditorRef.current;
    const editEditor = openedEditEditorRef.current;

    if (diffEditor) {
      applyDiffEditorPreferences(
        diffEditor,
        editorPreferences.lineNumbers,
        editorPreferences.tabSize,
        editorPreferences.eol
      );
    }

    if (fileEditor) {
      applyCodeEditorPreferences(
        fileEditor,
        editorPreferences.lineNumbers,
        editorPreferences.tabSize,
        editorPreferences.eol
      );
    }

    if (editEditor) {
      applyCodeEditorPreferences(
        editEditor,
        editorPreferences.lineNumbers,
        editorPreferences.tabSize,
        editorPreferences.eol
      );
    }
  }, [
    editorPreferences.eol,
    editorPreferences.lineNumbers,
    editorPreferences.tabSize,
  ]);

  useEffect(() => {
    if (activeRepoId === null) {
      fileHistoryCacheRef.current.clear();
      fileBlameCacheRef.current.clear();
      return;
    }

    fileHistoryCacheRef.current.clear();
    fileBlameCacheRef.current.clear();
  }, [activeRepoId]);

  const formatCommitDate = (value: string): string => {
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
  };
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
      | "revert"
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

    const actionLabelByKind = {
      checkout: "checkout this commit",
      "create-branch": "create a branch here",
      "create-tag": "create a tag here",
      "cherry-pick": "cherry-pick this commit",
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

    if (commits.length === 0) {
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
        commits.some((commit) => commit.hash === resolvedCommitHash)
      ) {
        if (selectedCommitId !== resolvedCommitHash) {
          setSelectedCommitId(resolvedCommitHash);
        }

        return;
      }
    }

    if (
      selectedCommitId &&
      commits.some((commit) => commit.hash === selectedCommitId)
    ) {
      if (selectedTimelineRowId !== selectedCommitId) {
        setSelectedTimelineRowId(selectedCommitId);
      }
      return;
    }

    const fallbackCommitHash =
      localHeadCommit?.hash ?? commits[0]?.hash ?? null;

    if (selectedTimelineRowId !== fallbackCommitHash) {
      setSelectedTimelineRowId(fallbackCommitHash);
    }

    if (selectedCommitId !== fallbackCommitHash) {
      setSelectedCommitId(fallbackCommitHash);
    }
  }, [
    commits,
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

    const prefill = repoCommitDraftPrefillById[activeRepoId] ?? null;

    if (!prefill) {
      return;
    }

    setDraftCommitSummary(prefill.summary);
    setDraftCommitDescription(prefill.description);
    setAmendPreviousCommit(false);
    setLastAiCommitGeneration(null);
    clearRepoCommitDraftPrefill(activeRepoId);
  }, [activeRepoId, clearRepoCommitDraftPrefill, repoCommitDraftPrefillById]);

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
    setTimelineGraphColumnWidth(
      isCompact ? TIMELINE_GRAPH_COLUMN_MIN_WIDTH : null
    );
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

  const handleToolbarBranchChange = async (
    nextValue: BranchComboboxOption | null
  ) => {
    if (
      !nextValue ||
      nextValue.name === currentBranch ||
      !activeRepoId ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsSwitchingBranch(true);

    try {
      await switchBranch(activeRepoId, nextValue.name);
      toast.success("Checkout Successful", {
        description: `refs/heads/${nextValue.name}`,
      });
    } catch (error) {
      toast.error("Failed to switch branch", {
        description: getCheckoutFailureReason(error),
      });
    } finally {
      setIsSwitchingBranch(false);
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
            setPublishRepoName(activeRepo?.name ?? "");
            setPublishRepoVisibility("private");
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
            setPublishRepoName(activeRepo?.name ?? "");
            setPublishRepoVisibility("private");
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
      if (entry.type === "stash") {
        const matchingStash = stashes.find(
          (stash) => stash.ref === entry.stashRef
        );
        return matchingStash?.anchorCommitHash ?? null;
      }

      if (!(entry.type === "branch" || entry.type === "tag")) {
        return null;
      }

      for (const commit of commits) {
        for (const rawReference of commit.refs) {
          const normalizedReference = normalizeCommitRefLabel(rawReference);

          if (normalizedReference === entry.name) {
            return commit.hash;
          }
        }
      }

      return null;
    },
    [commits, stashes]
  );

  const getTimelineRowIdForEntry = useCallback(
    (entry: SidebarEntry): string | null => {
      if (entry.type === "stash") {
        return entry.stashRef
          ? (timelineRowIdByStashRef.get(entry.stashRef) ?? null)
          : null;
      }

      if (entry.type === "tag") {
        return timelineRowIdByTagName.get(entry.name) ?? null;
      }

      if (entry.type === "branch") {
        return getCommitHashForEntry(entry);
      }

      return null;
    },
    [getCommitHashForEntry, timelineRowIdByStashRef, timelineRowIdByTagName]
  );

  const scrollTimelineRowIntoView = useCallback((rowId: string) => {
    globalThis.requestAnimationFrame(() => {
      const rowElement = timelineRowElementsRef.current.get(rowId);
      const scroller = mainScrollContainerRef.current;

      if (!(rowElement && scroller)) {
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
  }, []);

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
      if (row.type === "stash") {
        const stashRef = row.id.slice("stash:".length);
        const stash = stashes.find((item) => item.ref === stashRef);

        if (!stash) {
          return null;
        }

        const label = formatStashLabel(stash);
        return {
          name: label,
          searchName: label.toLowerCase(),
          stashMessage: stash.message,
          stashRef: stash.ref,
          type: "stash",
        };
      }

      if (row.type === "tag" && row.label) {
        return {
          active: false,
          name: row.label,
          searchName: row.label.toLowerCase(),
          type: "tag",
        };
      }

      return null;
    },
    [stashes]
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

  const createSidebarEntryFromRefName = (
    referenceName: string
  ): SidebarEntry => {
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
  };

  const getCommitRefEntries = (commit: RepositoryCommit): SidebarEntry[] => {
    const uniqueEntries = new Map<string, SidebarEntry>();

    for (const rawReference of commit.refs) {
      const normalizedReference = normalizeCommitRefLabel(rawReference);

      if (!normalizedReference) {
        continue;
      }

      const entry = createSidebarEntryFromRefName(normalizedReference);
      const key = `${entry.type}:${entry.name}`;

      if (!uniqueEntries.has(key)) {
        uniqueEntries.set(key, entry);
      }
    }

    return Array.from(uniqueEntries.values());
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
    const commitRefEntries = getCommitRefEntries(commit);
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
      const commit = commits.find((item) => item.hash === row.commitHash);
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
    const nextState: Record<string, boolean> = {};

    const visitNode = (node: ChangeTreeNode) => {
      if (node.children.size === 0) {
        return;
      }

      nextState[getTreeNodeStateKey(section, node.fullPath)] = true;

      for (const childNode of node.children.values()) {
        visitNode(childNode);
      }
    };

    for (const node of nodes) {
      visitNode(node);
    }

    return nextState;
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
    const counts = new Map<string, number>();

    const visitNode = (current: ChangeTreeNode) => {
      if (current.item) {
        const statusCodes = getStatusCodes(current.item, section);

        for (const code of statusCodes) {
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }

        return;
      }

      for (const child of current.children.values()) {
        visitNode(child);
      }
    };

    visitNode(node);

    return counts;
  };

  const collectCommitTreeChangeSummary = (node: CommitFileTreeNode) => {
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    const visitNode = (current: CommitFileTreeNode) => {
      if (current.file) {
        const statusCode = current.file.status.charAt(0);

        if (statusCode === "A") {
          addedCount += 1;
          return;
        }

        if (statusCode === "D") {
          removedCount += 1;
          return;
        }

        modifiedCount += 1;
        return;
      }

      for (const child of current.children.values()) {
        visitNode(child);
      }
    };

    visitNode(node);

    return {
      addedCount,
      modifiedCount,
      removedCount,
    };
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
    setHasRequestedEditSurface(false);
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
  const monacoModelBasePath = useMemo(() => {
    if (openedDiffContext === null) {
      return null;
    }

    if (openedDiffContext.source === "commit") {
      return buildMonacoModelBasePath({
        commitHash: openedDiffContext.commitHash,
        filePath: activeDiffPath,
        source: "commit",
      });
    }

    return buildMonacoModelBasePath({
      filePath: activeDiffPath,
      source: "working",
    });
  }, [activeDiffPath, openedDiffContext]);
  const diffMonacoModelBasePath =
    monacoModelBasePath === null ? null : `${monacoModelBasePath}?surface=diff`;
  const hunkMonacoModelBasePath =
    monacoModelBasePath === null ? null : `${monacoModelBasePath}?surface=hunk`;
  const fileMonacoModelPath =
    monacoModelBasePath === null ? null : `${monacoModelBasePath}?surface=file`;
  const editMonacoModelPath =
    monacoModelBasePath === null ? null : `${monacoModelBasePath}?surface=edit`;
  const blameMonacoModelPath =
    monacoModelBasePath === null
      ? null
      : `${monacoModelBasePath}?surface=blame`;
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
    if (shouldMountEditMonacoSurface) {
      setHasRequestedEditSurface(true);
    }
  }, [shouldMountEditMonacoSurface]);

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

    if (resolvedPresentation === "hunk") {
      setActiveHunkIndex((current) => {
        if (activeHunks.length === 0) {
          return 0;
        }

        if (current <= 0) {
          return activeHunks.length - 1;
        }

        return current - 1;
      });
    }

    openedDiffEditorRef.current?.goToDiff("previous");
  };

  const handleNextChange = () => {
    if (workspaceMode !== "diff") {
      return;
    }

    if (resolvedPresentation === "hunk") {
      setActiveHunkIndex((current) => {
        if (activeHunks.length === 0) {
          return 0;
        }

        if (current >= activeHunks.length - 1) {
          return 0;
        }

        return current + 1;
      });
    }

    openedDiffEditorRef.current?.goToDiff("next");
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
    const nextState: Record<string, boolean> = {};
    const stack = [...nodes];

    while (stack.length > 0) {
      const currentNode = stack.pop();

      if (!currentNode || currentNode.children.size === 0) {
        continue;
      }

      nextState[getCommitTreeNodeStateKey(commitHash, currentNode.fullPath)] =
        true;

      stack.push(...Array.from(currentNode.children.values()));
    }

    return nextState;
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
    depth = 0
  ): ReactNode => {
    return nodes.map((node) => {
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

        return (
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
      }

      return (
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
                depth + 1
              )
            : null}
        </div>
      );
    });
  };
  const renderCommitPathRows = (
    files: RepositoryCommitFile[],
    commitHash: string
  ): ReactNode => {
    return files.map((file) => {
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

      return (
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
    });
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
    depth = 0
  ): ReactNode => {
    return nodes.map((node) => {
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

        return (
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
      }

      return (
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
                depth + 1
              )}
            </div>
          ) : null}
        </div>
      );
    });
  };

  const renderFlatChangeRows = (
    items: RepositoryWorkingTreeItem[],
    section: "staged" | "unstaged"
  ) => {
    return items.map((item) => {
      const isBusy = isUpdatingFilePath === item.path;
      const nextAction = section === "unstaged" ? "stage" : "unstage";
      const nextLabel = section === "unstaged" ? "Stage" : "Unstage";
      const isLoadingDiff = isLoadingDiffPath === item.path;
      const isDiffOpened = openedDiffPath === item.path;

      return (
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
    });
  };

  const renderChangesSectionContent = (
    items: RepositoryWorkingTreeItem[],
    tree: ChangeTreeNode[],
    section: "staged" | "unstaged"
  ) => {
    if (items.length === 0) {
      return (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          {section === "unstaged" ? "No unstaged files." : "No staged files."}
        </p>
      );
    }

    if (changesViewMode === "tree") {
      return renderChangeTreeNodes(tree, section);
    }

    return renderFlatChangeRows(items, section);
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

    return renderChangeTreeNodes(allFilesTree, "all");
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

  const handleSidebarEntryClick = async (entry: SidebarEntry) => {
    if (entry.type === "branch") {
      await handleCheckoutBranch(entry);
      return;
    }

    const rowId = getTimelineRowIdForEntry(entry);
    const anchorCommitHash = getCommitHashForEntry(entry);

    if (!(rowId && anchorCommitHash)) {
      return;
    }

    selectTimelineReferenceRow(rowId, anchorCommitHash, true);
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
    setPublishRepoName(activeRepo?.name ?? "");
    setPublishRepoVisibility("private");
    setPublishRepoFormError(null);
    setIsPublishRepoConfirmOpen(true);
  };

  const executePublishAndPush = async () => {
    const pendingAction = pendingPublishPushActionRef.current;

    if (!pendingAction || isSubmittingPublishRepo) {
      return;
    }

    const repoNameError = resolvePublishRepositoryNameError(publishRepoName);
    if (repoNameError) {
      setPublishRepoFormError(repoNameError);
      return;
    }

    setIsSubmittingPublishRepo(true);
    setPublishRepoFormError(null);

    try {
      await pendingAction({
        repoName: publishRepoName.trim(),
        visibility: publishRepoVisibility,
      });
      pendingPublishPushActionRef.current = null;
      setIsPublishRepoConfirmOpen(false);
    } catch (error) {
      setPublishRepoFormError(getErrorMessage(error));
    } finally {
      setIsSubmittingPublishRepo(false);
    }
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

    try {
      const generatedCommit = await generateAiCommitMessage(activeRepoId, "");

      setDraftCommitSummary(generatedCommit.title);
      setDraftCommitDescription(generatedCommit.body);
      setLastAiCommitGeneration({
        promptMode: generatedCommit.promptMode,
        providerKind: generatedCommit.providerKind,
        schemaFallbackUsed: generatedCommit.schemaFallbackUsed,
      });
    } finally {
      setIsGeneratingAiCommitMessage(false);
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
              <SidebarHeader className="border-border/70 border-b px-2 py-2">
                <div className="space-y-1 px-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">
                    Repository
                  </p>
                  <div className="flex items-center gap-1.5">
                    <GithubLogoIcon className="size-3.5 text-muted-foreground" />
                    <p className="truncate font-semibold text-sm">
                      {activeRepo.name}
                    </p>
                  </div>
                </div>
                <div className="-mx-2 mt-1.5 border-border/60 border-b" />
                <div className="mt-2 flex items-center justify-between px-2 text-xs">
                  <span className="text-muted-foreground">Viewing</span>
                  <span className="font-medium text-foreground/90">
                    {filteredSidebarEntryCount}
                  </span>
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

              <SidebarContent className="py-2">
                {filteredSidebarGroups.map((group) => (
                  <SidebarGroup key={group.key}>
                    <SidebarGroupLabel className="px-0 py-0">
                      <button
                        className="flex w-full items-center justify-between px-2 py-0.5"
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
                          {group.entries.map((entry) => {
                            const entryMenuKey = `${group.key}-${entry.stashRef ?? entry.name}`;
                            const isEntryMenuOpen =
                              openEntryContextMenuKey === entryMenuKey ||
                              openEntryDropdownMenuKey === entryMenuKey;
                            const isEntryContextMenuOpen =
                              openEntryContextMenuKey === entryMenuKey;
                            const isEntryDropdownMenuOpen =
                              openEntryDropdownMenuKey === entryMenuKey;

                            return (
                              <SidebarMenuItem key={entryMenuKey}>
                                <ContextMenu
                                  onOpenChange={(open) => {
                                    handleEntryContextMenuOpenChange(
                                      entryMenuKey,
                                      open
                                    );
                                  }}
                                  open={isEntryContextMenuOpen}
                                >
                                  <ContextMenuTrigger>
                                    <SidebarMenuButton
                                      aria-label={entry.name}
                                      className={cn(
                                        "group gap-1.5 rounded-none py-1 text-xs",
                                        isSidebarEntrySelected(entry) ||
                                          isEntryMenuOpen
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                      )}
                                      disabled={
                                        entry.type !== "stash" &&
                                        isSwitchingBranch
                                      }
                                      onClick={() => {
                                        handleSidebarEntryClick(entry).catch(
                                          () => undefined
                                        );
                                      }}
                                    >
                                      {renderEntryIcon(entry)}
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <span className="min-w-0 flex-1 truncate" />
                                          }
                                        >
                                          {renderHighlightedEntryName(
                                            entry.name
                                          )}
                                        </TooltipTrigger>
                                        <TooltipContent
                                          align="end"
                                          side="right"
                                          sideOffset={6}
                                        >
                                          {entry.name}
                                        </TooltipContent>
                                      </Tooltip>
                                      {entry.type === "branch" &&
                                      typeof entry.pendingSyncCount ===
                                        "number" &&
                                      entry.pendingSyncCount > 0 ? (
                                        <span className="inline-flex shrink-0 items-center gap-1 text-xs opacity-90">
                                          <ArrowDownIcon className="size-3" />
                                          {entry.pendingSyncCount}
                                        </span>
                                      ) : null}
                                      {entry.type === "branch" &&
                                      typeof entry.pendingPushCount ===
                                        "number" &&
                                      entry.pendingPushCount > 0 ? (
                                        <span className="inline-flex shrink-0 items-center gap-1 text-xs opacity-90">
                                          <ArrowUpIcon className="size-3" />
                                          {entry.pendingPushCount}
                                        </span>
                                      ) : null}
                                      <DropdownMenu
                                        onOpenChange={(open) => {
                                          handleEntryDropdownMenuOpenChange(
                                            entryMenuKey,
                                            open
                                          );
                                        }}
                                        open={isEntryDropdownMenuOpen}
                                      >
                                        <DropdownMenuTrigger
                                          render={
                                            <button
                                              aria-label={`More options for ${entry.name}`}
                                              className={cn(
                                                "ml-0.5 inline-flex size-4 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-accent/80 focus-visible:opacity-100 group-hover:opacity-100",
                                                isEntryMenuOpen &&
                                                  "opacity-100",
                                                entry.active &&
                                                  "hover:bg-accent-foreground/10"
                                              )}
                                              onClick={(event) =>
                                                event.stopPropagation()
                                              }
                                              type="button"
                                            />
                                          }
                                        >
                                          <DotsThreeVerticalIcon className="size-3.5" />
                                        </DropdownMenuTrigger>
                                        {isEntryDropdownMenuOpen
                                          ? renderEntryDropdownMenuContent(
                                              entry
                                            )
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
                          })}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    )}
                  </SidebarGroup>
                ))}
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
          <div className="grid w-full grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-1.5 border-border/60 border-b bg-background px-2 py-1 text-foreground">
            <div className="flex min-w-0 items-center justify-start gap-1">
              <Combobox
                autoHighlight
                disabled={
                  isSwitchingBranch || branchComboboxOptions.length === 0
                }
                filter={null}
                inputValue={
                  branchQuery.length > 0
                    ? branchQuery
                    : (selectedBranchOption?.name ?? "")
                }
                items={visibleBranchComboboxOptions}
                itemToStringLabel={(item: BranchComboboxOption) => item.name}
                onInputValueChange={(nextInputValue) => {
                  setBranchQuery(nextInputValue);
                }}
                onValueChange={(nextValue: BranchComboboxOption | null) => {
                  setBranchQuery("");
                  handleToolbarBranchChange(nextValue).catch(() => undefined);
                }}
                value={selectedBranchOption}
              >
                <ComboboxInput
                  className="h-7 w-56"
                  placeholder="Find branch..."
                  render={
                    <InputGroupInput className="h-7 text-xs placeholder:text-xs" />
                  }
                  showClear={false}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No branch found.</ComboboxEmpty>
                  <ComboboxList>
                    {(option: BranchComboboxOption) => (
                      <ComboboxItem key={option.name} value={option}>
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-6">
                          <GitBranchIcon className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{option.name}</span>
                          {option.isRemote ? (
                            <span className="ml-auto text-muted-foreground text-xs">
                              remote
                            </span>
                          ) : null}
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="w-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center justify-end gap-1">
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
                        size="sm"
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
                        size="sm"
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
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <InputGroup className="h-7 w-auto border-border/60 bg-transparent">
                          <Button
                            aria-label={`Run ${selectedPullActionLabel}`}
                            className="focus-visible:desktop-focus h-7 border-0 px-2 focus-visible:ring-0! focus-visible:ring-offset-0!"
                            disabled={isPulling}
                            onClick={handlePullWithSelectedMode}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isPulling ? (
                              <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                            ) : (
                              <ArrowDownIcon className="size-4 text-muted-foreground" />
                            )}
                            <span className={cn(!toolbarLabels && "hidden")}>
                              Pull
                            </span>
                          </Button>
                          <InputGroupAddon align="inline-end" className="pr-0">
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  aria-label="Select pull mode"
                                  className="focus-visible:desktop-focus-strong h-7 border-0 border-border/60 border-l px-1.5 focus-visible:ring-0! focus-visible:ring-offset-0!"
                                  disabled={isPulling}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                />
                              }
                            >
                              <CaretDownIcon className="size-3 text-muted-foreground" />
                            </DropdownMenuTrigger>
                          </InputGroupAddon>
                        </InputGroup>
                      }
                    />
                    <TooltipContent
                      className={cn(toolbarLabels && "hidden")}
                      side="bottom"
                    >
                      {selectedPullActionLabel}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="center"
                    className="w-72"
                    side="bottom"
                    sideOffset={6}
                  >
                    <DropdownMenuItem
                      className={cn(
                        "gap-1.5",
                        pullActionMode === "fetch-all" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("fetch-all")}
                    >
                      Fetch All
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "gap-1.5",
                        pullActionMode === "pull-ff-possible" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-ff-possible")}
                    >
                      Pull (fast-forward if possible)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "gap-1.5",
                        pullActionMode === "pull-ff-only" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-ff-only")}
                    >
                      Pull (fast-forward only)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "gap-1.5",
                        pullActionMode === "pull-rebase" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
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
                        size="sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isPushing ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ArrowUpIcon className="size-4 text-muted-foreground" />
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
                        size="sm"
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
                        size="sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isCreatingStash ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <DownloadSimpleIcon className="size-4 text-muted-foreground" />
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
                        size="sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isPoppingStash ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <UploadSimpleIcon className="size-4 text-muted-foreground" />
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
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Terminal"
                        className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                        onClick={toggleTerminalPanel}
                        size="sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <TerminalWindowIcon className="size-4 text-muted-foreground" />
                    <span className={cn(!toolbarLabels && "hidden")}>
                      Terminal
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    className={cn(toolbarLabels && "hidden")}
                    side="bottom"
                  >
                    {isTerminalPanelOpen ? "Hide terminal" : "Show terminal"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <section className="relative flex min-w-0 flex-1 flex-col">
              <div
                className="grid border-border/60 border-b px-2 py-1 text-muted-foreground text-xs/3 uppercase tracking-wide"
                style={{ gridTemplateColumns: timelineGridTemplateColumns }}
              >
                <span className="flex items-center justify-center">
                  Branch / Tag
                </span>
                <span className="flex items-center justify-center">Graph</span>
                <span className="relative flex items-center justify-center">
                  <span>Commit Message</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          aria-label="Timeline settings"
                          className="focus-visible:desktop-focus-strong absolute right-0 inline-flex size-5 shrink-0 items-center justify-center transition-colors hover:bg-accent/40 focus-visible:bg-accent/40"
                          type="button"
                        />
                      }
                    >
                      <GearIcon className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-52"
                      sideOffset={6}
                    >
                      <DropdownMenuCheckboxItem
                        checked={isTimelineGraphCompactMode}
                        disabled={isTimelineGraphAutoCompact}
                        onCheckedChange={(checked) => {
                          setTimelineGraphCompactMode(checked === true);
                        }}
                      >
                        {isTimelineGraphAutoCompact
                          ? "Compact graph (auto on small screen)"
                          : "Compact graph (1 line)"}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
              <div
                className={cn(
                  "relative min-h-0 flex-1 overflow-y-auto",
                  isTerminalPanelOpen && "pb-52"
                )}
                ref={mainScrollContainerRef}
              >
                {isBranchCreateInputOpen ? (
                  <div
                    className="grid items-center border-border/35 border-b bg-muted/[0.16] px-2 py-1.5"
                    style={{ gridTemplateColumns: timelineGridTemplateColumns }}
                  >
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
                          style={{ backgroundColor: currentBranchLaneColor }}
                        />
                        {currentBranch}
                      </span>
                    </div>
                    <div className="flex items-center justify-center">
                      <span
                        aria-hidden
                        className="flex size-7 items-center justify-center rounded-full bg-background/95"
                        style={{
                          boxShadow: `inset 0 0 0 1px ${currentBranchLaneColor}66`,
                        }}
                      >
                        <CircleIcon
                          className="size-2.5"
                          style={{ color: currentBranchLaneColor }}
                        />
                      </span>
                    </div>
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
                          isCreatingBranch || newBranchName.trim().length === 0
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
                  </div>
                ) : null}
                <div className="relative">
                  <GitGraphOverlay
                    commits={commits}
                    graphColumnWidth={effectiveTimelineGraphColumnWidth}
                    onNodeMenuOpenChange={handleGraphNodeMenuOpenChange}
                    onNodeSelect={handleGraphNodeSelect}
                    renderNodeContextMenu={renderGraphNodeContextMenuContent}
                    rowHeight={TIMELINE_ROW_HEIGHT}
                    rows={timelineRows}
                    selectedRowId={selectedTimelineRowId}
                  />
                  {hasAnyWorkingTreeChanges ? (
                    <button
                      className={cn(
                        "group relative z-10 grid h-11 w-full cursor-pointer items-center border-border/35 border-b px-2 text-left transition-colors",
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
                      style={{
                        gridTemplateColumns: timelineGridTemplateColumns,
                      }}
                      type="button"
                    >
                      <div className="min-w-0" />
                      <div className="h-full" />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <Input
                            className="h-7 w-full max-w-52"
                            disabled
                            placeholder="// WIP"
                            value={draftCommitSummary}
                          />
                          {workingTreeIndicators.editedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs dark:text-amber-300">
                              <PencilSimpleIcon
                                aria-hidden
                                className="size-2.5"
                              />
                              {workingTreeIndicators.editedCount}
                            </span>
                          )}
                          {workingTreeIndicators.addedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs dark:text-emerald-300">
                              <PlusIcon aria-hidden className="size-2.5" />
                              {workingTreeIndicators.addedCount}
                            </span>
                          )}
                          {workingTreeIndicators.removedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-rose-700 text-xs dark:text-rose-300">
                              <MinusIcon aria-hidden className="size-2.5" />
                              {workingTreeIndicators.removedCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ) : null}

                  {timelineRows
                    .filter((row) => row.type !== "wip")
                    .map((row) => {
                      if (row.type === "commit" && row.commitHash) {
                        const item = commits.find(
                          (commit) => commit.hash === row.commitHash
                        );

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
                          commits,
                          item.hash
                        );
                        const isPullableCommit = item.syncState === "pullable";
                        const commitRefs = item.refs
                          .map(
                            (ref) => normalizeCommitRefLabel(ref) ?? ref.trim()
                          )
                          .filter((ref) => ref.length > 0);
                        const visibleRefCount = commitRefs.length > 2 ? 1 : 2;
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
                                  "group relative z-10 grid h-11 w-full items-center border-border/35 border-b px-2 text-left transition-colors",
                                  selectedTimelineRowId === item.hash ||
                                    openCommitMenuHash === item.hash
                                    ? "bg-muted hover:bg-muted"
                                    : "hover:bg-muted/35"
                                )}
                                onClick={() => {
                                  handleCommitRowClick(item.hash);
                                }}
                                style={{
                                  gridTemplateColumns:
                                    timelineGridTemplateColumns,
                                }}
                                type="button"
                              >
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
                                            <ArrowDownIcon className="size-3" />
                                            Pull
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom">
                                            Commit available from upstream
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : null}
                                      {visibleCommitRefs.map((ref, index) => (
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
                                      ))}
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
                                            {hiddenCommitRefs.join(", ")}
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground/70 text-xs">
                                      <span className="sr-only">No refs</span>
                                    </span>
                                  )}
                                </div>
                                <div className="h-full" />
                                <div className="relative min-w-0 self-stretch">
                                  <div
                                    className="absolute top-0 bottom-0 left-0 rounded-full"
                                    style={{
                                      background: isPullableCommit
                                        ? `repeating-linear-gradient(to bottom, ${laneColor} 0 2px, transparent 2px 6px)`
                                        : laneColor,
                                      width: TIMELINE_COMMIT_MESSAGE_BAR_WIDTH,
                                    }}
                                  />
                                  <div
                                    className="flex h-full min-w-0 items-center gap-1.5"
                                    style={{
                                      paddingLeft:
                                        TIMELINE_COMMIT_MESSAGE_BAR_WIDTH +
                                        TIMELINE_COMMIT_MESSAGE_BAR_GAP,
                                    }}
                                  >
                                    <p className="min-w-0 flex-1 truncate pr-2 text-sm">
                                      <span>{commitTitle}</span>
                                      {commitDescription.length > 0 ? (
                                        <span className="text-muted-foreground/80">
                                          {" "}
                                          {commitDescription}
                                        </span>
                                      ) : null}
                                    </p>
                                  </div>
                                </div>
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
                        commits,
                        row.anchorCommitHash ?? ""
                      );
                      const timelineEntry = getSidebarEntryForTimelineRow(row);
                      const rowLabel = row.label ?? "";
                      const rowKindLabel =
                        row.type === "stash"
                          ? "Stash snapshot"
                          : "Tag reference";

                      const rowButton = (
                        <button
                          className={cn(
                            "group relative z-10 grid h-11 w-full items-center border-border/35 border-b px-2 text-left transition-colors",
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
                              <span className="truncate">{rowLabel}</span>
                            </span>
                          </div>
                          <div className="h-full" />
                          <div className="relative min-w-0 self-stretch">
                            <div
                              className="absolute top-0 bottom-0 left-0 rounded-full"
                              style={{
                                backgroundColor: laneColor,
                                width: TIMELINE_COMMIT_MESSAGE_BAR_WIDTH,
                              }}
                            />
                            <div
                              className="flex h-full min-w-0 items-center gap-1.5"
                              style={{
                                paddingLeft:
                                  TIMELINE_COMMIT_MESSAGE_BAR_WIDTH +
                                  TIMELINE_COMMIT_MESSAGE_BAR_GAP,
                              }}
                            >
                              <p className="min-w-0 flex-1 truncate pr-2 text-sm">
                                <span>{rowLabel}</span>
                                <span className="text-muted-foreground/80">
                                  {" "}
                                  {rowKindLabel}
                                </span>
                              </p>
                            </div>
                          </div>
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
                              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                                Loading hunk surface...
                              </div>
                            }
                          >
                            <LazyDiffWorkspaceHunkSurface
                              fontFamily={editorPreferences.fontFamily}
                              fontSize={editorPreferences.fontSize}
                              hunks={activeHunks}
                              ignoreTrimWhitespace={ignoreTrimWhitespace}
                              isLoading={isLoadingHunks}
                              language={
                                editorPreferences.syntaxHighlighting
                                  ? resolveMonacoLanguage(activeDiffPath)
                                  : "plaintext"
                              }
                              lineNumbers={editorPreferences.lineNumbers}
                              modelPathBase={
                                hunkMonacoModelBasePath ??
                                "inmemory://litgit/unknown?hunk"
                              }
                              modified={activeDiff.newText}
                              onMount={(editor) => {
                                openedDiffEditorRef.current = editor;
                                setIsDiffEditorReady(true);
                                applyDiffEditorPreferences(
                                  editor,
                                  editorPreferences.lineNumbers,
                                  editorPreferences.tabSize,
                                  editorPreferences.eol
                                );
                              }}
                              onRetry={() => {
                                handleRetryDiffPreview().catch(() => undefined);
                              }}
                              original={activeDiff.oldText}
                              renderError={hunkLoadError}
                              syntaxHighlighting={
                                editorPreferences.syntaxHighlighting
                              }
                              theme={
                                resolvedTheme === "light" ? "vs" : "vs-dark"
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
                              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                                Loading diff surface...
                              </div>
                            }
                          >
                            <LazyDiffPreviewMonacoSurface
                              fontFamily={editorPreferences.fontFamily}
                              fontSize={editorPreferences.fontSize}
                              ignoreTrimWhitespace={ignoreTrimWhitespace}
                              language={
                                editorPreferences.syntaxHighlighting
                                  ? resolveMonacoLanguage(activeDiffPath)
                                  : "plaintext"
                              }
                              lineNumbers={editorPreferences.lineNumbers}
                              modelPathBase={
                                diffMonacoModelBasePath ??
                                "inmemory://litgit/unknown?diff"
                              }
                              modified={activeDiff.newText}
                              onMount={(editor) => {
                                openedDiffEditorRef.current = editor;
                                setIsDiffEditorReady(true);
                                applyDiffEditorPreferences(
                                  editor,
                                  editorPreferences.lineNumbers,
                                  editorPreferences.tabSize,
                                  editorPreferences.eol
                                );
                              }}
                              original={activeDiff.oldText}
                              renderSideBySide={
                                resolvedPresentation === "split"
                              }
                              syntaxHighlighting={
                                editorPreferences.syntaxHighlighting
                              }
                              theme={
                                resolvedTheme === "light" ? "vs" : "vs-dark"
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
                          <div className="h-full overflow-auto p-3">
                            {useImageSplitView ? (
                              <div className="grid min-h-full grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="flex min-h-0 flex-col border border-border/70 bg-background">
                                  <p className="border-border/70 border-b px-3 py-2 font-medium text-xs uppercase tracking-wide">
                                    Original
                                  </p>
                                  <div className="flex min-h-55 flex-1 items-center justify-center p-3">
                                    {activeDiffOldImageDataUrl ? (
                                      <img
                                        alt={`Original version of ${activeDiffPath}`}
                                        className="max-h-full max-w-full object-contain"
                                        height={800}
                                        src={activeDiffOldImageDataUrl}
                                        width={1200}
                                      />
                                    ) : (
                                      <p className="text-center text-muted-foreground text-xs">
                                        No image in the previous revision.
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex min-h-0 flex-col border border-border/70 bg-background">
                                  <p className="border-border/70 border-b px-3 py-2 font-medium text-xs uppercase tracking-wide">
                                    Modified
                                  </p>
                                  <div className="flex min-h-55 flex-1 items-center justify-center p-3">
                                    {activeDiffNewImageDataUrl ? (
                                      <img
                                        alt={`Modified version of ${activeDiffPath}`}
                                        className="max-h-full max-w-full object-contain"
                                        height={800}
                                        src={activeDiffNewImageDataUrl}
                                        width={1200}
                                      />
                                    ) : (
                                      <p className="text-center text-muted-foreground text-xs">
                                        No image in the current revision.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex min-h-full items-center justify-center border border-border/70 bg-background p-3">
                                {centeredImageDataUrl ? (
                                  <img
                                    alt={activeDiffPath}
                                    className="max-h-full max-w-full object-contain"
                                    height={800}
                                    src={centeredImageDataUrl}
                                    width={1200}
                                  />
                                ) : (
                                  <p className="text-center text-muted-foreground text-xs">
                                    No preview available for this image
                                    revision.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
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
                              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                                Loading file view...
                              </div>
                            }
                          >
                            <LazyDiffWorkspaceMonacoFileSurface
                              fontFamily={editorPreferences.fontFamily}
                              fontSize={editorPreferences.fontSize}
                              language={
                                editorPreferences.syntaxHighlighting
                                  ? resolveMonacoLanguage(activeDiffPath)
                                  : "plaintext"
                              }
                              lineNumbers={editorPreferences.lineNumbers}
                              modelPath={
                                fileMonacoModelPath ??
                                "inmemory://litgit/unknown?file"
                              }
                              onMount={(editor) => {
                                openedFileEditorRef.current = editor;
                                applyCodeEditorPreferences(
                                  editor,
                                  editorPreferences.lineNumbers,
                                  editorPreferences.tabSize,
                                  editorPreferences.eol
                                );
                              }}
                              syntaxHighlighting={
                                editorPreferences.syntaxHighlighting
                              }
                              theme={
                                resolvedTheme === "light" ? "vs" : "vs-dark"
                              }
                              value={activeDiff.newText}
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
                          <div className="h-full overflow-auto p-3">
                            <div className="flex min-h-full items-center justify-center border border-border/70 bg-background p-3">
                              {centeredImageDataUrl ? (
                                <img
                                  alt={activeDiffPath}
                                  className="max-h-full max-w-full object-contain"
                                  height={800}
                                  src={centeredImageDataUrl}
                                  width={1200}
                                />
                              ) : (
                                <p className="text-center text-muted-foreground text-xs">
                                  No preview available for this image revision.
                                </p>
                              )}
                            </div>
                          </div>
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
                            monacoModelBasePath ??
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
                              ? resolveMonacoLanguage(activeDiffPath)
                              : "plaintext"
                          }
                          lineNumbers={editorPreferences.lineNumbers}
                          onCancelDiff={handleWorkspaceCloseRequest}
                          onDiffEditorMount={(editor) => {
                            applyDiffEditorPreferences(
                              editor,
                              editorPreferences.lineNumbers,
                              editorPreferences.tabSize,
                              editorPreferences.eol
                            );
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
                          theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
                          wordWrap={editorPreferences.wordWrap}
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
                          fontFamily={editorPreferences.fontFamily}
                          fontSize={editorPreferences.fontSize}
                          isLoading={isLoadingBlame}
                          language={
                            editorPreferences.syntaxHighlighting
                              ? resolveMonacoLanguage(activeDiffPath)
                              : "plaintext"
                          }
                          lineNumbers={editorPreferences.lineNumbers}
                          lines={blameLines}
                          modelPath={
                            blameMonacoModelPath ??
                            "inmemory://litgit/unknown?blame"
                          }
                          onPreviewEditorMount={(editor) => {
                            openedFileEditorRef.current = editor;
                            applyCodeEditorPreferences(
                              editor,
                              editorPreferences.lineNumbers,
                              editorPreferences.tabSize,
                              editorPreferences.eol
                            );
                          }}
                          onRetry={() => {
                            handleRetryDiffPreview().catch(() => undefined);
                          }}
                          renderError={blameError}
                          syntaxHighlighting={
                            editorPreferences.syntaxHighlighting
                          }
                          theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
                          wordWrap={editorPreferences.wordWrap}
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
                            {hasRequestedEditSurface ? (
                              <Suspense
                                fallback={
                                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                    <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                                    Loading editor...
                                  </div>
                                }
                              >
                                <LazyDiffWorkspaceMonacoEditSurface
                                  fontFamily={editorPreferences.fontFamily}
                                  fontSize={editorPreferences.fontSize}
                                  language={
                                    editorPreferences.syntaxHighlighting
                                      ? resolveMonacoLanguage(activeDiffPath)
                                      : "plaintext"
                                  }
                                  lineNumbers={editorPreferences.lineNumbers}
                                  modelPath={
                                    editMonacoModelPath ??
                                    "inmemory://litgit/unknown?edit"
                                  }
                                  onChange={setEditBuffer}
                                  onMount={(editor) => {
                                    openedEditEditorRef.current = editor;
                                    applyCodeEditorPreferences(
                                      editor,
                                      editorPreferences.lineNumbers,
                                      editorPreferences.tabSize,
                                      editorPreferences.eol
                                    );
                                  }}
                                  onSave={() => {
                                    handleSaveEditedFile().catch(
                                      () => undefined
                                    );
                                  }}
                                  syntaxHighlighting={
                                    editorPreferences.syntaxHighlighting
                                  }
                                  theme={
                                    resolvedTheme === "light" ? "vs" : "vs-dark"
                                  }
                                  value={editBuffer}
                                  wordWrap={editorPreferences.wordWrap}
                                />
                              </Suspense>
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
                                Preparing editor...
                              </div>
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
                          <div className="border border-border/70 bg-background/70">
                            <div
                              className="overflow-y-auto px-2.5 pt-2.5"
                              ref={commitDetailsLayoutRef}
                              style={{
                                height: `${commitDetailsPanelHeight}px`,
                              }}
                            >
                              <div className="space-y-2">
                                <p className="font-medium leading-snug">
                                  {selectedCommitMessageSections.summary}
                                </p>
                                {selectedCommitMessageSections.detailLines
                                  .length > 0 ? (
                                  <ul className="space-y-1.5 pb-1 text-muted-foreground text-sm">
                                    {selectedCommitMessageSections.detailLines.map(
                                      (line) => (
                                        <li className="leading-snug" key={line}>
                                          - {line}
                                        </li>
                                      )
                                    )}
                                  </ul>
                                ) : null}
                              </div>
                            </div>
                            <button
                              aria-label="Resize commit message"
                              className="desktop-resize-handle-horizontal-focus h-1.5 w-full cursor-row-resize border-border/70 border-t bg-transparent transition-colors hover:bg-accent/30"
                              onMouseDown={startCommitDetailsResize}
                              type="button"
                            />
                          </div>
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
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                          >
                                            {isCommitTreeFullyExpanded
                                              ? "Collapse All"
                                              : "Expand All"}
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
                                        return renderCommitTreeNodes(
                                          selectedCommitTree,
                                          selectedCommit.hash
                                        );
                                      }

                                      return renderCommitPathRows(
                                        sortedCommitPathRows,
                                        selectedCommit.hash
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
                                  return renderCommitTreeNodes(
                                    selectedReferenceTree,
                                    selectedReferenceRevision
                                  );
                                }

                                return renderCommitPathRows(
                                  sortedSelectedReferencePathRows,
                                  selectedReferenceRevision
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
      <Dialog
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
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!isSubmittingPublishRepo}
        >
          <DialogHeader>
            <DialogTitle>Publish repository before push</DialogTitle>
            <DialogDescription>
              No Git remote is configured for this project. Publish it to
              GitHub, then continue pushing the current branch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="publish-repository-name">Repository name</Label>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
                disabled={isSubmittingPublishRepo}
                id="publish-repository-name"
                onChange={(event) => {
                  setPublishRepoName(event.target.value);
                  setPublishRepoFormError(null);
                }}
                placeholder="my-repository"
                spellCheck={false}
                value={publishRepoName}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="font-medium text-sm">Visibility</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="focus-visible:desktop-focus justify-start focus-visible:ring-0! focus-visible:ring-offset-0!"
                  disabled={isSubmittingPublishRepo}
                  onClick={() => {
                    setPublishRepoVisibility("private");
                  }}
                  type="button"
                  variant={
                    publishRepoVisibility === "private" ? "default" : "outline"
                  }
                >
                  Private
                </Button>
                <Button
                  className="focus-visible:desktop-focus justify-start focus-visible:ring-0! focus-visible:ring-offset-0!"
                  disabled={isSubmittingPublishRepo}
                  onClick={() => {
                    setPublishRepoVisibility("public");
                  }}
                  type="button"
                  variant={
                    publishRepoVisibility === "public" ? "default" : "outline"
                  }
                >
                  Public
                </Button>
              </div>
            </fieldset>
            {publishRepoFormError ? (
              <p className="text-destructive text-sm">{publishRepoFormError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isSubmittingPublishRepo}
              onClick={() => {
                setIsPublishRepoConfirmOpen(false);
                pendingPublishPushActionRef.current = null;
                setPublishRepoFormError(null);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="focus-visible:desktop-focus focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isSubmittingPublishRepo}
              onClick={() => {
                executePublishAndPush().catch(() => undefined);
              }}
              type="button"
            >
              {isSubmittingPublishRepo ? "Publishing..." : "Publish and Push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
