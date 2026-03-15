const LINE_BREAK_PATTERN = /\r?\n/;
const PRIORITY_ERROR_LINE_PATTERN =
  /^(x\b|error:|failed\b|unable\b|cannot\b|denied\b|eperm\b|enoent\b)/i;
const DECORATIVE_LINE_PATTERN = /^[\u2500-\u257f|>$`]+/;
const LOW_SIGNAL_LINE_PATTERN = /^(summary:|checked\b|tasks:|cached:|time:)/i;

export function resolveErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function resolveErrorSummary(error: unknown, fallback: string) {
  const message = resolveErrorMessage(error, fallback);
  const lines = message
    .split(LINE_BREAK_PATTERN)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const preferredLine =
    lines.find((line) => PRIORITY_ERROR_LINE_PATTERN.test(line)) ??
    lines.find(
      (line) =>
        !(
          DECORATIVE_LINE_PATTERN.test(line) ||
          LOW_SIGNAL_LINE_PATTERN.test(line)
        )
    );

  return preferredLine ?? fallback;
}

export function clearRepoDataById<T>(
  data: Record<string, T>,
  id: string
): Record<string, T> {
  const { [id]: _removed, ...nextData } = data;
  return nextData;
}

export function countUniqueRemoteNames(remoteNames: readonly string[]): number {
  return new Set(
    remoteNames
      .map((remoteName) => remoteName.trim())
      .filter((remoteName) => remoteName.length > 0)
  ).size;
}
