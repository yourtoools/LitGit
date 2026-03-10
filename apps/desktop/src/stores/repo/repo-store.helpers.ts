export function resolveErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
