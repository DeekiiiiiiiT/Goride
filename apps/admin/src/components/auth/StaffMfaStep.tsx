// Stitch: dominion-redesign/d8107f1d4b7c4c8bbb570fed4a8216be
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

const ENROLL_NAME = 'Roam Dominion';
const ISSUER = 'Roam Dominion';

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

function buildOtpAuthUri(secret: string, accountLabel: string): string {
  const label = encodeURIComponent(`${ISSUER}:${accountLabel}`);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}

async function listTotpFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(formatMfaError(error));
  return data?.totp ?? [];
}

async function clearUnverifiedFactors(): Promise<void> {
  const factors = await listTotpFactors();
  await Promise.all(
    factors
      .filter((factor) => factor.status !== 'verified')
      .map(async (factor) => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error && !/not found/i.test(error.message ?? '')) {
          throw new Error(formatMfaError(error));
        }
      }),
  );
}

async function enrollTotp(): Promise<EnrollState> {
  await clearUnverifiedFactors();
  const names = [ENROLL_NAME, `${ENROLL_NAME} ${Date.now()}`];
  let lastError: { message?: string } | null = null;
  for (const friendlyName of names) {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (!error && data?.id && data.totp) {
      const { data: sessionData } = await supabase.auth.getSession();
      const account = sessionData.session?.user.email ?? 'owner';
      return {
        factorId: data.id,
        otpUri: data.totp.uri || buildOtpAuthUri(data.totp.secret, account),
        secret: data.totp.secret,
      };
    }
    lastError = error;
    if (!/already exists/i.test(error?.message ?? '')) {
      throw new Error(formatMfaError(error));
    }
  }
  throw new Error(formatMfaError(lastError));
}

/** Google or password sign-in is only the first step. Dominion stays locked until this account is at the second step. */
export function StaffMfaStep({
  onCancel,
  onVerified,
}: {
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
    const next = await enrollTotp();
    setEnroll(next);
    setFactorId(next.factorId);
    setMode('enroll');
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data?.currentLevel === 'aal2') {
          onVerified();
          return;
        }
        const verified = (await listTotpFactors()).find((factor) => factor.status === 'verified');
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
  }, [beginEnroll, onVerified]);

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
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge?.id) throw new Error(formatMfaError(challengeError));
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: trimmed,
      });
      if (verifyError) throw new Error('That code was not accepted. Try the next one.');
      await supabase.auth.refreshSession();
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
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

  const restart = async () => {
    setBusy(true);
    setError('');
    setCode('');
    setEnroll(null);
    try {
      await beginEnroll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-500/20">
            {mode === 'loading' ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" /> : <KeyRound className="w-5 h-5 text-blue-500" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {mode === 'enroll' ? 'Set up your authenticator' : 'Authenticator code'}
            </h2>
            <p className="text-slate-500 text-sm">
              {mode === 'enroll'
                ? 'Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code. This is separate from Google’s own sign-in prompt.'
                : 'Open your authenticator app and enter the current 6-digit code. The map stays locked until this step is done.'}
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {mode !== 'loading' ? (
          <button
            type="submit"
            disabled={busy || !factorId}
            className="mt-4 w-full rounded-lg bg-dominion-blue py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Checking…' : mode === 'enroll' ? 'Finish setup' : 'Continue'}
          </button>
        ) : null}
        {mode === 'enroll' || (error && !factorId) ? (
          <button type="button" disabled={busy} onClick={() => void restart()} className="mt-3 w-full text-sm text-slate-500">
            Generate a new QR code
          </button>
        ) : null}
        <button type="button" onClick={onCancel} className="mt-3 w-full text-sm text-slate-500">
          Sign out
        </button>
      </form>
    </div>
  );
}
