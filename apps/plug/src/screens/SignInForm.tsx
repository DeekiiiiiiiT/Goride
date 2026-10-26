import { useState } from 'react';
import { appleSignInEnabled, signInOrder, takeAuthLinkError, thisSignInDevice, type SignInMethod } from '../authClient';
import { useAuth } from '../auth';

const fieldClass = 'mt-3 h-12 w-full rounded-xl bg-surface-container-low px-3 text-on-surface';
const buttonClass = 'pressable mt-3 min-h-[52px] w-full rounded-xl px-4 font-bold';
const WRONG_BUTTON = 'Signed up with Google or Apple? Use that button, or tap Forgot password to set a password for this email.';

function ProviderButton({ method, onClick }: { method: SignInMethod; onClick: () => void }) {
  const apple = method === 'apple';
  return (
    <button type="button" className={`${buttonClass} ${apple ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-surface-container-lowest text-on-surface shadow-sm'}`} data-act={apple ? 'continue-with-apple' : 'continue-with-google'} onClick={onClick}>
      {apple ? 'Continue with Apple' : 'Continue with Google'}
    </button>
  );
}

export function SignInForm({ onDone }: { onDone?: () => void }) {
  const auth = useAuth();
  const layout = signInOrder(thisSignInDevice(), appleSignInEnabled());
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => takeAuthLinkError());
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const run = (method: SignInMethod) => {
    const start = method === 'apple' ? auth.continueWithApple() : auth.continueWithGoogle();
    void start.catch((err) => setError(err instanceof Error ? err.message : 'That sign-in did not start'));
  };

  const submit = async () => {
    setError(null);
    setNotice(null);
    const address = email.trim();
    if (!address || !password) {
      setError('Enter your email and a password.');
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        const result = await auth.signUpWithEmail(address, password);
        if (result === 'confirm') {
          setNotice('Check your email. Open the link on this phone, in this browser.');
          return;
        }
      } else {
        await auth.signInWithEmail(address, password);
      }
      onDone?.();
    } catch (err) {
      setError(creating ? (err instanceof Error ? err.message : 'That sign-up did not work') : WRONG_BUTTON);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setNotice(null);
    const address = email.trim();
    if (!address) {
      setError('Enter your email, then ask for the reset link.');
      return;
    }
    setBusy(true);
    try {
      await auth.sendPasswordReset(address);
      setNotice('Check your email for a link to choose a new password. Open the link on this phone, in this browser.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex w-full flex-col" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className={layout.primary.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
        {layout.primary.map((method) => <ProviderButton key={method} method={method} onClick={() => run(method)} />)}
      </div>
      {layout.primary.includes('apple') ? <p className="mt-2 text-xs text-on-surface-variant">Tip: choose Share my email so you can also sign in with Google or email later.</p> : null}
      {layout.more.length ? (
        <>
          <button type="button" className="pressable mt-2 min-h-12 w-full text-sm font-bold text-primary" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
            More ways to sign in
          </button>
          {moreOpen ? layout.more.map((method) => (
            <div key={method}>
              <ProviderButton method={method} onClick={() => run(method)} />
              {method === 'apple' ? <p className="mt-2 text-xs text-on-surface-variant">Tip: choose Share my email so you can also sign in with Google or email later.</p> : null}
            </div>
          )) : null}
        </>
      ) : null}
      <label className="mt-4 font-label-lg text-label-lg text-on-surface" htmlFor="plug-email">Email</label>
      <input id="plug-email" className={fieldClass} type="email" autoComplete="email" aria-label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <label className="mt-3 font-label-lg text-label-lg text-on-surface" htmlFor="plug-password">Password</label>
      <input id="plug-password" className={fieldClass} type="password" autoComplete={creating ? 'new-password' : 'current-password'} aria-label="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
      {error ? <p role="alert" className="mt-2 text-sm text-error">{error}</p> : null}
      {notice ? <p role="status" className="mt-2 text-sm text-on-surface">{notice}</p> : null}
      <button type="submit" className={`${buttonClass} bg-primary text-on-primary`} disabled={busy}>
        {creating ? 'Create account' : 'Sign in'}
      </button>
      <button type="button" className="pressable mt-1 min-h-12 w-full text-sm font-bold text-primary" onClick={() => { void reset(); }}>
        Forgot password
      </button>
      <button type="button" className="pressable min-h-12 w-full text-sm font-bold text-on-surface" onClick={() => { setCreating((value) => !value); setError(null); setNotice(null); }}>
        {creating ? 'Already have an account? Sign in' : 'New here? Create account'}
      </button>
    </form>
  );
}
