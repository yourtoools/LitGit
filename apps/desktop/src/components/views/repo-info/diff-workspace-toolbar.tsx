import { Button } from "@litgit/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListBulletsIcon,
  ParagraphIcon,
  PencilSimpleLineIcon,
  RowsIcon,
  SquareSplitHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import type { DiffWorkspaceEncodingOption } from "@/components/views/repo-info/diff-workspace-encoding";
import type {
  DiffWorkspaceFilePresentationMode,
  DiffWorkspaceMode,
  DiffWorkspacePresentationMode,
  DiffWorkspaceToolbarControlState,
} from "@/components/views/repo-info/diff-workspace-types";

interface DiffWorkspaceToolbarProps {
  activePath: string;
  activePrimaryMode: "diff" | "file";
  controls: DiffWorkspaceToolbarControlState;
  editLabel: string;
  encoding: string;
  encodingOptions: DiffWorkspaceEncodingOption[];
  isCompactImageToolbar: boolean;
  isIgnoreTrimWhitespace: boolean;
  isMarkdownFileView: boolean;
  isStageActionDisabled: boolean;
  markdownFilePresentation: DiffWorkspaceFilePresentationMode;
  mode: DiffWorkspaceMode;
  onClose: () => void;
  onEdit: () => void;
  onEncodingChange: (encoding: string) => void;
  onMarkdownFilePresentationChange: (
    mode: DiffWorkspaceFilePresentationMode
  ) => void;
  onModeChange: (mode: DiffWorkspaceMode) => void;
  onNextChange: () => void;
  onPresentationChange: (mode: DiffWorkspacePresentationMode) => void;
  onPreviousChange: () => void;
  onPrimaryModeChange: (mode: "diff" | "file") => void;
  onStageAction: () => void;
  onToggleWhitespace: () => void;
  presentation: DiffWorkspacePresentationMode;
  stageActionLabel: string | null;
  stageBadgeLabel: string | null;
}

const PRIMARY_MODE_OPTIONS: Array<{
  label: string;
  mode: "diff" | "file";
}> = [
  { label: "File View", mode: "file" },
  { label: "Diff View", mode: "diff" },
];

const SECONDARY_MODE_OPTIONS: Array<{
  label: string;
  mode: DiffWorkspaceMode;
}> = [
  { label: "Blame", mode: "blame" },
  { label: "History", mode: "history" },
];
const MARKDOWN_FILE_PRESENTATION_OPTIONS: Array<{
  label: string;
  mode: DiffWorkspaceFilePresentationMode;
}> = [
  { label: "Code", mode: "code" },
  { label: "Preview", mode: "preview" },
];

const PRESENTATION_OPTIONS: Array<{
  icon: Icon;
  label: string;
  mode: DiffWorkspacePresentationMode;
}> = [
  { icon: RowsIcon, label: "Hunk", mode: "hunk" },
  { icon: ListBulletsIcon, label: "Inline", mode: "inline" },
  { icon: SquareSplitHorizontalIcon, label: "Split", mode: "split" },
];
const BUTTON_GROUP_CLASS =
  "inline-flex items-center gap-0.5  border border-border/70 bg-muted/20 p-0.5";
const TEXT_BUTTON_CLASS = "h-7 px-2 text-[0.72rem]";
const ICON_BUTTON_CLASS = "h-7 w-7 p-0";

function groupEncodingOptions(
  options: DiffWorkspaceEncodingOption[]
): Array<{ groupLabel: string; options: DiffWorkspaceEncodingOption[] }> {
  const groupedByLabel = new Map<string, DiffWorkspaceEncodingOption[]>();

  for (const option of options) {
    const existingGroup = groupedByLabel.get(option.groupLabel);

    if (existingGroup) {
      existingGroup.push(option);
      continue;
    }

    groupedByLabel.set(option.groupLabel, [option]);
  }

  return Array.from(groupedByLabel.entries()).map(([groupLabel, grouped]) => ({
    groupLabel,
    options: grouped,
  }));
}

export function DiffWorkspaceToolbar({
  activePath,
  activePrimaryMode,
  controls,
  editLabel,
  encoding,
  encodingOptions,
  isCompactImageToolbar,
  isIgnoreTrimWhitespace,
  isMarkdownFileView,
  isStageActionDisabled,
  markdownFilePresentation,
  mode,
  onClose,
  onEdit,
  onEncodingChange,
  onMarkdownFilePresentationChange,
  onPrimaryModeChange,
  onModeChange,
  onNextChange,
  onPresentationChange,
  onPreviousChange,
  onStageAction,
  onToggleWhitespace,
  presentation,
  stageActionLabel,
  stageBadgeLabel,
}: DiffWorkspaceToolbarProps) {
  const isAttributionMode = mode === "history" || mode === "blame";
  const primaryModeOptions = useMemo(() => {
    if (!isMarkdownFileView) {
      return PRIMARY_MODE_OPTIONS;
    }

    return PRIMARY_MODE_OPTIONS.filter((option) => option.mode === "file");
  }, [isMarkdownFileView]);
  const groupedEncodingOptions = useMemo(
    () => groupEncodingOptions(encodingOptions),
    [encodingOptions]
  );
  const encodingOptionItems = useMemo(
    () =>
      groupedEncodingOptions.map((group, groupIndex) => (
        <SelectGroup className="py-0.5" key={group.groupLabel}>
          {groupIndex > 0 ? <SelectSeparator className="-mx-0.5 my-1" /> : null}
          <SelectLabel className="px-2 py-1 font-semibold text-[0.62rem] uppercase tracking-wide">
            {group.groupLabel}
          </SelectLabel>
          {group.options.map((option) => (
            <SelectItem
              className="text-xs"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      )),
    [groupedEncodingOptions]
  );

  if (isCompactImageToolbar) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-border/70 border-b px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
          {activePath}
        </p>

        {stageActionLabel ? (
          <Button
            className="h-7 px-2 text-xs"
            disabled={isStageActionDisabled}
            onClick={onStageAction}
            size="sm"
            type="button"
            variant="ghost"
          >
            {stageActionLabel}
          </Button>
        ) : null}

        <Button
          aria-label="Close diff editor"
          className="h-7 w-7 p-0"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border/70 border-b">
      <div className="flex flex-wrap items-center gap-2 border-border/70 border-b px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate font-medium text-foreground/90 text-xs">
          {activePath}
        </p>

        <Select
          onValueChange={(value) => {
            if (value) {
              onEncodingChange(value);
            }
          }}
          value={encoding}
        >
          <SelectTrigger
            className="h-7 w-auto max-w-48 gap-1 border-0! bg-transparent! px-0! font-medium text-[0.68rem] text-muted-foreground uppercase tracking-wide shadow-none hover:text-foreground focus-visible:border-transparent! focus-visible:ring-0! focus-visible:ring-offset-0! [&_svg]:size-3"
            size="sm"
          >
            <SelectValue placeholder="Encoding" />
          </SelectTrigger>
          <SelectContent className="max-h-80 w-64">
            {encodingOptionItems}
          </SelectContent>
        </Select>

        {stageActionLabel ? (
          <Button
            className="h-7 px-2 text-xs"
            disabled={isStageActionDisabled}
            onClick={onStageAction}
            size="sm"
            type="button"
            variant="secondary"
          >
            {stageActionLabel}
          </Button>
        ) : null}

        <Button
          aria-label="Close diff editor"
          className="h-7 w-7 p-0"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {isAttributionMode ? null : (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onEdit}
              size="sm"
              type="button"
              variant="outline"
            >
              <PencilSimpleLineIcon className="size-3.5" />
              {editLabel}
            </Button>
          )}
        </div>

        <div className="flex min-w-0 items-center justify-center gap-2">
          {!isAttributionMode && stageBadgeLabel ? (
            <span className="inline-flex h-7 items-center border border-border/80 bg-muted/40 px-2 font-medium text-[0.68rem] uppercase tracking-wide">
              {stageBadgeLabel}
            </span>
          ) : null}

          <div className={BUTTON_GROUP_CLASS}>
            {primaryModeOptions.map((option) => (
              <Button
                className={TEXT_BUTTON_CLASS}
                key={option.mode}
                onClick={() => {
                  onPrimaryModeChange(option.mode);
                }}
                size="sm"
                type="button"
                variant={
                  activePrimaryMode === option.mode ? "secondary" : "ghost"
                }
              >
                {option.label}
              </Button>
            ))}
          </div>

          {isMarkdownFileView ? (
            <div className={BUTTON_GROUP_CLASS}>
              {MARKDOWN_FILE_PRESENTATION_OPTIONS.map((option) => (
                <Button
                  className={TEXT_BUTTON_CLASS}
                  key={option.mode}
                  onClick={() => {
                    onMarkdownFilePresentationChange(option.mode);
                  }}
                  size="sm"
                  type="button"
                  variant={
                    markdownFilePresentation === option.mode
                      ? "secondary"
                      : "ghost"
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className={BUTTON_GROUP_CLASS}>
            {SECONDARY_MODE_OPTIONS.map((option) => (
              <Button
                className={TEXT_BUTTON_CLASS}
                key={option.mode}
                onClick={() => {
                  onModeChange(option.mode);
                }}
                size="sm"
                type="button"
                variant={mode === option.mode ? "secondary" : "ghost"}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className={BUTTON_GROUP_CLASS}>
            <Button
              aria-label="Previous change"
              className={ICON_BUTTON_CLASS}
              disabled={!controls.canNavigateChanges}
              onClick={onPreviousChange}
              size="sm"
              title="Previous change"
              type="button"
              variant="ghost"
            >
              <ArrowUpIcon className="size-3" />
            </Button>
            <Button
              aria-label="Next change"
              className={ICON_BUTTON_CLASS}
              disabled={!controls.canNavigateChanges}
              onClick={onNextChange}
              size="sm"
              title="Next change"
              type="button"
              variant="ghost"
            >
              <ArrowDownIcon className="size-3" />
            </Button>
          </div>

          <div className={BUTTON_GROUP_CLASS}>
            {PRESENTATION_OPTIONS.map((option) => (
              <Button
                aria-label={option.label}
                className={ICON_BUTTON_CLASS}
                disabled={!controls.canUseHunkMode && option.mode === "hunk"}
                key={option.mode}
                onClick={() => {
                  onPresentationChange(option.mode);
                }}
                size="sm"
                title={option.label}
                type="button"
                variant={presentation === option.mode ? "secondary" : "ghost"}
              >
                <option.icon className="size-3" />
              </Button>
            ))}
          </div>

          <div className={BUTTON_GROUP_CLASS}>
            <Button
              aria-label="Ignore leading and trailing whitespace"
              className={ICON_BUTTON_CLASS}
              disabled={!controls.canToggleWhitespace}
              onClick={onToggleWhitespace}
              size="sm"
              title="Ignore leading/trailing whitespace"
              type="button"
              variant={isIgnoreTrimWhitespace ? "secondary" : "ghost"}
            >
              <ParagraphIcon className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
