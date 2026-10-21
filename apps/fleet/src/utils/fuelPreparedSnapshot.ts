/** Version of the saved week the lock button may approve, remembered per period. */
const versions = new Map<string, number>();

export function rememberFuelSnapshotVersion(periodId: string | null | undefined, next: number | null) {
  const id = String(periodId || '');
  if (!id) return;
  if (next && next > 0) versions.set(id, next);
  else versions.delete(id);
}

export function currentFuelSnapshotVersion(periodId?: string | null): number | null {
  const id = String(periodId || '');
  if (!id) return null;
  return versions.get(id) ?? null;
}
