/**
 * Dash Admin Service - API client for Roam Rush admin portal
 */

import { dashAdminFetch } from './fetch';
import type {
  MerchantOperationalStatus,
  MerchantOnboardingStatus,
  MerchantVerificationStatus,
  PartnerWizardStepKey,
} from '@roam/types/delivery';

export type { MerchantVerificationStatus, MerchantOperationalStatus };

export interface DashMerchant {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  cuisine_type: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_accepting_orders: boolean;
  payout_ready?: boolean;
  is_test_merchant?: boolean;
  avg_prep_time_mins: number | null;
  min_order_amount: number | null;
  delivery_fee: number | null;
  delivery_radius_km: number | null;
  commission_rate: number | null;
  pricing_tier_id?: string | null;
  merchant_commission_rate?: number | null;
  rating: number | null;
  total_ratings: number | null;
  verification_status: MerchantVerificationStatus;
  operational_status?: MerchantOperationalStatus;
  verification_notes: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  verified_by: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  admin_assigned_to?: string | null;
  verification_checklist?: Record<string, boolean>;
  admin_internal_notes?: string | null;
  onboarding_status?: MerchantOnboardingStatus;
  wizard_step?: number;
  wizard_step_key?: PartnerWizardStepKey | null;
  onboarding_draft?: Record<string, unknown>;
  last_onboarding_activity_at?: string | null;
  vertical_type?: string | null;
  fulfillment_type?: string | null;
  go_live_rule?: string | null;
  business_type_id?: string | null;
  capabilities?: string[];
  gct_registered?: boolean;
  tax_id?: string | null;
  /** Assigned delivery town; required for discovery/orders */
  market_id?: string | null;
  /** Ops lock — publish recompute will not overwrite market_id */
  market_id_locked?: boolean;
}

export interface MerchantHours {
  id: string;
  merchant_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export interface MerchantAuditEntry {
  id: string;
  merchant_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
}

export interface MerchantStatusCounts {
  pending: number;
  in_review: number;
  docs_requested: number;
  approved: number;
  rejected: number;
}

export interface MerchantTeamMemberRow {
  id: string;
  email: string | null;
  name: string;
  role: string;
  permissions: string[];
  is_owner: boolean;
}

export interface ListMerchantsResponse {
  merchants: DashMerchant[];
  total: number;
  page: number;
  limit: number;
  counts: MerchantStatusCounts;
  operational?: Record<MerchantOperationalStatus, number>;
}

export interface SetupChecklistSnapshot {
  profileComplete: boolean;
  documentsComplete: boolean;
  bankComplete: boolean;
  hoursComplete: boolean;
  menuComplete: boolean;
}

export interface IncompleteSetupRow {
  kind: 'draft' | 'merchant';
  userId: string;
  ownerEmail: string;
  merchantId: string | null;
  merchantName: string | null;
  verificationStatus: string | null;
  onboardingStatus?: MerchantOnboardingStatus | null;
  wizardStep?: number | null;
  wizardStepKey?: PartnerWizardStepKey | null;
  setupStage: string;
  checklist: SetupChecklistSnapshot | null;
  missingSteps: string[];
  lastActivityAt: string | null;
}

export interface ListIncompleteSetupResponse {
  items: IncompleteSetupRow[];
  total: number;
  page: number;
  limit: number;
  counts: {
    drafts: number;
    incomplete_merchants: number;
    total: number;
  };
}

export interface MerchantDetailResponse {
  merchant: DashMerchant;
  hours: MerchantHours[];
  auditLog: MerchantAuditEntry[];
  ownerEmail: string;
  documents?: MerchantDocumentDetail[];
  bankAccount?: MerchantBankAccountDetail | null;
  team?: MerchantTeamMemberRow[];
  pendingInvites?: Array<Record<string, unknown>>;
  platform_fee_rate?: number;
  global_platform_fee_rate?: number;
  platform_fee_percent?: number;
  global_platform_fee_percent?: number;
}

export interface MerchantDocumentDetail {
  id: string;
  doc_type: string;
  status: string;
  file_path: string;
  signedUrl?: string | null;
  uploaded_at: string;
  rejection_reason?: string | null;
}

export interface MerchantBankAccountDetail {
  bank_name: string;
  account_holder_name: string;
  account_last4: string;
  account_type: string;
}

export interface DashboardStats {
  merchants: {
    total: number;
    verification: MerchantStatusCounts;
    operational: Record<MerchantOperationalStatus, number>;
  };
  orders: { todayCount: number; todayGmv: number; liveCount: number };
  sla: { staleVerifications: number };
}

export type DashboardStatsResponse =
  | { scope: 'platform'; platform: DashboardStats }
  | {
      scope: 'courier';
      courier: {
        total_couriers: number;
        active_couriers: number;
        pending_compliance: number;
        online_now: number;
        on_delivery_now: number;
      };
    };

export interface DashOrderRow {
  id: string;
  order_number: string;
  status: string;
  total: number;
  placed_at: string;
  merchant_id: string;
  customer_id: string;
  delivery_address: string;
}

const deliveryFetch = dashAdminFetch;

export function listMerchants(
  accessToken: string,
  opts: {
    status?: MerchantVerificationStatus | 'all';
    operational_status?: MerchantOperationalStatus | 'all';
    vertical_in?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<ListMerchantsResponse> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.operational_status) sp.set('operational_status', opts.operational_status);
  if (opts.vertical_in) sp.set('vertical_in', opts.vertical_in);
  if (opts.search) sp.set('search', opts.search);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch(accessToken, `/admin/merchants?${sp}`);
}

export function listIncompleteSetup(
  accessToken: string,
  opts: { q?: string; page?: number; limit?: number } = {},
): Promise<ListIncompleteSetupResponse> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch(accessToken, `/admin/merchants/incomplete-setup?${sp}`);
}

export function getMerchantDetail(accessToken: string, id: string): Promise<MerchantDetailResponse> {
  return deliveryFetch(accessToken, `/admin/merchants/${id}`);
}

export function changeMerchantStatus(
  accessToken: string,
  id: string,
  payload: {
    status: MerchantVerificationStatus;
    notes?: string;
    internal_notes?: string;
    force?: boolean;
    commission_rate?: number;
    delivery_radius_km?: number;
  },
): Promise<{ merchant: DashMerchant }> {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMerchantStats(
  accessToken: string,
): Promise<{ counts: MerchantStatusCounts; operational?: Record<string, number>; total: number }> {
  return deliveryFetch(accessToken, '/admin/merchants/stats');
}

function normalizeDashboardStats(raw: unknown): DashboardStatsResponse {
  const body = raw as Record<string, unknown>;

  if (body.scope === 'courier' && body.courier) {
    return body as DashboardStatsResponse;
  }

  if (body.scope === 'platform' && body.platform) {
    const platform = body.platform as DashboardStats;
    return {
      scope: 'platform',
      platform: {
        ...platform,
        sla: platform.sla ?? { staleVerifications: 0 },
      },
    };
  }

  // Legacy flat payload from pre-scope `/admin/dashboard/stats` (undeployed edge).
  if (body.merchants && body.orders) {
    return {
      scope: 'platform',
      platform: {
        merchants: body.merchants as DashboardStats['merchants'],
        orders: body.orders as DashboardStats['orders'],
        sla: (body.sla as DashboardStats['sla']) ?? { staleVerifications: 0 },
      },
    };
  }

  throw new Error('Invalid dashboard stats response');
}

export async function getDashboardStats(accessToken: string): Promise<DashboardStatsResponse> {
  const raw = await deliveryFetch<unknown>(accessToken, '/admin/dashboard/stats');
  return normalizeDashboardStats(raw);
}

export function suspendMerchant(accessToken: string, id: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendMerchant(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/unsuspend`, { method: 'POST' });
}

export function deactivateMerchant(accessToken: string, id: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function reactivateMerchant(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/reactivate`, { method: 'POST' });
}

export function deleteMerchant(
  accessToken: string,
  id: string,
  payload: { reason: string; confirm_name: string },
) {
  return deliveryFetch<{ ok: boolean; message: string }>(accessToken, `/admin/merchants/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function patchMerchantOps(
  accessToken: string,
  id: string,
  payload: {
    is_accepting_orders?: boolean;
    commission_rate?: number | null;
    merchant_commission_rate?: number | null;
    pricing_tier_id?: string | null;
    delivery_radius_km?: number;
    admin_internal_notes?: string;
    capabilities?: string[];
    payout_ready?: boolean;
    is_test_merchant?: boolean;
    gct_registered?: boolean;
    market_id?: string | null;
    market_id_locked?: boolean;
  },
) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/ops`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function backfillMerchantMarkets(accessToken: string, includeLocked = false) {
  const qs = includeLocked ? '?include_locked=true' : '';
  return deliveryFetch<{
    assigned: number;
    skipped: number;
    total: number;
    updated_locked?: number;
  }>(
    accessToken,
    `/admin/markets/backfill-merchant-markets${qs}`,
    { method: 'POST', body: '{}' },
  );
}

export function recomputeMerchantMarket(accessToken: string, merchantId: string) {
  return deliveryFetch<{
    merchant: DashMerchant;
    previous_market_id: string | null;
    suggested_market_id: string | null;
  }>(accessToken, `/admin/merchants/${merchantId}/recompute-market`, { method: 'POST', body: '{}' });
}

export function assignMerchant(accessToken: string, id: string, assignedTo: string | null) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assigned_to: assignedTo }),
  });
}

export function updateMerchantChecklist(
  accessToken: string,
  id: string,
  checklist: Record<string, boolean>,
) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ checklist }),
  });
}

export function reviewMerchantDocument(
  accessToken: string,
  docId: string,
  payload: { status: string; rejection_reason?: string },
) {
  return deliveryFetch(accessToken, `/admin/merchants/documents/${docId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listOrders(
  accessToken: string,
  opts: {
    status?: string;
    merchant_id?: string;
    customer_id?: string;
    q?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ orders: DashOrderRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.merchant_id) sp.set('merchant_id', opts.merchant_id);
  if (opts.customer_id) sp.set('customer_id', opts.customer_id);
  if (opts.q) sp.set('q', opts.q);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch(accessToken, `/admin/orders?${sp}`);
}

export function getOrderDetail(
  accessToken: string,
  orderId: string,
): Promise<{
  order: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  transaction?: Record<string, unknown> | null;
  refunds?: Array<Record<string, unknown>>;
}> {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}`);
}

export function cancelOrder(accessToken: string, orderId: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function refundOrder(
  accessToken: string,
  orderId: string,
  payload: { amount?: number; reason: string },
) {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}/refund`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function completeOrder(accessToken: string, orderId: string) {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}/complete`, { method: 'POST' });
}

export function listCustomers(
  accessToken: string,
  opts: { q?: string; page?: number; status?: string } = {},
) {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.status) sp.set('status', opts.status);
  return deliveryFetch(accessToken, `/admin/customers?${sp}`);
}

export interface CustomerAddress {
  id?: string;
  label?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  parish?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_default?: boolean;
  instructions?: string | null;
}

export interface CustomerDevice {
  id?: string;
  platform?: string | null;
  model?: string | null;
  app_version?: string | null;
  push_enabled?: boolean;
  last_active_at?: string | null;
}

export interface CustomerTrust {
  risk_score?: number | null;
  risk_level?: string | null;
  chargebacks?: number | null;
  refunds_count?: number | null;
  refunds_amount?: number | null;
  cancelled_orders?: number | null;
  flagged?: boolean;
  flags?: string[];
  email_verified?: boolean;
  phone_verified?: boolean;
}

export interface CustomerDetailResponse {
  customer: Record<string, unknown>;
  recentOrders: Array<Record<string, unknown>>;
  orderCount?: number;
  lifetimeSpend?: number;
  addresses?: CustomerAddress[];
  devices?: CustomerDevice[];
  trust?: CustomerTrust | null;
}

export function getCustomerDetail(accessToken: string, id: string) {
  return deliveryFetch<CustomerDetailResponse>(accessToken, `/admin/customers/${id}`);
}

export function patchCustomerNotes(accessToken: string, id: string, admin_internal_notes: string | null) {
  return deliveryFetch(accessToken, `/admin/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ admin_internal_notes }),
  });
}

export function suspendCustomer(accessToken: string, id: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/customers/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendCustomer(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/customers/${id}/unsuspend`, { method: 'POST' });
}

export function deleteCustomer(
  accessToken: string,
  id: string,
  payload: { reason: string; confirm_name: string },
) {
  return deliveryFetch<{ ok: boolean; message: string }>(accessToken, `/admin/customers/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function listDashTeam(accessToken: string) {
  return deliveryFetch<{ members: Array<{ userId: string; email: string; role: string }> }>(
    accessToken,
    '/admin/team',
  );
}

export function removeDashTeamMember(
  accessToken: string,
  userId: string,
  payload?: { reason?: string },
) {
  return deliveryFetch<{ ok: boolean }>(accessToken, `/admin/team/${userId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload ?? {}),
  });
}

/** Assignable dash / courier admin roles from the Rush Ops console */
export type DashTeamRole = 'dash_admin' | 'dash_ops' | 'courier_admin' | 'courier_ops';

export interface DashTeamInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  invited_by?: string | null;
}

export function inviteDashTeamMember(
  accessToken: string,
  payload: { email: string; role: DashTeamRole },
) {
  return deliveryFetch<{ ok: boolean; invite?: DashTeamInvite; member?: { userId: string; email: string; role: string } }>(
    accessToken,
    '/admin/team/invite',
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function changeDashTeamRole(accessToken: string, userId: string, role: DashTeamRole) {
  return deliveryFetch<{ ok: boolean; member?: { userId: string; email: string; role: string } }>(
    accessToken,
    `/admin/team/${userId}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
}

// ---------------------------------------------------------------------------
// Markets / coverage zones
// ---------------------------------------------------------------------------

export type DashZoneKind = 'include' | 'exclude';
export type DashZoneSource = 'manual' | 'radius' | 'auto_outline' | 'import';

export interface DashZoneVertex {
  lat: number;
  lng: number;
}

export interface DashZoneRow {
  id: string;
  market_id: string;
  name: string;
  polygon: DashZoneVertex[];
  priority: number;
  kind: DashZoneKind;
  source?: DashZoneSource | string | null;
  center_lat?: number | null;
  center_lng?: number | null;
  radius_m?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface DashMarketRow {
  id: string;
  name: string;
  slug?: string | null;
  is_active: boolean;
  waitlist_enabled?: boolean;
  parish_id?: string | null;
  zones?: DashZoneRow[];
  draft_dirty?: boolean;
  published_version_id?: string | null;
  readiness_merchants_min?: number;
  readiness_couriers_min?: number;
  created_at?: string;
}

export interface DashParishRow {
  id: string;
  name: string;
  slug: string;
  sort_order?: number;
  coverage_mode?: 'town_zones' | 'parish_boundary';
  /** Parish outline — outer gate (town_zones) or live delivery area (parish_boundary). */
  foundation_polygon?: DashZoneVertex[] | null;
  foundation_updated_at?: string | null;
  towns?: DashMarketRow[];
  created_at?: string;
}

export interface CoverageCheckResult {
  inZone: boolean;
  reason?: string;
  matchedInclude?: { id: string; name: string; market_id?: string } | null;
  matchedExclude?: { id: string; name: string; market_id?: string } | null;
}

export interface CoverageVersionRow {
  id: string;
  market_id: string;
  version: number;
  label?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export interface ReadinessCheck {
  id: string;
  ok: boolean;
  label: string;
  detail?: string;
}

export interface MarketReadiness {
  market_id: string;
  ready: boolean;
  checks: ReadinessCheck[];
  draft_dirty: boolean;
  published_version_id?: string | null;
}

export function listMarkets(accessToken: string) {
  return deliveryFetch<{
    markets: DashMarketRow[];
    parishes: DashParishRow[];
    unassigned: DashMarketRow[];
  }>(accessToken, '/admin/markets');
}

export function createParish(accessToken: string, payload: { name: string; sort_order?: number }) {
  return deliveryFetch<{ parish: DashParishRow }>(accessToken, '/admin/markets/parishes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateParish(
  accessToken: string,
  parishId: string,
  payload: { name?: string; sort_order?: number; coverage_mode?: 'town_zones' | 'parish_boundary' },
) {
  return deliveryFetch<{ parish: DashParishRow }>(
    accessToken,
    `/admin/markets/parishes/${parishId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function deleteParish(accessToken: string, parishId: string) {
  return deliveryFetch<{ ok: boolean }>(
    accessToken,
    `/admin/markets/parishes/${parishId}`,
    { method: 'DELETE' },
  );
}

/** Save parish foundation border (ops geography). Promotes default template by default. */
export function updateParishOutline(
  accessToken: string,
  parishId: string,
  payload: {
    polygon: DashZoneVertex[];
    confirm_foundation_edit: true;
    promote_template?: boolean;
  },
) {
  return deliveryFetch<{ parish: DashParishRow; promoted_template?: boolean }>(
    accessToken,
    `/admin/markets/parishes/${parishId}/outline`,
    { method: 'PUT', body: JSON.stringify(payload) },
  );
}

export function updateMarket(
  accessToken: string,
  id: string,
  payload: {
    is_active?: boolean;
    name?: string;
    waitlist_enabled?: boolean;
    parish_id?: string | null;
    force?: boolean;
    readiness_merchants_min?: number;
    readiness_couriers_min?: number;
  },
) {
  return deliveryFetch<{ market: DashMarketRow; failed_checks?: ReadinessCheck[]; checks?: ReadinessCheck[] }>(
    accessToken,
    `/admin/markets/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function createMarket(
  accessToken: string,
  payload: {
    name: string;
    is_active?: boolean;
    waitlist_enabled?: boolean;
    parish_id?: string | null;
  },
) {
  return deliveryFetch<{ market: DashMarketRow }>(accessToken, '/admin/markets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createZone(
  accessToken: string,
  marketId: string,
  payload: {
    name: string;
    polygon: DashZoneVertex[];
    priority?: number;
    kind?: DashZoneKind;
    source?: DashZoneSource;
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
  },
) {
  return deliveryFetch<{ zone: DashZoneRow }>(
    accessToken,
    `/admin/markets/${marketId}/zones`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateZone(
  accessToken: string,
  marketId: string,
  zoneId: string,
  payload: {
    name?: string;
    polygon?: DashZoneVertex[];
    priority?: number;
    kind?: DashZoneKind;
    source?: DashZoneSource;
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
    /** Required when patching an include (town foundation) polygon. */
    confirm_foundation_edit?: boolean;
    /** Upsert town_outline_templates from this include polygon. */
    promote_template?: boolean;
  },
) {
  return deliveryFetch<{ zone: DashZoneRow }>(
    accessToken,
    `/admin/markets/${marketId}/zones/${zoneId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function deleteZone(accessToken: string, marketId: string, zoneId: string) {
  return deliveryFetch<{ ok: boolean }>(
    accessToken,
    `/admin/markets/${marketId}/zones/${zoneId}`,
    { method: 'DELETE' },
  );
}

/** Server-side coverage check (same rules as Rush customer app). */
export function checkCoveragePoint(accessToken: string, lat: number, lng: number) {
  return deliveryFetch<CoverageCheckResult>(accessToken, '/admin/markets/check-point', {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
}

export function getMarketReadiness(accessToken: string, marketId: string) {
  return deliveryFetch<MarketReadiness>(accessToken, `/admin/markets/${marketId}/readiness`);
}

export function listCoverageVersions(accessToken: string, marketId: string) {
  return deliveryFetch<{ versions: CoverageVersionRow[] }>(
    accessToken,
    `/admin/markets/${marketId}/versions`,
  );
}

export type MerchantMarketRecompute = {
  updated: number;
  cleared: number;
  skippedLocked: number;
  skippedNoPin: number;
  unchanged: number;
  updatedLocked: number;
};

export function publishMarketCoverage(
  accessToken: string,
  marketId: string,
  payload: { label?: string; notes?: string; recompute_locked?: boolean } = {},
) {
  return deliveryFetch<{
    market: DashMarketRow;
    version: CoverageVersionRow;
    merchant_recompute?: MerchantMarketRecompute;
  }>(accessToken, `/admin/markets/${marketId}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function restoreCoverageVersion(
  accessToken: string,
  marketId: string,
  versionId: string,
  republish = true,
  recomputeLocked = false,
) {
  return deliveryFetch<{
    market: DashMarketRow;
    merchant_recompute?: MerchantMarketRecompute | null;
  }>(accessToken, `/admin/markets/${marketId}/versions/${versionId}/restore`, {
    method: 'POST',
    body: JSON.stringify({ republish, recompute_locked: recomputeLocked }),
  });
}

function formatMerchantRecomputeToast(r?: MerchantMarketRecompute | null): string {
  if (!r) return '';
  const moved = r.updated + r.cleared;
  if (moved === 0 && r.skippedLocked === 0 && r.updatedLocked === 0) return '';
  const parts = [`${r.updated} reassigned`];
  if (r.cleared) parts.push(`${r.cleared} cleared`);
  if (r.updatedLocked) parts.push(`${r.updatedLocked} locked updated`);
  if (r.skippedLocked) parts.push(`${r.skippedLocked} locked skipped`);
  return ` · ${parts.join(', ')}`;
}

export { formatMerchantRecomputeToast };

export function importMarketGeoJson(
  accessToken: string,
  marketId: string,
  payload: {
    polygon?: DashZoneVertex[];
    geojson?: unknown;
    promote_template?: boolean;
  },
) {
  return deliveryFetch<{ zone: DashZoneRow }>(
    accessToken,
    `/admin/markets/${marketId}/import-geojson`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

// ---------------------------------------------------------------------------
// Live Ops
// ---------------------------------------------------------------------------

export interface LiveOrderRow {
  id: string;
  order_number: string;
  status: string;
  total: number;
  placed_at: string;
  merchant_name?: string | null;
  courier_display_name?: string | null;
  courier_user_id?: string | null;
  delivery_address?: string | null;
  eta_minutes?: number | null;
}

export function listLiveOrders(
  accessToken: string,
  opts: { status?: string; merchant_id?: string; unassigned?: boolean } = {},
) {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.merchant_id) sp.set('merchant_id', opts.merchant_id);
  if (opts.unassigned) sp.set('unassigned', 'true');
  return deliveryFetch<{ orders: LiveOrderRow[]; total: number; count?: number }>(
    accessToken,
    `/admin/ops/live-orders?${sp}`,
  );
}

export function redispatchOrder(accessToken: string, orderId: string, reason?: string) {
  return deliveryFetch<{ ok: boolean }>(accessToken, `/admin/ops/orders/${orderId}/redispatch`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export interface ActivityLogRow {
  id: string;
  actor_email?: string | null;
  actor_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  target_id?: string | null;
  target_email?: string | null;
  notes?: string | null;
  details?: string | null;
  created_at: string;
}

export function listActivityLog(
  accessToken: string,
  opts: { q?: string; action?: string; page?: number; limit?: number } = {},
) {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.action) sp.set('action', opts.action);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch<{ events: ActivityLogRow[]; total: number; page: number; limit: number }>(
    accessToken,
    `/admin/audit/events?${sp}`,
  );
}

// ---------------------------------------------------------------------------
// Support cases
// ---------------------------------------------------------------------------

export interface SupportCaseRow {
  id: string;
  subject: string;
  status: string;
  priority?: string | null;
  order_id?: string | null;
  customer_id?: string | null;
  assignee_email?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export function listSupportCases(accessToken: string, status?: string) {
  const sp = status ? `?status=${status}` : '';
  return deliveryFetch<{ cases: SupportCaseRow[] }>(accessToken, `/admin/support/cases${sp}`);
}

export function createSupportCase(
  accessToken: string,
  payload: { subject: string; priority?: string; order_id?: string; customer_id?: string; notes?: string },
) {
  return deliveryFetch<{ case: SupportCaseRow }>(accessToken, '/admin/support/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Finance adjustments
// ---------------------------------------------------------------------------

export interface AdjustmentRow {
  id: string;
  merchant_id?: string | null;
  amount: number;
  reason: string;
  type: string;
  created_at: string;
}

export function listAdjustments(accessToken: string, merchantId?: string) {
  const sp = merchantId ? `?merchant_id=${merchantId}` : '';
  return deliveryFetch<{ adjustments: AdjustmentRow[] }>(accessToken, `/admin/finance/adjustments${sp}`);
}

export function createAdjustment(
  accessToken: string,
  payload: { merchant_id?: string; amount: number; reason: string; type: string },
) {
  return deliveryFetch<{ adjustment: AdjustmentRow }>(accessToken, '/admin/finance/adjustments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPayouts(accessToken: string, opts: { merchant_id?: string; status?: string } = {}) {
  const sp = new URLSearchParams();
  if (opts.merchant_id) sp.set('merchant_id', opts.merchant_id);
  if (opts.status) sp.set('status', opts.status);
  return deliveryFetch(accessToken, `/admin/finance/payouts?${sp}`);
}

export function createPayout(
  accessToken: string,
  payload: {
    merchant_id: string;
    amount: number;
    fee?: number;
    currency?: string;
    period_start?: string;
    period_end?: string;
    order_count?: number;
    bank_account_last4?: string;
    notes?: string;
  },
) {
  return deliveryFetch(accessToken, '/admin/finance/payouts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function holdPayout(accessToken: string, payoutId: string, reason?: string) {
  return deliveryFetch(accessToken, `/admin/finance/payouts/${payoutId}/hold`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function releasePayout(accessToken: string, payoutId: string) {
  return deliveryFetch(accessToken, `/admin/finance/payouts/${payoutId}/release`, {
    method: 'POST',
  });
}

export function listDisputes(accessToken: string, status?: string) {
  const sp = status ? `?status=${status}` : '';
  return deliveryFetch(accessToken, `/admin/finance/disputes${sp}`);
}

export function resolveDispute(
  accessToken: string,
  id: string,
  payload: {
    status: string;
    resolution_notes?: string;
    refund_amount?: number;
  },
) {
  return deliveryFetch(accessToken, `/admin/finance/disputes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listReviews(accessToken: string, merchantId?: string) {
  const sp = merchantId ? `?merchant_id=${merchantId}` : '';
  return deliveryFetch(accessToken, `/admin/finance/reviews${sp}`);
}

export function hideReview(accessToken: string, orderId: string, hidden: boolean) {
  return deliveryFetch(accessToken, `/admin/finance/reviews/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ review_hidden: hidden }),
  });
}

export function listPromotions(accessToken: string, merchantId?: string) {
  const sp = merchantId ? `?merchant_id=${merchantId}` : '';
  return deliveryFetch(accessToken, `/admin/finance/promotions${sp}`);
}

export function listMerchantOwners(accessToken: string, q?: string, page = 1) {
  const sp = new URLSearchParams({ page: String(page) });
  if (q) sp.set('q', q);
  return deliveryFetch(accessToken, `/admin/merchant-owners?${sp}`);
}

import type { MerchantBusinessTypeConfig } from '@roam/types';

export type MerchantBusinessTypeDto = MerchantBusinessTypeConfig;

export interface MerchantBusinessTypeSectionDto {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  types: MerchantBusinessTypeDto[];
}

export function listMerchantBusinessTypes(accessToken: string) {
  return deliveryFetch<{ sections: MerchantBusinessTypeSectionDto[] }>(
    accessToken,
    '/admin/onboarding/business-types',
  );
}

export function createMerchantBusinessTypeSection(
  accessToken: string,
  body: { label: string; id?: string; sort_order?: number },
) {
  return deliveryFetch<{ section: MerchantBusinessTypeSectionDto }>(
    accessToken,
    '/admin/onboarding/business-type-sections',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function updateMerchantBusinessTypeSection(
  accessToken: string,
  id: string,
  body: Partial<Pick<MerchantBusinessTypeSectionDto, 'label' | 'sort_order' | 'is_active'>>,
) {
  return deliveryFetch<{ section: MerchantBusinessTypeSectionDto }>(
    accessToken,
    `/admin/onboarding/business-type-sections/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function deleteMerchantBusinessTypeSection(accessToken: string, id: string) {
  return deliveryFetch<{ ok: boolean }>(
    accessToken,
    `/admin/onboarding/business-type-sections/${id}`,
    { method: 'DELETE' },
  );
}

export function createMerchantBusinessType(
  accessToken: string,
  body: {
    label: string;
    section_id: string;
    id?: string;
    sort_order?: number;
    vertical_type?: string;
    fulfillment_type?: string;
    category_taxonomy_key?: string;
    default_prep_time_mins?: number;
    max_delivery_radius_km?: number;
    compliance_tier?: string;
    go_live_rule?: string;
    required_document_types?: string[];
  },
) {
  return deliveryFetch<{ type: MerchantBusinessTypeDto }>(
    accessToken,
    '/admin/onboarding/business-types',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function updateMerchantBusinessType(
  accessToken: string,
  id: string,
  body: Partial<MerchantBusinessTypeDto>,
) {
  return deliveryFetch<{ type: MerchantBusinessTypeDto }>(
    accessToken,
    `/admin/onboarding/business-types/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function deleteMerchantBusinessType(accessToken: string, id: string) {
  return deliveryFetch<{ ok: boolean }>(
    accessToken,
    `/admin/onboarding/business-types/${id}`,
    { method: 'DELETE' },
  );
}

// ---------------------------------------------------------------------------
// Pricing & Commission
// ---------------------------------------------------------------------------

export type MerchantTierRow = {
  id: string;
  slug: string;
  name: string;
  commission_rate: number;
  search_boost: number;
  default_delivery_radius_km: number;
  promo_eligible: boolean;
  sort_order: number;
  is_active: boolean;
};

export type PricingMarketSummary = {
  market: { id: string; slug: string; name: string; is_active: boolean };
  profile: Record<string, unknown> | null;
  pricing_v2_enabled: boolean;
};

export type PricingRulesPayload = {
  pricing_v2_enabled?: boolean;
  delivery?: {
    base_fee_jmd?: number;
    included_km?: number;
    per_extra_km_jmd?: number;
    max_fee_jmd?: number;
  };
  service_fee?: {
    mode?: 'flat' | 'percent' | 'marginal';
    flat_jmd?: number;
    percent?: number;
    min_jmd?: number;
    max_jmd?: number;
    avg_rate?: number;
    override_rate?: number;
    override_threshold_jmd?: number;
  };
  courier_delivery_share?: number;
  cod?: { pause_threshold_jmd?: number };
  launch_promos?: { free_delivery_first_n_orders?: number };
  tax_rate_percent?: number;
  min_order_subtotal_jmd?: number;
  card_processing_fee_percent?: number;
};

export function fetchPricingOverview(accessToken: string) {
  return deliveryFetch<{ markets: PricingMarketSummary[]; tiers: MerchantTierRow[] }>(
    accessToken,
    '/admin/pricing/overview',
  );
}

export function fetchMarketPricing(accessToken: string, marketId: string) {
  return deliveryFetch<{
    market: Record<string, unknown>;
    profile: Record<string, unknown> | null;
    rules: PricingRulesPayload;
  }>(accessToken, `/admin/pricing/markets/${marketId}`);
}

export function updateMarketPricing(
  accessToken: string,
  marketId: string,
  rules: PricingRulesPayload,
) {
  return deliveryFetch(accessToken, `/admin/pricing/markets/${marketId}`, {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
}

export function fetchPricingTiers(accessToken: string) {
  return deliveryFetch<{ tiers: MerchantTierRow[] }>(accessToken, '/admin/pricing/tiers');
}

export function updatePricingTier(
  accessToken: string,
  tierId: string,
  payload: Partial<MerchantTierRow>,
) {
  return deliveryFetch(accessToken, `/admin/pricing/tiers/${tierId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function previewPricing(
  accessToken: string,
  payload: {
    merchant_id: string;
    subtotal: number;
    dropoff_lat?: number;
    dropoff_lng?: number;
    tip?: number;
    customer_order_count?: number;
    /** Force / suppress launch free-delivery promo in simulator */
    free_delivery?: boolean;
    payment_method?: 'wipay' | 'paypal' | 'cash';
    market_id?: string;
  },
) {
  return deliveryFetch<{
    breakdown: Record<string, unknown>;
    pricing_v2_enabled?: boolean;
    market_id?: string | null;
    resolved_market_id?: string | null;
    covered?: boolean | null;
    coverage?: {
      inZone: boolean;
      reason?: string;
      matchedInclude?: { id: string; name: string; market_id?: string } | null;
      matchedExclude?: { id: string; name: string; market_id?: string } | null;
    } | null;
    market_override_applied?: boolean;
  }>(accessToken, '/admin/pricing/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchPricingAudit(accessToken: string, marketId?: string) {
  const sp = marketId ? `?market_id=${encodeURIComponent(marketId)}` : '';
  return deliveryFetch<{ entries: Array<Record<string, unknown>> }>(
    accessToken,
    `/admin/pricing/audit${sp}`,
  );
}

export function fetchCodBalances(accessToken: string) {
  return deliveryFetch<{ balances: Array<Record<string, unknown>> }>(
    accessToken,
    '/admin/pricing/cod/balances',
  );
}

export function fetchCodEvents(accessToken: string, courierId?: string) {
  const sp = courierId ? `?courier_id=${encodeURIComponent(courierId)}` : '';
  return deliveryFetch<{ events: Array<Record<string, unknown>> }>(
    accessToken,
    `/admin/pricing/cod/events${sp}`,
  );
}

export function settleCourierCash(
  accessToken: string,
  payload: { courier_id: string; amount_jmd: number; settlement_method: string; notes?: string },
) {
  return deliveryFetch(accessToken, '/admin/pricing/cod/settle', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
