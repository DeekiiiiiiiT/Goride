import type { UploadEvidenceMeta } from '@roam/types/evidence';
import { api } from './api';

export async function uploadEvidenceFile(
  file: File,
  meta?: UploadEvidenceMeta,
): Promise<{ url: string }> {
  return api.uploadFile(file, meta);
}

export async function uploadPermanentFile(file: File): Promise<{ url: string }> {
  return api.uploadFile(file);
}
