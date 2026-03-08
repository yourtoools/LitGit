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
