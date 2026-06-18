/**
 * Deep-merge partial settings over defaults (load path).
 * Arrays are replaced, not concatenated — matches existing UI spread behavior.
 */
export function mergeSettings<T extends Record<string, unknown>>(
  defaults: T,
  partial: Partial<T> | null | undefined,
): T {
  if (!partial || typeof partial !== 'object') {
    return { ...defaults };
  }

  const result = { ...defaults } as T & Record<string, unknown>;

  for (const key of Object.keys(partial) as (keyof T)[]) {
    const defaultVal = defaults[key];
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
      result[key] = mergeSettings(
        defaultVal as Record<string, unknown>,
        partialVal as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      result[key] = partialVal as T[keyof T];
    }
  }

  return result;
}
