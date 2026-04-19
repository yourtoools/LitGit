import type { RepositoryBranch } from "@/stores/repo/repo-store-types";
import {
  useRepoActions,
  useRepoActiveContext,
  useRepoBranches,
} from "@/stores/repo/repo-selectors";
import { useBranchSearchStore } from "@/stores/ui/use-branch-search-store";
import { Button } from "@litgit/ui/components/button";
import {
  Combobox,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import {
  Dialog,
  DialogContent,
} from "@litgit/ui/components/dialog";
import { Input } from "@litgit/ui/components/input";
import { cn } from "@litgit/ui/lib/utils";
import { matchSorter } from "match-sorter";
import {
  GitBranchIcon,
  PlusIcon,
  TagIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";

const SCROLLBAR_CLASSES =
  "[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2";

const COMBOBOX_ITEM_CLASS =
  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-hidden hover:bg-accent/70 hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground";

const CREATE_BRANCH_ACTION = {
  id: "create-branch",
  label: "Create new branch...",
} as const;

const CREATE_BRANCH_FROM_ACTION = {
  id: "create-branch-from",
  label: "Create new branch from...",
} as const;

type BranchPaletteAction =
  | typeof CREATE_BRANCH_ACTION
  | typeof CREATE_BRANCH_FROM_ACTION;
type BranchPaletteItem = BranchPaletteAction | RepositoryBranch;
type BranchPaletteMode = "browse" | "enter-name" | "pick-source";

const isBranchPaletteAction = (
  item: BranchPaletteItem | null
): item is BranchPaletteAction => {
  return Boolean(item && "id" in item);
};

function BranchPaletteClearButton({
  onClear,
}: {
  onClear: () => void;
}) {
  return (
    <Button
      aria-label="Clear search"
      className="absolute top-1/2 right-1.5 z-10 size-5 -translate-y-1/2 p-0"
      onClick={onClear}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      size="xs"
      type="button"
      variant="ghost"
    >
      <XIcon className="size-3" />
    </Button>
  );
}

function BranchSearchInput({
  autoFocus = false,
  onClear,
  placeholder,
  query,
}: {
  autoFocus?: boolean;
  onClear: () => void;
  placeholder: string;
  query: string;
}) {
  return (
    <div className="border-b px-3 py-1.5">
      <ComboboxInput
        autoFocus={autoFocus}
        className="flex h-7 w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground **:data-[slot=input-group-control]:pr-7"
        placeholder={placeholder}
        showClear={false}
        showTrigger={false}
      >
        {query.length > 0 ? <BranchPaletteClearButton onClear={onClear} /> : null}
      </ComboboxInput>
    </div>
  );
}

function BranchListSection({
  branches,
  currentBranchName,
  icon,
  label,
  showCurrentIndicator = false,
}: {
  branches: RepositoryBranch[];
  currentBranchName?: string;
  icon: "branch" | "tag";
  label: string;
  showCurrentIndicator?: boolean;
}) {
  if (branches.length === 0) {
    return null;
  }

  return (
    <ComboboxGroup>
      <ComboboxLabel className="px-2 py-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </ComboboxLabel>
      {branches.map((branch) => (
        <ComboboxItem
          className={COMBOBOX_ITEM_CLASS}
          key={branch.name}
          value={branch}
        >
          {icon === "tag" ? (
            <TagIcon className="size-3.5 text-muted-foreground" />
          ) : (
            <GitBranchIcon
              className={cn(
                "size-3.5",
                branch.isCurrent ? "text-primary" : "text-muted-foreground"
              )}
            />
          )}
          <span className="flex-1 truncate">{branch.name}</span>
          {showCurrentIndicator && currentBranchName === branch.name ? (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              current
            </span>
          ) : null}
        </ComboboxItem>
      ))}
    </ComboboxGroup>
  );
}

export function BranchSelectorPalette() {
  const isOpen = useBranchSearchStore((state) => state.isOpen);
  const closePalette = useBranchSearchStore((state) => state.close);

  const { activeRepoId } = useRepoActiveContext();
  const { switchBranch, createBranch, createBranchAtReference } = useRepoActions();
  const branches = useRepoBranches(activeRepoId);

  const [mode, setMode] = useState<BranchPaletteMode>("browse");
  const [query, setQuery] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);
  const [sourceRef, setSourceRef] = useState<string | null>(null);
  const ignoredInputValueRef = useRef<null | string>(null);
  const normalizedDebouncedQuery = useDebouncedValue(
    query,
    COMBOBOX_DEBOUNCE_DELAY_MS,
    normalizeComboboxQuery
  );

  const branchGroups = useMemo(() => {
    const localBranches = branches.filter(
      (branch) => branch.refType === "branch" && !branch.isRemote
    );
    const remoteBranches = branches.filter(
      (branch) => branch.refType === "branch" && branch.isRemote
    );
    const tags = branches.filter((branch) => branch.refType === "tag");

    const filterBranches = (list: RepositoryBranch[]) => {
      if (normalizedDebouncedQuery.length === 0) {
        return list;
      }

      return matchSorter(list, normalizedDebouncedQuery, {
        keys: ["name"],
      });
    };

    return {
      localBranches,
      remoteBranches,
      sourceLocalBranches: filterBranches(localBranches),
      sourceRemoteBranches: filterBranches(remoteBranches),
      tags: filterBranches(tags),
      visibleLocalBranches: filterBranches(localBranches),
      visibleRemoteBranches: filterBranches(remoteBranches),
    };
  }, [branches, normalizedDebouncedQuery]);

  const visibleActions = useMemo(() => {
    return [CREATE_BRANCH_ACTION, CREATE_BRANCH_FROM_ACTION];
  }, []);

  const currentBranchName =
    branchGroups.localBranches.find((branch) => branch.isCurrent)?.name ??
    undefined;

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setMode("browse");
    setQuery("");
    setNewBranchName("");
    setCreateBranchError(null);
    setSourceRef(null);
  }, [isOpen]);

  const itemToStringLabel = (item: BranchPaletteItem) => {
    return isBranchPaletteAction(item) ? item.label : item.name;
  };

  const handleInputValueChange = (nextInputValue: string) => {
    if (ignoredInputValueRef.current === nextInputValue) {
      ignoredInputValueRef.current = null;
      return;
    }

    ignoredInputValueRef.current = null;
    setQuery(nextInputValue);
  };

  const handleBranchSelection = async (item: BranchPaletteItem | null) => {
    if (!(activeRepoId && item)) {
      return;
    }

    ignoredInputValueRef.current = itemToStringLabel(item);

    if (isBranchPaletteAction(item)) {
      setQuery("");
      setCreateBranchError(null);

      if (item.id === CREATE_BRANCH_ACTION.id) {
        setSourceRef(null);
        setMode("enter-name");
        return;
      }

      setSourceRef(null);
      setMode("pick-source");
      return;
    }

    if (mode === "pick-source") {
      setSourceRef(item.name);
      setQuery("");
      setCreateBranchError(null);
      setMode("enter-name");
      return;
    }

    try {
      await switchBranch(activeRepoId, item.name);
      toast.success(`Switched to branch ${item.name}`);
      closePalette();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to switch branch"
      );
    }
  };

  const handleCreateBranch = async () => {
    if (!activeRepoId) {
      return;
    }

    const trimmedBranchName = newBranchName.trim();

    if (trimmedBranchName.length === 0) {
      setCreateBranchError("Branch name is required");
      return;
    }

    try {
      if (sourceRef) {
        await createBranchAtReference(activeRepoId, trimmedBranchName, sourceRef);
      } else {
        await createBranch(activeRepoId, trimmedBranchName);
      }

      toast.success(`Created and switched to ${trimmedBranchName}`);
      closePalette();
    } catch (error) {
      setCreateBranchError(
        error instanceof Error ? error.message : "Failed to create branch"
      );
    }
  };

  const handleBranchNameKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleCreateBranch().catch(() => undefined);
  };

  const hasBrowseResults =
    branchGroups.visibleLocalBranches.length > 0 ||
    branchGroups.visibleRemoteBranches.length > 0 ||
    branchGroups.tags.length > 0;

  const hasSourceResults =
    branchGroups.sourceLocalBranches.length > 0 ||
    branchGroups.sourceRemoteBranches.length > 0;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closePalette();
        }
      }}
      open={isOpen}
    >
      <DialogContent
        className="top-[10%] translate-y-0 gap-2 p-0 pb-2 sm:max-w-xl"
        showCloseButton={false}
      >
        {mode === "enter-name" ? (
          <div className="flex flex-col gap-2 px-3 pt-1.5">
            <Input
              autoFocus
              className="h-7 text-xs"
              onChange={(event) => {
                setNewBranchName(event.target.value);
                setCreateBranchError(null);
              }}
              onKeyDown={handleBranchNameKeyDown}
              placeholder="Please provide a new branch name"
              value={newBranchName}
            />
            <p className="text-muted-foreground text-xs">
              Please provide a new branch name (Press 'Enter' to confirm or
              'Escape' to cancel)
            </p>
            {createBranchError ? (
              <p className="text-destructive text-xs">{createBranchError}</p>
            ) : null}
          </div>
        ) : (
          <Combobox
            filter={null}
            inputValue={query}
            itemToStringLabel={itemToStringLabel}
            onInputValueChange={handleInputValueChange}
            onValueChange={(value) => {
              handleBranchSelection(value).catch(() => undefined);
            }}
          >
            <BranchSearchInput
              autoFocus
              onClear={() => {
                setQuery("");
              }}
              placeholder={
                mode === "pick-source"
                  ? "Select a ref to create a new branch from"
                  : "Select a branch or tag to checkout..."
              }
              query={query}
            />
            <ComboboxList
              className={`max-h-[min(40vh,320px)] overflow-x-hidden overflow-y-auto p-1 ${SCROLLBAR_CLASSES}`}
            >
              {mode === "browse" ? (
                <>
                  {visibleActions.length > 0 ? (
                    <ComboboxGroup>
                      {visibleActions.map((action) => (
                        <ComboboxItem
                          className={COMBOBOX_ITEM_CLASS}
                          key={action.id}
                          value={action}
                        >
                          <PlusIcon className="size-3.5 text-muted-foreground" />
                          <span>{action.label}</span>
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  ) : null}

                  {visibleActions.length > 0 && hasBrowseResults ? (
                    <div className="-mx-1 my-0.5 h-px bg-border" />
                  ) : null}

                  <BranchListSection
                    branches={branchGroups.visibleLocalBranches}
                    currentBranchName={currentBranchName}
                    icon="branch"
                    label="Local Branches"
                    showCurrentIndicator
                  />

                  {branchGroups.visibleLocalBranches.length > 0 &&
                  branchGroups.visibleRemoteBranches.length > 0 ? (
                    <div className="-mx-1 my-0.5 h-px bg-border" />
                  ) : null}

                  <BranchListSection
                    branches={branchGroups.visibleRemoteBranches}
                    icon="branch"
                    label="Remote Branches"
                  />

                  {(branchGroups.visibleLocalBranches.length > 0 ||
                    branchGroups.visibleRemoteBranches.length > 0) &&
                  branchGroups.tags.length > 0 ? (
                    <div className="-mx-1 my-0.5 h-px bg-border" />
                  ) : null}

                  <BranchListSection
                    branches={branchGroups.tags}
                    icon="tag"
                    label="Tags"
                  />
                </>
              ) : (
                <>
                  {!hasSourceResults ? (
                    <div className="py-4 text-center text-muted-foreground text-xs">
                      No matching branches found.
                    </div>
                  ) : null}

                  <BranchListSection
                    branches={branchGroups.sourceLocalBranches}
                    currentBranchName={currentBranchName}
                    icon="branch"
                    label="Local Branches"
                    showCurrentIndicator
                  />

                  {branchGroups.sourceLocalBranches.length > 0 &&
                  branchGroups.sourceRemoteBranches.length > 0 ? (
                    <div className="-mx-1 my-0.5 h-px bg-border" />
                  ) : null}

                  <BranchListSection
                    branches={branchGroups.sourceRemoteBranches}
                    icon="branch"
                    label="Remote Branches"
                  />
                </>
              )}
            </ComboboxList>
          </Combobox>
        )}
      </DialogContent>
    </Dialog>
  );
}
