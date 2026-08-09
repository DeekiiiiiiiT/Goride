import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useFacilities,
  useHubSort,
  usePackages,
  useScanPackage,
} from '@/app/hooks/useFreight';
import {
  resolveHubFacility,
  writeHubFacility,
} from '@/app/freight/os/hubFacilityStorage';
import {
  ScanBarcodeField,
  ScanDetailsDisclosure,
  ScanFlashTone,
  ScanStatusFlash,
} from '@/app/freight/os/scan';

type HubTab = 'floor' | 'station';

function parseTab(raw: string | null): HubTab {
  return raw === 'station' ? 'station' : 'floor';
}

function suiteLabel(p: Record<string, unknown>): string {
  const suites = p.suites as { suite_code?: string } | null | undefined;
  return String(suites?.suite_code || p.suite_code || '—');
}

type RowDraft = { zone: string; mode: string };

/** On-hub queue with inline sort + ready list. */
export function HubFloorPanel({
  facilityId,
  onGoScan,
}: {
  facilityId: string;
  onGoScan: () => void;
}) {
  const onHub = usePackages('received_hub');
  const ready = usePackages('ready_for_fulfillment');
  const sort = useHubSort();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [rowError, setRowError] = useState<string | null>(null);

  function draftFor(id: string): RowDraft {
    return drafts[id] ?? { zone: '', mode: '' };
  }

  function setDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...draftFor(id), ...patch },
    }));
  }

  async function markReady(packageId: string) {
    setRowError(null);
    if (!facilityId) {
      setRowError('Select a Jamaica hub facility.');
      return;
    }
    const d = draftFor(packageId);
    try {
      await sort.mutateAsync({
        packageId,
        facilityId,
        sortZone: d.zone.trim() || null,
        fulfillmentMode: d.mode || null,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[packageId];
        return next;
      });
    } catch (err) {
      setRowError((err as Error).message);
    }
  }

  const awaiting = onHub.data?.packages ?? [];
  const readyRows = ready.data?.packages ?? [];
  const busyId =
    sort.isPending && sort.variables
      ? String((sort.variables as { packageId?: string }).packageId ?? '')
      : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Sort packages already on the hub floor — no re-scan needed.
      </p>

      {rowError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {rowError}
        </p>
      )}
      {(onHub.error || ready.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {((onHub.error || ready.error) as Error).message}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">
            On hub · awaiting sort · {awaiting.length}
          </h2>
          <p className="text-xs text-slate-500">
            Packages scanned into the hub — set zone + mode, then mark ready
          </p>
        </div>
        {onHub.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : awaiting.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-800">Nothing awaiting sort</p>
            <p className="mt-1 text-sm text-slate-500">
              Scan packages in at the Scan station, or check what&apos;s still expected upstream.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onGoScan}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Go to Scan station
              </button>
              <Link
                to="/app/packages"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Open packages
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {awaiting.map((p) => {
              const id = String(p.id);
              const d = draftFor(id);
              const pending = busyId === id;
              return (
                <li key={id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">
                      {String(p.courier_tracking_number ?? id)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">Suite {suiteLabel(p)}</p>
                  </div>
                  <label className="block text-xs sm:w-36">
                    Sort zone
                    <input
                      value={d.zone}
                      onChange={(e) => setDraft(id, { zone: e.target.value })}
                      placeholder="KIN-A / MOBAY"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block text-xs sm:w-44">
                    Fulfillment
                    <select
                      value={d.mode}
                      onChange={(e) => setDraft(id, { mode: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Use suite default</option>
                      <option value="pickup">Branch pickup</option>
                      <option value="door_delivery">Door delivery</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!facilityId || pending}
                    onClick={() => void markReady(id)}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
                  >
                    {pending ? 'Saving…' : 'Mark ready'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Ready · sorted · {readyRows.length}
            </h2>
            <p className="text-xs text-slate-500">Hand off to Last Mile fulfillment</p>
          </div>
          <Link
            to="/app/fulfillment"
            className="text-xs font-medium text-amber-800 underline"
          >
            Open Fulfillment
          </Link>
        </div>
        {ready.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : readyRows.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-800">No packages ready for fulfillment</p>
            <p className="mt-1 text-sm text-slate-500">
              Mark packages ready from awaiting sort, or scan the next inbound package.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                to="/app/fulfillment"
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Open Fulfillment
              </Link>
              <button
                type="button"
                onClick={onGoScan}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Scan next
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {readyRows.map((p) => {
              const id = String(p.id);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold">
                      {String(p.courier_tracking_number ?? id)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Suite {suiteLabel(p)} · zone {String(p.sort_zone || '—')} ·{' '}
                      {String(p.fulfillment_mode || 'suite default').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <Link
                    to="/app/fulfillment"
                    className="text-xs font-medium text-amber-800 underline"
                  >
                    Fulfillment
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Tabbed hub: Hub floor | Scan station. */
export function HubWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const hubs = useFacilities('ja_hub');
  const [facilityId, setFacilityId] = useState('');

  const hubList = hubs.data?.facilities ?? [];

  useEffect(() => {
    if (!hubList.length) return;
    setFacilityId((prev) => {
      const next = resolveHubFacility(hubList, prev);
      if (next) writeHubFacility(next);
      return next;
    });
  }, [hubList]);

  function setFacility(next: string) {
    setFacilityId(next);
    writeHubFacility(next);
  }

  function setTab(next: HubTab) {
    setParams(next === 'floor' ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jamaica Hub</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sort what&apos;s on the floor, or scan packages in.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <label className="text-xs font-medium text-slate-500">Hub facility</label>
          <select
            value={facilityId}
            onChange={(e) => setFacility(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {hubList.map((f) => (
              <option key={String(f.id)} value={String(f.id)}>
                {String(f.name)}
              </option>
            ))}
          </select>
        </div>
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

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'floor' as const, label: 'Hub floor' },
            { id: 'station' as const, label: 'Scan station' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'floor' && (
        <HubFloorPanel facilityId={facilityId} onGoScan={() => setTab('station')} />
      )}
      {tab === 'station' && <HubStationPage embedded facilityId={facilityId} />}
    </div>
  );
}

export function HubStationPage({
  embedded = false,
  facilityId: facilityIdProp,
}: {
  embedded?: boolean;
  /** When used inside Hub workspace — shared facility from chrome. */
  facilityId?: string;
}) {
  const hubs = useFacilities('ja_hub');
  const scan = useScanPackage();
  const sort = useHubSort();
  const [localFacilityId, setLocalFacilityId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lastPkgId, setLastPkgId] = useState<string | null>(null);
  const [sortZone, setSortZone] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [flashTone, setFlashTone] = useState<ScanFlashTone>('ok');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const clearFlash = useCallback(() => setFlash(null), []);

  const controlled = facilityIdProp !== undefined;
  const facilityId = controlled ? facilityIdProp : localFacilityId;
  const hubList = hubs.data?.facilities ?? [];

  useEffect(() => {
    if (controlled) return;
    if (!hubList.length) return;
    setLocalFacilityId((prev) => {
      const next = resolveHubFacility(hubList, prev);
      if (next) writeHubFacility(next);
      return next;
    });
  }, [hubList, controlled]);

  function setFacility(next: string) {
    setLocalFacilityId(next);
    writeHubFacility(next);
  }

  async function submitInbound() {
    if (!barcode.trim() || scan.isPending) return;
    if (!facilityId) {
      setFlashTone('error');
      setFlash('Select a Jamaica hub facility.');
      return;
    }
    try {
      const code = barcode.trim();
      const res = await scan.mutateAsync({
        body: { barcode: code, facilityId },
        idempotencyKey: `hub:${facilityId}:${code}:${Date.now()}`,
      });
      setLastPkgId(String(res.package.id));
      setFlashTone('ok');
      setFlash(
        `Inbound: ${String(res.package.courier_tracking_number || res.package.id)} → ${String(res.package.status)}`,
      );
      setBarcode('');
      barcodeRef.current?.focus();
    } catch (err) {
      setFlashTone('error');
      setFlash((err as Error).message);
    }
  }

  async function submitSort(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lastPkgId || !facilityId) return;
    try {
      const res = await sort.mutateAsync({
        packageId: lastPkgId,
        facilityId,
        sortZone: sortZone.trim() || null,
        fulfillmentMode: fulfillmentMode || null,
      });
      setFlashTone('ok');
      setFlash(`Sorted: ${String(res.package.status)} zone ${String(res.package.sort_zone || '—')}`);
      setSortZone('');
      setFulfillmentMode('');
    } catch (err) {
      setFlashTone('error');
      setFlash((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-semibold">Jamaica Hub Station</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scan inbound. Sort stays one tap away.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Scan inbound. Sort stays one tap away.</p>
      )}

      {!embedded && !hubList.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No Jamaica hub yet.{' '}
          <Link to="/app/facilities" className="font-semibold underline">
            Add one under Facilities
          </Link>
          .
        </p>
      )}

      {!controlled && (
        <label className="block text-sm">
          Hub facility
          <select
            value={facilityId}
            onChange={(e) => setFacility(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {hubList.map((f) => (
              <option key={String(f.id)} value={String(f.id)}>
                {String(f.name)}
              </option>
            ))}
          </select>
        </label>
      )}

      {controlled && facilityId ? (
        <p className="text-xs text-slate-500">Scanning into the hub selected above.</p>
      ) : null}

      <ScanStatusFlash message={flash} tone={flashTone} onClear={clearFlash} />

      <ScanBarcodeField
        ref={barcodeRef}
        value={barcode}
        onChange={setBarcode}
        onSubmit={() => void submitInbound()}
        disabled={scan.isPending || !facilityId}
        placeholder="Package barcode"
      />

      <button
        type="button"
        disabled={!barcode.trim() || !facilityId || scan.isPending}
        onClick={() => void submitInbound()}
        className="w-full rounded-xl bg-amber-500 py-4 text-base font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {scan.isPending ? 'Scanning…' : 'Scan inbound'}
      </button>

      <ScanDetailsDisclosure
        summary="Sort last package"
        hint="zone + fulfillment mode"
      >
        <form onSubmit={(e) => void submitSort(e)} className="space-y-3">
          <p className="text-xs text-slate-500">
            Package: {lastPkgId || '— scan first —'}
          </p>
          <label className="block text-sm">
            Sort zone
            <input
              value={sortZone}
              onChange={(e) => setSortZone(e.target.value)}
              placeholder="KIN-A / MOBAY"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Fulfillment override
            <select
              value={fulfillmentMode}
              onChange={(e) => setFulfillmentMode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Use suite default</option>
              <option value="pickup">Branch pickup</option>
              <option value="door_delivery">Door delivery</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={!lastPkgId || sort.isPending}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {sort.isPending ? 'Saving…' : 'Mark ready'}
          </button>
        </form>
      </ScanDetailsDisclosure>
    </div>
  );
}
