import { Button } from "@litgit/ui/components/button";
import { Checkbox } from "@litgit/ui/components/checkbox";
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
  DownloadSimpleIcon,
  FolderOpenIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
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

import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";

import {
  type CloneRepositoryProgress,
  pickCloneDestinationFolder,
} from "@/lib/tauri-repo-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { useRepoStore } from "@/stores/repo/use-repo-store";

const CLONE_PROGRESS_EVENT = "clone-repository-progress";
const DEFAULT_PROGRESS_MESSAGE = "Waiting to start clone";
const TRAILING_SLASHES_REGEX = /\/+$/;
const HTTPS_REPOSITORY_URL_REGEX = /^https:\/\/.+/i;
const SSH_REPOSITORY_URL_REGEX = /^git@[^\s:]+:.+/i;
const SSH_PROTOCOL_REPOSITORY_URL_REGEX = /^ssh:\/\/.+/i;
const TRAILING_PATH_SEPARATOR_REGEX = /[\\/]$/;
const INVALID_FOLDER_NAME_CHARACTERS = new Set([
  "<",
  ">",
  ":",
  '"',
  "|",
  "?",
  "*",
]);

interface ValidationErrors {
  destinationParent?: string;
  folderName?: string;
  repositoryUrl?: string;
  sshKeyPair?: string;
}

interface CloneSuccessState {
  name: string;
  path: string;
  repoId: string;
}

interface RepositoryCloneDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface CloneFormPanelProps {
  destinationInputId: string;
  destinationParent: string;
  errors: ValidationErrors;
  folderInputId: string;
  folderName: string;
  formError: string | null;
  fullDestinationPath: string;
  handlePickDestination: () => Promise<void>;
  isBusy: boolean;
  isCloning: boolean;
  progressDetails: string | null;
  progressMessage: string;
  progressPercent: number;
  recurseSubmodules: boolean;
  repositoryUrl: string;
  repositoryUrlRef: RefObject<HTMLInputElement | null>;
  setDestinationParent: Dispatch<SetStateAction<string>>;
  setErrors: Dispatch<SetStateAction<ValidationErrors>>;
  setFolderName: Dispatch<SetStateAction<string>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setIsFolderDirty: Dispatch<SetStateAction<boolean>>;
  setRecurseSubmodules: Dispatch<SetStateAction<boolean>>;
  setRepositoryUrl: Dispatch<SetStateAction<string>>;
  statusRegionId: string;
  submodulesCheckboxId: string;
  urlInputId: string;
}

const deriveFolderNameFromUrl = (repositoryUrl: string) => {
  const trimmed = repositoryUrl.trim().replace(TRAILING_SLASHES_REGEX, "");

  if (!trimmed) {
    return "";
  }

  const segments = trimmed.split("/");
  const tail = segments.at(-1) ?? "";

  return tail.endsWith(".git") ? tail.slice(0, -4) : tail;
};

const isLikelyRepositoryUrl = (value: string) => {
  const trimmed = value.trim();

  if (trimmed.startsWith("file://")) {
    return false;
  }

  return (
    HTTPS_REPOSITORY_URL_REGEX.test(trimmed) ||
    SSH_REPOSITORY_URL_REGEX.test(trimmed) ||
    SSH_PROTOCOL_REPOSITORY_URL_REGEX.test(trimmed)
  );
};

const isMatchingSshKeyPair = (
  privateKeyPath: string | null | undefined,
  publicKeyPath: string | null | undefined
) => {
  const trimmedPrivateKeyPath = privateKeyPath?.trim() ?? "";
  const trimmedPublicKeyPath = publicKeyPath?.trim() ?? "";

  if (!(trimmedPrivateKeyPath && trimmedPublicKeyPath)) {
    return true;
  }

  return trimmedPublicKeyPath === `${trimmedPrivateKeyPath}.pub`;
};

const validateCloneFolderName = (value: string) => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Enter a folder name for the cloned repository.";
  }

  if (trimmed === "." || trimmed === "..") {
    return "Folder name must be more specific.";
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return "Folder name cannot contain path separators.";
  }

  if (
    [...trimmed].some(
      (character) =>
        INVALID_FOLDER_NAME_CHARACTERS.has(character) ||
        character.charCodeAt(0) < 32
    )
  ) {
    return "Folder name contains unsupported characters.";
  }

  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) {
    return "Folder name cannot end with a dot or space.";
  }

  return null;
};

const formatProgressDetails = (progress: CloneRepositoryProgress) => {
  if (
    progress.phase === "receiving" &&
    progress.receivedObjects !== undefined &&
    progress.totalObjects !== undefined
  ) {
    return `${progress.receivedObjects} of ${progress.totalObjects} objects received`;
  }

  if (
    progress.phase === "resolving" &&
    progress.resolvedObjects !== undefined &&
    progress.totalObjects !== undefined
  ) {
    return `${progress.resolvedObjects} of ${progress.totalObjects} deltas resolved`;
  }

  if (progress.phase === "complete") {
    return "Repository is ready to open";
  }

  return "Preparing the local repository workspace";
};

function CloneSuccessPanel({
  successState,
}: {
  successState: CloneSuccessState;
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
            Clone finished successfully
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
            Added to your workspace and saved in recent repositories.
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

function CloneFormPanel({
  destinationInputId,
  destinationParent,
  errors,
  formError,
  folderInputId,
  folderName,
  fullDestinationPath,
  handlePickDestination,
  isBusy,
  isCloning,
  progressDetails,
  progressMessage,
  progressPercent,
  recurseSubmodules,
  repositoryUrl,
  repositoryUrlRef,
  setDestinationParent,
  setErrors,
  setFolderName,
  setFormError,
  setIsFolderDirty,
  setRecurseSubmodules,
  setRepositoryUrl,
  statusRegionId,
  submodulesCheckboxId,
  urlInputId,
}: CloneFormPanelProps) {
  return (
    <div className="space-y-5 px-4 py-4">
      {/* --- Form fields --- */}
      <fieldset className="space-y-4" disabled={isBusy}>
        {/* Repository URL */}
        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor={urlInputId}>
            Repository URL
          </Label>
          <Input
            aria-describedby={
              errors.repositoryUrl ? `${urlInputId}-error` : undefined
            }
            aria-invalid={Boolean(errors.repositoryUrl)}
            autoCapitalize="none"
            autoCorrect="off"
            className="h-7 border-border/60 bg-background/60 px-2.5 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground/60"
            id={urlInputId}
            onChange={(event) => {
              setRepositoryUrl(event.target.value);
              setErrors((current) => ({
                ...current,
                repositoryUrl: undefined,
              }));
              setFormError(null);
            }}
            placeholder="https://github.com/owner/repository.git"
            ref={repositoryUrlRef}
            spellCheck={false}
            type="url"
            value={repositoryUrl}
          />
          {errors.repositoryUrl ? (
            <p className="text-destructive text-xs" id={`${urlInputId}-error`}>
              {errors.repositoryUrl}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-xs">
              HTTPS, SSH, or Git transport URL
            </p>
          )}
        </div>

        {/* Destination folder + Browse */}
        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor={destinationInputId}>
            Destination folder
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
              Parent folder for the cloned repository
            </p>
          )}
        </div>

        {/* Folder name */}
        <div className="grid gap-1.5">
          <Label className="text-xs" htmlFor={folderInputId}>
            Folder name
          </Label>
          <Input
            aria-describedby={
              errors.folderName ? `${folderInputId}-error` : undefined
            }
            aria-invalid={Boolean(errors.folderName)}
            className="h-7 border-border/60 bg-background/60 px-2.5 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground/60"
            id={folderInputId}
            onChange={(event) => {
              setFolderName(event.target.value);
              setIsFolderDirty(event.target.value.trim().length > 0);
              setErrors((current) => ({
                ...current,
                folderName: undefined,
              }));
              setFormError(null);
            }}
            placeholder="repository-name"
            spellCheck={false}
            value={folderName}
          />
          {errors.folderName ? (
            <p
              className="text-destructive text-xs"
              id={`${folderInputId}-error`}
            >
              {errors.folderName}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-xs">
              Auto-filled from URL — rename before cloning if needed
            </p>
          )}
        </div>
      </fieldset>

      {/* --- Destination path preview --- */}
      <div className="flex items-center gap-3 border border-border/50 bg-muted/20 px-3.5 py-2.5">
        <FolderOpenIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/70"
        />
        <p className="min-w-0 truncate font-mono text-foreground/75 text-xs">
          {fullDestinationPath || (
            <span className="font-sans text-muted-foreground/50">
              Fill in the fields above to preview the clone path
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
            Could not clone repository
          </p>
          <p className="mt-1 text-foreground/80 text-xs leading-relaxed">
            {formError}
          </p>
        </section>
      ) : null}

      {errors.sshKeyPair ? (
        <section
          aria-live="polite"
          className="border border-amber-500/30 bg-amber-500/8 p-3"
        >
          <p className="font-medium text-amber-700 text-xs dark:text-amber-300">
            SSH key paths need attention
          </p>
          <p className="mt-1 text-foreground/80 text-xs leading-relaxed">
            {errors.sshKeyPair}
          </p>
        </section>
      ) : null}

      {/* --- Submodules option --- */}
      <label
        className="flex cursor-pointer items-center gap-2.5 px-0.5 py-1"
        htmlFor={submodulesCheckboxId}
      >
        <Checkbox
          checked={recurseSubmodules}
          disabled={isBusy}
          id={submodulesCheckboxId}
          onCheckedChange={(checked) => {
            setRecurseSubmodules(checked === true);
          }}
        />
        <span className="select-none text-foreground/85 text-xs">
          Clone submodules recursively
        </span>
      </label>

      {/* --- Clone progress (only visible while cloning) --- */}
      {isCloning && (
        <section
          aria-describedby={statusRegionId}
          aria-live="polite"
          className="space-y-3 border border-primary/20 bg-primary/4 p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <SpinnerGapIcon
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin text-primary"
              />
              <p
                className="min-w-0 truncate font-medium text-foreground text-xs"
                id={statusRegionId}
              >
                {progressMessage}
              </p>
            </div>
            <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
              {progressPercent}%
            </span>
          </div>

          <div
            aria-label="Clone progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            className="h-1.5 overflow-hidden rounded-full bg-primary/10"
            role="progressbar"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_82%,white_8%),color-mix(in_oklab,var(--color-primary)_62%,black_4%))]"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {progressDetails && (
            <p className="text-muted-foreground text-xs">{progressDetails}</p>
          )}
        </section>
      )}
    </div>
  );
}

function CloneDialogFooter({
  handleClone,
  handleOpenNow,
  isBusy,
  isCloning,
  onOpenChange,
  successState,
}: {
  handleClone: () => Promise<void>;
  handleOpenNow: () => Promise<void>;
  isBusy: boolean;
  isCloning: boolean;
  onOpenChange: (open: boolean) => void;
  successState: CloneSuccessState | null;
}) {
  const actionIcon = isCloning ? (
    <SpinnerGapIcon aria-hidden="true" className="size-4 animate-spin" />
  ) : (
    <DownloadSimpleIcon aria-hidden="true" className="size-4" />
  );
  const actionLabel = isCloning ? "Cloning..." : "Clone repository";

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
        className="text-xs"
        disabled={isBusy}
        onClick={() => {
          handleClone().catch(() => {
            return;
          });
        }}
        size="sm"
        type="button"
      >
        {actionIcon}
        {actionLabel}
      </Button>
    </DialogFooter>
  );
}

export function RepositoryCloneDialog({
  open,
  onOpenChange,
}: RepositoryCloneDialogProps) {
  const cloneRepository = useRepoStore((state) => state.cloneRepository);
  const networkPreferences = usePreferencesStore((state) => state.network);
  const sshPreferences = usePreferencesStore((state) => state.ssh);
  const { routeRepository } = useOpenRepositoryTabRouting();

  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [destinationParent, setDestinationParent] = useState("");
  const [folderName, setFolderName] = useState("");
  const [recurseSubmodules, setRecurseSubmodules] = useState(true);
  const [isFolderDirty, setIsFolderDirty] = useState(false);
  const [isPickingDestination, setIsPickingDestination] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [progress, setProgress] = useState<CloneRepositoryProgress | null>(
    null
  );
  const [successState, setSuccessState] = useState<CloneSuccessState | null>(
    null
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const urlInputId = useId();
  const destinationInputId = useId();
  const folderInputId = useId();
  const submodulesCheckboxId = useId();
  const statusRegionId = useId();
  const repositoryUrlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRepositoryUrl("");
      setDestinationParent("");
      setFolderName("");
      setRecurseSubmodules(true);
      setIsFolderDirty(false);
      setIsPickingDestination(false);
      setIsCloning(false);
      setProgress(null);
      setSuccessState(null);
      setErrors({});
      setFormError(null);
      return;
    }

    if (!successState) {
      queueMicrotask(() => {
        repositoryUrlRef.current?.focus();
      });
    }
  }, [open, successState]);

  useEffect(() => {
    if (!(open && !successState)) {
      return;
    }

    const derivedFolderName = deriveFolderNameFromUrl(repositoryUrl);

    if (isFolderDirty || derivedFolderName.length === 0) {
      return;
    }

    setFolderName(derivedFolderName);
  }, [isFolderDirty, open, repositoryUrl, successState]);

  useEffect(() => {
    if (!(open && isCloning)) {
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    listen<CloneRepositoryProgress>(CLONE_PROGRESS_EVENT, (event) => {
      if (!isMounted) {
        return;
      }

      setProgress(event.payload);
    })
      .then((unlisten) => {
        unsubscribe = unlisten;
      })
      .catch(() => {
        return;
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [isCloning, open]);

  const fullDestinationPath = useMemo(() => {
    const trimmedParent = destinationParent.trim();
    const trimmedFolder = folderName.trim();

    if (!(trimmedParent && trimmedFolder)) {
      return "";
    }

    return `${trimmedParent.replace(TRAILING_PATH_SEPARATOR_REGEX, "")}/${trimmedFolder}`;
  }, [destinationParent, folderName]);

  const progressPercent = progress?.percent ?? (isCloning ? 8 : 0);
  const progressMessage = progress?.message ?? DEFAULT_PROGRESS_MESSAGE;
  const progressDetails = progress ? formatProgressDetails(progress) : null;

  const validateForm = useCallback(() => {
    const nextErrors: ValidationErrors = {};

    if (!isLikelyRepositoryUrl(repositoryUrl)) {
      nextErrors.repositoryUrl = "Enter a valid HTTPS or SSH repository URL.";
    }

    if (destinationParent.trim().length === 0) {
      nextErrors.destinationParent = "Choose a local destination folder.";
    }

    const folderNameError = validateCloneFolderName(folderName);

    if (folderNameError) {
      nextErrors.folderName = folderNameError;
    }

    if (
      !(
        sshPreferences.useLocalAgent ||
        isMatchingSshKeyPair(
          sshPreferences.privateKeyPath,
          sshPreferences.publicKeyPath
        )
      )
    ) {
      nextErrors.sshKeyPair =
        "Selected SSH public key must match the private key path (`<private>.pub`).";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }, [
    destinationParent,
    folderName,
    repositoryUrl,
    sshPreferences.privateKeyPath,
    sshPreferences.publicKeyPath,
    sshPreferences.useLocalAgent,
  ]);

  const handlePickDestination = useCallback(async () => {
    if (isCloning) {
      return;
    }

    setIsPickingDestination(true);

    try {
      const pickedFolder = await pickCloneDestinationFolder();

      if (!pickedFolder) {
        return;
      }

      setDestinationParent(pickedFolder);
      setErrors((current) => ({ ...current, destinationParent: undefined }));
    } finally {
      setIsPickingDestination(false);
    }
  }, [isCloning]);

  const handleClone = useCallback(async () => {
    if (!(validateForm() && !isCloning)) {
      return;
    }

    setIsCloning(true);
    setFormError(null);
    setProgress({
      message: "Starting clone request",
      percent: 6,
      phase: "preparing",
    });

    try {
      const openedRepository = await cloneRepository(
        repositoryUrl.trim(),
        destinationParent.trim(),
        folderName.trim(),
        recurseSubmodules,
        {
          enableProxy: networkPreferences.enableProxy,
          proxyHost: networkPreferences.proxyHost,
          proxyPort: networkPreferences.proxyPort,
          proxyType: networkPreferences.proxyType,
          sshPrivateKeyPath: sshPreferences.privateKeyPath,
          sshPublicKeyPath: sshPreferences.publicKeyPath,
          sslVerification: networkPreferences.sslVerification,
          useGitCredentialManager: networkPreferences.useGitCredentialManager,
          useLocalSshAgent: sshPreferences.useLocalAgent,
        }
      );

      if (!openedRepository) {
        setFormError("Failed to clone repository.");
        return;
      }

      setProgress({
        message: `Clone complete: ${openedRepository.name}`,
        percent: 100,
        phase: "complete",
      });
      setSuccessState({
        name: openedRepository.name,
        path: openedRepository.path,
        repoId: openedRepository.id,
      });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to clone repository."
      );
    } finally {
      setIsCloning(false);
    }
  }, [
    cloneRepository,
    destinationParent,
    folderName,
    isCloning,
    networkPreferences.enableProxy,
    networkPreferences.proxyHost,
    networkPreferences.proxyPort,
    networkPreferences.proxyType,
    networkPreferences.sslVerification,
    networkPreferences.useGitCredentialManager,
    recurseSubmodules,
    repositoryUrl,
    sshPreferences.privateKeyPath,
    sshPreferences.publicKeyPath,
    sshPreferences.useLocalAgent,
    validateForm,
  ]);

  const handleOpenNow = useCallback(async () => {
    if (!successState) {
      return;
    }

    await routeRepository(successState.repoId, successState.name);
    onOpenChange(false);
  }, [onOpenChange, routeRepository, successState]);

  const isBusy = isCloning || isPickingDestination;

  const headerIcon = (() => {
    if (successState) {
      return (
        <CheckCircleIcon
          aria-hidden="true"
          className="size-4.5 text-emerald-400"
        />
      );
    }

    if (isCloning) {
      return (
        <SpinnerGapIcon
          aria-hidden="true"
          className="size-4.5 animate-spin text-primary"
        />
      );
    }

    return (
      <DownloadSimpleIcon
        aria-hidden="true"
        className="size-4.5 text-primary"
      />
    );
  })();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[min(92dvh,44rem)] max-w-[min(96vw,30rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,30rem)]"
        showCloseButton={!isBusy}
      >
        <DialogHeader className="gap-1.5 border-border/50 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center border border-border/50 bg-muted/25">
              {headerIcon}
            </div>
            <DialogTitle className="text-sm">
              {successState ? "Repository cloned" : "Clone a repository"}
            </DialogTitle>
          </div>
          <DialogDescription className="max-w-[44ch] text-xs leading-relaxed">
            {successState
              ? `"${successState.name}" is now available locally.`
              : "Clone from a remote URL into a local folder."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          {successState ? (
            <CloneSuccessPanel successState={successState} />
          ) : (
            <CloneFormPanel
              destinationInputId={destinationInputId}
              destinationParent={destinationParent}
              errors={errors}
              folderInputId={folderInputId}
              folderName={folderName}
              formError={formError}
              fullDestinationPath={fullDestinationPath}
              handlePickDestination={handlePickDestination}
              isBusy={isBusy}
              isCloning={isCloning}
              progressDetails={progressDetails}
              progressMessage={progressMessage}
              progressPercent={progressPercent}
              recurseSubmodules={recurseSubmodules}
              repositoryUrl={repositoryUrl}
              repositoryUrlRef={repositoryUrlRef}
              setDestinationParent={setDestinationParent}
              setErrors={setErrors}
              setFolderName={setFolderName}
              setFormError={setFormError}
              setIsFolderDirty={setIsFolderDirty}
              setRecurseSubmodules={setRecurseSubmodules}
              setRepositoryUrl={setRepositoryUrl}
              statusRegionId={statusRegionId}
              submodulesCheckboxId={submodulesCheckboxId}
              urlInputId={urlInputId}
            />
          )}
        </div>

        <CloneDialogFooter
          handleClone={handleClone}
          handleOpenNow={handleOpenNow}
          isBusy={isBusy}
          isCloning={isCloning}
          onOpenChange={onOpenChange}
          successState={successState}
        />
      </DialogContent>
    </Dialog>
  );
}
