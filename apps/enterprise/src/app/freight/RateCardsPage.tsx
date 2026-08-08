import { FormEvent, useState } from 'react';
import {
  useCreateRateCard,
  useFreightClients,
  useFreightRateCards,
  useUpdateRateCard,
} from '@/app/hooks/useFreight';
import { useServiceZones } from '@/app/hooks/useLogistics';

type Strategy = 'flat' | 'distance_tier' | 'zone' | 'per_stop';

function dollarsToMinor(v: string | number) {
  return Math.round(Number(v || 0) * 100);
}

export function RateCardsPage() {
  const { data, isLoading, error } = useFreightRateCards();
  const clients = useFreightClients();
  const pricingZones = useServiceZones('pricing');
  const create = useCreateRateCard();
  const update = useUpdateRateCard();
  const [formError, setFormError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('flat');
  const [editId, setEditId] = useState<string | null>(null);
  const rows = data?.rateCards ?? [];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const amountMinor = dollarsToMinor(String(fd.get('amount') || 0));
    let rules: Record<string, unknown> = {};

    if (strategy === 'distance_tier') {
      const tiersRaw = String(fd.get('tiers') || '').trim();
      // Format: upToKm:amount, e.g. 5:1000,20:2500 (amounts in JMD dollars)
      const tiers = tiersRaw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [up, amt] = part.split(':');
          return { upToKm: Number(up), amountMinor: dollarsToMinor(amt) };
        })
        .filter((t) => Number.isFinite(t.upToKm) && Number.isFinite(t.amountMinor));
      if (!tiers.length) {
        setFormError('Add at least one distance tier like 5:1500,20:3000');
        return;
      }
      rules = { tiers };
    } else if (strategy === 'zone') {
      const zoneId = String(fd.get('zoneId') || '');
      const zoneAmt = dollarsToMinor(String(fd.get('zoneAmount') || 0));
      if (!zoneId || zoneAmt <= 0) {
        setFormError('Pick a pricing zone and amount');
        return;
      }
      rules = { zones: [{ zoneId, amountMinor: zoneAmt }] };
    } else if (strategy === 'per_stop') {
      rules = {
        baseMinor: dollarsToMinor(String(fd.get('baseAmount') || 0)),
        perStopMinor: dollarsToMinor(String(fd.get('perStopAmount') || 0)),
      };
    }

    const body = {
      name: String(fd.get('name') || ''),
      clientId: String(fd.get('clientId') || '') || null,
      originLabel: String(fd.get('originLabel') || '') || null,
      destinationLabel: String(fd.get('destinationLabel') || '') || null,
      currency: 'JMD',
      amountMinor,
      pricingStrategy: strategy,
      rules,
    };

    try {
      if (editId) {
        await update.mutateAsync({ id: editId, body });
        setEditId(null);
      } else {
        await create.mutateAsync(body);
      }
      form.reset();
      setStrategy('flat');
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rate cards</h1>
        <p className="mt-1 text-sm text-slate-500">
          Flat, distance-tier, zone, or per-stop pricing (JMD).
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <input name="name" required placeholder="Rate name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as Strategy)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="flat">Flat amount</option>
          <option value="distance_tier">Distance tiers</option>
          <option value="zone">Zone pricing</option>
          <option value="per_stop">Per stop</option>
        </select>
        <input
          name="amount"
          type="number"
          min={0}
          step="0.01"
          required
          placeholder={strategy === 'flat' ? 'Amount (JMD)' : 'Fallback amount (JMD)'}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
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

        {strategy === 'distance_tier' && (
          <input
            name="tiers"
            placeholder="Tiers km:amount — e.g. 5:1500,20:3000"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
        )}
        {strategy === 'zone' && (
          <>
            <select name="zoneId" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Pricing zone</option>
              {(pricingZones.data?.zones ?? []).map((z) => (
                <option key={String(z.id)} value={String(z.id)}>
                  {String(z.name)}
                </option>
              ))}
            </select>
            <input
              name="zoneAmount"
              type="number"
              min={0}
              step="0.01"
              placeholder="Zone amount (JMD)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </>
        )}
        {strategy === 'per_stop' && (
          <>
            <input
              name="baseAmount"
              type="number"
              min={0}
              step="0.01"
              placeholder="Base (JMD)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="perStopAmount"
              type="number"
              min={0}
              step="0.01"
              placeholder="Per stop (JMD)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </>
        )}

        <button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 sm:col-span-2">
          {editId ? 'Update rate card' : 'Add rate card'}
        </button>
        {editId && (
          <button
            type="button"
            onClick={() => setEditId(null)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 sm:col-span-2"
          >
            Cancel edit
          </button>
        )}
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
          <li key={String(r.id)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{String(r.name)}</p>
              <p className="text-slate-500">
                {r.origin_label || 'Any'} → {r.destination_label || 'Any'} ·{' '}
                {String(r.pricing_strategy || 'flat').replace(/_/g, ' ')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-semibold tabular-nums">
                {(Number(r.amount_minor) / 100).toLocaleString()} {String(r.currency)}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditId(String(r.id));
                  setStrategy((String(r.pricing_strategy || 'flat') as Strategy) || 'flat');
                }}
                className="text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
              >
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
