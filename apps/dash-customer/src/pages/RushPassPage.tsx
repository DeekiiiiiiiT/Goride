import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AccountSubHeader } from '@/components/account/AccountSubHeader';
import { supabase } from '@/lib/supabase';

type RushPassStatus = {
  active: boolean;
  plan: {
    id: string;
    slug: string;
    name: string;
    price_jmd: number;
    billing_period_days: number;
    free_delivery: boolean;
    service_fee_multiplier: number;
    eligible_tier_slugs?: string[];
    max_free_delivery_km?: number;
    monthly_subsidy_budget_jmd?: number;
  } | null;
  membership: {
    id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    auto_renew: boolean;
    source: string;
  } | null;
  subsidy?: {
    budget_jmd: number;
    used_jmd: number;
    remaining_jmd: number;
    max_free_delivery_km: number;
  };
};

type Props = {
  onNavigate: (page: string) => void;
};

function formatJmd(n: number) {
  return `J$${Math.round(n).toLocaleString()}`;
}

export default function RushPassPage({ onNavigate }: Props) {
  const [status, setStatus] = useState<RushPassStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMessage('Sign in to manage Rush Pass.');
        setStatus(null);
        return;
      }
      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/rush-pass`, {
        headers: supabaseAnonFunctionHeaders({ Authorization: `Bearer ${token}` }),
      });
      if (!res.ok) throw new Error('Could not load Rush Pass');
      const data = (await res.json()) as RushPassStatus;
      setStatus(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMessage('Sign in required');
        return;
      }
      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/rush-pass/subscribe`, {
        method: 'POST',
        headers: {
          ...supabaseAnonFunctionHeaders({ Authorization: `Bearer ${token}` }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnOrigin: window.location.origin }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        paymentRedirectUrl?: string;
        intentId?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Subscribe failed');
      if (data.paymentRedirectUrl) {
        window.location.href = data.paymentRedirectUrl;
        return;
      }
      setMessage('Payment link unavailable — try again');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Subscribe failed');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/rush-pass/cancel`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({ Authorization: `Bearer ${token}` }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Cancel failed');
      setMessage('Auto-renew turned off. Benefits continue until the period ends.');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const plan = status?.plan;
  const membership = status?.membership;
  const active = Boolean(status?.active);

  return (
    <div className="min-h-screen bg-surface pb-24">
      <AccountSubHeader title="Rush Pass" onBack={() => onNavigate('account')} />
      <main className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        {loading ? (
          <p className="text-body-md text-on-surface-variant">Loading…</p>
        ) : (
          <>
            <section className="space-y-2">
              <h1 className="text-title-lg text-on-surface font-semibold">
                {plan?.name ?? 'Rush Pass'}
              </h1>
              <p className="text-body-md text-on-surface-variant">
                Half service fee at Growth &amp; Dominant. Free delivery within{' '}
                {plan?.max_free_delivery_km ?? status?.subsidy?.max_free_delivery_km ?? 8} km road
                distance, up to {formatJmd(plan?.monthly_subsidy_budget_jmd ?? plan?.price_jmd ?? 0)}{' '}
                delivery credit per period.
                {plan ? ` ${formatJmd(plan.price_jmd)} / ${plan.billing_period_days} days.` : ''}
              </p>
            </section>

            {active && membership ? (
              <section className="rounded-xl bg-primary/10 px-4 py-3 space-y-2">
                <p className="text-label-md text-primary font-medium flex items-center gap-2">
                  <MaterialIcon name="verified" className="text-lg" />
                  Active until {new Date(membership.current_period_end).toLocaleDateString()}
                </p>
                {status?.subsidy ? (
                  <p className="text-body-sm text-on-surface-variant">
                    Free-delivery credit left this period:{' '}
                    {formatJmd(status.subsidy.remaining_jmd)} of{' '}
                    {formatJmd(status.subsidy.budget_jmd)}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancel()}
                  className="text-body-sm text-on-surface-variant underline disabled:opacity-50"
                >
                  Cancel auto-renew
                </button>
              </section>
            ) : (
              <button
                type="button"
                disabled={busy || !plan}
                onClick={() => void subscribe()}
                className="w-full rounded-xl bg-primary text-on-primary py-3 text-label-lg font-medium disabled:opacity-50"
              >
                {busy ? 'Starting checkout…' : `Get Rush Pass — ${plan ? formatJmd(plan.price_jmd) : ''}`}
              </button>
            )}

            {message ? (
              <p className="text-body-sm text-on-surface-variant">{message}</p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
