import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { loadSignupDraft } from '@/lib/signupDraft';
import { toE164JamaicaPhone } from '@/components/forms/PhoneInput';
import { syncVehicleFromSignupDraft } from '@/lib/courierVehicleService';

/**
 * Ensures a delivery.courier_profiles row exists for the signed-in courier.
 * New rows must insert as onboarding_complete=false (RLS). Only mark complete
 * when the signup wizard actually finishes.
 */
export async function ensureCourierProfile(opts?: { markComplete?: boolean }): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  const delivery = createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
    db: { schema: 'delivery' },
    global: {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  });

  const user = session.user;
  const draft = loadSignupDraft();
  const meta = user.user_metadata ?? {};
  const displayName =
    draft.displayName ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    draft.fullName ||
    user.email?.split('@')[0] ||
    null;

  const phone =
    user.phone ||
    (draft.phone ? toE164JamaicaPhone(draft.phone) : null) ||
    (typeof meta.phone === 'string' ? meta.phone : null);

  const { data: existing } = await delivery
    .from('courier_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    user_id: user.id,
    email: user.email ?? draft.email ?? null,
    phone,
    display_name: displayName,
    vehicle_type: draft.vehicleType ?? null,
    status: 'pending' as const,
    updated_at: new Date().toISOString(),
  };
  if (draft.profilePhotoUrl) {
    payload.profile_photo_url = draft.profilePhotoUrl;
  }

  if (existing) {
    // Do not overwrite status on existing profiles; do not flip complete mid-wizard.
    const { status: _status, ...safePayload } = payload;
    if (opts?.markComplete) {
      safePayload.onboarding_complete = true;
    }
    await delivery.from('courier_profiles').update(safePayload).eq('user_id', user.id);
  } else {
    await delivery.from('courier_profiles').upsert(
      { ...payload, onboarding_complete: false },
      { onConflict: 'user_id' },
    );
  }

  await syncVehicleFromSignupDraft();
}

export async function syncCourierProfileFromDraft(): Promise<void> {
  await ensureCourierProfile();
  const draft = loadSignupDraft();
  const delivery = await getDeliveryClient();
  if (!delivery) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  const patch: Record<string, unknown> = {
    display_name: draft.displayName || draft.fullName || null,
    phone: draft.phone ? toE164JamaicaPhone(draft.phone) : null,
    vehicle_type: draft.vehicleType,
    updated_at: new Date().toISOString(),
  };
  if (draft.profilePhotoUrl) {
    patch.profile_photo_url = draft.profilePhotoUrl;
  }

  await delivery.from('courier_profiles').update(patch).eq('user_id', session.user.id);
}

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
