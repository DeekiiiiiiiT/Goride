/** Map server UNLINKED_SPLIT_HALVES (and similar) to operator-facing copy. */
export function fuelSaveErrorMessage(err: unknown, fallback = 'Failed to save fuel entry'): string {
  if (!err || typeof err !== 'object') {
    return err instanceof Error ? err.message : fallback;
  }
  const e = err as Error & { code?: string; message?: string };
  if (e.code === 'UNLINKED_SPLIT_HALVES') {
    return 'This looks like half of a Gas Card + Cash fill. Use Add fuel → Gas Card + Cash instead of two separate rows.';
  }
  return e.message || fallback;
}
