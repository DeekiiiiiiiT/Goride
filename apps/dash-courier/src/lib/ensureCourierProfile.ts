import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';

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
  const { data: existing } = await delivery
    .from('courier_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) return;

  const meta = user.user_metadata ?? {};
  const displayName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    user.email?.split('@')[0] ||
    null;

  await delivery.from('courier_profiles').upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      display_name: displayName,
      onboarding_complete: true,
      status: 'pending',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}
