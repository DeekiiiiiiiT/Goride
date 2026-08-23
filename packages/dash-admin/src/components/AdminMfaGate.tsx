import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabaseDashAdmin as supabase } from '@roam/auth-client';
import { AlertCircle, Copy, Loader2, ShieldCheck } from 'lucide-react';
import '../../../admin-core/src/styles/admin-login.css';

type MfaMode = 'loading' | 'enroll' | 'verify';

type EnrollState = {
  factorId: string;
  otpUri: string;
  secret: string;
};

type AdminMfaGateProps = {
  onComplete: () => void;
  onSignOut: () => void;
};

const ENROLL_FRIENDLY_NAME = 'Roam Ops Console';
const MFA_ISSUER = 'Roam Ops Console';

function buildOtpAuthUri(secret: string, accountLabel: string): string {
  const label = encodeURIComponent(`${MFA_ISSUER}:${accountLabel}`);
  const issuer = encodeURIComponent(MFA_ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}

function formatMfaError(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? 'Something went wrong. Try again.';
  if (/enroll.*disabled|totp.*disabled/i.test(message)) {
    return 'MFA enrollment is disabled in Supabase Auth settings. Ask an engineer to enable TOTP under Authentication → MFA.';
  }
  if (/already exists/i.test(message)) {
    return 'A previous MFA setup was interrupted. Tap “Show QR code again” to start fresh.';
  }
  return message;
}

async function listTotpFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(formatMfaError(error));
  return data?.totp ?? [];
}

async function removeUnverifiedTotpFactors(): Promise<void> {
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

async function enrollTotpFactor(): Promise<EnrollState> {
  await removeUnverifiedTotpFactors();

  const friendlyNames = [
    ENROLL_FRIENDLY_NAME,
    `${ENROLL_FRIENDLY_NAME} ${Date.now()}`,
  ];

  let lastError: { message?: string } | null = null;
  for (const friendlyName of friendlyNames) {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (!error && data?.id && data.totp) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accountLabel = sessionData.session?.user.email ?? 'admin';
      const otpUri = data.totp.uri || buildOtpAuthUri(data.totp.secret, accountLabel);
      return {
        factorId: data.id,
        otpUri,
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

export function AdminMfaGate({ onComplete, onSignOut }: AdminMfaGateProps) {
  const [mode, setMode] = useState<MfaMode>('loading');
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [title, setTitle] = useState('Multi-factor authentication required');
  const [subtitle, setSubtitle] = useState(
    'Admin accounts at your privilege level must enroll MFA before using the Ops Console.',
  );
  const initStartedRef = useRef(false);
  const enrollTaskRef = useRef<Promise<EnrollState> | null>(null);

  const finishIfAal2 = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel === 'aal2') {
      onComplete();
      return true;
    }
    return false;
  }, [onComplete]);

  const startEnrollment = useCallback(async () => {
    if (!enrollTaskRef.current) {
      enrollTaskRef.current = enrollTotpFactor().finally(() => {
        enrollTaskRef.current = null;
      });
    }
    const next = await enrollTaskRef.current;
    setEnroll(next);
    setFactorId(next.factorId);
    setMode('enroll');
    setTitle('Set up authenticator app');
    setSubtitle('Scan the QR code with Google Authenticator, 1Password, or Authy, then enter the 6-digit code.');
  }, []);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    void (async () => {
      try {
        if (await finishIfAal2()) return;

        const factors = await listTotpFactors();
        const verified = factors.find((f) => f.status === 'verified');
        if (verified) {
          setFactorId(verified.id);
          setMode('verify');
          setTitle('Enter authenticator code');
          setSubtitle('Open your authenticator app and enter the current 6-digit code to continue.');
          return;
        }

        await startEnrollment();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start MFA setup.');
        setMode('verify');
      }
    })();
  }, [finishIfAal2, startEnrollment]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge?.id) {
        throw new Error(formatMfaError(challengeError));
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: trimmed,
      });
      if (verifyError) {
        throw new Error(formatMfaError(verifyError));
      }

      await supabase.auth.refreshSession();
      if (await finishIfAal2()) return;
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const restartEnrollment = async () => {
    setBusy(true);
    setError(null);
    setCode('');
    setEnroll(null);
    enrollTaskRef.current = null;
    try {
      await startEnrollment();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restart setup.');
      setMode('verify');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!enroll?.secret) return;
    await navigator.clipboard.writeText(enroll.secret);
    setSecretCopied(true);
    window.setTimeout(() => setSecretCopied(false), 2000);
  };

  if (mode === 'loading') {
    return (
      <div className="dash-admin-portal min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="dash-admin-portal min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md">
        <div className="dash-admin-login__card">
          <div className="dash-admin-login__card-header">
            <div className="dash-admin-login__card-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="dash-admin-login__card-title">{title}</h2>
              <p className="dash-admin-login__card-desc">{subtitle}</p>
            </div>
          </div>

          {error && (
            <div className="dash-admin-login__error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}

          {mode === 'enroll' && enroll && (
            <div className="space-y-4 mb-4">
              <div className="mx-auto w-fit rounded-lg bg-white p-4">
                <QRCodeSVG
                  value={enroll.otpUri}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-left">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-slate-400">Manual setup key</p>
                  <button
                    type="button"
                    onClick={() => void copySecret()}
                    className="text-slate-400 hover:text-amber-200"
                    aria-label={secretCopied ? 'Copied setup key' : 'Copy setup key'}
                    title={secretCopied ? 'Copied' : 'Copy setup key'}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <code className="text-sm text-amber-200 break-all">{enroll.secret}</code>
              </div>
            </div>
          )}

          <form onSubmit={(e) => void submitCode(e)}>
            <div className="dash-admin-login__field">
              <label htmlFor="admin-mfa-code" className="dash-admin-login__label">
                Authenticator code
              </label>
              <input
                id="admin-mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="dash-admin-login__input tracking-[0.35em] text-center text-lg"
              />
            </div>
            <button type="submit" disabled={busy || !factorId} className="dash-admin-login__submit">
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying...
                </>
              ) : mode === 'enroll' ? (
                'Complete setup'
              ) : (
                'Continue'
              )}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2">
            {(mode === 'enroll' || error) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void restartEnrollment()}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                {mode === 'enroll' ? 'Generate a new QR code' : 'Show QR code again'}
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="text-sm text-slate-500 hover:text-slate-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
