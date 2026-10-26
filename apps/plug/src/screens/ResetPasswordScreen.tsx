import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearNewPassword } from '../authClient';
import { useAuth } from '../auth';

export function ResetPasswordScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await auth.setPassword(password);
      clearNewPassword();
      navigate(auth.displayName ? '/explore' : '/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-plug-screen="06-reset.html" className="flex min-h-screen flex-col bg-surface px-margin pb-safe pt-safe text-on-surface">
      <h1 className="mt-6 font-headline-sm text-headline-sm">Choose a new password</h1>
      <p className="mt-1 text-sm text-on-surface-variant">This replaces the old one for your email.</p>
      <label className="mt-4 font-label-lg text-label-lg" htmlFor="plug-new-password">New password</label>
      <input id="plug-new-password" className="mt-3 h-12 w-full rounded-xl bg-surface-container-low px-3" type="password" autoComplete="new-password" aria-label="New password" value={password} onChange={(event) => setPassword(event.target.value)} />
      {error ? <p role="alert" className="mt-2 text-sm text-error">{error}</p> : null}
      <button type="button" className="pressable mt-4 min-h-[52px] w-full rounded-xl bg-primary font-bold text-on-primary" disabled={busy} onClick={() => { void save(); }}>
        Save password
      </button>
    </div>
  );
}
