import { Button } from "@litgit/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  DesktopIcon,
  FolderOpenIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { GitIdentityDialog } from "@/components/views/git-identity-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import {
  loadRepositoryTemplates,
  type RepositoryTemplates,
} from "@/lib/repository-template-data.lazy";
import {
  getRepoGitIdentity,
  pickLocalRepositoryParentFolder,
} from "@/lib/tauri-repo-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import type {
  GitIdentityStatus,
  GitIdentityWriteInput,
  RepositoryTemplateOption,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";

const TRAILING_PATH_SEPARATOR_REGEX = /[\\/]$/;
const INVALID_REPOSITORY_NAME_CHARACTERS = new Set([
  "<",
  ">",
  ":",
  '"',
  "|",
  "?",
  "*",
]);

interface TemplateState {
  error: string | null;
  isLoading: boolean;
  options: RepositoryTemplateOption[];
}

interface ValidationErrors {
  defaultBranch?: string;
  destinationParent?: string;
  name?: string;
}

interface StartLocalSuccessState {
  name: string;
  path: string;
  repoId: string;
}

interface RepositoryStartLocalDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface TemplateSelectProps {
  disabled?: boolean;
  fallback: string;
  id: string;
  label: string;
  onValueChange: (value: string | null) => void;
  options: readonly RepositoryTemplateOption[];
  placeholder: string;
  state: TemplateState;
  value: string | null;
}

interface StartLocalFormPanelProps {
  defaultBranch: string;
  defaultBranchInputId: string;
  destinationInputId: string;
  destinationParent: string;
  errors: ValidationErrors;
  formError: string | null;
  fullDestinationPath: string;
  gitignoreTemplateInputId: string;
  gitignoreTemplateKey: string | null;
  gitignoreTemplatesState: TemplateState;
  handlePickDestination: () => Promise<void>;
  isBusy: boolean;
  isCreating: boolean;
  licenseTemplateInputId: string;
  licenseTemplateKey: string | null;
  licenseTemplatesState: TemplateState;
  name: string;
  nameInputId: string;
  nameInputRef: RefObject<HTMLInputElement | null>;
  setDefaultBranch: Dispatch<SetStateAction<string>>;
  setDestinationParent: Dispatch<SetStateAction<string>>;
  setErrors: Dispatch<SetStateAction<ValidationErrors>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setGitignoreTemplateKey: Dispatch<SetStateAction<string | null>>;
  setLicenseTemplateKey: Dispatch<SetStateAction<string | null>>;
  setName: Dispatch<SetStateAction<string>>;
  statusRegionId: string;
}

interface StartLocalDialogFooterProps {
  handleCreate: () => Promise<void>;
  handleOpenNow: () => Promise<void>;
  isBusy: boolean;
  isCreating: boolean;
  onOpenChange: (open: boolean) => void;
  successState: StartLocalSuccessState | null;
}

const formatDisplayPath = (destinationParent: string, name: string) => {
  const trimmedParent = destinationParent.trim();
  const trimmedName = name.trim();

  if (!trimmedParent) {
    return trimmedName;
  }

  if (!trimmedName) {
    return `${trimmedParent.replace(TRAILING_PATH_SEPARATOR_REGEX, "")}/`;
  }

  return `${trimmedParent.replace(TRAILING_PATH_SEPARATOR_REGEX, "")}/${trimmedName}`;
};

const validateRepositoryName = (value: string) => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Enter a repository name.";
  }

  if (trimmed === "." || trimmed === "..") {
    return "Repository name must be more specific.";
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return "Repository name cannot contain path separators.";
  }

  if (
    [...trimmed].some(
      (character) =>
        INVALID_REPOSITORY_NAME_CHARACTERS.has(character) ||
        character.charCodeAt(0) < 32
    )
  ) {
    return "Repository name contains unsupported characters.";
  }

  return null;
};

function TemplateSelect({
  disabled,
  fallback,
  id,
  label,
  onValueChange,
  options,
  placeholder,
  state,
  value,
}: TemplateSelectProps) {
  const selectedOption = options.find((option) => option.key === value) ?? null;
  const [templateQuery, setTemplateQuery] = useState("");
  const normalizedTemplateQuery = useDebouncedValue(
    templateQuery,
    COMBOBOX_DEBOUNCE_DELAY_MS,
    normalizeComboboxQuery
  );
  const visibleOptions = useMemo(() => {
    if (normalizedTemplateQuery.length === 0) {
      return options;
    }

    const filteredOptions = options.filter((option) =>
      `${option.label} ${option.description ?? ""}`
        .toLowerCase()
        .includes(normalizedTemplateQuery)
    );

    if (!selectedOption) {
      return filteredOptions;
    }

    const hasSelectedOption = filteredOptions.some(
      (option) => option.key === selectedOption.key
    );

    return hasSelectedOption
      ? filteredOptions
      : [selectedOption, ...filteredOptions];
  }, [normalizedTemplateQuery, options, selectedOption]);
  let helpText = fallback;
  let helpTextClassName = "text-xs text-muted-foreground/70";

  if (state.error) {
    helpText = state.error;
    helpTextClassName = "text-xs text-destructive";
  } else if (state.isLoading) {
    helpText = "Loading available templates...";
  }

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <Combobox
        autoHighlight
        disabled={disabled}
        filter={null}
        inputValue={templateQuery}
        items={visibleOptions}
        itemToStringLabel={(option: RepositoryTemplateOption) => option.label}
        onInputValueChange={(nextInputValue) => {
          setTemplateQuery(nextInputValue);
        }}
        onValueChange={(nextValue: RepositoryTemplateOption | null) => {
          setTemplateQuery("");
          onValueChange(nextValue?.key ?? null);
        }}
        value={selectedOption}
      >
        <ComboboxInput
          className="w-full"
          id={id}
          placeholder={placeholder}
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>No matching templates found.</ComboboxEmpty>
          <ComboboxList className="[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
            {(option: RepositoryTemplateOption) => (
              <ComboboxItem key={option.key} value={option}>
                <div className="flex min-w-0 flex-col gap-0.5 pr-6">
                  <span className="truncate text-left">{option.label}</span>
                  {option.description ? (
                    <span className="truncate text-left text-muted-foreground text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className={helpTextClassName}>{helpText}</p>
    </div>
  );
}

function StartLocalSuccessPanel({
  successState,
}: {
  successState: StartLocalSuccessState;
}) {
  return (
    <div className="space-y-4 px-4 py-4">
      <section className="flex items-start gap-3 border border-emerald-500/20 bg-emerald-500/8 p-3">
        <CheckCircleIcon
          aria-hidden="true"
          className="mt-0.5 size-4.5 shrink-0 text-emerald-400"
        />
        <div className="min-w-0">
          <p className="font-medium text-foreground text-xs">
            Repository created successfully
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
            The new local repository is ready and has been added to your
            workspace.
          </p>
        </div>
      </section>

      <div
        aria-live="polite"
        className="grid gap-px overflow-hidden border border-border/60"
      >
        <div className="bg-background/70 px-4 py-3">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
            Repository
          </p>
          <p className="mt-0.5 font-medium text-foreground text-xs">
            {successState.name}
          </p>
        </div>
        <div className="bg-background/70 px-4 py-3">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
            Local path
          </p>
          <p className="mt-0.5 break-all font-mono text-foreground/85 text-xs leading-relaxed">
            {successState.path}
          </p>
        </div>
      </div>
    </div>
  );
}

function StartLocalFormPanel({
  defaultBranch,
  defaultBranchInputId,
  destinationInputId,
  destinationParent,
  errors,
  formError,
  fullDestinationPath,
  gitignoreTemplateInputId,
  gitignoreTemplateKey,
  gitignoreTemplatesState,
  handlePickDestination,
  isBusy,
  isCreating,
  licenseTemplateInputId,
  licenseTemplateKey,
  licenseTemplatesState,
  name,
  nameInputId,
  nameInputRef,
  setDefaultBranch,
  setDestinationParent,
  setErrors,
  setFormError,
  setGitignoreTemplateKey,
  setLicenseTemplateKey,
  setName,
  statusRegionId,
}: StartLocalFormPanelProps) {
  const areTemplateSelectsDisabled =
    isBusy ||
    gitignoreTemplatesState.isLoading ||
    licenseTemplatesState.isLoading;

  return (
    <div className="space-y-5 px-4 py-4">
      <fieldset className="space-y-4" disabled={isBusy}>
        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor={nameInputId}>
            Repository name
          </Label>
          <Input
            aria-describedby={errors.name ? `${nameInputId}-error` : undefined}
            aria-invalid={Boolean(errors.name)}
            className="h-7 border-border/60 bg-background/60 px-2.5 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground/60"
            id={nameInputId}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: undefined }));
              setFormError(null);
            }}
            placeholder="my-local-repo"
            ref={nameInputRef}
            spellCheck={false}
            value={name}
          />
          {errors.name ? (
            <p className="text-destructive text-xs" id={`${nameInputId}-error`}>
              {errors.name}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-xs">
              This becomes the folder name and visible repository title.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor={destinationInputId}>
            Initialize in
          </Label>
          <div className="flex gap-2">
            <Input
              aria-describedby={
                errors.destinationParent
                  ? `${destinationInputId}-error`
                  : undefined
              }
              aria-invalid={Boolean(errors.destinationParent)}
              className="h-7 flex-1 border-border/60 bg-background/60 px-2.5 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground/60"
              id={destinationInputId}
              onChange={(event) => {
                setDestinationParent(event.target.value);
                setErrors((current) => ({
                  ...current,
                  destinationParent: undefined,
                }));
                setFormError(null);
              }}
              placeholder="/Users/name/projects"
              spellCheck={false}
              value={destinationParent}
            />
            <Button
              className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={() => {
                handlePickDestination().catch(() => {
                  return;
                });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <FolderOpenIcon aria-hidden="true" className="size-3.5" />
              Browse
            </Button>
          </div>
          {errors.destinationParent ? (
            <p
              className="text-destructive text-xs"
              id={`${destinationInputId}-error`}
            >
              {errors.destinationParent}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-xs">
              Choose the parent folder where the repository directory will be
              created.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor={defaultBranchInputId}>
            Default branch name
          </Label>
          <Input
            aria-describedby={
              errors.defaultBranch ? `${defaultBranchInputId}-error` : undefined
            }
            aria-invalid={Boolean(errors.defaultBranch)}
            className="h-7 border-border/60 bg-background/60 px-2.5 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground/60"
            id={defaultBranchInputId}
            onChange={(event) => {
              setDefaultBranch(event.target.value);
              setErrors((current) => ({
                ...current,
                defaultBranch: undefined,
              }));
              setFormError(null);
            }}
            placeholder="main"
            spellCheck={false}
            value={defaultBranch}
          />
          {errors.defaultBranch ? (
            <p
              className="text-destructive text-xs"
              id={`${defaultBranchInputId}-error`}
            >
              {errors.defaultBranch}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-xs">
              LitGit points `HEAD` to this branch before the initial commit is
              created.
            </p>
          )}
        </div>

        <TemplateSelect
          disabled={areTemplateSelectsDisabled}
          fallback="Select a .gitignore template to add to your repository."
          id={gitignoreTemplateInputId}
          label=".gitignore template (optional)"
          onValueChange={setGitignoreTemplateKey}
          options={gitignoreTemplatesState.options}
          placeholder="No template"
          state={gitignoreTemplatesState}
          value={gitignoreTemplateKey}
        />

        <TemplateSelect
          disabled={areTemplateSelectsDisabled}
          fallback="Select a license to add to your repository. You can customize it after creation."
          id={licenseTemplateInputId}
          label="License template (optional)"
          onValueChange={setLicenseTemplateKey}
          options={licenseTemplatesState.options}
          placeholder="No license"
          state={licenseTemplatesState}
          value={licenseTemplateKey}
        />
      </fieldset>

      <div className="flex items-center gap-3 border border-border/50 bg-muted/20 px-3.5 py-2.5">
        <FolderOpenIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/70"
        />
        <p className="min-w-0 truncate font-mono text-foreground/75 text-xs">
          {fullDestinationPath || (
            <span className="font-sans text-muted-foreground/50">
              Fill in the fields above to preview the repository path
            </span>
          )}
        </p>
      </div>

      {formError ? (
        <section
          aria-live="polite"
          className="border border-destructive/30 bg-destructive/8 p-3"
        >
          <p className="font-medium text-destructive text-xs">
            Could not create repository
          </p>
          <p className="mt-1 text-foreground/80 text-xs leading-relaxed">
            {formError}
          </p>
        </section>
      ) : null}

      {isCreating ? (
        <section
          aria-describedby={statusRegionId}
          aria-live="polite"
          className="space-y-3 border border-primary/20 bg-primary/4 p-3"
        >
          <div className="flex items-center gap-2.5">
            <SpinnerGapIcon
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin text-primary"
            />
            <p
              className="font-medium text-foreground text-xs"
              id={statusRegionId}
            >
              Creating local repository...
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            LitGit is preparing the folder, writing starter files, and creating
            the first commit.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function StartLocalDialogFooter({
  handleCreate,
  handleOpenNow,
  isBusy,
  isCreating,
  onOpenChange,
  successState,
}: StartLocalDialogFooterProps) {
  if (successState) {
    return (
      <DialogFooter className="m-0 border-border/60 bg-muted/22 px-4 py-3 sm:justify-between">
        <Button
          className="text-xs"
          onClick={() => {
            onOpenChange(false);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Close
        </Button>
        <Button
          className="text-xs"
          onClick={() => {
            handleOpenNow().catch(() => {
              return;
            });
          }}
          size="sm"
          type="button"
        >
          <ArrowSquareOutIcon aria-hidden="true" className="size-4" />
          Open now
        </Button>
      </DialogFooter>
    );
  }

  const actionIcon = isCreating ? (
    <SpinnerGapIcon aria-hidden="true" className="size-4 animate-spin" />
  ) : (
    <DesktopIcon aria-hidden="true" className="size-4" />
  );

  return (
    <DialogFooter className="m-0 border-border/60 bg-muted/22 px-4 py-3 sm:justify-between">
      <Button
        className="text-xs"
        disabled={isBusy}
        onClick={() => {
          onOpenChange(false);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        Cancel
      </Button>
      <Button
        className={cn("min-w-38 text-xs", isCreating && "pointer-events-none")}
        disabled={isBusy}
        onClick={() => {
          handleCreate().catch(() => {
            return;
          });
        }}
        size="sm"
        type="button"
      >
        {actionIcon}
        {isCreating ? "Creating..." : "Create repository"}
      </Button>
    </DialogFooter>
  );
}

export function RepositoryStartLocalDialog({
  onOpenChange,
  open,
}: RepositoryStartLocalDialogProps) {
  const preferredDefaultBranchName = usePreferencesStore(
    (state) => state.general.defaultBranchName
  );
  const createLocalRepository = useRepoStore(
    (state) => state.createLocalRepository
  );
  const { routeRepository } = useOpenRepositoryTabRouting();

  const [repositoryTemplates, setRepositoryTemplates] =
    useState<RepositoryTemplates | null>(null);
  const [name, setName] = useState("");
  const [destinationParent, setDestinationParent] = useState("");
  const [defaultBranch, setDefaultBranch] = useState(
    preferredDefaultBranchName
  );
  const [gitignoreTemplateKey, setGitignoreTemplateKey] = useState<
    string | null
  >(null);
  const [licenseTemplateKey, setLicenseTemplateKey] = useState<string | null>(
    null
  );
  const [gitignoreTemplatesState, setGitignoreTemplatesState] =
    useState<TemplateState>({
      error: null,
      isLoading: true,
      options: [],
    });
  const [licenseTemplatesState, setLicenseTemplatesState] =
    useState<TemplateState>({
      error: null,
      isLoading: true,
      options: [],
    });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPickingDestination, setIsPickingDestination] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGitIdentityDialogOpen, setIsGitIdentityDialogOpen] = useState(false);
  const [gitIdentityStatus, setGitIdentityStatus] =
    useState<GitIdentityStatus | null>(null);
  const [successState, setSuccessState] =
    useState<StartLocalSuccessState | null>(null);

  const nameInputId = useId();
  const destinationInputId = useId();
  const defaultBranchInputId = useId();
  const gitignoreTemplateInputId = useId();
  const licenseTemplateInputId = useId();
  const statusRegionId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRepositoryTemplates(null);
      setGitignoreTemplatesState({
        error: null,
        isLoading: true,
        options: [],
      });
      setLicenseTemplatesState({
        error: null,
        isLoading: true,
        options: [],
      });
      setName("");
      setDestinationParent("");
      setDefaultBranch(preferredDefaultBranchName);
      setGitignoreTemplateKey(null);
      setLicenseTemplateKey(null);
      setErrors({});
      setFormError(null);
      setIsPickingDestination(false);
      setIsCreating(false);
      setIsGitIdentityDialogOpen(false);
      setGitIdentityStatus(null);
      setSuccessState(null);
      return;
    }

    let isCancelled = false;
    setGitignoreTemplatesState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));
    setLicenseTemplatesState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));

    loadRepositoryTemplates()
      .then((templates) => {
        if (isCancelled) {
          return;
        }

        setRepositoryTemplates(templates);
        setGitignoreTemplatesState({
          error: null,
          isLoading: false,
          options: templates.gitignoreOptions,
        });
        setLicenseTemplatesState({
          error: null,
          isLoading: false,
          options: templates.licenseOptions,
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to load repository templates.";

        setGitignoreTemplatesState({
          error: message,
          isLoading: false,
          options: [],
        });
        setLicenseTemplatesState({
          error: message,
          isLoading: false,
          options: [],
        });
      });

    if (!successState) {
      setDefaultBranch((currentValue) =>
        currentValue.trim().length === 0
          ? preferredDefaultBranchName
          : currentValue
      );

      queueMicrotask(() => {
        nameInputRef.current?.focus();
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [open, preferredDefaultBranchName, successState]);

  const fullDestinationPath = useMemo(
    () => formatDisplayPath(destinationParent, name),
    [destinationParent, name]
  );

  const validateForm = useCallback(() => {
    const nextErrors: ValidationErrors = {};

    const nameError = validateRepositoryName(name);

    if (nameError) {
      nextErrors.name = nameError;
    }

    if (destinationParent.trim().length === 0) {
      nextErrors.destinationParent = "Choose where to create the repository.";
    }

    if (defaultBranch.trim().length === 0) {
      nextErrors.defaultBranch = "Enter the default branch name.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }, [defaultBranch, destinationParent, name]);

  const handlePickDestination = useCallback(async () => {
    if (isCreating) {
      return;
    }

    setIsPickingDestination(true);

    try {
      const pickedFolder = await pickLocalRepositoryParentFolder();

      if (!pickedFolder) {
        return;
      }

      setDestinationParent(pickedFolder);
      setErrors((current) => ({ ...current, destinationParent: undefined }));
      setFormError(null);
    } finally {
      setIsPickingDestination(false);
    }
  }, [isCreating]);

  const performCreate = useCallback(
    async (gitIdentity?: GitIdentityWriteInput | null) => {
      setIsCreating(true);
      setFormError(null);

      try {
        if (!repositoryTemplates) {
          setFormError("Repository templates are still loading. Try again.");
          return;
        }

        const gitignoreTemplateContent = gitignoreTemplateKey
          ? (repositoryTemplates.gitignoreContents[gitignoreTemplateKey] ??
            null)
          : null;
        const licenseTemplateContent = licenseTemplateKey
          ? (repositoryTemplates.licenseContents[licenseTemplateKey] ?? null)
          : null;

        const openedRepository = await createLocalRepository({
          defaultBranch: defaultBranch.trim(),
          destinationParent: destinationParent.trim(),
          gitIdentity,
          gitignoreTemplateContent,
          gitignoreTemplateKey,
          licenseTemplateContent,
          licenseTemplateKey,
          name: name.trim(),
        });

        if (!openedRepository) {
          return;
        }

        setSuccessState({
          name: openedRepository.name,
          path: openedRepository.path,
          repoId: openedRepository.id,
        });
        setIsGitIdentityDialogOpen(false);
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "Failed to create local repository."
        );
      } finally {
        setIsCreating(false);
      }
    },
    [
      createLocalRepository,
      defaultBranch,
      destinationParent,
      gitignoreTemplateKey,
      licenseTemplateKey,
      name,
      repositoryTemplates,
    ]
  );

  const handleCreate = useCallback(async () => {
    if (!(validateForm() && !isCreating)) {
      return;
    }

    const identityStatus = await getRepoGitIdentity(null);

    if (identityStatus.effective.isComplete) {
      await performCreate();
      return;
    }

    setGitIdentityStatus(identityStatus);
    setIsGitIdentityDialogOpen(true);
  }, [isCreating, performCreate, validateForm]);

  const handleOpenNow = useCallback(async () => {
    if (!successState) {
      return;
    }

    await routeRepository(successState.repoId, successState.name);
    onOpenChange(false);
  }, [onOpenChange, routeRepository, successState]);

  const isBusy = isCreating || isPickingDestination;
  const dialogDescription = successState
    ? `"${successState.name}" is ready to open.`
    : "Create a new Git repository locally with a starter commit, branch name, and optional templates.";

  let headerIcon = (
    <DesktopIcon aria-hidden="true" className="size-4.5 text-primary" />
  );
  const dialogTitle = successState
    ? "Local repository ready"
    : "Start a local repository";

  if (successState) {
    headerIcon = (
      <CheckCircleIcon
        aria-hidden="true"
        className="size-4.5 text-emerald-400"
      />
    );
  } else if (isCreating) {
    headerIcon = (
      <SpinnerGapIcon
        aria-hidden="true"
        className="size-4.5 animate-spin text-primary"
      />
    );
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent
          className="max-h-[min(92dvh,38rem)] max-w-[min(96vw,32rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,32rem)]"
          showCloseButton={!(isBusy || isGitIdentityDialogOpen)}
        >
          <DialogHeader className="gap-1.5 border-border/50 border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center border border-border/50 bg-muted/25">
                {headerIcon}
              </div>
              <DialogTitle className="text-sm">{dialogTitle}</DialogTitle>
            </div>
            <DialogDescription className="max-w-[48ch] text-xs leading-relaxed">
              {dialogDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto">
            {successState ? (
              <StartLocalSuccessPanel successState={successState} />
            ) : (
              <StartLocalFormPanel
                defaultBranch={defaultBranch}
                defaultBranchInputId={defaultBranchInputId}
                destinationInputId={destinationInputId}
                destinationParent={destinationParent}
                errors={errors}
                formError={formError}
                fullDestinationPath={fullDestinationPath}
                gitignoreTemplateInputId={gitignoreTemplateInputId}
                gitignoreTemplateKey={gitignoreTemplateKey}
                gitignoreTemplatesState={gitignoreTemplatesState}
                handlePickDestination={handlePickDestination}
                isBusy={isBusy}
                isCreating={isCreating}
                licenseTemplateInputId={licenseTemplateInputId}
                licenseTemplateKey={licenseTemplateKey}
                licenseTemplatesState={licenseTemplatesState}
                name={name}
                nameInputId={nameInputId}
                nameInputRef={nameInputRef}
                setDefaultBranch={setDefaultBranch}
                setDestinationParent={setDestinationParent}
                setErrors={setErrors}
                setFormError={setFormError}
                setGitignoreTemplateKey={setGitignoreTemplateKey}
                setLicenseTemplateKey={setLicenseTemplateKey}
                setName={setName}
                statusRegionId={statusRegionId}
              />
            )}
          </div>

          <StartLocalDialogFooter
            handleCreate={handleCreate}
            handleOpenNow={handleOpenNow}
            isBusy={isBusy}
            isCreating={isCreating}
            onOpenChange={onOpenChange}
            successState={successState}
          />
        </DialogContent>
      </Dialog>
      <GitIdentityDialog
        description="LitGit needs your Git author name and email before it can create the first commit for this new repository. This will be saved to your global Git config."
        identityStatus={gitIdentityStatus}
        onConfirm={async (gitIdentity) => {
          await performCreate(gitIdentity);
        }}
        onOpenChange={setIsGitIdentityDialogOpen}
        open={isGitIdentityDialogOpen}
        submitLabel="Save and create repository"
        title="Set your global Git identity"
      />
    </>
  );
}
