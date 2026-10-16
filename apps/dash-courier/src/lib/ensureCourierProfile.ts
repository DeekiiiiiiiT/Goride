import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { loadSignupDraft } from '@/lib/signupDraft';
import { toE164JamaicaPhone } from '@/components/forms/PhoneInput';
import { syncVehicleFromSignupDraft } from '@/lib/courierVehicleService';
import { upsertCourierProfile } from '@/lib/courierApi';

/**
 * Ensures a delivery.courier_profiles row exists for the signed-in courier.
 * Writes go through delivery edge so courier.signup.vehicle_types is enforced.
 */
export async function ensureCourierProfile(opts?: { markComplete?: boolean }): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

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

  const payload: Record<string, unknown> = {
    email: user.email ?? draft.email ?? null,
    phone,
    display_name: displayName,
    vehicle_type: draft.vehicleType ?? null,
  };
  if (draft.workforceChoice !== 'join_fleet') {
    payload.mode = 'independent';
  }
  if (draft.profilePhotoUrl) {
    payload.profile_photo_url = draft.profilePhotoUrl;
  }
  if (draft.dateOfBirth) {
    payload.date_of_birth = draft.dateOfBirth;
  }
  if (opts?.markComplete) {
    payload.markComplete = true;
  }

  const result = await upsertCourierProfile(payload);
  if (!result.ok) {
    console.warn('[ensureCourierProfile]', result.error);
  }

  await syncVehicleFromSignupDraft();
}

export async function syncCourierProfileFromDraft(): Promise<void> {
  await ensureCourierProfile();
  const draft = loadSignupDraft();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  const patch: Record<string, unknown> = {
    display_name: draft.displayName || draft.fullName || null,
    phone: draft.phone ? toE164JamaicaPhone(draft.phone) : null,
    vehicle_type: draft.vehicleType,
  };
  if (draft.profilePhotoUrl) {
    patch.profile_photo_url = draft.profilePhotoUrl;
  }
  if (draft.dateOfBirth) {
    patch.date_of_birth = draft.dateOfBirth;
  }
  if (draft.workforceChoice !== 'join_fleet') {
    const delivery = await getDeliveryClient();
    if (delivery) {
      const { data: current } = await delivery
        .from('courier_profiles')
        .select('mode, fleet_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!(current?.mode === 'fleet' && current?.fleet_id)) {
        patch.mode = 'independent';
      }
    }
  }

  await upsertCourierProfile(patch);
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
