/**
 * Remittance detail — bag / remit / kept history + how to clear.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/formatMoney';
import {
  fetchCourierRemittance,
  fetchCourierRemittanceEvents,
  type CourierRemittanceEvent,
  type CourierRemittanceSummary,
} from '@/lib/courierApi';

type Props = {
  onBack: () => void;
};

function fromMinor(m: number): number {
  return Math.round(m) / 100;
}

export function RemittanceDetailPage({ onBack }: Props) {
  const [acct, setAcct] = useState<CourierRemittanceSummary | null>(null);
  const [events, setEvents] = useState<CourierRemittanceEvent[]>([]);

  const load = useCallback(async () => {
    const [a, e] = await Promise.all([
      fetchCourierRemittance(),
      fetchCourierRemittanceEvents(),
    ]);
    setAcct(a);
    setEvents(e);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-full pb-24 bg-surface">
      <div className="sticky top-0 z-40 bg-surface pt-safe px-[var(--spacing-edge)] pb-2 shadow-sm">
        <div className="flex items-center h-14 gap-2">
          <button type="button" onClick={onBack} className="p-2 -ml-2" aria-label="Back">
            <MaterialIcon name="arrow_back" className="text-2xl" />
          </button>
          <h1 className="text-xl font-semibold">Cash for Roam</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-[var(--spacing-edge)] pt-4 space-y-6">
        <section className="bg-surface-variant/40 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted">You’re holding</p>
          <p className="text-3xl font-bold mt-1">
            J${formatJmd(acct?.balanceJmd ?? 0)}
          </p>
          <p className="text-sm text-muted mt-2">
            Remit at a Roam cash office, Lynk, or bank transfer. Support will confirm and clear
            your balance.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">Recent activity</h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted">No remittance events yet.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="bg-surface rounded-xl border border-surface-variant p-3 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">{ev.event_type}</span>
                    <span>
                      {ev.amount_minor >= 0 ? '+' : '−'}J$
                      {formatJmd(fromMinor(Math.abs(ev.amount_minor)))}
                    </span>
                  </div>
                  {ev.event_type === 'collected' && (
                    <p className="text-xs text-muted mt-1">
                      Bag J${formatJmd(fromMinor(ev.bag_total_minor ?? 0))} · Remit J$
                      {formatJmd(
                        fromMinor(
                          (ev.platform_due_minor ?? 0) + (ev.merchant_due_minor ?? 0),
                        ),
                      )}{' '}
                      · Kept J${formatJmd(fromMinor(ev.courier_retained_minor ?? 0))}
                    </p>
                  )}
                  <p className="text-[11px] text-muted mt-1">
                    {new Date(ev.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
