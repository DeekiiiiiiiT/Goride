import React from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { DeliveryReconReadinessItem } from '@roam/finance-core';
import { cn } from '../../ui/utils';

export function ReconDeliveryReadinessCard({
  weekKey,
  items,
  ready,
  loading,
}: {
  weekKey: string;
  items: DeliveryReconReadinessItem[];
  ready: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking delivery readiness…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/40 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Delivery reconciliation</h2>
        <p className="mt-1 text-sm text-slate-600">
          Week of {weekKey}. Complete every item below before the delivery wizard opens — we never
          show an empty $0 week.
        </p>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex gap-3 rounded-lg border bg-white px-3 py-3',
              item.ok ? 'border-emerald-200' : 'border-slate-200',
            )}
          >
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-600">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {ready ? (
        <p className="text-sm font-medium text-emerald-800">All prerequisites met — open this week to reconcile delivery.</p>
      ) : null}
    </div>
  );
}
