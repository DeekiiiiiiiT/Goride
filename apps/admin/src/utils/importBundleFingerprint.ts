import type { FileData } from './csvHelpers';

/**
 * Stable SHA-256 over sorted `name:rowCount` pairs for import audit / sourceFileHash context.
 */
export async function computeImportBundleFingerprint(files: FileData[]): Promise<string> {
  const parts = files
    .map((f) => `${f.name}:${f.rows?.length ?? 0}`)
    .sort((a, b) => a.localeCompare(b));
  const payload = parts.join('|');
  const enc = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
