import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

/** Password is already accepted. This account has an authenticator, so the map API will not open until the code is checked. */
export function StaffMfaStep({ onCancel }: { onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((item) => item.status === 'verified');
    if (listError || !factor) {
      setBusy(false);
      setError(listError?.message || 'No authenticator is set up on this account.');
      return;
    }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError || !challenge) {
      setBusy(false);
      setError(challengeError?.message || 'Could not start the code check.');
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: trimmed,
    });
    setBusy(false);
    if (verifyError) setError('That code was not accepted. Try the next one.');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <KeyRound className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Authenticator code</h2>
            <p className="text-slate-500 text-sm">Open your authenticator app and enter the current 6-digit code.</p>
          </div>
        </div>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="6-digit code"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button type="button" onClick={onCancel} className="mt-3 w-full text-sm text-slate-500">
          Sign out
        </button>
      </form>
    </div>
  );
}
