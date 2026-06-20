import React, { useState } from 'react';
import { GOOGLE_OAUTH_EMAIL_ONLY_SCOPES } from '@roam/auth-client';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  COURIER_OAUTH_INTENT_KEY,
  COURIER_OAUTH_INTENT_LOGIN,
  COURIER_OAUTH_INTENT_SIGNUP,
  getCourierAuthRedirectUrl,
} from '@/lib/courierAuth';
import { supabase } from '@/lib/supabase';

type CourierGoogleAuthButtonProps = {
  variant?: 'signup' | 'login';
  disabled?: boolean;
  onError?: (message: string) => void;
  className?: string;
};

export function CourierGoogleAuthButton({
  variant = 'signup',
  disabled = false,
  onError,
  className = '',
}: CourierGoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const label = variant === 'login' ? 'Sign in with Google' : 'Continue with Google';

  const handleClick = async () => {
    onError?.('');
    setLoading(true);
    try {
      sessionStorage.setItem(
        COURIER_OAUTH_INTENT_KEY,
        variant === 'login' ? COURIER_OAUTH_INTENT_LOGIN : COURIER_OAUTH_INTENT_SIGNUP,
      );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getCourierAuthRedirectUrl(),
          scopes: GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      sessionStorage.removeItem(COURIER_OAUTH_INTENT_KEY);
      onError?.(
        err instanceof Error
          ? err.message
          : variant === 'login'
            ? 'Google sign-in failed.'
            : 'Google sign-up failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void handleClick()}
      className={`w-full min-h-[56px] bg-surface border border-outline-variant text-on-surface font-semibold text-base rounded-lg flex items-center justify-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-surface-container-low active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <MaterialIcon name="progress_activity" className="text-xl animate-spin text-muted" />
      ) : (
        <GoogleIcon />
      )}
      {label}
    </button>
  );
}
