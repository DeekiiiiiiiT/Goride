import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useForgotPassword, consumeAdminLoginErrorFlash } from '@roam/auth-client';
import { useAdminAuth } from '@/app/auth/AdminAuthProvider';

export function EnterpriseAdminLogin() {
  const { signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => consumeAdminLoginErrorFlash());
  const [loading, setLoading] = useState(false);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword('enterprise', { signInHref: '/admin' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotMode) {
      setError(null);
      const err = await sendResetEmail(email);
      if (err) setError(err);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: signErr } = await signIn(email, password);
      if (signErr) setError(signErr);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-8"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">
            Roam Enterprise
          </p>
          <h1 className="mt-1 text-lg font-semibold text-white">Product Admin</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage Enterprise customer accounts and team members.
          </p>
        </div>
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          required
        />
        {!forgotMode && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            required
          />
        )}
        {!forgotMode ? (
          <button
            type="button"
            onClick={() => {
              setForgotMode(true);
              setError(null);
              setNotice(null);
            }}
            className="text-left text-sm text-amber-400 hover:text-amber-300"
          >
            Forgot password?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setForgotMode(false);
              setError(null);
            }}
            className="text-left text-sm text-slate-400 hover:text-slate-300"
          >
            Back to sign in
          </button>
        )}
        <button
          type="submit"
          disabled={loading || forgotLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {(loading || forgotLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
          {forgotMode ? 'Send reset email' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
