/**
 * Courier admin types for Roam Dash Courier workforce management
 */

export type CourierAccountStatus = 'active' | 'pending' | 'suspended' | 'deactivated';

export type CourierLiveStatus = 'online' | 'offline' | 'on_delivery';

export type CourierComplianceBlocker =
  | 'no_profile'
  | 'onboarding_incomplete'
  | 'background_check_not_approved'
  | 'license_missing'
  | 'vehicle_missing'
  | 'insurance_missing'
  | 'account_suspended'
  | 'account_deactivated';

export interface CourierProfile {
  userId: string;
  displayName?: string;
  phone?: string;
  email?: string;
  status: CourierAccountStatus;
  onboardingComplete: boolean;
  vehicleType?: string;
  backgroundCheckStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  documentsVerifiedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rating?: number;
  totalDeliveries?: number;
  acceptanceRatePct?: number | null;
  completionRatePct?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CourierComplianceSummary {
  blockers: CourierComplianceBlocker[];
  can_strict_approve: boolean;
  can_force_approve: boolean;
}

export interface CourierComplianceRow {
  courier_id: string;
  courier_name: string | null;
  courier_email: string | null;
  account_status: CourierAccountStatus;
  onboarding_complete: boolean;
  background_check_status: string | null;
  has_license: boolean;
  has_vehicle: boolean;
  has_insurance: boolean;
  blockers: CourierComplianceBlocker[];
  can_strict_approve: boolean;
  can_force_approve: boolean;
  created_at: string | null;
}

export interface CourierApproveResult {
  ok: boolean;
  status: CourierAccountStatus;
  approved_at: string;
  force: boolean;
  blockers_at_approval: CourierComplianceBlocker[];
  already_active?: boolean;
}

export interface CourierDirectoryRow {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  status: CourierAccountStatus;
  live_status: CourierLiveStatus;
  vehicle_type: string | null;
  onboarding_complete: boolean;
  background_check_status: string | null;
  compliance_blockers_count?: number;
  total_deliveries: number;
  acceptance_rate_pct: number | null;
  completion_rate_pct: number | null;
  rating: number | null;
  last_delivery_at: string | null;
  last_online_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export interface CourierAdminPermissions {
  can_write: boolean;
  can_delete: boolean;
  can_see_reset_link: boolean;
}

export interface CourierDetailDto {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  status: CourierAccountStatus;
  live_status: CourierLiveStatus;
  vehicle_type: string | null;
  onboarding_complete: boolean;
  background_check_status: string | null;
  documents_verified_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rating: number | null;
  total_deliveries: number;
  acceptance_rate_pct: number | null;
  completion_rate_pct: number | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  location: {
    user_id: string;
    lat: number | null;
    lng: number | null;
    is_online: boolean;
    updated_at: string | null;
    active_order_id: string | null;
  } | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  deactivated_by: string | null;
  recent_deliveries: Array<Record<string, unknown>>;
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    year: number | null;
    license_plate: string;
    is_primary: boolean;
    status: string;
  }>;
  documents: Array<{
    id: string;
    doc_type: string;
    status: string;
    expiry_date: string | null;
  }>;
  compliance?: CourierComplianceSummary;
}

export interface CourierStats {
  total_couriers: number;
  active_couriers: number;
  pending_compliance: number;
  online_now: number;
  on_delivery_now: number;
}

export interface CourierPresenceRow {
  courier_id: string;
  lat: number | null;
  lng: number | null;
  is_online: boolean;
  last_seen: string | null;
  live_status: CourierLiveStatus | string;
  order_status?: string | null;
  order_id?: string | null;
  delivery_address?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CourierDeliveryLedgerRow {
  id: string;
  order_number: string;
  status: string;
  courier_id: string | null;
  courier_display_name?: string | null;
  merchant_name?: string | null;
  total: number;
  delivery_fee: number;
  tip: number;
  payment_method: string | null;
  placed_at: string | null;
  delivered_at: string | null;
  delivery_address: string | null;
}
