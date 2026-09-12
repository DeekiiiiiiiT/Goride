export const ASSIGNMENT_OPTIONS = ['Assigned', 'Unassigned'] as const;
export type AssignmentFilter = (typeof ASSIGNMENT_OPTIONS)[number] | null;

export const STATUS_OPTIONS = [
  'Active',
  'Onboarding',
  'Waitlisted',
  'Rejected',
] as const;
export type StatusFilterOption = (typeof STATUS_OPTIONS)[number];

export const DOCUMENT_OPTIONS = [
  'Passed',
  'Pending',
  'Missing',
  'Rejected',
  'Expiring',
] as const;
export type DocumentFilterOption = (typeof DOCUMENT_OPTIONS)[number];

export const SEARCH_FIELD_OPTIONS = [
  'Number plate',
  'Vehicle ID',
  'VIN',
] as const;
export type SearchFieldOption = (typeof SEARCH_FIELD_OPTIONS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 30;

export function deriveDocumentStatus(driver: {
  licenseFrontUrl?: string;
  licenseBackUrl?: string;
  proofOfAddressUrl?: string;
  licenseExpiry?: string;
  dispatchBlocked?: boolean;
}): DocumentFilterOption {
  const hasLicense = Boolean(driver.licenseFrontUrl || driver.licenseBackUrl);
  const hasProof = Boolean(driver.proofOfAddressUrl);

  if (!hasLicense && !hasProof) return 'Missing';

  if (driver.dispatchBlocked) return 'Rejected';

  if (driver.licenseExpiry) {
    const expiryMs = new Date(driver.licenseExpiry).getTime();
    if (!Number.isNaN(expiryMs)) {
      const daysLeft = Math.ceil((expiryMs - Date.now()) / MS_PER_DAY);
      if (daysLeft < 0) return 'Rejected';
      if (daysLeft <= EXPIRING_SOON_DAYS) return 'Expiring';
    }
  }

  if (!hasLicense || !hasProof) return 'Pending';

  return 'Passed';
}

/** Map roster status strings onto the dashboard Status filter buckets. */
export function deriveStatusBucket(status: string): StatusFilterOption | null {
  const s = (status || '').trim().toLowerCase();
  if (!s) return 'Active';
  if (s === 'active') return 'Active';
  if (s.includes('onboard')) return 'Onboarding';
  if (s.includes('wait')) return 'Waitlisted';
  if (s.includes('reject')) return 'Rejected';
  // Existing fleet statuses → closest buckets in the filter set
  if (s.includes('attention')) return 'Onboarding';
  if (s === 'inactive') return 'Waitlisted';
  return null;
}

export function isAssignedRow(row: {
  vehicleId?: string;
  vehicleLabel?: string;
}): boolean {
  const label = (row.vehicleLabel || '').trim().toLowerCase();
  if (row.vehicleId) return true;
  if (!label || label === 'unassigned' || label === '—') return false;
  return true;
}

export function rowMatchesSearch(
  row: {
    licensePlate?: string;
    vehicleId?: string;
    vin?: string;
    name?: string;
    phone?: string;
    email?: string;
    vehicleLabel?: string;
  },
  field: SearchFieldOption,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const hay =
    field === 'Number plate'
      ? row.licensePlate || ''
      : field === 'Vehicle ID'
        ? row.vehicleId || ''
        : row.vin || '';

  return hay.toLowerCase().includes(q);
}
