/**
 * Shadow-week helper: compare getSetting to a legacy source value and warn on mismatch.
 * Callers should still use the getSetting return as the authority after Phase 3 switch.
 */
import { getSetting, type GetSettingOptions } from "./getSetting.ts";

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(a - b) < 1e-9;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Resolve via getSetting, warn if it disagrees with `legacyValue`, return getSetting.
 */
export async function shadowCompare<T = unknown>(
  key: string,
  legacyValue: unknown,
  opts?: GetSettingOptions,
): Promise<T> {
  const next = await getSetting<T>(key, opts);
  if (!valuesEqual(next, legacyValue)) {
    console.warn(`[rushSettings:shadow] mismatch for ${key}`, {
      getSetting: next,
      legacy: legacyValue,
    });
  }
  return next;
}

/** Exported for tests. */
export function shadowValuesEqual(a: unknown, b: unknown): boolean {
  return valuesEqual(a, b);
}
