import { FormEvent, useState } from 'react';
import { useCreateRateCard, useFreightClients, useFreightRateCards } from '@/app/hooks/useFreight';

export function RateCardsPage() {
  const { data, isLoading, error } = useFreightRateCards();
  const clients = useFreightClients();
  const create = useCreateRateCard();
  const [formError, setFormError] = useState<string | null>(null);
  const rows = data?.rateCards ?? [];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const dollars = Number(fd.get('amount') || 0);
    try {
      await create.mutateAsync({
        name: String(fd.get('name') || ''),
        clientId: String(fd.get('clientId') || '') || null,
        originLabel: String(fd.get('originLabel') || '') || null,
        destinationLabel: String(fd.get('destinationLabel') || '') || null,
        currency: 'JMD',
        amountMinor: Math.round(dollars * 100),
      });
      e.currentTarget.reset();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rate cards</h1>
        <p className="mt-1 text-sm text-slate-500">JMD pricing for client routes.</p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <input name="name" required placeholder="Rate name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="amount" type="number" min={0} step="0.01" required placeholder="Amount (JMD)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="originLabel" placeholder="Origin" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="destinationLabel" placeholder="Destination" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select name="clientId" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
          <option value="">Any client</option>
          {(clients.data?.clients ?? []).map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {String(c.name)}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 sm:col-span-2">
          Add rate card
        </button>
        {formError && <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
      </form>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No rate cards yet.
        </p>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={String(r.id)} className="flex justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{String(r.name)}</p>
              <p className="text-slate-500">
                {r.origin_label || 'Any'} → {r.destination_label || 'Any'}
              </p>
            </div>
            <p className="font-semibold tabular-nums">
              {(Number(r.amount_minor) / 100).toLocaleString()} {String(r.currency)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
