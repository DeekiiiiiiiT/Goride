import type { CourierComplianceBlocker } from '@roam/types/courier';

export const BLOCKER_LABELS: Record<CourierComplianceBlocker, string> = {
  no_profile: 'No courier profile',
  onboarding_incomplete: 'Onboarding incomplete',
  background_check_not_approved: 'Background check not approved',
  license_missing: "Driver's license not verified",
  vehicle_missing: 'No vehicle registered',
  insurance_missing: 'Insurance not verified',
  account_suspended: 'Account suspended',
  account_deactivated: 'Account deactivated',
};

export const MIN_FORCE_APPROVE_REASON_LENGTH = 10;

export function formatBlockersList(blockers: CourierComplianceBlocker[]): string {
  if (!blockers.length) return 'Ready to approve';
  return blockers.map((b) => BLOCKER_LABELS[b]).join(', ');
}

export function formatBlockersShort(blockers: CourierComplianceBlocker[], max = 2): string {
  if (!blockers.length) return '';
  const labels = blockers.map((b) => BLOCKER_LABELS[b]);
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max}`;
}
