export type RoamConnectionRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type RoamConnectionRequestSource =
  | 'manual'
  | 'roam_tag'
  | 'device_import'
  | 'book_for_someone'
  | 'contacts_page';

export interface RoamConnectionRequestDto {
  id: string;
  requester_user_id: string;
  target_user_id: string | null;
  target_phone_e164: string;
  target_phone_masked: string;
  target_display_name: string;
  status: RoamConnectionRequestStatus;
  source: RoamConnectionRequestSource;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  /** Enriched on incoming: requester's display name */
  requester_display_name?: string | null;
  /** Enriched on incoming: requester's @tag */
  requester_custom_tag_name?: string | null;
  /** True when target has a Roam account */
  roam_account_linked?: boolean;
  /** True when this is an invite (target not on Roam yet) */
  is_invite?: boolean;
}

export interface CreateRoamConnectionRequestBody {
  target_display_name: string;
  phone_e164: string;
  target_user_id?: string | null;
  source?: RoamConnectionRequestSource;
}

export interface RoamConnectionsOutgoingResponse {
  requests: RoamConnectionRequestDto[];
}

export interface RoamConnectionsIncomingResponse {
  requests: RoamConnectionRequestDto[];
}

export interface RoamConnectionRequestActionResponse {
  request: RoamConnectionRequestDto;
  contact_id?: string | null;
}

export interface SyncPhoneConnectionRequestsResponse {
  matched_count: number;
}

export interface UserBlockDto {
  id: string;
  blocked_user_id: string;
  blocked_display_name: string | null;
  created_at: string;
}

export interface UserBlocksListResponse {
  blocks: UserBlockDto[];
}

export interface CreateUserBlockBody {
  blocked_user_id: string;
}

export type AbuseReportReasonCode =
  | 'spam'
  | 'harassment'
  | 'impersonation'
  | 'inappropriate'
  | 'other';

export interface CreateAbuseReportBody {
  reported_user_id: string;
  reason_code: AbuseReportReasonCode;
  details?: string | null;
  context?: Record<string, unknown> | null;
}

export interface CreateAbuseReportResponse {
  ok: boolean;
  report_id: string;
}
