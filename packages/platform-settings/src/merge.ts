/**
 * Deep-merge partial settings over defaults (load path).
 * Arrays are replaced, not concatenated — matches existing UI spread behavior.
 */
export function mergeSettings<T extends object>(
  defaults: T,
  partial: Partial<T> | null | undefined,
): T {
  if (!partial || typeof partial !== 'object') {
    return { ...defaults };
  }

  const result = { ...defaults } as T & Record<string, unknown>;
  const defaultsRecord = defaults as Record<string, unknown>;

  for (const key of Object.keys(partial) as (keyof T)[]) {
    const defaultVal = defaultsRecord[key as string];
    const partialVal = partial[key];

    if (partialVal === undefined) continue;

    if (
      defaultVal !== null
      && typeof defaultVal === 'object'
      && !Array.isArray(defaultVal)
      && partialVal !== null
      && typeof partialVal === 'object'
      && !Array.isArray(partialVal)
    ) {
      (result as Record<string, unknown>)[key as string] = mergeSettings(
        defaultVal as Record<string, unknown>,
        partialVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key as string] = partialVal;
    }
  }

  return result;
}
