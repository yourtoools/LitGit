import type {
  RepositoryCommitFileHunks,
  RepositoryFileBlamePayload,
  RepositoryFileDetectedEncoding,
  RepositoryFileHistoryPayload,
  RepositoryFileHunks,
} from "@/stores/repo/repo-store-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function parseRepositoryFileHunk(
  value: unknown,
  errorMessage: string
): RepositoryFileHunks["hunks"][number] {
  if (!isRecord(value)) {
    throw new Error(errorMessage);
  }

  const { header, index, lines, newLines, newStart, oldLines, oldStart } =
    value;

  if (
    typeof header !== "string" ||
    typeof index !== "number" ||
    !Array.isArray(lines) ||
    lines.some((line) => typeof line !== "string") ||
    typeof newLines !== "number" ||
    typeof newStart !== "number" ||
    typeof oldLines !== "number" ||
    typeof oldStart !== "number"
  ) {
    throw new Error(errorMessage);
  }

  return {
    header,
    index,
    lines,
    newLines,
    newStart,
    oldLines,
    oldStart,
  };
}

export function parseRepositoryFileHunks(value: unknown): RepositoryFileHunks {
  if (!isRecord(value)) {
    throw new Error("Invalid repository file hunks payload");
  }

  const { path, hunks } = value;

  if (typeof path !== "string" || !Array.isArray(hunks)) {
    throw new Error("Invalid repository file hunks payload");
  }

  return {
    path,
    hunks: hunks.map((hunk) =>
      parseRepositoryFileHunk(hunk, "Invalid repository file hunks payload")
    ),
  };
}

export function parseRepositoryCommitFileHunks(
  value: unknown
): RepositoryCommitFileHunks {
  if (!isRecord(value)) {
    throw new Error("Invalid repository commit file hunks payload");
  }

  const { commitHash } = value;

  if (typeof commitHash !== "string") {
    throw new Error("Invalid repository commit file hunks payload");
  }

  return {
    commitHash,
    ...parseRepositoryFileHunks(value),
  };
}

function parseRepositoryFileHistoryEntry(
  value: unknown,
  errorMessage: string
): RepositoryFileHistoryPayload["entries"][number] {
  if (!isRecord(value)) {
    throw new Error(errorMessage);
  }

  const { author, authorEmail, commitHash, date, messageSummary, shortHash } =
    value;

  if (
    typeof author !== "string" ||
    typeof authorEmail !== "string" ||
    typeof commitHash !== "string" ||
    typeof date !== "string" ||
    typeof messageSummary !== "string" ||
    typeof shortHash !== "string"
  ) {
    throw new Error(errorMessage);
  }

  return {
    author,
    authorEmail,
    commitHash,
    date,
    messageSummary,
    shortHash,
  };
}

export function parseRepositoryFileHistory(
  value: unknown
): RepositoryFileHistoryPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid repository file history payload");
  }

  const { path, entries } = value;

  if (typeof path !== "string" || !Array.isArray(entries)) {
    throw new Error("Invalid repository file history payload");
  }

  return {
    path,
    entries: entries.map((entry) =>
      parseRepositoryFileHistoryEntry(
        entry,
        "Invalid repository file history payload"
      )
    ),
  };
}

function parseRepositoryFileBlameLine(
  value: unknown,
  errorMessage: string
): RepositoryFileBlamePayload["lines"][number] {
  if (!isRecord(value)) {
    throw new Error(errorMessage);
  }

  const {
    author,
    authorEmail,
    authorTime,
    commitHash,
    lineNumber,
    summary,
    text,
  } = value;

  if (
    typeof author !== "string" ||
    typeof authorEmail !== "string" ||
    !isNullableNumber(authorTime) ||
    typeof commitHash !== "string" ||
    typeof lineNumber !== "number" ||
    typeof summary !== "string" ||
    typeof text !== "string"
  ) {
    throw new Error(errorMessage);
  }

  return {
    author,
    authorEmail,
    authorTime,
    commitHash,
    lineNumber,
    summary,
    text,
  };
}

export function parseRepositoryFileBlame(
  value: unknown
): RepositoryFileBlamePayload {
  if (!isRecord(value)) {
    throw new Error("Invalid repository file blame payload");
  }

  const { path, revision, lines } = value;

  if (
    typeof path !== "string" ||
    typeof revision !== "string" ||
    !Array.isArray(lines)
  ) {
    throw new Error("Invalid repository file blame payload");
  }

  return {
    path,
    revision,
    lines: lines.map((line) =>
      parseRepositoryFileBlameLine(
        line,
        "Invalid repository file blame payload"
      )
    ),
  };
}

export function parseRepositoryFileText(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid repository file text payload");
  }

  return value;
}

export function parseRepositoryFileDetectedEncoding(
  value: unknown
): RepositoryFileDetectedEncoding {
  if (!isRecord(value)) {
    throw new Error("Invalid repository file encoding payload");
  }

  const { encoding } = value;

  if (typeof encoding !== "string") {
    throw new Error("Invalid repository file encoding payload");
  }

  return { encoding };
}
