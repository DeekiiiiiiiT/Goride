import type { DriverComplianceBlocker } from '@roam/types/driver';

export const BLOCKER_LABELS: Record<DriverComplianceBlocker, string> = {
  no_profile: 'No driver profile',
  onboarding_incomplete: 'Onboarding incomplete',
  background_check_not_approved: 'Background check not approved',
  insurance_missing: 'Insurance on file missing',
  vehicle_missing: 'No vehicle registered',
  account_suspended: 'Account suspended',
  account_deactivated: 'Account deactivated',
};

export function formatBlockersList(blockers: DriverComplianceBlocker[]): string {
  if (!blockers.length) return 'Ready to approve';
  return blockers.map((b) => BLOCKER_LABELS[b]).join(', ');
}

export function formatBlockersShort(blockers: DriverComplianceBlocker[], max = 2): string {
  if (!blockers.length) return '';
  const labels = blockers.map((b) => BLOCKER_LABELS[b]);
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max}`;
}
