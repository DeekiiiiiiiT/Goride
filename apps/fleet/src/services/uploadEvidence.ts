import type { UploadEvidenceMeta } from '@roam/types/evidence';
import { api } from './api';

/** Shared upload helper for fleet + driver ephemeral evidence. */
export async function uploadEvidenceFile(
  file: File,
  meta?: UploadEvidenceMeta,
): Promise<{ url: string }> {
  return api.uploadFile(file, meta);
}

/** Permanent document uploads (licenses, registration) — unchanged behavior. */
export async function uploadPermanentFile(file: File): Promise<{ url: string }> {
  return api.uploadFile(file);
}
