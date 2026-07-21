import { API_ENDPOINTS } from '../services/apiConfig';
import { withProductLineHeaders } from '../config/productLine';

export type FleetAdminCustomer = {
  id: string;
  email: string;
  name: string;
  businessType: string;
  productLine: string;
  accountStatus: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  status: string;
  isSuspended: boolean;
};

export async function fetchFleetAdminCustomers(
  accessToken: string,
  refresh = false,
): Promise<FleetAdminCustomer[]> {
  const qs = refresh ? '?refresh=true' : '';
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers${qs}`, {
    headers: withProductLineHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.customers || [];
}

export async function approveFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<void> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/approve`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Fleet Customer Lifecycle Actions
// ---------------------------------------------------------------------------

export async function suspendFleetCustomer(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/suspend`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function reactivateFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/reactivate`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function signOutFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/sign-out`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function deleteFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}`, {
    method: 'DELETE',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------------
// Storage Center (Roam ops)
// ---------------------------------------------------------------------------

export type FleetStorageBucketRow = {
  id: string;
  label: string;
  purpose: string;
  folder?: string;
  fileCount: number;
  totalBytes: number;
  reachable: boolean;
};

export type FleetEvidenceSummary = {
  activeCount: number;
  scheduledCount: number;
  deletedCount: number;
  pendingHoldCount: number;
  totalBytes: number;
  expiringWithin7Days: number;
  lastCleanupAt: string | null;
  lastCleanupPurged: number;
  bucketReachable: boolean;
  ttlEnabled: boolean;
};

export type FleetStorageOverview = {
  ttlEnabled: boolean;
  freePlanLimitBytes: number;
  totalBytes: number;
  overQuota: boolean;
  status: 'healthy' | 'over_quota' | 'ttl_off';
  canPurge: boolean;
  buckets: FleetStorageBucketRow[];
  evidence: FleetEvidenceSummary;
};

export type FleetLegacyAuditResult = {
  success: boolean;
  bucket: string;
  scanned: number;
  linkedCount: number;
  orphanCount: number;
  linkedBytes: number;
  orphanBytes: number;
  orphans: { path: string; bytes: number }[];
  orgId?: string | null;
  note?: string;
};

export async function fetchFleetStorageOverview(
  accessToken: string,
): Promise<FleetStorageOverview> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/storage/overview`, {
    headers: withProductLineHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data as FleetStorageOverview;
}

export async function runFleetEvidenceCleanup(
  accessToken: string,
  dryRun: boolean,
  orgId?: string,
): Promise<{ success: boolean; purged: number; wouldPurge?: number; kvPatched: number }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/storage/cleanup`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ dryRun, orgId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function auditFleetLegacyStorage(
  accessToken: string,
  orgId?: string,
): Promise<FleetLegacyAuditResult> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/storage/audit-legacy`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(orgId ? { orgId } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data as FleetLegacyAuditResult;
}

export async function purgeFleetLegacyStorage(
  accessToken: string,
  opts: {
    orphanOnly?: boolean;
    olderThanDays?: number;
    paths?: string[];
    orgId?: string;
  } = {},
): Promise<{ success: boolean; deleted: number; pathsProcessed: number; mode?: string }> {
  const orphanOnly =
    opts.orgId != null
      ? false
      : opts.olderThanDays != null
        ? false
        : opts.orphanOnly !== false;
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/storage/purge-legacy`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      confirm: true,
      orphanOnly,
      olderThanDays: opts.olderThanDays,
      paths: opts.paths,
      orgId: opts.orgId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export type FleetStorageOrgRollup = {
  orgId: string;
  ephemeral: {
    fileCount: number;
    bytes: number;
    pendingHold: number;
    scheduled: number;
  };
  legacy: { linkedCount: number; linkedBytes: number };
  vehicles: { linkedCount: number; linkedBytes: number };
  totalBytes: number;
};

export type FleetStorageByOrgResult = {
  generatedAt: string;
  orgs: FleetStorageOrgRollup[];
  unattributed: {
    legacyOrphans: { count: number; bytes: number };
    vehicleOrphans: { count: number; bytes: number };
    ephemeralUnknown: { count: number; bytes: number };
  };
};

export type FleetStorageOrgDetail = {
  orgId: string;
  evidence: FleetEvidenceSummary;
  ephemeral: {
    byStatus: Record<string, { count: number; bytes: number }>;
    byType: Record<string, { count: number; bytes: number }>;
    recent: Array<{
      id: string;
      storage_path: string;
      evidence_type: string;
      status: string;
      size: number;
      uploaded_at: string;
    }>;
  };
  legacy: {
    linked: Array<{
      path: string;
      bytes: number;
      sourceType: string;
      sourceId: string;
    }>;
    note: string;
  };
  vehicles: {
    linked: Array<{
      path: string;
      bytes: number;
      vehicleId: string;
      licensePlate: string | null;
    }>;
  };
  totals: {
    ephemeralBytes: number;
    legacyLinkedBytes: number;
    vehicleLinkedBytes: number;
    totalBytes: number;
  };
  canPurge: boolean;
};

export async function fetchFleetStorageByOrg(
  accessToken: string,
): Promise<FleetStorageByOrgResult> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/storage/by-org`, {
    headers: withProductLineHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data as FleetStorageByOrgResult;
}

export async function fetchFleetStorageOrgDetail(
  accessToken: string,
  orgId: string,
): Promise<FleetStorageOrgDetail> {
  const res = await fetch(
    `${API_ENDPOINTS.admin}/fleet-admin/storage/orgs/${encodeURIComponent(orgId)}`,
    {
      headers: withProductLineHeaders({ Authorization: `Bearer ${accessToken}` }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data as FleetStorageOrgDetail;
}
