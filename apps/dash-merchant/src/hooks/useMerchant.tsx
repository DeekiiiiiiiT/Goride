import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { partnerFetch } from '../lib/partner-fetch';
import type {
  FulfillmentType,
  GoLiveRule,
  MerchantOnboardingStatus,
  PartnerWizardStepKey,
  VerticalType,
} from '@roam/types';
import { Session } from '@supabase/supabase-js';
import { supabase, ensureValidPartnerSession, refreshPartnerSessionIfNeeded } from '../lib/partner-supabase';
import type { PendingTeamInviteSummary } from '../lib/partner-api';
import type { MerchantMembership, TeamPermission } from '../types/team';

export type { MerchantMembership, TeamPermission };

export type VerificationStatus =
  | 'pending'
  | 'in_review'
  | 'docs_requested'
  | 'approved'
  | 'rejected';

export interface Merchant {
  id: string;
  name: string | null;
  slug: string;
  description: string;
  logo_url: string;
  cover_image_url: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  phone: string;
  email: string;
  cuisine_type: string;
  is_active: boolean;
  is_verified: boolean;
  is_accepting_orders: boolean;
  avg_prep_time_mins: number;
  min_order_amount: number;
  delivery_fee: number;
  delivery_radius_km: number;
  commission_rate: number;
  rating: number;
  total_ratings: number;
  verification_status: VerificationStatus;
  verification_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  onboarding_status?: MerchantOnboardingStatus;
  wizard_step?: number;
  wizard_step_key?: PartnerWizardStepKey | null;
  onboarding_draft?: Record<string, unknown>;
  last_onboarding_activity_at?: string | null;
  vertical_type?: VerticalType | null;
  fulfillment_type?: FulfillmentType | null;
  go_live_rule?: GoLiveRule | null;
  capabilities?: string[];
  business_type?: string | null;
}

export interface MerchantProfileResponse {
  merchant: Merchant;
  membership: MerchantMembership;
  pendingTeamInvite?: PendingTeamInviteSummary;
}

export function useMerchant(session: Session | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-merchant', session?.user?.id],
    queryFn: async () => {
      if (!session) return null;

      const fetchProfile = async (accessToken: string) =>
        partnerFetch(`${API_ENDPOINTS.delivery}/merchant/profile`, {
          headers: supabaseAnonFunctionHeaders({
            Authorization: `Bearer ${accessToken}`,
          }),
        });

      let token = session.access_token;
      let res = await fetchProfile(token);
      if (res.status === 401) {
        const refreshed = await refreshPartnerSessionIfNeeded();
        token = refreshed.access_token;
        res = await fetchProfile(token);
      }
      if (res.status === 401) {
        const validated = await ensureValidPartnerSession();
        if (!validated) throw new Error('Session expired');
        res = await fetchProfile(validated.access_token);
      }

      if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        if (body.pendingTeamInvite) {
          return {
            merchant: null,
            membership: null,
            pendingTeamInvite: body.pendingTeamInvite as PendingTeamInviteSummary,
          };
        }
        return null;
      }
      if (!res.ok) throw new Error('Failed to fetch merchant');

      const profile = (await res.json()) as MerchantProfileResponse;
      return profile;
    },
    enabled: !!session,
    retry: 1,
  });

  return {
    merchant: data?.merchant ?? undefined,
    membership: data?.membership ?? undefined,
    pendingTeamInvite: data?.pendingTeamInvite,
    isLoading,
    error,
    refetch,
  };
}
