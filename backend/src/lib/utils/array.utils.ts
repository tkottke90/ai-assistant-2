

export function isPopulatedArray<T>(arr: T[] | undefined | null): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

export function isEmptyArray<T>(arr: unknown) {
  return !Array.isArray(arr) || arr.length === 0;
}