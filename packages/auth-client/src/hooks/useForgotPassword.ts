import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AuthRecoverySurface,
  requestPasswordReset,
} from '../requestPasswordReset';
import { rememberRecoverySignInHref } from '../recoverySignInStorage';

export type UseForgotPasswordOptions = {
  /** Stored for PasswordRecoveryPage after the user follows the email link. */
  signInHref?: string;
};

export function useForgotPassword(
  client: SupabaseClient,
  surface: AuthRecoverySurface,
  options?: UseForgotPasswordOptions,
) {
  const [forgotMode, setForgotMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  const sendResetEmail = useCallback(
    async (email: string): Promise<string | null> => {
      const trimmed = email.trim();
      if (!trimmed) {
        return 'Enter your email first.';
      }
      setForgotLoading(true);
      setNotice(null);
      try {
        const { error } = await requestPasswordReset(client, trimmed, surface);
        if (error) throw error;
        if (options?.signInHref) {
          rememberRecoverySignInHref(options.signInHref);
        }
        const host =
          typeof window !== 'undefined' ? window.location.hostname : 'this site';
        setNotice(`Password reset email sent. The link opens on ${host}.`);
        setForgotMode(false);
        return null;
      } catch (err: unknown) {
        return err instanceof Error ? err.message : 'Could not send reset email';
      } finally {
        setForgotLoading(false);
      }
    },
    [client, surface, options?.signInHref],
  );

  return {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  };
}
