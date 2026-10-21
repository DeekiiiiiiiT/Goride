/** Version of the saved week the lock button may approve. Cleared when the saved week does not match the numbers on screen. */
let version: number | null = null;

export function rememberFuelSnapshotVersion(next: number | null) {
  version = next && next > 0 ? next : null;
}

export function currentFuelSnapshotVersion(): number | null {
  return version;
}
