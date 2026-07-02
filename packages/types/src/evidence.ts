/** Ephemeral scan evidence — 14-day retention after approve/reject */

export const EVIDENCE_RETENTION_DAYS = 14;

export type EvidenceType =
  | 'fuel_receipt'
  | 'toll_receipt'
  | 'odometer_proof'
  | 'maintenance_invoice';

export type EvidenceRetentionClass = 'ephemeral' | 'permanent';

export type EvidenceSourceType = 'transaction' | 'fuel_entry' | 'maintenance_log';

export type EvidenceFileStatus =
  | 'active'
  | 'pending_hold'
  | 'scheduled'
  | 'deleted'
  | 'failed';

export type EvidenceMediaState =
  | 'available'
  | 'expiring_soon'
  | 'expired'
  | 'pending_review'
  | 'unavailable';

export interface EvidenceFile {
  id: string;
  bucket_id: string;
  storage_path: string;
  evidence_type: EvidenceType;
  retention_class: EvidenceRetentionClass;
  source_type: EvidenceSourceType;
  source_id: string;
  org_id: string | null;
  public_url: string | null;
  uploaded_at: string;
  resolved_at: string | null;
  delete_after: string | null;
  deleted_at: string | null;
  status: EvidenceFileStatus;
  metadata: Record<string, unknown>;
}

export interface EvidenceExpiredMetadata {
  evidenceExpired?: boolean;
  evidenceDeleteAfter?: string;
}

export interface UploadEvidenceMeta {
  evidenceType: EvidenceType;
  sourceType: EvidenceSourceType;
  sourceId: string;
  retentionClass?: EvidenceRetentionClass;
  orgId?: string;
  parentStatus?: 'Pending' | 'Approved' | 'Rejected' | string;
}

/** Append ephemeral upload fields to FormData (fleet + driver upload endpoints). */
export function appendUploadEvidenceMeta(
  formData: FormData,
  meta?: UploadEvidenceMeta,
): void {
  if (!meta) return;
  formData.append('retentionClass', meta.retentionClass ?? 'ephemeral');
  formData.append('evidenceType', meta.evidenceType);
  formData.append('sourceType', meta.sourceType);
  formData.append('sourceId', meta.sourceId);
  if (meta.orgId) formData.append('orgId', meta.orgId);
  if (meta.parentStatus) formData.append('parentStatus', meta.parentStatus);
}

export interface EvidenceStorageSummary {
  activeCount: number;
  scheduledCount: number;
  deletedCount: number;
  pendingHoldCount: number;
  totalBytes: number;
  expiringWithin7Days: number;
  lastCleanupAt: string | null;
  lastCleanupPurged: number;
}
