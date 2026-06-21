import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { loadSignupDraft } from '@/lib/signupDraft';
import { toE164JamaicaPhone } from '@/components/forms/PhoneInput';

/**
 * Ensures a delivery.courier_profiles row exists for the signed-in courier.
 * Called after onboarding permissions or OAuth signup completes.
 */
export async function ensureCourierProfile(): Promise<void> {
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

  const payload = {
    user_id: user.id,
    email: user.email ?? draft.email ?? null,
    phone,
    display_name: displayName,
    vehicle_type: draft.vehicleType ?? null,
    onboarding_complete: true,
    status: 'pending' as const,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await delivery.from('courier_profiles').update(payload).eq('user_id', user.id);
    return;
  }

  await delivery.from('courier_profiles').upsert(payload, { onConflict: 'user_id' });
}

export async function syncCourierProfileFromDraft(): Promise<void> {
  const draft = loadSignupDraft();
  const delivery = await getDeliveryClient();
  if (!delivery) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  await delivery
    .from('courier_profiles')
    .update({
      display_name: draft.displayName || draft.fullName || null,
      phone: draft.phone ? toE164JamaicaPhone(draft.phone) : null,
      vehicle_type: draft.vehicleType,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', session.user.id);
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
