import type { FileData } from './csvHelpers';

/**
 * Stable SHA-256 over sorted file fingerprints for import audit / sourceFileHash.
 * Includes name, row count, size proxy, and first/last row samples.
 */
export async function computeImportBundleFingerprint(files: FileData[]): Promise<string> {
  const parts = files
    .map((f) => {
      const rows = f.rows ?? [];
      const rowCount = rows.length;
      const first = rows[0] ? JSON.stringify(rows[0]).slice(0, 200) : '';
      const last = rowCount > 1 ? JSON.stringify(rows[rowCount - 1]).slice(0, 200) : first;
      const sizeApprox = rows.reduce((n, r) => n + JSON.stringify(r).length, 0);
      return `${f.name}:${rowCount}:${sizeApprox}:${first}:${last}`;
    })
    .sort((a, b) => a.localeCompare(b));
  const payload = parts.join('|');
  const enc = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
