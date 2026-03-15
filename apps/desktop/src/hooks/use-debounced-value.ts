import { useDebouncedValue as useMantineDebouncedValue } from "@mantine/hooks";

export const COMBOBOX_DEBOUNCE_DELAY_MS = 500;

export const normalizeComboboxQuery = (query: string): string => {
  return query.trim().toLowerCase();
};

export function useDebouncedValue<T>(value: T, delayInMs: number): T;
export function useDebouncedValue<T, TResult>(
  value: T,
  delayInMs: number,
  transform: (value: T) => TResult
): TResult;
export function useDebouncedValue<T, TResult>(
  value: T,
  delayInMs: number,
  transform?: (value: T) => TResult
): T | TResult {
  const [debouncedValue] = useMantineDebouncedValue(value, delayInMs);

  return transform ? transform(debouncedValue) : debouncedValue;
}
