import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFacilities, useHubSort, useScanPackage } from '@/app/hooks/useFreight';

export function HubStationPage() {
  const hubs = useFacilities('ja_hub');
  const scan = useScanPackage();
  const sort = useHubSort();
  const [facilityId, setFacilityId] = useState('');
  const [lastPkgId, setLastPkgId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = hubs.data?.facilities ?? [];
    if (!facilityId && list.length) setFacilityId(String(list[0].id));
  }, [hubs.data, facilityId]);

  async function onInbound(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!facilityId) {
      setError('Select a Jamaica hub facility.');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const barcode = String(fd.get('barcode') || '').trim();
    try {
      const res = await scan.mutateAsync({
        body: { barcode, facilityId },
        idempotencyKey: `hub:${facilityId}:${barcode}:${Date.now()}`,
      });
      setLastPkgId(String(res.package.id));
      setMsg(`Inbound: ${String(res.package.courier_tracking_number || res.package.id)} → ${String(res.package.status)}`);
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

  async function onSort(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lastPkgId || !facilityId) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await sort.mutateAsync({
        packageId: lastPkgId,
        facilityId,
        sortZone: fd.get('sortZone') || null,
        fulfillmentMode: fd.get('fulfillmentMode') || null,
      });
      setMsg(`Sorted: ${String(res.package.status)} zone ${String(res.package.sort_zone || '—')}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const hubList = hubs.data?.facilities ?? [];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Jamaica Hub Station</h1>
        <p className="mt-1 text-sm text-slate-500">Inbound scan → sort to pickup or door delivery.</p>
      </div>

      {!hubList.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No Jamaica hub yet.{' '}
          <Link to="/app/facilities" className="font-semibold underline">
            Add one under Facilities
          </Link>
          .
        </p>
      )}

      <label className="block text-sm">
        Hub facility
        <select
          value={facilityId}
          onChange={(e) => setFacilityId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">Select…</option>
          {hubList.map((f) => (
            <option key={String(f.id)} value={String(f.id)}>{String(f.name)}</option>
          ))}
        </select>
      </label>

      <form onSubmit={onInbound} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold">1. Inbound scan</h2>
        <input
          ref={barcodeRef}
          name="barcode"
          required
          autoFocus
          placeholder="Package barcode"
          className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono"
        />
        <button type="submit" disabled={scan.isPending} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Scan inbound
        </button>
      </form>

      <form onSubmit={onSort} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold">2. Sort last scanned package</h2>
        <p className="text-xs text-slate-500">Package: {lastPkgId || '— scan first —'}</p>
        <label className="block text-sm">
          Sort zone
          <input name="sortZone" placeholder="KIN-A / MOBAY" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Fulfillment override
          <select name="fulfillmentMode" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Use suite default</option>
            <option value="pickup">Branch pickup</option>
            <option value="door_delivery">Door delivery</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={!lastPkgId || sort.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          Mark ready
        </button>
      </form>

      {msg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
