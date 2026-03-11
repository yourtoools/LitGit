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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import { Input } from "@litgit/ui/components/input";
import { InputGroup, InputGroupAddon } from "@litgit/ui/components/input-group";
import { Label } from "@litgit/ui/components/label";
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
import { DiffEditor } from "@monaco-editor/react";
import {
  ArrowBendRightUpIcon,
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
  GitBranchIcon,
  GithubLogoIcon,
  PencilSimpleIcon,
  SpinnerGapIcon,
  StackSimpleIcon,
  TagIcon,
  TerminalWindowIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useSearch } from "@tanstack/react-router";
import type { editor as MonacoEditor } from "monaco-editor";
import { useTheme } from "next-themes";
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { IntegratedTerminalPanel } from "@/components/terminal/integrated-terminal-panel";
import { getRuntimePlatform } from "@/lib/runtime-platform";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import type {
  PullActionMode,
  RepositoryCommit,
  RepositoryCommitFile,
  RepositoryCommitFileDiff,
  RepositoryFileDiff,
  RepositoryStash,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

interface SidebarEntry {
  active?: boolean;
  name: string;
  pendingPushCount?: number;
  pendingSyncCount?: number;
  searchName: string;
  stashRef?: string;
  type: "branch" | "stash" | "tag";
}

interface SidebarGroupItem {
  count: number;
  entries: SidebarEntry[];
  key: string;
  name: string;
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
type SidebarResizeTarget = "left" | "right";

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
const HORIZONTAL_RESIZE_HANDLE_WIDTH = 6;
const MIN_TIMELINE_CONTENT_WIDTH = 560;

const GIT_STATUS_STYLE_BY_CODE: Record<
  string,
  { className: string; label: string; short: string }
> = {
  A: {
    className: "text-emerald-500 dark:text-emerald-400",
    label: "Added",
    short: "+",
  },
  C: {
    className: "text-sky-500 dark:text-sky-400",
    label: "Copied",
    short: "C",
  },
  D: {
    className: "text-rose-500 dark:text-rose-400",
    label: "Removed",
    short: "-",
  },
  M: {
    className: "text-amber-500 dark:text-amber-400",
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
    className: "text-emerald-500 dark:text-emerald-400",
    label: "Added",
    short: "+",
  },
};

function getStatusDescriptor(code: string) {
  return GIT_STATUS_STYLE_BY_CODE[code] ?? null;
}

const TREE_STATUS_SUMMARY_ORDER = ["M", "A", "D", "R", "C", "U", "T", "?"];

function createEmptyTreeNode(name: string, fullPath: string): ChangeTreeNode {
  return {
    children: new Map<string, ChangeTreeNode>(),
    fullPath,
    item: null,
    name,
  };
}

function buildChangeTree(items: RepositoryWorkingTreeItem[]): ChangeTreeNode[] {
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

        return left.name.localeCompare(right.name);
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
  files: RepositoryCommitFile[]
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

        return left.name.localeCompare(right.name);
      });

  return toSortedArray(root);
}

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;
const WORKING_TREE_ROW_ID = "__working_tree__";
const FILE_EXTENSION_PATTERN = /\.([a-z0-9]+)$/i;

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

function resolveMonacoLanguage(filePath: string): string {
  const normalizedPath = filePath.toLowerCase();
  const extension = FILE_EXTENSION_PATTERN.exec(normalizedPath)?.[1] ?? "";

  if (extension.length === 0) {
    return "plaintext";
  }

  return MONACO_LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}

function clampWidth(value: number, min: number, max: number): number {
  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);

  return Math.min(upperBound, Math.max(lowerBound, value));
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
  const repoWorkingTreeItems = useRepoStore(
    (state) => state.repoWorkingTreeItems
  );
  const isLoadingBranches = useRepoStore((state) => state.isLoadingBranches);
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const isLoadingStatus = useRepoStore((state) => state.isLoadingStatus);
  const isLoadingWip = useRepoStore((state) => state.isLoadingWip);
  const switchBranch = useRepoStore((state) => state.switchBranch);
  const applyStash = useRepoStore((state) => state.applyStash);
  const popStash = useRepoStore((state) => state.popStash);
  const dropStash = useRepoStore((state) => state.dropStash);
  const addIgnoreRule = useRepoStore((state) => state.addIgnoreRule);
  const stageAll = useRepoStore((state) => state.stageAll);
  const unstageAll = useRepoStore((state) => state.unstageAll);
  const stageFile = useRepoStore((state) => state.stageFile);
  const unstageFile = useRepoStore((state) => state.unstageFile);
  const getFileDiff = useRepoStore((state) => state.getFileDiff);
  const getLatestCommitMessage = useRepoStore(
    (state) => state.getLatestCommitMessage
  );
  const getCommitFiles = useRepoStore((state) => state.getCommitFiles);
  const getCommitFileDiff = useRepoStore((state) => state.getCommitFileDiff);
  const discardAllChanges = useRepoStore((state) => state.discardAllChanges);
  const discardPathChanges = useRepoStore((state) => state.discardPathChanges);
  const commitChanges = useRepoStore((state) => state.commitChanges);
  const pullBranch = useRepoStore((state) => state.pullBranch);
  const pushBranch = useRepoStore((state) => state.pushBranch);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    Record<string, boolean>
  >({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    LEFT_SIDEBAR_DEFAULT_WIDTH
  );
  const [rightSidebarWidth, setRightSidebarWidth] = useState(
    RIGHT_SIDEBAR_DEFAULT_WIDTH
  );
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [isStagingAll, setIsStagingAll] = useState(false);
  const [isUnstagingAll, setIsUnstagingAll] = useState(false);
  const [isUpdatingFilePath, setIsUpdatingFilePath] = useState<string | null>(
    null
  );
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDiscardingAllChanges, setIsDiscardingAllChanges] = useState(false);
  const [isDiscardAllConfirmOpen, setIsDiscardAllConfirmOpen] = useState(false);
  const [isForcePushConfirmOpen, setIsForcePushConfirmOpen] = useState(false);
  const [forcePushConfirmMode, setForcePushConfirmMode] = useState<
    "commit" | "push"
  >("push");
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isApplyingStash, setIsApplyingStash] = useState(false);
  const [isPoppingStash, setIsPoppingStash] = useState(false);
  const [isDroppingStash, setIsDroppingStash] = useState(false);
  const [draftCommitSummary, setDraftCommitSummary] = useState("");
  const [draftCommitDescription, setDraftCommitDescription] = useState("");
  const [amendPreviousCommit, setAmendPreviousCommit] = useState(false);
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [skipCommitHooks, setSkipCommitHooks] = useState(false);
  const [isCommitOptionsCollapsed, setIsCommitOptionsCollapsed] =
    useState(false);
  const [changesViewMode, setChangesViewMode] =
    useState<ChangesViewMode>("tree");
  const [isUnstagedSectionCollapsed, setIsUnstagedSectionCollapsed] =
    useState(false);
  const [isStagedSectionCollapsed, setIsStagedSectionCollapsed] =
    useState(false);
  const [expandedTreeNodePaths, setExpandedTreeNodePaths] = useState<
    Record<string, boolean>
  >({});
  const [workingTreeWipInput, setWorkingTreeWipInput] = useState("");
  const [isLoadingDiffPath, setIsLoadingDiffPath] = useState<string | null>(
    null
  );
  const [openedDiff, setOpenedDiff] = useState<RepositoryFileDiff | null>(null);
  const [openedDiffPath, setOpenedDiffPath] = useState<string | null>(null);
  const [commitDetailsViewMode, setCommitDetailsViewMode] =
    useState<ChangesViewMode>("tree");
  const [expandedCommitTreeNodePaths, setExpandedCommitTreeNodePaths] =
    useState<Record<string, boolean>>({});
  const [commitFilesByHash, setCommitFilesByHash] = useState<
    Record<string, RepositoryCommitFile[]>
  >({});
  const [isLoadingCommitFilesHash, setIsLoadingCommitFilesHash] = useState<
    string | null
  >(null);
  const [openedCommitDiff, setOpenedCommitDiff] =
    useState<RepositoryCommitFileDiff | null>(null);
  const [isLoadingCommitDiffPath, setIsLoadingCommitDiffPath] = useState<
    string | null
  >(null);
  const [pullActionMode, setPullActionMode] =
    useState<PullActionMode>("pull-ff-possible");
  const [openEntryMenuKey, setOpenEntryMenuKey] = useState<string | null>(null);
  const pullActionLabelByMode: Record<PullActionMode, string> = {
    "fetch-all": "Fetch All",
    "pull-ff-only": "Pull (fast-forward only)",
    "pull-ff-possible": "Pull (fast-forward if possible)",
    "pull-rebase": "Pull (rebase)",
  };
  const selectedPullActionLabel = pullActionLabelByMode[pullActionMode];
  const [sidebarFilterInputValue, setSidebarFilterInputValue] = useState("");
  const [sidebarFilterQuery, setSidebarFilterQuery] = useState("");
  const sidebarFilterInputRef = useRef<HTMLInputElement | null>(null);
  const mainScrollContainerRef = useRef<HTMLDivElement | null>(null);
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
  const leftSidebarWidthRef = useRef(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const rightSidebarWidthRef = useRef(RIGHT_SIDEBAR_DEFAULT_WIDTH);
  const isRightSidebarOpenRef = useRef(true);
  const [, startSidebarFilterTransition] = useTransition();
  const deferredSidebarFilterQuery = useDeferredValue(sidebarFilterQuery);
  const isTerminalPanelOpen = useTerminalPanelStore((state) => state.isOpen);
  const toggleTerminalPanel = useTerminalPanelStore((state) => state.toggle);
  const dateFormatPreference = usePreferencesStore(
    (state) => state.ui.dateFormat
  );
  const localePreference = usePreferencesStore((state) => state.ui.locale);
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const editorPreferences = usePreferencesStore((state) => state.editor);
  const openedDiffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(
    null
  );
  const preAmendDraftRef = useRef<{
    description: string;
    summary: string;
  } | null>(null);
  const pendingForcePushActionRef = useRef<(() => Promise<void>) | null>(null);
  const { resolvedTheme } = useTheme();
  const routeSearch = useSearch({ strict: false });
  const activeTabIdFromUrl =
    typeof routeSearch.tabId === "string" ? routeSearch.tabId : "tab:default";

  leftSidebarWidthRef.current = leftSidebarWidth;
  rightSidebarWidthRef.current = rightSidebarWidth;
  isRightSidebarOpenRef.current = isRightSidebarOpen;

  const activeRepo = openedRepos.find((repo) => repo.id === activeRepoId);
  const commits = useMemo<RepositoryCommit[]>(
    () => (activeRepoId ? (repoCommits[activeRepoId] ?? []) : []),
    [activeRepoId, repoCommits]
  );
  const branches = useMemo(
    () => (activeRepoId ? (repoBranches[activeRepoId] ?? []) : []),
    [activeRepoId, repoBranches]
  );
  const stashes = useMemo<RepositoryStash[]>(
    () => (activeRepoId ? (repoStashes[activeRepoId] ?? []) : []),
    [activeRepoId, repoStashes]
  );
  const workingTreeItems = useMemo<RepositoryWorkingTreeItem[]>(
    () => (activeRepoId ? (repoWorkingTreeItems[activeRepoId] ?? []) : []),
    [activeRepoId, repoWorkingTreeItems]
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
  const hasAnyWorkingTreeChanges = workingTreeItems.length > 0;
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
  const unstagedTree = useMemo(
    () => buildChangeTree(unstagedItems),
    [unstagedItems]
  );
  const stagedTree = useMemo(() => buildChangeTree(stagedItems), [stagedItems]);
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
  const isWorkingTreeSelection = selectedCommitId === WORKING_TREE_ROW_ID;
  const selectedCommit = useMemo(
    () => commits.find((item) => item.hash === selectedCommitId) ?? null,
    [commits, selectedCommitId]
  );
  const selectedCommitFiles = useMemo<RepositoryCommitFile[]>(
    () =>
      selectedCommit
        ? (commitFilesByHash[selectedCommit.hash] ?? [])
        : ([] as RepositoryCommitFile[]),
    [commitFilesByHash, selectedCommit]
  );
  const selectedCommitTree = useMemo(
    () => buildCommitFileTree(selectedCommitFiles),
    [selectedCommitFiles]
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
  const sidebarGroups = useMemo<SidebarGroupItem[]>(() => {
    const localEntries: SidebarEntry[] = [];
    const remoteEntries: SidebarEntry[] = [];
    const stashEntries: SidebarEntry[] = stashes.map((stash) => {
      const label = formatStashLabel(stash);

      return {
        name: label,
        searchName: label.toLowerCase(),
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
        name: branch.name,
        pendingPushCount: branch.aheadCount > 0 ? branch.aheadCount : undefined,
        pendingSyncCount:
          branch.behindCount > 0 ? branch.behindCount : undefined,
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
  }, [branches, stashes]);
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

    if (!diffEditor) {
      return;
    }

    applyDiffEditorPreferences(
      diffEditor,
      editorPreferences.lineNumbers,
      editorPreferences.tabSize,
      editorPreferences.eol
    );
  }, [
    editorPreferences.eol,
    editorPreferences.lineNumbers,
    editorPreferences.tabSize,
  ]);

  const formatCommitDate = (value: string): string => {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    const locale =
      localePreference === "system" || localePreference.trim().length === 0
        ? undefined
        : localePreference;

    return new Intl.DateTimeFormat(locale, {
      dateStyle: dateFormatPreference === "verbose" ? "full" : "medium",
      timeStyle: dateFormatPreference === "verbose" ? "medium" : "short",
    }).format(parsedDate);
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

  useEffect(() => {
    if (selectedCommitId === WORKING_TREE_ROW_ID && hasAnyWorkingTreeChanges) {
      return;
    }

    if (commits.length === 0) {
      setSelectedCommitId(
        hasAnyWorkingTreeChanges ? WORKING_TREE_ROW_ID : null
      );
      return;
    }

    if (
      !(
        selectedCommitId &&
        commits.some((commit) => commit.hash === selectedCommitId)
      )
    ) {
      setSelectedCommitId(commits[0].hash);
    }
  }, [commits, hasAnyWorkingTreeChanges, selectedCommitId]);

  useEffect(() => {
    if (activeRepoId === null) {
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
      return;
    }

    setDraftCommitSummary("");
    setDraftCommitDescription("");
    setAmendPreviousCommit(false);
  }, [activeRepoId]);

  useEffect(() => {
    if (activeRepoId === null) {
      setWorkingTreeWipInput("");
      return;
    }
  }, [activeRepoId]);

  useEffect(() => {
    if (activeRepoId === null) {
      setIsLoadingDiffPath(null);
      setOpenedDiff(null);
      setOpenedDiffPath(null);
      return;
    }

    setIsLoadingDiffPath(null);
    setOpenedDiff(null);
    setOpenedDiffPath(null);
  }, [activeRepoId]);

  useEffect(() => {
    if (!activeRepoId || isWorkingTreeSelection || !selectedCommit) {
      setOpenedCommitDiff(null);
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
    isWorkingTreeSelection,
    selectedCommit,
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
      const hasRightSidebar = isRightSidebarOpen;
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
  }, [isRightSidebarOpen]);

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

  const scheduleSidebarFilterUpdate = (nextValue: string) => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
    }

    sidebarFilterDebounceRef.current = globalThis.setTimeout(() => {
      startSidebarFilterTransition(() => {
        setSidebarFilterQuery(nextValue);
      });
      sidebarFilterDebounceRef.current = null;
    }, 120);
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

  const preventLeftClickInMenus = (event: React.MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const renderEntryIcon = (entry: SidebarEntry) => {
    if (entry.type === "stash") {
      return <StackSimpleIcon className="size-3.5 shrink-0" />;
    }

    if (entry.type === "tag") {
      return <TagIcon className="size-3.5 shrink-0" />;
    }

    return <GitBranchIcon className="size-3.5 shrink-0" />;
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
          className="rounded-sm bg-primary/20 px-0.5 text-foreground"
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

    try {
      await applyStash(activeRepoId, entry.stashRef);
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

    try {
      await popStash(activeRepoId, entry.stashRef);
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

  const handlePushAction = async () => {
    if (!activeRepoId || isPushing) {
      return;
    }

    const hasDivergedBranch =
      (currentLocalBranch?.aheadCount ?? 0) > 0 &&
      (currentLocalBranch?.behindCount ?? 0) > 0;

    if (hasDivergedBranch) {
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

    const hasDivergedBranch =
      (entry.pendingPushCount ?? 0) > 0 && (entry.pendingSyncCount ?? 0) > 0;

    if (hasDivergedBranch) {
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
    } finally {
      setIsPushing(false);
    }
  };

  const renderEntryDropdownMenuContent = (entry: SidebarEntry) => {
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
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Fast-forward {entry.name} to {currentBranch}
          </DropdownMenuItem>
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Merge {currentBranch} into {entry.name}
          </DropdownMenuItem>
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Rebase {currentBranch} onto {entry.name}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Checkout the commit at {entry.name}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Explain Branch Changes (Preview)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Create branch here</DropdownMenuItem>
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Cherry pick commit</DropdownMenuItem>
          <DropdownMenuSub>
            {/* TODO: Implement this action */}
            <DropdownMenuSubTrigger disabled>
              Reset {currentBranch} to this commit
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {/* TODO: Implement this action */}
              <DropdownMenuItem disabled>
                Soft - keep all changes
              </DropdownMenuItem>
              {/* TODO: Implement this action */}
              <DropdownMenuItem disabled>
                Mixed - keep working copy but reset index
              </DropdownMenuItem>
              {/* TODO: Implement this action */}
              <DropdownMenuItem disabled>
                Hard - discard all changes
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Revert commit</DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Delete {entry.name} locally
          </DropdownMenuItem>
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Delete {entry.name} from origin
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Copy tag name</DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Copy link to this tag on remote: origin
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Hide</DropdownMenuItem>
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Solo</DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Annotate {entry.name}</DropdownMenuItem>
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
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Edit stash message</DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>
            Share stash as Cloud Patch
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* TODO: Implement this action */}
          <DropdownMenuItem disabled>Hide</DropdownMenuItem>
        </DropdownMenuContent>
      );
    }

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
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Set Upstream</DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Fast-forward {entry.name} to {currentBranch}
        </DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Merge {currentBranch} into {entry.name}
        </DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Rebase {currentBranch} onto {entry.name}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={entry.active || isSwitchingBranch}
          onClick={() => {
            handleCheckoutBranch(entry).catch(() => undefined);
          }}
        >
          Checkout {entry.name}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Create worktree from {entry.name}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Create branch here</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Cherry pick commit</DropdownMenuItem>
        <DropdownMenuSub>
          {/* TODO: Implement this action */}
          <DropdownMenuSubTrigger disabled>
            Reset {currentBranch} to this commit
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {/* TODO: Implement this action */}
            <DropdownMenuItem disabled>
              Soft - keep all changes
            </DropdownMenuItem>
            {/* TODO: Implement this action */}
            <DropdownMenuItem disabled>
              Mixed - keep working copy but reset index
            </DropdownMenuItem>
            {/* TODO: Implement this action */}
            <DropdownMenuItem disabled>
              Hard - discard all changes
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Revert commit</DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Explain Branch Changes (Preview)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Rename {entry.name}</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Delete {entry.name}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Copy branch name</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Copy commit sha</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Copy link to branch: origin/{entry.name}
        </DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Copy link to this commit on remote: origin
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Hide</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Pin to Left</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Solo</DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>
          Compare commit against working directory
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Create tag here</DropdownMenuItem>
        {/* TODO: Implement this action */}
        <DropdownMenuItem disabled>Create annotated tag here</DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const renderEntryContextMenuContent = (entry: SidebarEntry) => {
    if (entry.type === "tag") {
      return (
        <ContextMenuContent
          className="w-80"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Fast-forward {entry.name} to {currentBranch}
          </ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Merge {currentBranch} into {entry.name}
          </ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Rebase {currentBranch} onto {entry.name}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Checkout the commit at {entry.name}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Explain Branch Changes (Preview)
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Create branch here</ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Cherry pick commit</ContextMenuItem>
          <ContextMenuSub>
            {/* TODO: Implement this action */}
            <ContextMenuSubTrigger disabled>
              Reset {currentBranch} to this commit
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {/* TODO: Implement this action */}
              <ContextMenuItem disabled>
                Soft - keep all changes
              </ContextMenuItem>
              {/* TODO: Implement this action */}
              <ContextMenuItem disabled>
                Mixed - keep working copy but reset index
              </ContextMenuItem>
              {/* TODO: Implement this action */}
              <ContextMenuItem disabled>
                Hard - discard all changes
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Revert commit</ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Delete {entry.name} locally
          </ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Delete {entry.name} from origin
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Copy tag name</ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>
            Copy link to this tag on remote: origin
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Hide</ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Solo</ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Annotate {entry.name}</ContextMenuItem>
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
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Edit stash message</ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Share stash as Cloud Patch</ContextMenuItem>
          <ContextMenuSeparator />
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Hide</ContextMenuItem>
        </ContextMenuContent>
      );
    }

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
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Set Upstream</ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Fast-forward {entry.name} to {currentBranch}
        </ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Merge {currentBranch} into {entry.name}
        </ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Rebase {currentBranch} onto {entry.name}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={entry.active || isSwitchingBranch}
          onClick={() => {
            handleCheckoutBranch(entry).catch(() => undefined);
          }}
        >
          Checkout {entry.name}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Create worktree from {entry.name}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Create branch here</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Cherry pick commit</ContextMenuItem>
        <ContextMenuSub>
          {/* TODO: Implement this action */}
          <ContextMenuSubTrigger disabled>
            Reset {currentBranch} to this commit
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {/* TODO: Implement this action */}
            <ContextMenuItem disabled>Soft - keep all changes</ContextMenuItem>
            {/* TODO: Implement this action */}
            <ContextMenuItem disabled>
              Mixed - keep working copy but reset index
            </ContextMenuItem>
            {/* TODO: Implement this action */}
            <ContextMenuItem disabled>
              Hard - discard all changes
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Revert commit</ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Explain Branch Changes (Preview)
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Rename {entry.name}</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Delete {entry.name}</ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Copy branch name</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Copy commit sha</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Copy link to branch: origin/{entry.name}
        </ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Copy link to this commit on remote: origin
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Hide</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Pin to Left</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Solo</ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>
          Compare commit against working directory
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Create tag here</ContextMenuItem>
        {/* TODO: Implement this action */}
        <ContextMenuItem disabled>Create annotated tag here</ContextMenuItem>
      </ContextMenuContent>
    );
  };
  const getTreeNodeStateKey = (
    section: "staged" | "unstaged",
    nodePath: string
  ) => `${section}:${nodePath}`;

  const toggleTreeNode = (section: "staged" | "unstaged", nodePath: string) => {
    const key = getTreeNodeStateKey(section, nodePath);

    setExpandedTreeNodePaths((current) => ({
      ...current,
      [key]: !current[key],
    }));
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
  const closeOpenedDiff = () => {
    setOpenedDiff(null);
    setOpenedDiffPath(null);
  };

  const handleOpenFileDiff = async (filePath: string) => {
    if (!activeRepoId || isLoadingDiffPath !== null) {
      return;
    }

    setOpenedCommitDiff(null);

    const isTogglingCurrentDiff =
      openedDiffPath === filePath && openedDiff !== null;

    if (isTogglingCurrentDiff) {
      closeOpenedDiff();
      return;
    }

    setIsLoadingDiffPath(filePath);

    try {
      const diff = await getFileDiff(activeRepoId, filePath);

      if (!diff) {
        return;
      }

      setOpenedDiff(diff);
      setOpenedDiffPath(filePath);
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

    return openedDiffActionMode === "stage" ? "Stage" : "Unstage";
  }, [openedDiffActionMode]);

  const handleOpenedDiffShortcutAction = async () => {
    if (openedDiffPath === null || openedDiffActionMode === null) {
      return;
    }

    await handleFileStageToggle(openedDiffPath, openedDiffActionMode);
  };

  const closeOpenedCommitDiff = () => {
    setOpenedCommitDiff(null);
  };

  const handleOpenCommitFileDiff = async (
    commitHash: string,
    filePath: string
  ) => {
    if (!activeRepoId || isLoadingCommitDiffPath !== null) {
      return;
    }

    setOpenedDiff(null);
    setOpenedDiffPath(null);

    const isTogglingCurrentDiff =
      openedCommitDiff !== null &&
      openedCommitDiff.commitHash === commitHash &&
      openedCommitDiff.path === filePath;

    if (isTogglingCurrentDiff) {
      closeOpenedCommitDiff();
      return;
    }

    setIsLoadingCommitDiffPath(`${commitHash}:${filePath}`);

    try {
      const diff = await getCommitFileDiff(activeRepoId, commitHash, filePath);

      if (!diff) {
        return;
      }

      setOpenedCommitDiff(diff);
    } finally {
      setIsLoadingCommitDiffPath(null);
    }
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

        return (
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors",
              openedCommitDiff?.commitHash === commitHash &&
                openedCommitDiff.path === file.path
                ? "bg-accent/30"
                : "hover:bg-accent/20"
            )}
            key={`${commitHash}-${file.path}`}
            onClick={() => {
              handleOpenCommitFileDiff(commitHash, file.path).catch(
                () => undefined
              );
            }}
            style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            type="button"
          >
            <span className="w-4" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <span className="inline-flex items-center gap-1 text-[0.72rem] text-muted-foreground">
              {file.additions > 0 ? (
                <span className="text-emerald-400">+{file.additions}</span>
              ) : null}
              {file.deletions > 0 ? (
                <span className="text-rose-400">-{file.deletions}</span>
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
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground text-xs hover:bg-accent/20 hover:text-foreground"
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
              <span className="ml-auto inline-flex items-center gap-2 text-[0.72rem] leading-none">
                {collapsedChangeSummary.modifiedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <PencilSimpleIcon className="size-2.5" />
                    {collapsedChangeSummary.modifiedCount}
                  </span>
                ) : null}
                {collapsedChangeSummary.addedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    +{collapsedChangeSummary.addedCount}
                  </span>
                ) : null}
                {collapsedChangeSummary.removedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-rose-300">
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

      return (
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors",
            openedCommitDiff?.commitHash === commitHash &&
              openedCommitDiff.path === file.path
              ? "bg-accent/30"
              : "hover:bg-accent/20"
          )}
          key={`${commitHash}-${file.path}`}
          onClick={() => {
            handleOpenCommitFileDiff(commitHash, file.path).catch(
              () => undefined
            );
          }}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">{file.path}</span>
          <span className="inline-flex items-center gap-1 text-[0.72rem] text-muted-foreground">
            {file.additions > 0 ? (
              <span className="text-emerald-400">+{file.additions}</span>
            ) : null}
            {file.deletions > 0 ? (
              <span className="text-rose-400">-{file.deletions}</span>
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
    if (openedDiff === null && openedCommitDiff === null) {
      return;
    }

    const handleEscapeToCloseDiff = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (openedDiff !== null) {
        setOpenedDiff(null);
        setOpenedDiffPath(null);
      }

      if (openedCommitDiff !== null) {
        setOpenedCommitDiff(null);
      }
    };

    globalThis.addEventListener("keydown", handleEscapeToCloseDiff);

    return () => {
      globalThis.removeEventListener("keydown", handleEscapeToCloseDiff);
    };
  }, [openedCommitDiff, openedDiff]);
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
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>File History</ContextMenuItem>
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>File Blame</ContextMenuItem>
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
          {/* TODO: Implement this action */}
          <ContextMenuItem disabled>Edit file</ContextMenuItem>
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
    section: "staged" | "unstaged",
    depth = 0
  ): ReactNode => {
    return nodes.map((node) => {
      const hasChildren = node.children.size > 0;
      const nodeStateKey = getTreeNodeStateKey(section, node.fullPath);
      const isExpanded = expandedTreeNodePaths[nodeStateKey] ?? depth < 1;
      const collapsedStatusCounts =
        hasChildren && !isExpanded
          ? collectTreeStatusCounts(node, section)
          : null;

      if (node.item) {
        const actionMode = section === "unstaged" ? "stage" : "unstage";
        const actionLabel = section === "unstaged" ? "Stage" : "Unstage";
        const isBusy = isUpdatingFilePath === node.item.path;
        const isLoadingDiff = isLoadingDiffPath === node.item.path;
        const isDiffOpened = openedDiffPath === node.item.path;

        return (
          <ContextMenu key={`${section}-${node.fullPath}`}>
            <ContextMenuTrigger>
              <div
                className={cn(
                  "group relative flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/20",
                  isDiffOpened && "bg-accent/30"
                )}
                style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
              >
                <button
                  aria-label={`Open diff for ${node.item.path}`}
                  className="absolute inset-0 z-0 rounded"
                  onClick={() => {
                    handleOpenFileDiff(node.item?.path ?? "").catch(
                      () => undefined
                    );
                  }}
                  type="button"
                />
                <div className="pointer-events-none inline-flex min-w-3 items-center justify-center">
                  {renderStatusBadges(node.item, section)}
                </div>
                <div className="pointer-events-none min-w-0 flex-1">
                  <p className="truncate">{node.name}</p>
                </div>
                <Button
                  className={cn(
                    "relative z-10 h-6 px-2 text-[0.65rem] transition-opacity",
                    isBusy
                      ? "opacity-100"
                      : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                  )}
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleFileStageToggle(
                      node.item?.path ?? "",
                      actionMode
                    ).catch(() => undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {isBusy ? "..." : actionLabel}
                </Button>
                {isLoadingDiff ? (
                  <SpinnerGapIcon className="relative z-10 size-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </ContextMenuTrigger>
            {renderChangeContextMenuContent(node.item?.path ?? "", section)}
          </ContextMenu>
        );
      }

      return (
        <div key={`${section}-${node.fullPath}`}>
          <ContextMenu>
            <ContextMenuTrigger>
              <button
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground text-xs hover:bg-accent/20 hover:text-foreground"
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
            {renderChangeContextMenuContent(node.fullPath, section, {
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
                "group relative flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/20",
                isDiffOpened && "bg-accent/30"
              )}
            >
              <button
                aria-label={`Open diff for ${item.path}`}
                className="absolute inset-0 z-0 rounded"
                onClick={() => {
                  handleOpenFileDiff(item.path).catch(() => undefined);
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
                  "relative z-10 h-6 px-2 text-[0.65rem] transition-opacity",
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

  const handleWorkingTreeRowClick = () => {
    if (!hasAnyWorkingTreeChanges) {
      return;
    }

    const isSameRow = selectedCommitId === WORKING_TREE_ROW_ID;

    if (isSameRow && isRightSidebarOpen) {
      setIsRightSidebarOpen(false);
      return;
    }

    setSelectedCommitId(WORKING_TREE_ROW_ID);
    setIsRightSidebarOpen(true);
  };

  const handleWorkingTreeInputClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const handleWorkingTreeInputKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
  };

  const openForcePushConfirm = (
    mode: "commit" | "push",
    action: () => Promise<void>
  ) => {
    pendingForcePushActionRef.current = action;
    setForcePushConfirmMode(mode);
    setIsForcePushConfirmOpen(true);
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

  const handleCommit = async () => {
    if (!activeRepoId || isCommitting || !canCommit) {
      return;
    }

    const hasDivergedBranch =
      (currentLocalBranch?.aheadCount ?? 0) > 0 &&
      (currentLocalBranch?.behindCount ?? 0) > 0;

    if (pushAfterCommit && (amendPreviousCommit || hasDivergedBranch)) {
      openForcePushConfirm("commit", async () => {
        await executeCommit(true);
      });
      return;
    }

    await executeCommit(false);
  };

  const executeCommit = async (forceWithLease: boolean) => {
    if (!activeRepoId || isCommitting || !canCommit) {
      return;
    }

    setIsCommitting(true);

    try {
      await commitChanges(
        activeRepoId,
        draftCommitSummary.trim(),
        draftCommitDescription.trim(),
        !amendPreviousCommit,
        amendPreviousCommit,
        skipCommitHooks
      );
      if (pushAfterCommit) {
        if (!forceWithLease && (currentLocalBranch?.behindCount ?? 0) > 0) {
          await pullBranch(activeRepoId, pullActionMode);
        }
        await pushBranch(activeRepoId, forceWithLease);
      }
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
      setPushAfterCommit(false);
      setSkipCommitHooks(false);
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
        <Sidebar
          className="shrink-0"
          style={{ width: `${leftSidebarWidth}px` }}
        >
          <SidebarHeader>
            <p className="text-[0.65rem] text-muted-foreground uppercase tracking-[0.16em]">
              Repository
            </p>
            <div className="mt-2 flex items-center gap-2">
              <GithubLogoIcon className="size-4 text-muted-foreground" />
              <p className="truncate font-semibold text-sm">
                {activeRepo.name}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>Viewing {filteredSidebarEntryCount}</span>
              </div>
              <InputGroup>
                <Input
                  className="h-8 border-0 bg-transparent pr-0 shadow-none focus-visible:ring-0"
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
                  <InputGroupAddon>
                    <Button
                      aria-label="Clear filter"
                      className="rounded-l-none border-0 border-input border-l"
                      onClick={clearSidebarFilter}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {filteredSidebarGroups.map((group) => (
              <SidebarGroup key={group.key}>
                <SidebarGroupLabel className="px-0 py-0">
                  <button
                    className="flex w-full items-center justify-between px-2 py-1"
                    onClick={() =>
                      setCollapsedGroupKeys((current) => ({
                        ...current,
                        [group.key]: !current[group.key],
                      }))
                    }
                    type="button"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-muted-foreground uppercase tracking-[0.13em]">
                      {collapsedGroupKeys[group.key] ? (
                        <CaretRightIcon className="size-3" />
                      ) : (
                        <CaretDownIcon className="size-3" />
                      )}
                      {group.name}
                    </span>
                    <span className="font-medium text-[0.68rem] text-muted-foreground">
                      {group.count}
                    </span>
                  </button>
                </SidebarGroupLabel>

                {!collapsedGroupKeys[group.key] && (
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.entries.map((entry) => (
                        <SidebarMenuItem
                          key={`${group.key}-${entry.stashRef ?? entry.name}`}
                        >
                          <ContextMenu
                            onOpenChange={(open) => {
                              const entryMenuKey = `${group.key}-${entry.stashRef ?? entry.name}`;
                              setOpenEntryMenuKey((current) => {
                                if (open) {
                                  return entryMenuKey;
                                }

                                if (current === entryMenuKey) {
                                  return null;
                                }

                                return current;
                              });
                            }}
                          >
                            <ContextMenuTrigger>
                              <SidebarMenuButton
                                aria-label={entry.name}
                                className={cn(
                                  "group",
                                  entry.active ||
                                    openEntryMenuKey ===
                                      `${group.key}-${entry.stashRef ?? entry.name}`
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                )}
                                disabled={
                                  entry.type !== "stash" && isSwitchingBranch
                                }
                                onClick={() => {
                                  handleCheckoutBranch(entry).catch(
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
                                    {renderHighlightedEntryName(entry.name)}
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
                                typeof entry.pendingSyncCount === "number" &&
                                entry.pendingSyncCount > 0 ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] opacity-90">
                                    <ArrowDownIcon className="size-3" />
                                    {entry.pendingSyncCount}
                                  </span>
                                ) : null}
                                {entry.type === "branch" &&
                                typeof entry.pendingPushCount === "number" &&
                                entry.pendingPushCount > 0 ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] opacity-90">
                                    <ArrowUpIcon className="size-3" />
                                    {entry.pendingPushCount}
                                  </span>
                                ) : null}
                                <DropdownMenu
                                  onOpenChange={(open) => {
                                    const entryMenuKey = `${group.key}-${entry.stashRef ?? entry.name}`;
                                    setOpenEntryMenuKey((current) => {
                                      if (open) {
                                        return entryMenuKey;
                                      }

                                      if (current === entryMenuKey) {
                                        return null;
                                      }

                                      return current;
                                    });
                                  }}
                                >
                                  <DropdownMenuTrigger
                                    render={
                                      <button
                                        aria-label={`More options for ${entry.name}`}
                                        className={cn(
                                          "ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent/80 focus-visible:opacity-100 group-hover:opacity-100",
                                          openEntryMenuKey ===
                                            `${group.key}-${entry.stashRef ?? entry.name}` &&
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
                                  {renderEntryDropdownMenuContent(entry)}
                                </DropdownMenu>
                              </SidebarMenuButton>
                            </ContextMenuTrigger>
                            {renderEntryContextMenuContent(entry)}
                          </ContextMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                )}
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <button
          aria-label="Resize left sidebar"
          className="h-full w-1.5 shrink-0 cursor-col-resize border-border/70 border-r bg-transparent hover:bg-accent/30"
          onMouseDown={startSidebarResize("left")}
          type="button"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid w-full grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-2 border-border/60 border-b bg-background px-3 py-1.5 text-foreground">
            <div className="flex min-w-0 items-center justify-start gap-1">
              <Combobox
                autoHighlight
                disabled={
                  isSwitchingBranch || branchComboboxOptions.length === 0
                }
                items={branchComboboxOptions}
                itemToStringLabel={(item: BranchComboboxOption) => item.name}
                onValueChange={(nextValue: BranchComboboxOption | null) => {
                  handleToolbarBranchChange(nextValue).catch(() => undefined);
                }}
                value={selectedBranchOption}
              >
                <ComboboxInput
                  className="w-56"
                  placeholder="Find branch..."
                  showClear={false}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No branch found.</ComboboxEmpty>
                  <ComboboxList>
                    {(option: BranchComboboxOption) => (
                      <ComboboxItem key={option.name} value={option}>
                        <div className="flex min-w-0 flex-1 items-center gap-2 pr-6">
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
                {/* TODO: Implement this action */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Undo"
                        disabled
                        size="default"
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
                    Undo
                  </TooltipContent>
                </Tooltip>
                {/* TODO: Implement this action */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Redo"
                        disabled
                        size="default"
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
                    Redo
                  </TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <InputGroup className="h-8 w-auto border-border/60 bg-transparent">
                          <Button
                            aria-label={`Run ${selectedPullActionLabel}`}
                            className="h-7 rounded-r-none border-0 px-2"
                            disabled={isPulling}
                            onClick={handlePullWithSelectedMode}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isPulling ? (
                              <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                            ) : (
                              <DownloadSimpleIcon className="size-4 text-muted-foreground" />
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
                                  className="h-7 rounded-l-none border-0 border-border/60 border-l px-1.5"
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
                        "gap-2",
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
                        "gap-2",
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
                        "gap-2",
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
                        "gap-2",
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
                        disabled={isPushing}
                        onClick={() => {
                          handlePushAction().catch(() => undefined);
                        }}
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isPushing ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <UploadSimpleIcon className="size-4 text-muted-foreground" />
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
                {/* TODO: Implement this action */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Branch"
                        disabled
                        size="default"
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
                {/* TODO: Implement this action */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Stash"
                        disabled
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <StackSimpleIcon className="size-4 text-muted-foreground" />
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
                {/* TODO: Implement this action */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Pop"
                        disabled
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <ArrowBendRightUpIcon className="size-4 text-muted-foreground" />
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
                        onClick={toggleTerminalPanel}
                        size={toolbarLabels ? "default" : "icon"}
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
              <div className="grid grid-cols-[180px_60px_minmax(0,1fr)] border-border/60 border-b px-3 py-2 text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
                <span>Branch / Tag</span>
                <span className="text-center">Graph</span>
                <span>Commit Message</span>
              </div>
              <div
                className={cn(
                  "relative min-h-0 flex-1 overflow-y-auto",
                  isTerminalPanelOpen && "pb-52"
                )}
                ref={mainScrollContainerRef}
              >
                {hasAnyWorkingTreeChanges ? (
                  <button
                    className={cn(
                      "group grid w-full cursor-pointer grid-cols-[180px_60px_minmax(0,1fr)] items-center border-border/35 border-b px-3 py-2 text-left transition-colors",
                      selectedCommitId === WORKING_TREE_ROW_ID
                        ? "bg-accent/30"
                        : "hover:bg-accent/20"
                    )}
                    onClick={handleWorkingTreeRowClick}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleWorkingTreeRowClick();
                      }
                    }}
                    type="button"
                  >
                    <div className="min-w-0" />
                    <div className="flex items-center justify-center">
                      <CircleIcon className="size-3 text-muted-foreground" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Input
                          className="h-7 w-full max-w-52"
                          onChange={(event) => {
                            setWorkingTreeWipInput(event.target.value);
                          }}
                          onClick={handleWorkingTreeInputClick}
                          onFocus={() => {
                            if (selectedCommitId !== WORKING_TREE_ROW_ID) {
                              setSelectedCommitId(WORKING_TREE_ROW_ID);
                            }

                            if (!isRightSidebarOpen) {
                              setIsRightSidebarOpen(true);
                            }
                          }}
                          onKeyDown={handleWorkingTreeInputKeyDown}
                          placeholder="// WIP"
                          value={workingTreeWipInput}
                        />
                        <span className="inline-flex items-center gap-1 text-[0.78rem] text-amber-300">
                          <span aria-hidden>~</span>
                          {workingTreeIndicators.editedCount}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[0.78rem] text-emerald-300">
                          <span aria-hidden>+</span>
                          {workingTreeIndicators.addedCount}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[0.78rem] text-rose-300">
                          <span aria-hidden>-</span>
                          {workingTreeIndicators.removedCount}
                        </span>
                      </div>
                    </div>
                  </button>
                ) : null}

                {commits.map((item, index) => (
                  <button
                    className={cn(
                      "group grid h-12 w-full grid-cols-[180px_60px_minmax(0,1fr)] items-center border-border/35 border-b px-3 text-left transition-colors",
                      selectedCommitId === item.hash
                        ? "bg-accent/30"
                        : "hover:bg-accent/20"
                    )}
                    key={item.hash}
                    onClick={() => {
                      const isSameCommit = selectedCommitId === item.hash;

                      if (isSameCommit && isRightSidebarOpen) {
                        setIsRightSidebarOpen(false);
                        return;
                      }

                      setSelectedCommitId(item.hash);
                      setIsRightSidebarOpen(true);
                    }}
                    type="button"
                  >
                    <div className="min-w-0 truncate">
                      {item.refs.length > 0 ? (
                        <div className="flex min-w-0 items-center gap-1">
                          {item.refs.slice(0, 2).map((ref) => (
                            <span
                              className="truncate rounded border border-border/75 bg-muted/40 px-1.5 py-0.5 text-[0.65rem]"
                              key={ref}
                            >
                              {ref}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/70 text-xs">
                          <span className="sr-only">No refs</span>
                        </span>
                      )}
                    </div>
                    <div className="relative flex h-full items-center justify-center">
                      <span className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-border/60 border-l" />
                      {index === 0 ? (
                        <span className="absolute top-0 left-1/2 h-1/2 -translate-x-1/2 bg-background px-px" />
                      ) : null}
                      {index === commits.length - 1 ? (
                        <span className="absolute bottom-0 left-1/2 h-1/2 -translate-x-1/2 bg-background px-px" />
                      ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate pr-2 text-sm">
                        {item.message}
                      </p>
                      <span className="hidden text-muted-foreground text-xs group-hover:inline md:inline">
                        {item.author}
                      </span>
                    </div>
                  </button>
                ))}
                {commits.length === 0 && !isLoadingHistory ? (
                  <div className="px-3 py-4 text-muted-foreground text-sm">
                    No commits found.
                  </div>
                ) : null}
                {isLoadingHistory ? (
                  <div className="px-3 py-4 text-muted-foreground text-sm">
                    Loading commits...
                  </div>
                ) : null}
              </div>
              <IntegratedTerminalPanel
                contextKey={`${activeTabIdFromUrl}:${activeRepoId ?? "repo:none"}`}
                cwd={activeRepo?.path ?? ""}
              />
              {openedDiff || openedCommitDiff ? (
                <div className="absolute inset-0 z-20 flex flex-col bg-background/95">
                  <div className="flex items-center gap-2 border-border/70 border-b px-3 py-2">
                    <p className="min-w-0 flex-1 truncate font-medium text-sm">
                      {openedDiff?.path ?? openedCommitDiff?.path}
                    </p>
                    {openedDiff ? (
                      <Button
                        className="h-7 px-2 text-xs"
                        disabled={
                          openedDiffActionMode === null ||
                          isUpdatingFilePath !== null
                        }
                        onClick={() => {
                          handleOpenedDiffShortcutAction().catch(
                            () => undefined
                          );
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {openedDiffActionLabel ?? "Action"}
                      </Button>
                    ) : null}
                    <Button
                      aria-label="Close diff editor"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        closeOpenedDiff();
                        closeOpenedCommitDiff();
                      }}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <DiffEditor
                      height="100%"
                      keepCurrentModifiedModel={false}
                      keepCurrentOriginalModel={false}
                      language={
                        editorPreferences.syntaxHighlighting
                          ? resolveMonacoLanguage(
                              openedDiff?.path ?? openedCommitDiff?.path ?? ""
                            )
                          : "plaintext"
                      }
                      modified={
                        openedDiff?.newText ?? openedCommitDiff?.newText ?? ""
                      }
                      onMount={(editor) => {
                        openedDiffEditorRef.current = editor;
                        applyDiffEditorPreferences(
                          editor,
                          editorPreferences.lineNumbers,
                          editorPreferences.tabSize,
                          editorPreferences.eol
                        );
                      }}
                      options={{
                        automaticLayout: true,
                        experimentalWhitespaceRendering: "svg",
                        fontFamily: editorPreferences.fontFamily,
                        fontSize: editorPreferences.fontSize,
                        lineNumbers: editorPreferences.lineNumbers,
                        minimap: { enabled: false },
                        readOnly: true,
                        renderSideBySide: true,
                        scrollBeyondLastLine: false,
                        // handled in onMount/updateOptions because the wrapper
                        // typing omits this diff-editor option
                        wordSeparators: editorPreferences.syntaxHighlighting
                          ? undefined
                          : "",
                        wordWrap: editorPreferences.wordWrap,
                      }}
                      original={
                        openedDiff?.oldText ?? openedCommitDiff?.oldText ?? ""
                      }
                      originalModelPath={undefined}
                      theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
                    />
                  </div>
                </div>
              ) : null}
            </section>

            {isRightSidebarOpen ? (
              <button
                aria-label="Resize right sidebar"
                className="h-full w-1.5 shrink-0 cursor-col-resize border-border/70 border-l bg-transparent hover:bg-accent/30"
                onMouseDown={startSidebarResize("right")}
                type="button"
              />
            ) : null}

            <aside
              className={cn(
                "flex h-full shrink-0 flex-col overflow-hidden border-border/70 border-l bg-muted/20",
                !isRightSidebarOpen && "hidden"
              )}
              style={{ width: `${rightSidebarWidth}px` }}
            >
              {!isWorkingTreeSelection && selectedCommit ? (
                <>
                  <header className="border-border/70 border-b px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
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
                    <div className="space-y-3 border-border/70 border-b px-3 py-3 text-sm">
                      <div className="rounded border border-border/70 bg-background/70 p-3">
                        <p className="font-medium leading-snug">
                          {selectedCommit.message}
                        </p>
                      </div>
                      <div className="rounded border border-border/70 bg-background/50 p-2.5">
                        <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-foreground text-sm">
                              {selectedCommit.author}
                            </span>
                            <span className="truncate text-muted-foreground">
                              parent:{" "}
                              {selectedCommit.parentHashes.at(0)?.slice(0, 7) ??
                                "none"}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            authored {formatCommitDate(selectedCommit.date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <PencilSimpleIcon className="size-3" />
                          {selectedCommitFileSummary.modifiedCount} modified
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          + {selectedCommitFileSummary.addedCount} added
                        </span>
                        <span className="inline-flex items-center gap-1 text-rose-300">
                          - {selectedCommitFileSummary.removedCount} deleted
                        </span>
                      </div>
                      <div className="inline-flex rounded-sm border border-border/80 bg-background/70 p-0.5">
                        <button
                          className={cn(
                            "rounded px-3 py-1 font-medium text-xs transition-colors",
                            commitDetailsViewMode === "path"
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setCommitDetailsViewMode("path")}
                          type="button"
                        >
                          Path
                        </button>
                        <button
                          className={cn(
                            "rounded px-3 py-1 font-medium text-xs transition-colors",
                            commitDetailsViewMode === "tree"
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setCommitDetailsViewMode("tree")}
                          type="button"
                        >
                          Tree
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                      {(() => {
                        if (isLoadingCommitFilesHash === selectedCommit.hash) {
                          return (
                            <div className="px-3 py-4 text-muted-foreground text-sm">
                              Loading changed files...
                            </div>
                          );
                        }

                        if (selectedCommitFiles.length === 0) {
                          return (
                            <div className="px-3 py-4 text-muted-foreground text-sm">
                              No changed files for this commit.
                            </div>
                          );
                        }

                        return (
                          <div className="h-full overflow-y-auto px-2 py-2">
                            {commitDetailsViewMode === "tree"
                              ? renderCommitTreeNodes(
                                  selectedCommitTree,
                                  selectedCommit.hash
                                )
                              : renderCommitPathRows(
                                  selectedCommitFiles,
                                  selectedCommit.hash
                                )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <header className="shrink-0 space-y-3 border-border/70 border-b px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        aria-label="Discard all changes"
                        className="h-8 w-8 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
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
                      <p className="truncate text-sm">
                        <span className="font-medium">
                          {workingTreeItems.length} file changes
                        </span>{" "}
                        on{" "}
                        <span className="rounded bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                          {currentBranch}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center">
                      <div className="inline-flex rounded-sm border border-border/80 bg-background/70 p-0.5">
                        <button
                          className={cn(
                            "rounded px-3 py-1 font-medium text-xs transition-colors",
                            changesViewMode === "path"
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setChangesViewMode("path")}
                          type="button"
                        >
                          Path
                        </button>
                        <button
                          className={cn(
                            "rounded px-3 py-1 font-medium text-xs transition-colors",
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
                  </header>

                  <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
                    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/70 bg-background/50">
                      <section
                        className={cn(
                          "flex min-h-0 flex-col",
                          isUnstagedSectionCollapsed ? "shrink-0" : "flex-1"
                        )}
                      >
                        <div className="flex items-center gap-2 border-border/70 border-b px-2 py-2">
                          <button
                            className="inline-flex items-center gap-1 text-left font-medium text-sm"
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
                            className="ml-auto h-7 border border-border/70 bg-background/60 px-2 text-[0.72rem] text-foreground hover:bg-accent/40"
                            disabled={!hasUnstagedChanges || isStagingAll}
                            onClick={() => {
                              handleStageAll().catch(() => undefined);
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isStagingAll ? "Staging..." : "Stage All Changes"}
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

                      <section
                        className={cn(
                          "flex min-h-0 flex-col border-border/70 border-t",
                          isStagedSectionCollapsed
                            ? "mt-auto shrink-0"
                            : "flex-1"
                        )}
                      >
                        <div className="flex items-center gap-2 border-border/70 border-b px-2 py-2">
                          <button
                            className="inline-flex items-center gap-1 text-left font-medium text-sm"
                            onClick={() =>
                              setIsStagedSectionCollapsed((current) => !current)
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
                            className="ml-auto h-7 border border-border/70 bg-background/60 px-2 text-[0.72rem] text-foreground hover:bg-accent/40"
                            disabled={!hasStagedChanges || isUnstagingAll}
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
                  </div>

                  <form className="shrink-0 border-border/70 border-t px-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="commit-summary">Title</Label>
                      <Input
                        id="commit-summary"
                        onChange={(event) =>
                          setDraftCommitSummary(event.target.value)
                        }
                        placeholder="Describe your changes"
                        value={draftCommitSummary}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="commit-description">Description</Label>
                      <textarea
                        className="h-24 w-full resize-none overflow-y-scroll rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                        id="commit-description"
                        onChange={(event) =>
                          setDraftCommitDescription(event.target.value)
                        }
                        placeholder="Optional details..."
                        value={draftCommitDescription}
                      />
                    </div>
                    <div className="mt-3 rounded-md border border-border/70 px-3 py-2">
                      <button
                        className="inline-flex items-center gap-1 font-medium text-muted-foreground text-xs"
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
                      className="mt-4 w-full"
                      disabled={isCommitting || !canCommit}
                      onClick={handleCommit}
                      type="button"
                    >
                      <DotOutlineIcon className="size-4" />
                      Commit staged changes
                    </Button>
                  </form>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>
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
