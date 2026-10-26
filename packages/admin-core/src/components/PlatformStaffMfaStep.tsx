import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { isPlatformRole, jwtPrimaryRole } from '@roam/auth-client';

type EnrollState = { factorId: string; otpUri: string; secret: string };
type Mode = 'loading' | 'enroll' | 'verify';

function formatMfaError(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? 'Something went wrong. Try again.';
  if (/enroll.*disabled|totp.*disabled/i.test(message)) {
    return 'Authenticator setup is turned off for this login. Ask an engineer to turn on TOTP in Supabase Authentication.';
  }
  if (/already exists/i.test(message)) {
    return 'A previous setup was left unfinished. Generate a new QR code and scan that one.';
  }
  return message;
}

function buildOtpAuthUri(secret: string, issuer: string, accountLabel: string): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

/** Second step for Roam staff. Product roles (fleet manager, rides admin, and the rest) skip it. */
export function usePlatformStaffMfa(client: SupabaseClient, user: User | null | undefined) {
  const [status, setStatus] = useState<'checking' | 'required' | 'ready'>('checking');
  const userId = user?.id ?? null;
  const platform = !!user && isPlatformRole(jwtPrimaryRole(user));

  useEffect(() => {
    if (!userId) {
      setStatus('ready');
      return;
    }
    if (!platform) {
      setStatus('ready');
      return;
    }
    let cancel = false;
    setStatus('checking');
    void client.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (cancel) return;
      setStatus(data?.currentLevel === 'aal2' ? 'ready' : 'required');
    });
    return () => {
      cancel = true;
    };
  }, [client, userId, platform]);

  return {
    status,
    confirm: () => setStatus('ready'),
  };
}

export function PlatformStaffMfaStep({
  client,
  issuer,
  onCancel,
  onVerified,
}: {
  client: SupabaseClient;
  issuer: string;
  onCancel: () => void;
  onVerified: () => void;
}) {
  const [mode, setMode] = useState<Mode>('loading');
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const beginEnroll = useCallback(async () => {
    const { data: listed, error: listError } = await client.auth.mfa.listFactors();
    if (listError) throw new Error(formatMfaError(listError));
    await Promise.all(
      (listed?.totp ?? [])
        .filter((factor) => factor.status !== 'verified')
        .map(async (factor) => {
          const { error: unenrollError } = await client.auth.mfa.unenroll({ factorId: factor.id });
          if (unenrollError && !/not found/i.test(unenrollError.message ?? '')) {
            throw new Error(formatMfaError(unenrollError));
          }
        }),
    );
    const names = [issuer, `${issuer} ${Date.now()}`];
    let lastError: { message?: string } | null = null;
    for (const friendlyName of names) {
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });
      if (!enrollError && data?.id && data.totp) {
        const { data: sessionData } = await client.auth.getSession();
        const account = sessionData.session?.user.email ?? 'staff';
        const next: EnrollState = {
          factorId: data.id,
          otpUri: data.totp.uri || buildOtpAuthUri(data.totp.secret, issuer, account),
          secret: data.totp.secret,
        };
        setEnroll(next);
        setFactorId(next.factorId);
        setMode('enroll');
        return;
      }
      lastError = enrollError;
      if (!/already exists/i.test(enrollError?.message ?? '')) {
        throw new Error(formatMfaError(enrollError));
      }
    }
    throw new Error(formatMfaError(lastError));
  }, [client, issuer]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data?.currentLevel === 'aal2') {
          onVerified();
          return;
        }
        const { data: listed, error: listError } = await client.auth.mfa.listFactors();
        if (listError) throw new Error(formatMfaError(listError));
        const verified = (listed?.totp ?? []).find((factor) => factor.status === 'verified');
        if (verified) {
          setFactorId(verified.id);
          setMode('verify');
          return;
        }
        await beginEnroll();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the second step.');
        setMode('verify');
      }
    })();
  }, [beginEnroll, client, onVerified]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!factorId) return;
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge?.id) throw new Error(formatMfaError(challengeError));
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: trimmed,
      });
      if (verifyError) throw new Error('That code was not accepted. Try the next one.');
      await client.auth.refreshSession();
      const { data: level } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel !== 'aal2') {
        throw new Error('That code was not accepted. Try the next one.');
      }
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-amber-500/20">
            {mode === 'loading' ? <Loader2 className="w-5 h-5 text-amber-600 animate-spin" /> : <KeyRound className="w-5 h-5 text-amber-600" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {mode === 'enroll' ? 'Set up your authenticator' : 'Authenticator code'}
            </h2>
            <p className="text-slate-500 text-sm">
              {mode === 'enroll'
                ? 'Scan this with your authenticator app, then enter the 6-digit code.'
                : 'Enter the current 6-digit code. This admin stays locked until this step is done.'}
            </p>
          </div>
        </div>
        {mode === 'enroll' && enroll ? (
          <div className="mb-4 space-y-3">
            <div className="mx-auto w-fit rounded-lg border border-slate-200 bg-white p-3">
              <QRCodeSVG value={enroll.otpUri} size={196} level="M" includeMargin />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-slate-500">Or type this key</p>
                <button
                  type="button"
                  className="text-slate-500"
                  onClick={() => {
                    void navigator.clipboard.writeText(enroll.secret);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">{copied ? 'Copied' : 'Copy key'}</span>
                </button>
              </div>
              <code className="block break-all text-sm text-slate-800">{enroll.secret}</code>
            </div>
          </div>
        ) : null}
        {mode !== 'loading' ? (
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {mode !== 'loading' ? (
          <button
            type="submit"
            disabled={busy || !factorId}
            className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? 'Checking…' : mode === 'enroll' ? 'Finish setup' : 'Continue'}
          </button>
        ) : null}
        <button type="button" onClick={onCancel} className="mt-3 w-full text-sm text-slate-500">
          Sign out
        </button>
      </form>
    </div>
  );
}
