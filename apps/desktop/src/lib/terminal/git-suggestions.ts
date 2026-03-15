export interface GitSuggestion {
  description?: string;
  type:
    | "command"
    | "subcommand"
    | "option"
    | "branch"
    | "remote"
    | "stash"
    | "file";
  value: string;
}

const WHITESPACE_REGEX = /\s+/;

type SuggestionValueSource = "branch" | "file" | "remote" | "stash";

interface GitOptionDefinition {
  description: string;
  value: string;
  valueSource?: SuggestionValueSource;
}

interface GitCommandDefinition {
  argumentSource?: SuggestionValueSource;
  argumentSourceRequiresSpace?: boolean;
  description: string;
  options?: GitOptionDefinition[];
  subcommands?: GitOptionDefinition[];
  value: string;
}

interface ParsedCommandLine {
  currentWord: string;
  isGitCommand: boolean;
  isGitPrefix: boolean;
  isGitSubcommandStage: boolean;
  tokens: string[];
}

const GIT_COMMANDS: GitCommandDefinition[] = [
  {
    argumentSource: "file",
    description: "Add file contents to the index",
    value: "add",
  },
  {
    description: "Record changes to the repository",
    options: [
      { value: "-a", description: "Commit all changed files" },
      { value: "-m", description: "Commit message" },
      { value: "--amend", description: "Amend previous commit" },
      { value: "--fixup", description: "Create a fixup commit" },
      { value: "--no-edit", description: "Reuse the previous message" },
      { value: "--reuse-message", description: "Reuse a commit message" },
      {
        value: "--reedit-message",
        description: "Edit a reused commit message",
      },
      { value: "--signoff", description: "Add Signed-off-by trailer" },
      {
        value: "--verbose",
        description: "Show diff in commit message template",
      },
    ],
    value: "commit",
  },
  {
    argumentSource: "remote",
    description: "Update remote refs",
    options: [
      { value: "-u", description: "Set upstream" },
      { value: "--all", description: "Push all branches" },
      { value: "--atomic", description: "Request atomic transaction" },
      { value: "--delete", description: "Delete refs on the remote" },
      { value: "--dry-run", description: "Dry run only" },
      { value: "--follow-tags", description: "Push missing annotated tags" },
      { value: "--force", description: "Force push" },
      { value: "--force-with-lease", description: "Force push safely" },
      { value: "--set-upstream", description: "Set upstream tracking" },
      { value: "--tags", description: "Push all tags" },
    ],
    value: "push",
  },
  {
    argumentSource: "remote",
    argumentSourceRequiresSpace: true,
    value: "pull",
    description: "Fetch from and integrate with another repository",
  },
  {
    argumentSource: "remote",
    description: "Download objects and refs",
    options: [
      { value: "--all", description: "Fetch all remotes" },
      { value: "--dry-run", description: "Show what would be done" },
      { value: "--prune", description: "Remove stale remote-tracking refs" },
      { value: "--tags", description: "Fetch all tags" },
    ],
    value: "fetch",
  },
  {
    argumentSource: "branch",
    argumentSourceRequiresSpace: true,
    description: "Switch branches or restore files",
    options: [
      { value: "-b", description: "Create and switch to a new branch" },
      { value: "--detach", description: "Detach HEAD at named commit" },
      { value: "--ours", description: "Checkout our side for unmerged paths" },
      { value: "--patch", description: "Select hunks interactively" },
      {
        value: "--theirs",
        description: "Checkout their side for unmerged paths",
      },
      { value: "--track", description: "Set up branch tracking" },
    ],
    value: "checkout",
  },
  {
    argumentSource: "branch",
    argumentSourceRequiresSpace: true,
    description: "List, create, or delete branches",
    options: [
      { value: "-a", description: "List remote and local branches" },
      {
        value: "-m",
        description: "Move or rename a branch",
        valueSource: "branch",
      },
      {
        value: "-M",
        description: "Force move or rename a branch",
        valueSource: "branch",
      },
      { value: "-d", description: "Delete fully merged branch" },
      { value: "-D", description: "Force delete branch" },
      { value: "--all", description: "List all branches" },
      { value: "--copy", description: "Copy a branch and its reflog" },
      { value: "--delete", description: "Delete a branch" },
      { value: "--list", description: "List branches" },
      { value: "--move", description: "Rename a branch" },
      {
        value: "--set-upstream-to",
        description: "Set upstream tracking branch",
        valueSource: "branch",
      },
      { value: "--show-current", description: "Show current branch name" },
    ],
    value: "branch",
  },
  {
    argumentSource: "file",
    description: "Show the working tree status",
    options: [
      { value: "--short", description: "Give the output in short format" },
      { value: "--branch", description: "Show branch information" },
      { value: "--porcelain", description: "Machine-readable output" },
      {
        value: "--untracked-files",
        description: "Control display of untracked files",
      },
    ],
    value: "status",
  },
  {
    description: "Show commit logs",
    options: [
      { value: "--graph", description: "Show commit graph" },
      { value: "--decorate", description: "Print ref names" },
      { value: "--oneline", description: "Compress to one line" },
      { value: "--stat", description: "Show diffstat" },
    ],
    value: "log",
  },
  {
    argumentSource: "branch",
    argumentSourceRequiresSpace: true,
    description: "Join histories together",
    options: [
      { value: "--abort", description: "Abort the current merge" },
      { value: "--continue", description: "Continue the current merge" },
      { value: "--ff-only", description: "Fast-forward only" },
      {
        value: "--no-ff",
        description: "Create merge commit even when possible to fast-forward",
      },
      {
        value: "--squash",
        description: "Create a single commit from merged changes",
      },
    ],
    value: "merge",
  },
  {
    argumentSource: "branch",
    argumentSourceRequiresSpace: true,
    description: "Reapply commits on another base tip",
    options: [
      { value: "--abort", description: "Abort the current rebase" },
      { value: "--continue", description: "Continue the current rebase" },
      {
        value: "--interactive",
        description: "Make a list of commits to be rebased",
      },
      {
        value: "--onto",
        description: "Rebase onto given branch or commit",
        valueSource: "branch",
      },
      { value: "--skip", description: "Skip the current patch" },
    ],
    value: "rebase",
  },
  {
    description: "Reset current HEAD",
    options: [
      { value: "--hard", description: "Reset index and working tree" },
      { value: "--mixed", description: "Reset index but not working tree" },
      { value: "--soft", description: "Reset only HEAD" },
    ],
    value: "reset",
  },
  {
    description: "Stash changes",
    subcommands: [
      { value: "apply", description: "Apply stash" },
      {
        value: "branch",
        description: "Create branch from stash",
        valueSource: "stash",
      },
      { value: "clear", description: "Remove all stash entries" },
      { value: "drop", description: "Remove stash" },
      { value: "list", description: "List stash entries" },
      { value: "pop", description: "Apply and remove stash" },
      { value: "push", description: "Save modifications to a new stash" },
      { value: "show", description: "Show stash diff" },
    ],
    value: "stash",
  },
  {
    argumentSource: "remote",
    description: "Manage tracked repositories",
    options: [{ value: "--verbose", description: "Show remote URLs" }],
    subcommands: [
      { value: "add", description: "Add a remote" },
      {
        value: "get-url",
        description: "Show remote URL",
        valueSource: "remote",
      },
      {
        value: "prune",
        description: "Delete stale references",
        valueSource: "remote",
      },
      {
        value: "remove",
        description: "Remove a remote",
        valueSource: "remote",
      },
      {
        value: "rename",
        description: "Rename a remote",
        valueSource: "remote",
      },
      {
        value: "set-url",
        description: "Change remote URL",
        valueSource: "remote",
      },
      {
        value: "show",
        description: "Show remote information",
        valueSource: "remote",
      },
    ],
    value: "remote",
  },
  { value: "clone", description: "Clone a repository" },
  { value: "init", description: "Create or reinitialize repository" },
  {
    argumentSource: "file",
    description: "Restore working tree files",
    options: [
      {
        value: "--source",
        description: "Restore from given tree",
        valueSource: "branch",
      },
      { value: "--staged", description: "Restore the index" },
      { value: "--worktree", description: "Restore the working tree" },
    ],
    value: "restore",
  },
  {
    argumentSource: "branch",
    argumentSourceRequiresSpace: true,
    description: "Switch branches",
    options: [
      { value: "-c", description: "Create and switch to a new branch" },
      { value: "-C", description: "Force create and switch to a branch" },
      { value: "--detach", description: "Detach HEAD at named commit" },
      { value: "--discard-changes", description: "Throw away local changes" },
      {
        value: "--guess",
        description: "Guess branch from remote-tracking branch",
      },
      { value: "--track", description: "Set up branch tracking" },
    ],
    value: "switch",
  },
];

const GIT_COMMAND_LOOKUP = new Map(
  GIT_COMMANDS.map((command) => [command.value, command])
);

export interface RepoContext {
  aheadCount: number;
  behindCount: number;
  branches: string[];
  files: string[];
  hasChanges: boolean;
  remotes: string[];
  stashes: string[];
}

export function getGitSuggestions(
  currentWord: string,
  tokens: string[],
  context: RepoContext
): { completions: GitSuggestion[]; nextCommands: string[] } {
  const completions: GitSuggestion[] = [];
  const nextCommands: string[] = [];

  const buildResult = () => {
    const hasExactMatch =
      currentWord.length > 0 &&
      completions.some((completion) => completion.value === currentWord);

    return {
      completions: hasExactMatch ? [] : completions,
      nextCommands: hasExactMatch ? [] : Array.from(new Set(nextCommands)),
    };
  };

  if (tokens.length === 1) {
    if (currentWord !== "git" && "git".startsWith(currentWord)) {
      completions.push({
        description: "The Git version control system",
        type: "command",
        value: "git",
      });
    }

    return buildResult();
  }

  const subcommand = tokens[1];
  const commandDefinition = subcommand
    ? GIT_COMMAND_LOOKUP.get(subcommand)
    : undefined;
  const previousToken = tokens.at(-2) ?? "";
  const subcommandToken = tokens[2] ?? "";
  const previousNonEmptyToken = [...tokens]
    .reverse()
    .find((token) => token.length > 0 && token !== currentWord);
  const matchingSubcommand = commandDefinition?.subcommands?.find(
    (option) => option.value === subcommandToken
  );

  const pushContextualSuggestions = () => {
    if (context.hasChanges) {
      nextCommands.push("git status", "git add .", 'git commit -m ""');
    }
    if (context.aheadCount > 0) {
      nextCommands.push("git push");
    }
    if (context.behindCount > 0) {
      nextCommands.push("git pull --rebase");
    }
  };

  const pushValueSuggestions = (source?: SuggestionValueSource) => {
    if (!source) {
      return;
    }

    switch (source) {
      case "branch": {
        completions.push(
          ...context.branches
            .filter((branch) => branch.startsWith(currentWord))
            .map((branch) => ({ value: branch, type: "branch" as const }))
        );
        break;
      }
      case "file": {
        completions.push(
          ...context.files
            .filter((file) => file.startsWith(currentWord))
            .map((file) => ({ value: file, type: "file" as const }))
        );
        break;
      }
      case "remote": {
        completions.push(
          ...context.remotes
            .filter((remote) => remote.startsWith(currentWord))
            .map((remote) => ({ value: remote, type: "remote" as const }))
        );
        break;
      }
      case "stash": {
        completions.push(
          ...context.stashes
            .filter((stash) => stash.startsWith(currentWord))
            .map((stash) => ({ value: stash, type: "stash" as const }))
        );
        break;
      }
      default: {
        break;
      }
    }
  };

  const pushOptionSuggestions = (options: GitOptionDefinition[]) => {
    const filteredOptions = options.filter((option) => {
      if (currentWord === "") {
        return true;
      }

      if (currentWord === "-") {
        return option.value.startsWith("-") && !option.value.startsWith("--");
      }

      if (currentWord === "--") {
        return option.value.startsWith("--");
      }

      return option.value.startsWith(currentWord);
    });

    completions.push(
      ...filteredOptions.map((option) => ({
        ...option,
        type: "option" as const,
      }))
    );
  };

  if (tokens.length === 2) {
    completions.push(
      ...GIT_COMMANDS.filter((c) => c.value.startsWith(currentWord)).map(
        (c) => ({ ...c, type: "subcommand" as const })
      )
    );

    if (currentWord === "") {
      pushContextualSuggestions();
    }
  } else if (subcommand && commandDefinition) {
    const matchingOptionWithValue = commandDefinition.options?.find(
      (option) => {
        if (!option.valueSource) {
          return false;
        }

        if (option.value === previousToken) {
          return true;
        }

        if (
          option.value.startsWith("--") &&
          currentWord.startsWith(`${option.value}=`)
        ) {
          return true;
        }

        return false;
      }
    );

    const subcommandValueSource =
      tokens.length >= 4 && !currentWord.startsWith("-")
        ? matchingSubcommand?.valueSource
        : undefined;

    if (subcommandValueSource) {
      pushValueSuggestions(subcommandValueSource);
      return buildResult();
    }

    if (!currentWord.startsWith("-") && matchingOptionWithValue?.valueSource) {
      pushValueSuggestions(matchingOptionWithValue.valueSource);
      return buildResult();
    }

    const options = commandDefinition.options ?? [];
    const shouldShowOptionsFirst = options.length > 0 && currentWord === "";

    if (currentWord.startsWith("-") || shouldShowOptionsFirst) {
      pushOptionSuggestions(options);
    } else {
      if (commandDefinition.subcommands && tokens.length === 3) {
        completions.push(
          ...commandDefinition.subcommands
            .filter((option) => option.value.startsWith(currentWord))
            .map((option) => ({
              ...option,
              type: "subcommand" as const,
            }))
        );
      }

      const stashAction = subcommandToken;
      const expectsDefaultArgument =
        !shouldShowOptionsFirst &&
        commandDefinition.argumentSource &&
        (!commandDefinition.argumentSourceRequiresSpace ||
          currentWord === "") &&
        (tokens.length > 3 ||
          commandDefinition.subcommands === undefined ||
          previousNonEmptyToken === subcommand ||
          matchingSubcommand?.valueSource === undefined);

      if (
        subcommand === "stash" &&
        ["apply", "branch", "drop", "pop", "show"].includes(stashAction) &&
        tokens.length >= 4
      ) {
        pushValueSuggestions("stash");
      } else if (expectsDefaultArgument) {
        pushValueSuggestions(commandDefinition.argumentSource);
      }

      if (currentWord === "" && options.length > 0) {
        pushOptionSuggestions(options);
      }
    }
  }

  return buildResult();
}

export function parseCommandLine(line: string): ParsedCommandLine | null {
  const gitLine = line.trimStart();

  if (gitLine.length === 0) {
    return null;
  }

  if (!gitLine.includes(" ") && "git".startsWith(gitLine)) {
    return {
      currentWord: gitLine,
      isGitCommand: gitLine === "git",
      isGitPrefix: true,
      isGitSubcommandStage: false,
      tokens: [gitLine],
    };
  }

  if (!(gitLine === "git" || gitLine.startsWith("git "))) {
    return null;
  }

  const tokens = gitLine
    .trimStart()
    .split(WHITESPACE_REGEX)
    .filter((t) => t.length > 0);

  if (line.endsWith(" ")) {
    tokens.push("");
  }

  return {
    tokens,
    currentWord: tokens.at(-1) || "",
    isGitCommand: true,
    isGitPrefix: tokens.length === 1,
    isGitSubcommandStage: tokens.length >= 2,
  };
}
