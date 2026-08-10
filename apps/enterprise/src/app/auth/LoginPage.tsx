import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { InstallAppButton } from '@fleet/components/pwa/PwaLifecycleHost';
import { jwtPrimaryRole, supabaseEnterpriseApp } from '@roam/auth-client';
import { useAuth } from '@/app/auth/AuthProvider';
import {
  getProductDoor,
  navigateDoorHref,
  resolvePostLoginHref,
} from '@/app/productDoor';
import { resolveEnterpriseHomePath } from '@/app/verticals/enterpriseHome';

const GENERIC_AUTH_ERROR = 'Invalid email or password';

export function LoginPage() {
  const { session, user, signIn, loading, businessType, subscribedProducts, role } = useAuth();
  const location = useLocation();
  const requestedFrom = (location.state as { from?: string; authError?: string } | null)?.from;
  const stateError = (location.state as { authError?: string } | null)?.authError;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(stateError ?? null);
  const [submitting, setSubmitting] = useState(false);

  const door = getProductDoor();
  const isFreight = door === 'warehouse';
  const isCourier = door === 'courier';
  const brandName = isFreight
    ? 'Roam Freight Forwarding'
    : isCourier
      ? 'Roam Courier'
      : 'Roam Enterprise';

  useEffect(() => {
    if (loading || !session) return;
    const homePath = resolveEnterpriseHomePath({
      rawRole: role || jwtPrimaryRole(user) || null,
      businessType,
      subscribedProducts,
    });
    const href = resolvePostLoginHref({
      businessType,
      subscribedProducts,
      homePath,
      requestedFrom,
    });
    navigateDoorHref(href);
  }, [loading, session, role, user, businessType, subscribedProducts, requestedFrom]);

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
    } else {
      const { data: owned } = await supabaseEnterpriseApp
        .from('organizations')
        .select('business_type, subscribed_products')
        .eq('owner_id', data.session?.user?.id ?? '')
        .eq('product_line', 'enterprise')
        .limit(1)
        .maybeSingle();
      bt = (owned?.business_type as string) || null;
      products = Array.isArray(owned?.subscribed_products)
        ? (owned!.subscribed_products as string[])
        : [];
    }
    const homePath = resolveEnterpriseHomePath({
      rawRole: nextRole,
      businessType: bt,
      subscribedProducts: products,
    });
    const href = resolvePostLoginHref({
      businessType: bt,
      subscribedProducts: products,
      homePath,
      requestedFrom,
    });
    navigateDoorHref(href);
  }

  if (!loading && session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Opening {brandName}…
      </div>
    );
  }

  // Apex marketing host — compact form
  if (door === 'apex') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            Roam Enterprise
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Sign in</h1>
          <LoginForm
            email={email}
            password={password}
            error={error}
            submitting={submitting}
            setEmail={setEmail}
            setPassword={setPassword}
            onSubmit={onSubmit}
            submitLabel="Sign in"
            variant="dark"
          />
          <p className="mt-6 text-center text-sm text-slate-500">
            <Link to="/" className="text-slate-300 underline-offset-2 hover:underline">
              Back to marketing site
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const heroSrc = isFreight ? '/stitch/freight/hero.jpg' : '/stitch/courier/hero.jpg';

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden min-h-[40vh] flex-1 lg:block lg:min-h-screen">
        <img src={heroSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className={`absolute inset-0 ${
            isFreight
              ? 'bg-gradient-to-r from-[#0f172a]/70 to-[#0f172a]/35'
              : 'bg-gradient-to-r from-[#003077]/85 to-[#003077]/40'
          }`}
        />
        <div className="relative z-10 flex h-full flex-col justify-end p-12 text-white">
          <p
            className="text-4xl font-extrabold tracking-tight md:text-5xl"
            style={{
              fontFamily: isCourier ? "'Manrope', system-ui, sans-serif" : 'inherit',
            }}
          >
            {brandName}
          </p>
          <p
            className={`mt-3 text-lg text-white/85 ${isFreight ? 'uppercase tracking-[0.12em] text-sm text-white/70' : ''}`}
            style={{
              fontFamily: isFreight ? "'JetBrains Mono', ui-monospace, monospace" : undefined,
            }}
          >
            {isFreight
              ? 'US intake floor for partner couriers'
              : 'Ops for international packages'}
          </p>
        </div>
      </div>

      <div
        className={`flex w-full flex-col justify-center px-6 py-12 lg:w-[min(480px,42%)] lg:px-12 ${
          isFreight ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-900'
        }`}
      >
        <Link
          to="/"
          className={`mb-10 inline-flex text-sm font-medium ${
            isFreight ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          ← Home
        </Link>
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: isCourier ? "'Manrope', system-ui, sans-serif" : undefined,
          }}
        >
          Sign in
        </h1>
        <p className={`mt-2 text-sm ${isFreight ? 'text-white/60' : 'text-slate-500'}`}>
          {isFreight
            ? 'Access your receive floor and partner intake tools.'
            : 'Access your international courier ops dashboard.'}
        </p>
        <div className="mt-8">
          <LoginForm
            email={email}
            password={password}
            error={error}
            submitting={submitting}
            setEmail={setEmail}
            setPassword={setPassword}
            onSubmit={onSubmit}
            submitLabel={isFreight ? 'Sign in to Floor' : 'Sign in'}
            variant={isFreight ? 'freight' : 'courier'}
          />
        </div>
        <div className="mt-8">
          <InstallAppButton
            className={
              isFreight
                ? 'h-10 w-full border-white/20 bg-transparent text-white hover:bg-white/10'
                : 'h-10 w-full border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }
          />
        </div>
      </div>
    </div>
  );
}

function LoginForm({
  email,
  password,
  error,
  submitting,
  setEmail,
  setPassword,
  onSubmit,
  submitLabel,
  variant,
}: {
  email: string;
  password: string;
  error: string | null;
  submitting: boolean;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  variant: 'dark' | 'courier' | 'freight';
}) {
  const mono = variant !== 'dark';
  const labelClass =
    variant === 'freight'
      ? 'block text-[11px] font-medium uppercase tracking-[0.12em] text-white/55'
      : variant === 'courier'
        ? 'block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500'
        : 'block text-sm text-slate-300';
  const inputClass =
    variant === 'freight'
      ? 'mt-2 w-full border border-white/20 bg-[#1e293b] px-3 py-3 text-white outline-none placeholder:text-white/30 focus:border-[#f59e0b]'
      : variant === 'courier'
        ? 'mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-[#0045a5] focus:ring-2 focus:ring-[#0045a5]/20'
        : 'mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-500';
  const btnClass =
    variant === 'freight'
      ? 'w-full bg-[#f59e0b] px-4 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[#0f172a] transition hover:bg-amber-400 disabled:opacity-60'
      : variant === 'courier'
        ? 'w-full rounded-md bg-[#0045a5] px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#003077] disabled:opacity-60'
        : 'w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60';

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      <label
        className={labelClass}
        style={mono ? { fontFamily: "'JetBrains Mono', ui-monospace, monospace" } : undefined}
      >
        {variant === 'freight' ? 'Employee ID / Email' : 'Email'}
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={variant === 'freight' ? 'scan or type email…' : 'name@company.com'}
          className={inputClass}
        />
      </label>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label
            className={labelClass}
            style={mono ? { fontFamily: "'JetBrains Mono', ui-monospace, monospace" } : undefined}
          >
            {variant === 'freight' ? 'Password' : 'Password'}
          </label>
          <Link
            to="/reset-password"
            className={`text-xs ${
              variant === 'freight'
                ? 'text-white/70 underline'
                : variant === 'courier'
                  ? 'text-[#0045a5]'
                  : 'text-slate-400'
            }`}
          >
            Forgot password?
          </Link>
        </div>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            variant === 'freight'
              ? 'border-red-400/40 bg-red-500/10 text-red-200'
              : variant === 'courier'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
          }`}
        >
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className={btnClass}>
        {submitting ? 'Signing in…' : `${submitLabel}${variant === 'courier' ? ' →' : ''}`}
      </button>
    </form>
  );
}
