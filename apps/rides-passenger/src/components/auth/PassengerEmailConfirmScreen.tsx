import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Mail } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import { isNativeCapacitorPlatform } from '@roam/types';
import { getPassengerAuthRedirectUrl } from '../../utils/passengerAuthRedirect';
import { getEmailDomain, resolveEmailProvider } from '../../utils/emailProviderLinks';
import { formatEmailAuthError } from '../../utils/supabaseAuthErrors';

const RESEND_SECONDS = 60;

type Props = {
  email: string;
  onBack: () => void;
  onSignIn: () => void;
};

export function PassengerEmailConfirmScreen({ email, onBack, onSignIn }: Props) {
  const provider = resolveEmailProvider(email);
  const domain = getEmailDomain(email);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resendErr, setResendErr] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const openInbox = async () => {
    const url = provider?.inboxUrl ?? (domain ? `https://${domain}` : null);
    if (!url) return;
    if (isNativeCapacitorPlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleResend = async () => {
    if (resendIn > 0 || resending) return;
    setResendErr(null);
    setResendMsg(null);
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: getPassengerAuthRedirectUrl() },
      });
      if (error) throw error;
      setResendMsg('Confirmation email sent again. Check your inbox and spam folder.');
      setResendIn(RESEND_SECONDS);
    } catch (err: unknown) {
      setResendErr(formatEmailAuthError(err, 'Could not resend the confirmation email.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-2 ring-white/25">
          <Mail className="h-7 w-7 text-white" aria-hidden />
        </div>
        <h2 className="text-xl font-semibold text-white">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          We sent a confirmation link to
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-white">{email}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Open the message from Roam and tap the link to activate your rider account. On the app,
          the link will reopen Roam Rides automatically.
        </p>
      </div>

      {(provider || domain) && (
        <button
          type="button"
          onClick={() => void openInbox()}
          className="btn-touch flex w-full items-center justify-center gap-2 rounded-xl bg-white/95 py-3 text-[15px] font-semibold text-zinc-900 shadow-sm hover:bg-white"
        >
          <ExternalLink className="h-4 w-4" />
          {provider?.buttonLabel ?? (domain ? `Open ${domain}` : 'Open your email app')}
        </button>
      )}

      {resendMsg && (
        <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-white">
          {resendMsg}
        </div>
      )}
      {resendErr && (
        <div className="rounded-xl border border-red-300/50 bg-red-500/15 px-3 py-2 text-sm font-medium text-white">
          {resendErr}
        </div>
      )}

      <button
        type="button"
        disabled={resendIn > 0 || resending}
        onClick={() => void handleResend()}
        className="w-full text-sm font-semibold text-emerald-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {resending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </span>
        ) : resendIn > 0 ? (
          `Resend email in ${resendIn}s`
        ) : (
          'Resend confirmation email'
        )}
      </button>

      <p className="text-center text-xs leading-relaxed text-white/50">
        Didn&apos;t get it? Check spam or junk, wait a minute, then tap resend above.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onSignIn}
          className="w-full text-sm font-semibold text-white/90 hover:text-white"
        >
          Already confirmed? Sign in
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center gap-1 text-sm text-white/55 hover:text-white/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
}
