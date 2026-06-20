import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AuthRecoverySurface,
  recoveryRedirectForCurrentOrigin,
  recoveryRedirectForSurface,
} from './authRecoveryRedirects';

export async function requestPasswordReset(
  client: SupabaseClient,
  email: string,
  surface: AuthRecoverySurface,
): Promise<{ error: Error | null }> {
  const redirectTo =
    typeof window !== 'undefined'
      ? recoveryRedirectForCurrentOrigin()
      : recoveryRedirectForSurface(surface);

  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  return { error: error ? new Error(error.message) : null };
}
