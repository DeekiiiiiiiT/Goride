import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { useSuites } from '@/app/hooks/useFreight';
import { useDestinationWarehouses } from '@/app/hooks/useWarehouseCourierLinks';
import {
  DestinationFreightForwarderField,
  resolveIntendedFacilityId,
} from '@/app/freight/os/DestinationFreightForwarderField';

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
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const suites = useSuites();
  const destinationsQ = useDestinationWarehouses();
  const [suiteId, setSuiteId] = useState('');
  const [tracking, setTracking] = useState('');
  const [retailer, setRetailer] = useState('');
  const [valueUsd, setValueUsd] = useState('');
  const [intendedFacilityId, setIntendedFacilityId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const warehouses = useMemo(
    () => destinationsQ.data?.warehouses ?? [],
    [destinationsQ.data?.warehouses],
  );

  useEffect(() => {
    if (intendedFacilityId) return;
    if (warehouses.length === 1) {
      setIntendedFacilityId(String(warehouses[0].id));
    }
  }, [warehouses, intendedFacilityId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!suiteId) throw new Error('Select a suite.');
      if (!intendedFacilityId) throw new Error('Pick a destination freight forwarder.');
      const intended = resolveIntendedFacilityId(intendedFacilityId);
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
      <DestinationFreightForwarderField
        value={intendedFacilityId}
        onChange={setIntendedFacilityId}
        warehouses={warehouses}
        required
      />
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
