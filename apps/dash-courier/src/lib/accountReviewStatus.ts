import type { CourierDocumentRow } from '@/lib/courierDocumentService';

export type ReviewItemStatus = 'not-submitted' | 'submitted' | 'verified' | 'rejected' | 'expired';

export type AccountReviewItem = {
  id: string;
  label: string;
  status: ReviewItemStatus;
  statusLabel: string;
};

const STATUS_LABEL: Record<ReviewItemStatus, string> = {
  'not-submitted': 'Not submitted',
  submitted: 'Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

export function mapComplianceStatus(raw?: string | null): ReviewItemStatus {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return 'not-submitted';
  if (value === 'approved') return 'verified';
  if (value === 'pending') return 'submitted';
  if (value === 'rejected') return 'rejected';
  if (value === 'expired') return 'expired';
  return 'submitted';
}

function latestDoc(
  docs: CourierDocumentRow[],
  docType: CourierDocumentRow['doc_type'],
): CourierDocumentRow | undefined {
  return docs.find((row) => row.doc_type === docType);
}

function item(id: string, label: string, status: ReviewItemStatus): AccountReviewItem {
  return { id, label, status, statusLabel: STATUS_LABEL[status] };
}

export function buildAccountReviewItems(input: {
  docs: CourierDocumentRow[];
  backgroundCheckStatus?: string | null;
  hasVehicle: boolean;
}): AccountReviewItem[] {
  const license = latestDoc(input.docs, 'drivers_license');
  const insurance = latestDoc(input.docs, 'insurance');
  const licenseStatus = license?.file_url || license?.status
    ? mapComplianceStatus(license?.status || 'pending')
    : 'not-submitted';
  const insuranceStatus = insurance?.file_url || insurance?.status
    ? mapComplianceStatus(insurance?.status || 'pending')
    : 'not-submitted';

  return [
    item('license', "Driver's license", licenseStatus),
    item('insurance', 'Insurance', insuranceStatus),
    item('vehicle', 'Vehicle', input.hasVehicle ? 'submitted' : 'not-submitted'),
    item('background', 'Background check', mapComplianceStatus(input.backgroundCheckStatus)),
  ];
}
