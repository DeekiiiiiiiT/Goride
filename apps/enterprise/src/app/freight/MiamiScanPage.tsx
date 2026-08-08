import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFacilities, useScanPackage, useSuites } from '@/app/hooks/useFreight';

export function MiamiScanPage() {
  const facilities = useFacilities('miami_warehouse');
  const suites = useSuites();
  const scan = useScanPackage();
  const [facilityId, setFacilityId] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = facilities.data?.facilities ?? [];
    if (!facilityId && list.length) setFacilityId(String(list[0].id));
  }, [facilities.data, facilityId]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, [lastResult]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!facilityId) {
      setError('Add a US intake warehouse under Facilities first.');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const barcode = String(fd.get('barcode') || '').trim();
    if (!barcode) return;
    try {
      const res = await scan.mutateAsync({
        body: {
          barcode,
          facilityId,
          suiteCode: (fd.get('suiteCode') as string) || null,
          weightLbs: fd.get('weightLbs') ? Number(fd.get('weightLbs')) : null,
          lengthIn: fd.get('lengthIn') ? Number(fd.get('lengthIn')) : null,
          widthIn: fd.get('widthIn') ? Number(fd.get('widthIn')) : null,
          heightIn: fd.get('heightIn') ? Number(fd.get('heightIn')) : null,
          description: fd.get('description') || null,
          declaredValueUsdMinor: fd.get('declaredValueUsd')
            ? Math.round(Number(fd.get('declaredValueUsd')) * 100)
            : null,
        },
        idempotencyKey: `miami:${facilityId}:${barcode}:${Date.now()}`,
      });
      const tracking = String(res.package?.courier_tracking_number || res.package?.id);
      setLastResult(
        `${res.createdUnknown ? 'NEW unknown · ' : ''}${res.duplicate ? 'DUP · ' : ''}${tracking} → ${String(res.package?.status)}`,
      );
      if (barcodeRef.current) barcodeRef.current.value = '';
      else {
        const input = form.querySelector<HTMLInputElement>('[name=barcode]');
        if (input) input.value = '';
      }
      barcodeRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const intakeList = facilities.data?.facilities ?? [];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Warehouse receive</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scan courier barcode — match pre-alert or create unknown with suite.
        </p>
      </div>

      {!intakeList.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No US intake warehouse yet.{' '}
          <Link to="/app/facilities" className="font-semibold underline">
            Add one under Facilities
          </Link>{' '}
          before receiving packages.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border-2 border-amber-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium">
          Facility
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {intakeList.map((f) => (
              <option key={String(f.id)} value={String(f.id)}>
                {String(f.name)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Barcode / tracking #
          <input
            ref={barcodeRef}
            name="barcode"
            autoFocus
            autoComplete="off"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg font-mono"
          />
        </label>

        <label className="block text-sm">
          Suite (required if no pre-alert)
          <select name="suiteCode" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">—</option>
            {(suites.data?.suites ?? []).map((s) => (
              <option key={String(s.id)} value={String(s.suite_code)}>
                {String(s.suite_code)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block text-sm">
            Weight (lb)
            <input name="weightLbs" type="number" step="0.01" min={0} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
          </label>
          <label className="block text-sm">
            L (in)
            <input name="lengthIn" type="number" step="0.1" min={0} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
          </label>
          <label className="block text-sm">
            W (in)
            <input name="widthIn" type="number" step="0.1" min={0} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
          </label>
          <label className="block text-sm">
            H (in)
            <input name="heightIn" type="number" step="0.1" min={0} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
          </label>
        </div>

        <label className="block text-sm">
          Description
          <input name="description" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Declared value (USD)
          <input name="declaredValueUsd" type="number" step="0.01" min={0} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {lastResult && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {lastResult}
          </p>
        )}

        <button
          type="submit"
          disabled={scan.isPending || !intakeList.length}
          className="w-full rounded-lg bg-amber-500 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {scan.isPending ? 'Scanning…' : 'Receive package'}
        </button>
      </form>
    </div>
  );
}
