import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { FLEET_OAUTH_INTENT_KEY, FLEET_OAUTH_INTENT_VALUE, fleetSignupRedirectUrl } from '../../../utils/fleetAuthSignup';

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function FleetGoogleSignupButton({
  onError,
  label = 'Continue with Google',
}: {
  onError: (msg: string) => void;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    onError('');
    setLoading(true);
    try {
      sessionStorage.setItem(FLEET_OAUTH_INTENT_KEY, FLEET_OAUTH_INTENT_VALUE);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: fleetSignupRedirectUrl(),
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      sessionStorage.removeItem(FLEET_OAUTH_INTENT_KEY);
      onError(err instanceof Error ? err.message : 'Google sign-up failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void onClick()}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark className="h-5 w-5" />}
      {label}
    </button>
  );
}
