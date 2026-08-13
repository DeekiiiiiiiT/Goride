import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { useSuites } from '@/app/hooks/useFreight';

const fieldClass =
  'mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm';

/** Short fallback: suite + tracking + value. Invoice can be added later. */
export function CreateManualPreAlertForm({
  onSuccess,
  onBack,
}: {
  onSuccess?: () => void;
  onBack?: () => void;
}) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const suites = useSuites();
  const [suiteId, setSuiteId] = useState('');
  const [tracking, setTracking] = useState('');
  const [retailer, setRetailer] = useState('');
  const [valueUsd, setValueUsd] = useState('');
  const [warehouseMode, setWarehouseMode] = useState<'roam' | 'external'>('roam');
  const [intendedFacilityId, setIntendedFacilityId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const facilities = useQuery({
    queryKey: ['freight', 'facilities', organizationId, 'warehouse'],
    queryFn: () => freightService.listFacilities(organizationId, 'warehouse'),
    enabled: Boolean(session),
  });

  const warehouses = useMemo(
    () => (facilities.data?.facilities ?? []) as Record<string, unknown>[],
    [facilities.data?.facilities],
  );

  useEffect(() => {
    if (warehouseMode !== 'roam' || intendedFacilityId) return;
    if (warehouses.length === 1) {
      setIntendedFacilityId(String(warehouses[0].id));
    }
  }, [warehouses, warehouseMode, intendedFacilityId]);

  const create = useMutation({
    mutationFn: async () => {
      const intended = warehouseMode === 'roam' ? intendedFacilityId || null : null;
      if (!suiteId) throw new Error('Select a suite.');
      if (warehouseMode === 'roam' && !intended) {
        throw new Error('Pick our freight forwarder, or switch to someone else’s freight forwarder.');
      }
      const value = Number(valueUsd);
      const declared =
        Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
      return freightService.createRetailOrder(
        {
          suiteId,
          retailer: retailer.trim() || null,
          orderTotalUsdMinor: declared,
          intendedFacilityId: intended,
          lines: retailer.trim()
            ? [
                {
                  description: retailer.trim(),
                  quantity: 1,
                  unitValueUsdMinor: declared,
                  lineTotalUsdMinor: declared,
                  sortOrder: 0,
                },
              ]
            : declared != null
              ? [
                  {
                    description: 'Merchandise',
                    quantity: 1,
                    unitValueUsdMinor: declared,
                    lineTotalUsdMinor: declared,
                    sortOrder: 0,
                  },
                ]
              : [],
          packages: [
            {
              courierTrackingNumber: tracking.trim() || null,
              declaredValueUsdMinor: declared,
              intendedFacilityId: intended,
              lineIndexes: retailer.trim() || declared != null ? [0] : [],
            },
          ],
        },
        organizationId,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'pre-alerts'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-command'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-dashboard'] });
      onSuccess?.();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    create.mutate(undefined, {
      onError: (err) => setFormError((err as Error).message),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-medium text-slate-800">
        Suite
        <select
          required
          value={suiteId}
          onChange={(e) => setSuiteId(e.target.value)}
          className={fieldClass}
        >
          <option value="">Select…</option>
          {(suites.data?.suites ?? []).map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              {String(s.suite_code)} — {String(s.contact_name || '')}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Tracking # <span className="font-normal text-slate-500">(optional)</span>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Paste now, or add later"
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Retailer
        <input
          value={retailer}
          onChange={(e) => setRetailer(e.target.value)}
          placeholder="Amazon, Shein…"
          className={fieldClass}
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Value of this box (USD)
        <input
          type="number"
          min={0}
          step="0.01"
          value={valueUsd}
          onChange={(e) => setValueUsd(e.target.value)}
          className={fieldClass}
        />
      </label>
      <fieldset className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Destination freight forwarder
        </legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="radio"
              checked={warehouseMode === 'roam'}
              onChange={() => setWarehouseMode('roam')}
            />
            Our freight forwarder
          </label>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="radio"
              checked={warehouseMode === 'external'}
              onChange={() => setWarehouseMode('external')}
            />
            Someone else’s freight forwarder
          </label>
        </div>
        {warehouseMode === 'roam' ? (
          <select
            value={intendedFacilityId}
            onChange={(e) => setIntendedFacilityId(e.target.value)}
            className={fieldClass}
          >
            <option value="">Select freight forwarder…</option>
            {warehouses.map((f) => (
              <option key={String(f.id)} value={String(f.id)}>
                {String(f.name)} ({String(f.code)})
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-3 text-xs text-slate-600">
            Stays unassigned. Export from Expected if you hand off outside.
          </p>
        )}
      </fieldset>
      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      ) : null}
      <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
          >
            Back
          </button>
        ) : null}
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {create.isPending ? 'Creating…' : 'Create pre-alert'}
        </button>
      </div>
    </form>
  );
}
