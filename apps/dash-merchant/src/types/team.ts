export type TeamRole = 'staff' | 'manager' | 'admin';

export type TeamPermission = 'orders' | 'menu' | 'analytics' | 'payouts' | 'inventory';

/** Restaurant job station — separate from admin role/permissions. */
export type JobStation = 'counter' | 'kitchen' | 'manager' | 'pos';

/** UI value for job station picker — includes explicit unassigned option. */
export type JobStationSelection = JobStation | 'none';

export type LoginType = 'account' | 'roster';

export type PinStatus = 'unset' | 'active' | 'locked';

export interface MerchantMembership {
  role: TeamRole;
  permissions: TeamPermission[];
  is_owner: boolean;
  job_station?: JobStation | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role: TeamRole;
  permissions: TeamPermission[];
  isOwner?: boolean;
  jobStation?: JobStation | null;
  loginType?: LoginType;
  pinStatus?: PinStatus;
}

export interface RosterMember {
  id: string;
  name: string;
  role: Extract<TeamRole, 'staff' | 'manager'>;
  jobStation: JobStation | null;
  pinStatus: PinStatus;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: TeamRole;
  permissions: TeamPermission[];
  emailSent?: boolean;
  emailSentAt?: string;
  jobStation?: JobStation | null;
}

export interface TeamData {
  members: TeamMember[];
  pendingInvites: PendingInvite[];
}

export const TEAM_PERMISSIONS: { id: TeamPermission; label: string }[] = [
  { id: 'orders', label: 'View & manage orders' },
  { id: 'menu', label: 'Edit menu' },
  { id: 'analytics', label: 'View analytics' },
  { id: 'payouts', label: 'Manage payouts' },
  { id: 'inventory', label: 'Manage inventory' },
];

export const TEAM_ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export const JOB_STATION_OPTIONS: { value: JobStation; label: string; description: string }[] = [
  { value: 'counter', label: 'Counter', description: 'Accept orders, prep time, driver handoff' },
  { value: 'kitchen', label: 'Kitchen', description: 'Prep queue only — mark orders ready' },
  { value: 'manager', label: 'Manager', description: 'Full dashboard access' },
  { value: 'pos', label: 'POS Register', description: 'In-store sales and checkout' },
];

export function defaultJobStationForRole(role: TeamRole): JobStation {
  if (role === 'staff') return 'counter';
  return 'manager';
}

export const NO_JOB_STATION_OPTION = {
  value: 'none' as const,
  label: 'No station',
  description: 'Uses role permissions only — not locked to a tablet view',
};

export function jobStationSelectionToApi(
  station: JobStationSelection,
): JobStation | null {
  return station === 'none' ? null : station;
}

export function jobStationFromApi(station: JobStation | null | undefined): JobStationSelection {
  return station ?? 'none';
}

export function formatJobStationLabel(station: JobStation | null | undefined) {
  if (!station) return NO_JOB_STATION_OPTION.label;
  return JOB_STATION_OPTIONS.find((entry) => entry.value === station)?.label ?? station;
}

export const ROLE_DEFAULT_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  staff: ['orders'],
  manager: ['orders', 'menu', 'analytics'],
  admin: ['orders', 'menu', 'analytics', 'payouts'],
};

export function formatAccessSummary(permissions: TeamPermission[], isOwner?: boolean) {
  if (isOwner) return 'Full access';
  if (permissions.length === TEAM_PERMISSIONS.length) return 'Full access';

  const labels = TEAM_PERMISSIONS.filter((entry) => permissions.includes(entry.id)).map(
    (entry) => entry.label
  );

  if (labels.length === 0) return 'Limited access';
  if (labels.length === 1 && permissions.includes('orders')) return 'Orders only';
  if (permissions.includes('orders') && permissions.includes('menu')) return 'Orders & Menu';

  return labels
    .map((label) => label.replace('View & manage ', '').replace('Edit ', '').replace('View ', '').replace('Manage ', ''))
    .join(', ');
}

export function formatRoleLabel(role: TeamRole) {
  return TEAM_ROLE_OPTIONS.find((entry) => entry.value === role)?.label ?? role;
}

export function formatPinStatusLabel(status: PinStatus | undefined) {
  if (status === 'active') return 'Active';
  if (status === 'locked') return 'Locked — must set new PIN';
  return 'Not set';
}
