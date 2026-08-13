import { FormEvent, useMemo, useState } from 'react';
import { useCreateFacility, useIntakeWarehouses } from '@/app/hooks/useFreight';

type CatalogRow = Record<string, unknown>;

/** First-open: pick a Dominion building so Receive has somewhere to land. */
export function AddWarehouseBuildingPanel({
  onCreated,
}: {
  onCreated?: (facilityId: string) => void;
}) {
  const catalog = useIntakeWarehouses();
  const create = useCreateFacility();
  const [catalogId, setCatalogId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const warehouses = useMemo(
    () => (catalog.data?.warehouses ?? []) as CatalogRow[],
    [catalog.data?.warehouses],
  );
  const selected = warehouses.find((w) => String(w.id) === catalogId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!catalogId) {
      setError('Pick your building from the list.');
      return;
    }
    try {
      const res = await create.mutateAsync({
        facilityType: 'warehouse',
        intakeCatalogId: catalogId,
      });
      const id = String(res.facility?.id ?? '');
      if (id) onCreated?.(id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6"
    >
      <p className="text-sm font-semibold text-slate-900">Pick your building</p>
      <p className="mt-1 text-sm text-slate-500">
        Choose the intake building you work in. We’ll use it on every scan.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-800">
        Our building
        <select
          required
          value={catalogId}
          onChange={(e) => setCatalogId(e.target.value)}
          disabled={catalog.isLoading}
          className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
        >
          <option value="">
            {catalog.isLoading ? 'Loading buildings…' : 'Select from the list…'}
          </option>
          {warehouses.map((w) => (
            <option key={String(w.id)} value={String(w.id)}>
              {String(w.country_code || '??')} · {String(w.name)} — {String(w.city)}
              {w.state ? `, ${String(w.state)}` : ''}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {String(selected.address_line)}
          <br />
          {[selected.city, selected.state, selected.postal_code].filter(Boolean).map(String).join(', ')}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={create.isPending || !catalogId}
        className="mt-4 min-h-11 w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
      >
        {create.isPending ? 'Saving…' : 'Use this building'}
      </button>
    </form>
  );
}
