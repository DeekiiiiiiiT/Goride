import {
  type AuthRecoverySurface,
  recoveryRedirectForCurrentOrigin,
  recoveryRedirectForSurface,
} from './authRecoveryRedirects';
import { supabaseRecovery } from './supabaseRecovery';

/** Always uses `supabaseRecovery` so send + complete share one isolated auth client. */
export async function requestPasswordReset(
  email: string,
  surface: AuthRecoverySurface,
): Promise<{ error: Error | null }> {
  const redirectTo =
    typeof window !== 'undefined'
      ? recoveryRedirectForCurrentOrigin()
      : recoveryRedirectForSurface(surface);

  const { error } = await supabaseRecovery.auth.resetPasswordForEmail(email, { redirectTo });
  return { error: error ? new Error(error.message) : null };
}
