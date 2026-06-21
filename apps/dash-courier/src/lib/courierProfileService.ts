import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';

export type CourierProfileStatus = 'pending' | 'active' | 'suspended' | 'deactivated';

export type CourierProfileRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  status: CourierProfileStatus;
  onboarding_complete: boolean;
  vehicle_type: string | null;
  background_check_status: string | null;
  rating: number | null;
  total_deliveries: number | null;
  acceptance_rate_pct: number | null;
  completion_rate_pct: number | null;
};

async function getDeliveryClient() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  return createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
    db: { schema: 'delivery' },
    global: {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  });
}

export async function loadCourierProfile(): Promise<CourierProfileRow | null> {
  const delivery = await getDeliveryClient();
  if (!delivery) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await delivery
    .from('courier_profiles')
    .select(
      'user_id, display_name, phone, email, status, onboarding_complete, vehicle_type, background_check_status, rating, total_deliveries, acceptance_rate_pct, completion_rate_pct',
    )
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as CourierProfileRow;
}

export async function updateCourierProfile(
  partial: Partial<
    Pick<CourierProfileRow, 'display_name' | 'phone' | 'email' | 'vehicle_type' | 'onboarding_complete'>
  >,
): Promise<boolean> {
  const delivery = await getDeliveryClient();
  if (!delivery) return false;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const { error } = await delivery
    .from('courier_profiles')
    .update({ ...partial, updated_at: new Date().toISOString() })
    .eq('user_id', session.user.id);

  return !error;
}

export async function pollApprovalStatus(): Promise<CourierProfileStatus | null> {
  const profile = await loadCourierProfile();
  return profile?.status ?? null;
}
