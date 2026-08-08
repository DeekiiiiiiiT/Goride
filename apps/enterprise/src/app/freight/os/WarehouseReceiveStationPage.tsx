import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

/** Gun-friendly Warehouse Receive Station — wired to /scans. */
export function WarehouseReceiveStationPage() {
  const { organizationId, session } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [bin, setBin] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [suiteCode, setSuiteCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const facilities = useQuery({
    queryKey: ['freight', 'facilities', organizationId, 'warehouse'],
    queryFn: () => freightService.listFacilities(organizationId, 'warehouse'),
    enabled: Boolean(session),
  });
  const suites = useQuery({
    queryKey: ['freight', 'suites', organizationId],
    queryFn: () => freightService.listSuites(organizationId),
    enabled: Boolean(session),
  });

  useEffect(() => {
    const first = facilities.data?.facilities?.[0];
    if (first && !facilityId) setFacilityId(String(first.id));
  }, [facilities.data, facilityId]);

  useEffect(() => {
    const first = suites.data?.suites?.[0];
    if (first && !suiteCode) setSuiteCode(String(first.suite_code ?? ''));
  }, [suites.data, suiteCode]);

  const scan = useMutation({
    mutationFn: () =>
      freightService.scan(
        {
          barcode: barcode.trim(),
          facilityId,
          suiteCode: suiteCode || null,
          weightLbs: weightLbs ? Number(weightLbs) : null,
          binLocation: bin || null,
        },
        organizationId,
        `receive-station:${barcode.trim()}:${Date.now()}`,
      ),
    onSuccess: (res) => {
      setToast(
        `Received ${String(res.package?.courier_tracking_number ?? barcode)} · status ${String(res.package?.status ?? '')}`,
      );
      setBarcode('');
      setWeightLbs('');
      setBin('');
      window.setTimeout(() => setToast(null), 2800);
    },
  });

  const kg = (Number(weightLbs) || 0) * 0.453592;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Receive Station</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scan barcode → confirm suite → capture weight &amp; bin
        </p>
      </div>

      {toast ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-500">Warehouse</label>
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {(facilities.data?.facilities ?? []).map((f) => (
              <option key={String(f.id)} value={String(f.id)}>
                {String(f.name)} ({String(f.code)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Suite</label>
          <select
            value={suiteCode}
            onChange={(e) => setSuiteCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          >
            <option value="">— Required for unknown scan —</option>
            {(suites.data?.suites ?? []).map((s) => (
              <option key={String(s.id)} value={String(s.suite_code)}>
                {String(s.suite_code)} · {String(s.contact_name || '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Scan tracking barcode
        </label>
        <input
          autoFocus
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && barcode && facilityId && suiteCode) scan.mutate();
          }}
          className="mt-2 w-full rounded-xl border-2 border-amber-400 bg-slate-50 px-4 py-5 text-center font-mono text-2xl font-semibold tracking-wide text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
          placeholder="Scan or type tracking #"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500">Weight (lbs)</label>
            <input
              value={weightLbs}
              onChange={(e) => setWeightLbs(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-500">{kg.toFixed(3)} kg</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Bin / rack</label>
            <input
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 font-mono"
            />
          </div>
        </div>

        {scan.error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(scan.error as Error).message}
          </p>
        )}

        <button
          type="button"
          disabled={!barcode || !facilityId || !suiteCode || scan.isPending}
          onClick={() => scan.mutate()}
          className="mt-6 w-full rounded-xl bg-amber-500 py-4 text-base font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Confirm receipt
        </button>
      </div>
    </div>
  );
}
