import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { closeCourierPayoutPeriod } from '@/lib/courierApi';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type PayoutSettingsPageProps = {
  onBack: () => void;
  onViewHistory?: () => void;
};

function weekPeriodBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return { start: start.toISOString(), end: now.toISOString() };
}

export function PayoutSettingsPage({ onBack, onViewHistory }: PayoutSettingsPageProps) {
  const [busy, setBusy] = useState(false);

  const startConnect = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in required');
      const res = await fetch(`${API_ENDPOINTS.delivery}/courier/connect/onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Connect onboarding failed');
      if (body.url) {
        window.location.href = String(body.url);
        return;
      }
      toast.error('No onboarding URL returned');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start payout setup');
    } finally {
      setBusy(false);
    }
  };

  const requestPayout = async () => {
    setBusy(true);
    try {
      const { start, end } = weekPeriodBounds();
      const result = await closeCourierPayoutPeriod(start, end);
      if (!result) throw new Error('Could not close payout period');
      toast.success('Payout period recorded', 'Pending until Connect payouts are enabled.');
      onViewHistory?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payout request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Payout Settings" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 max-w-2xl mx-auto w-full space-y-6">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-on-background">Payout Method</h2>
          <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant space-y-3">
            <p className="text-sm text-on-surface-variant">
              Bank payouts run through Stripe Connect. No bank account is stored in Roam until you
              finish Connect onboarding. Weekly standard payouts only at launch (no instant payout).
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startConnect()}
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Set up payouts with Stripe Connect'}
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-on-background">This week</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestPayout()}
            className="w-full min-h-12 rounded-xl border border-outline font-medium disabled:opacity-50"
          >
            Request weekly payout
          </button>
          {onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="w-full min-h-12 rounded-xl text-primary font-medium"
            >
              View payout history
            </button>
          )}
        </section>

        <div className="flex items-start gap-2 text-sm text-muted">
          <MaterialIcon name="info" className="text-base shrink-0 mt-0.5" />
          <p>
            Closing a payout period is idempotent — requesting the same week twice will not create
            duplicate payout rows.
          </p>
        </div>
      </main>
    </div>
  );
}
