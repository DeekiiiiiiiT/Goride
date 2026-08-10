import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { InstallAppButton } from '@fleet/components/pwa/PwaLifecycleHost';
import { jwtPrimaryRole, supabaseEnterpriseApp } from '@roam/auth-client';
import { useAuth } from '@/app/auth/AuthProvider';
import { resolveEnterpriseHomePath } from '@/app/verticals/enterpriseHome';

const GENERIC_AUTH_ERROR = 'Invalid email or password';

export function LoginPage() {
  const { session, user, signIn, loading, businessType, subscribedProducts, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedFrom = (location.state as { from?: string; authError?: string } | null)?.from;
  const stateError = (location.state as { authError?: string } | null)?.authError;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(stateError ?? null);
  const [submitting, setSubmitting] = useState(false);

  const sessionHome = session
    ? resolveEnterpriseHomePath({
        rawRole: role || jwtPrimaryRole(user) || null,
        businessType,
        subscribedProducts,
      })
    : '/app';
  const defaultHome =
    requestedFrom?.startsWith('/warehouse') || requestedFrom?.startsWith('/app')
      ? requestedFrom
      : sessionHome;

  if (!loading && session) {
    return <Navigate to={defaultHome} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError(GENERIC_AUTH_ERROR);
      return;
    }
    const { data } = await supabaseEnterpriseApp.auth.getSession();
    const nextRole = data.session?.user ? jwtPrimaryRole(data.session.user) : null;
    const orgId =
      (data.session?.user?.app_metadata?.organizationId as string | undefined) ||
      (data.session?.user?.user_metadata?.organizationId as string | undefined) ||
      null;
    let bt: string | null = null;
    let products: string[] = [];
    if (orgId) {
      const { data: org } = await supabaseEnterpriseApp
        .from('organizations')
        .select('business_type, subscribed_products')
        .eq('id', orgId)
        .maybeSingle();
      bt = (org?.business_type as string) || null;
      products = Array.isArray(org?.subscribed_products)
        ? (org!.subscribed_products as string[])
        : [];
    }
    const home = resolveEnterpriseHomePath({
      rawRole: nextRole,
      businessType: bt,
      subscribedProducts: products,
    });
    const dest =
      requestedFrom?.startsWith('/warehouse') || requestedFrom?.startsWith('/app')
        ? requestedFrom
        : home;
    navigate(dest, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Roam Enterprise
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">
          Courier ops and warehouse intake for Enterprise logistics.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <label className="block text-sm text-slate-300">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-500"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-500"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6">
          <InstallAppButton className="h-10 w-full border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" />
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/" className="text-slate-300 underline-offset-2 hover:underline">
            Back to marketing site
          </Link>
        </p>
      </div>
    </div>
  );
}
