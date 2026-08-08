import { FormEvent, useState } from 'react';
import { useCreateCarrier, useFreightCarriers } from '@/app/hooks/useFreight';

export function CarriersPage() {
  const { data, isLoading, error } = useFreightCarriers();
  const create = useCreateCarrier();
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'own' | '3pl'>('all');

  const rows = (data?.carriers ?? []).filter((c) => {
    if (filter === 'own') return Boolean(c.is_own_fleet);
    if (filter === '3pl') return !c.is_own_fleet;
    return true;
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create.mutateAsync({
        name: String(fd.get('name') || ''),
        isOwnFleet: fd.get('isOwnFleet') === 'on',
        contactName: String(fd.get('contactName') || '') || null,
        contactPhone: String(fd.get('contactPhone') || '') || null,
      });
      form.reset();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Carriers</h1>
        <p className="mt-1 text-sm text-slate-500">Own fleet and third-party (3PL) partners.</p>
      </div>

      <div className="flex gap-2">
        {(['all', 'own', '3pl'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f ? 'bg-amber-100 text-amber-900' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'own' ? 'Own fleet' : '3PL'}
          </button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <input
          name="name"
          required
          placeholder="Carrier name"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="contactName"
          placeholder="Contact name"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="contactPhone"
          placeholder="Phone"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isOwnFleet" className="h-4 w-4" />
          Own fleet
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 sm:col-span-2"
        >
          Add carrier
        </button>
        {formError && <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
      </form>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No carriers yet.
        </p>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((c) => (
          <li key={String(c.id)} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{String(c.name)}</p>
              <p className="text-slate-500">{c.contact_phone ? String(c.contact_phone) : '—'}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {c.is_own_fleet ? 'Own' : '3PL'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
