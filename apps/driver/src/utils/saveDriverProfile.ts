import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import type { DriverMode, DriverProfile } from '../contexts/DriverContext';
import { getAuthErrorMessage } from './supabaseAuthErrors';

export type DriverProfileSaveFields = {
  display_name: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  phone?: string | null;
  onboarding_complete: boolean;
  onboarding_step?: string | null;
};

/**
 * Persists onboarding demographics to auth metadata + driver_profiles.
 * Handles existing rows, fleet vs independent mode, and duplicate user_id safely.
 */
export async function saveDriverOnboardingProfile(
  user: User,
  profile: DriverProfile | null,
  fields: DriverProfileSaveFields,
  options?: { email?: string },
): Promise<void> {
  const meta = {
    first_name: fields.first_name,
    last_name: fields.last_name,
    gender: fields.gender,
  };

  const emailTrim = options?.email?.trim();
  const currentEmail = (user.email ?? '').trim().toLowerCase();
  const emailChanged = Boolean(emailTrim && emailTrim.toLowerCase() !== currentEmail);

  if (emailChanged && emailTrim) {
    const { error: authErr } = await supabase.auth.updateUser({
      email: emailTrim,
      data: meta,
    });
    if (authErr) {
      const msg = getAuthErrorMessage(authErr, 'Could not update your email.');
      if (/already been registered|already registered|email address already/i.test(msg)) {
        throw new Error('That email is already used by another account. Sign in with that email or use a different one.');
      }
      if (/confirm|verification/i.test(msg)) {
        throw new Error(
          'We sent a confirmation link to that email. Open it, then return here and tap Continue again.',
        );
      }
      throw new Error(msg);
    }
  } else {
    const { error: authErr } = await supabase.auth.updateUser({ data: meta });
    if (authErr) throw new Error(getAuthErrorMessage(authErr, 'Could not update your account.'));
  }

  const { data: existing, error: loadErr } = await supabase
    .from('driver_profiles')
    .select('id, mode, fleet_id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (loadErr) {
    throw new Error(getAuthErrorMessage(loadErr, 'Could not load your driver profile.'));
  }

  const row = {
    display_name: fields.display_name,
    first_name: fields.first_name,
    last_name: fields.last_name,
    date_of_birth: fields.date_of_birth,
    gender: fields.gender,
    phone: fields.phone ?? null,
    onboarding_complete: fields.onboarding_complete,
    onboarding_step: fields.onboarding_step ?? null,
  };

  if (existing?.id) {
    const { error: upErr } = await supabase.from('driver_profiles').update(row).eq('id', existing.id);
    if (upErr) throw new Error(getAuthErrorMessage(upErr, 'Could not save your profile.'));
    return;
  }

  const mode: DriverMode = profile?.mode ?? 'independent';
  const { error: insErr } = await supabase.from('driver_profiles').insert({
    user_id: user.id,
    mode,
    fleet_id: profile?.fleetId ?? null,
    status: profile?.status ?? 'pending',
    ...row,
  });

  if (insErr) {
    if (insErr.code === '23505') {
      const { error: upErr } = await supabase.from('driver_profiles').update(row).eq('user_id', user.id);
      if (upErr) throw new Error(getAuthErrorMessage(upErr, 'Could not save your profile.'));
      return;
    }
    throw new Error(getAuthErrorMessage(insErr, 'Could not save your profile.'));
  }
}
