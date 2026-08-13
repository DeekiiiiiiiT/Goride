import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { useWarehouseCourierLinks } from '@/app/hooks/useWarehouseCourierLinks';
import { freightService } from '@/app/services/freightService';
import { AddWarehouseBuildingPanel } from '@/app/freight/os/AddWarehouseBuildingPanel';
import {
  ScanBarcodeField,
  ScanDetailsDisclosure,
  ScanFlashTone,
  ScanStatusFlash,
} from '@/app/freight/os/scan';

const fieldClass =
  'mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm';

type LookupPkg = Record<string, unknown> & {
  suites?: { suite_code?: string; contact_name?: string } | null;
};

/** Gun-friendly Warehouse Receive Station — wired to /scans. */
export function WarehouseReceiveStationPage({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [lengthIn, setLengthIn] = useState('');
  const [widthIn, setWidthIn] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [declaredUsd, setDeclaredUsd] = useState('');
  const [bin, setBin] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [suiteCode, setSuiteCode] = useState('');
  const [suiteScan, setSuiteScan] = useState('');
  const [ownerOrgId, setOwnerOrgId] = useState('');
  const [invoiceRequired, setInvoiceRequired] = useState(false);
  const [warehouseSlip, setWarehouseSlip] = useState<File | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashTone, setFlashTone] = useState<ScanFlashTone>('ok');
  const [lookupPkg, setLookupPkg] = useState<LookupPkg | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  const clearFlash = useCallback(() => setFlash(null), []);
  const linksQ = useWarehouseCourierLinks();

  const activeCourierLinks = useMemo(
    () => (linksQ.data?.links ?? []).filter((l) => String(l.status) === 'active'),
    [linksQ.data?.links],
  );
  const showOwnerSelector = activeCourierLinks.length > 1;

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

  const warehouseList = (facilities.data?.facilities ?? []) as Record<string, unknown>[];
  const hasBuilding = warehouseList.length > 0;

  useEffect(() => {
    const list = (facilities.data?.facilities ?? []) as Record<string, unknown>[];
    const first = list[0];
    if (first && !facilityId) setFacilityId(String(first.id));
  }, [facilities.data?.facilities, facilityId]);

  useEffect(() => {
    if (ownerOrgId || !organizationId) return;
    const selfLink = activeCourierLinks.find((l) => l.is_self);
    if (selfLink) {
      setOwnerOrgId(String(selfLink.courier_org_id ?? organizationId));
      return;
    }
    if (activeCourierLinks.length === 1) {
      setOwnerOrgId(
        String(
          activeCourierLinks[0].courier_org_id ??
            activeCourierLinks[0].courier_org?.id ??
            organizationId,
        ),
      );
      return;
    }
    setOwnerOrgId(organizationId);
  }, [activeCourierLinks, organizationId, ownerOrgId]);

  const trackingFromUrl = params.get('tracking');
  useEffect(() => {
    const t = trackingFromUrl?.trim();
    if (!t) return;
    setBarcode(t);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tracking');
        return next;
      },
      { replace: true },
    );
  }, [trackingFromUrl, setParams]);

  const warehousesByCountry = warehouseList.reduce<
    Record<string, Record<string, unknown>[]>
  >((acc, f) => {
    const cc = String(f.country_code || '??').toUpperCase();
    if (!acc[cc]) acc[cc] = [];
    acc[cc].push(f);
    return acc;
  }, {});

  const courierNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const link of activeCourierLinks) {
      const id = String(link.courier_org_id ?? link.courier_org?.id ?? '');
      if (!id) continue;
      map[id] = link.is_self ? 'In-house' : String(link.courier_org?.name || 'Courier');
    }
    return map;
  }, [activeCourierLinks]);

  const declaredUsdNum = declaredUsd.trim() === '' ? null : Number(declaredUsd);
  const declaredValueUsdMinor =
    declaredUsdNum != null && Number.isFinite(declaredUsdNum) && declaredUsdNum >= 0
      ? Math.round(declaredUsdNum * 100)
      : null;

  function applySuiteScan(raw: string) {
    const code = raw
      .trim()
      .replace(/^SUITE[:\s-]+/i, '')
      .toUpperCase();
    if (!code) return;
    const match = (suites.data?.suites ?? []).find(
      (s) => String(s.suite_code ?? '').toUpperCase() === code,
    );
    if (match) {
      setSuiteCode(String(match.suite_code));
      setSuiteScan('');
    } else {
      setSuiteCode(code);
      setSuiteScan('');
    }
  }

  async function lookupTracking(code: string) {
    const trimmed = code.trim();
    if (!trimmed) {
      setLookupPkg(null);
      setLookupDone(false);
      return null;
    }
    setLookupBusy(true);
    try {
      const res = await freightService.lookupPackageByTracking(trimmed, organizationId);
      const pkg = res.matched ? ((res.package ?? null) as LookupPkg | null) : null;
      setLookupPkg(pkg);
      setLookupDone(true);
      if (pkg) {
        const codeFromPkg = String(pkg.suites?.suite_code || '').trim();
        if (codeFromPkg) setSuiteCode(codeFromPkg);
        const owner = String(pkg.owner_org_id ?? pkg.organization_id ?? '');
        if (owner) setOwnerOrgId(owner);
        if (pkg.weight_lbs != null && !weightLbs) setWeightLbs(String(pkg.weight_lbs));
        const minor = Number(pkg.declared_value_usd_minor ?? 0);
        if (minor > 0 && !declaredUsd) setDeclaredUsd((minor / 100).toFixed(2));
      }
      return pkg;
    } catch {
      setLookupPkg(null);
      setLookupDone(true);
      return null;
    } finally {
      setLookupBusy(false);
    }
  }

  useEffect(() => {
    const trimmed = barcode.trim();
    if (!trimmed) {
      setLookupPkg(null);
      setLookupDone(false);
      return;
    }
    const t = window.setTimeout(() => {
      void lookupTracking(trimmed);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce barcode only
  }, [barcode]);

  const scan = useMutation({
    mutationFn: async () => {
      const res = await freightService.scan(
        {
          barcode: barcode.trim(),
          facilityId,
          suiteCode: suiteCode || null,
          weightLbs: weightLbs ? Number(weightLbs) : null,
          lengthIn: lengthIn ? Number(lengthIn) : null,
          widthIn: widthIn ? Number(widthIn) : null,
          heightIn: heightIn ? Number(heightIn) : null,
          declaredValueUsdMinor,
          binLocation: bin || null,
          invoiceRequiredFromCustomer: invoiceRequired,
          ...(ownerOrgId ? { ownerOrgId } : {}),
        },
        organizationId,
        `receive-station:${barcode.trim()}:${Date.now()}`,
      );
      const pkgId = String(res.package?.id ?? '');
      if (pkgId && warehouseSlip) {
        await freightService.uploadPackageInvoice(
          pkgId,
          warehouseSlip,
          organizationId,
          'warehouse',
        );
      }
      return res;
    },
    onSuccess: (res) => {
      const tracking = String(res.package?.courier_tracking_number ?? barcode);
      if (res.matchedPreAlert) {
        setFlashTone('match');
        const pkgSuiteCode = (res.package as { suites?: { suite_code?: string } } | null)
          ?.suites?.suite_code;
        const matchedSuite = String(pkgSuiteCode || suiteCode || '—');
        setFlash(`Matched pre-alert ${tracking} · mailbox ${matchedSuite} · received`);
      } else if (res.createdUnknown) {
        setFlashTone('ok');
        setFlash(
          `Received new ${tracking} · status ${String(res.package?.status ?? '')}${
            invoiceRequired ? ' · asked courier for customer invoice' : ''
          }`,
        );
      } else {
        setFlashTone('ok');
        setFlash(
          `Received ${tracking} · status ${String(res.package?.status ?? '')}${
            invoiceRequired ? ' · asked courier for customer invoice' : ''
          }`,
        );
      }
      const pkgSuite = (res.package as { suites?: { suite_code?: string } } | null)?.suites
        ?.suite_code;
      if (pkgSuite) setSuiteCode(String(pkgSuite));
      setBarcode('');
      setWeightLbs('');
      setLengthIn('');
      setWidthIn('');
      setHeightIn('');
      setDeclaredUsd('');
      setBin('');
      setInvoiceRequired(false);
      setWarehouseSlip(null);
      setLookupPkg(null);
      setLookupDone(false);
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      barcodeRef.current?.focus();
    },
    onError: (err) => {
      setFlashTone('error');
      setFlash((err as Error).message);
    },
  });

  async function submitScan() {
    if (!barcode.trim() || scan.isPending) return;
    if (!facilityId) {
      setFlashTone('error');
      setFlash('Pick our building.');
      return;
    }
    let matched = lookupPkg;
    if (!lookupDone || lookupBusy) {
      matched = await lookupTracking(barcode);
    }
    if (!matched && !suiteCode) {
      setFlashTone('error');
      setFlash('New box — pick the mailbox.');
      return;
    }
    scan.mutate();
  }

  const kg = (Number(weightLbs) || 0) * 0.453592;
  const matchValue = Number(lookupPkg?.declared_value_usd_minor ?? 0) / 100;
  const matchHasWeight = lookupPkg?.weight_lbs != null;
  const showWeightInline = Boolean(barcode.trim()) && (!lookupPkg || !matchHasWeight);
  const canConfirm =
    Boolean(barcode.trim() && facilityId) &&
    (Boolean(lookupPkg) || Boolean(suiteCode)) &&
    !scan.isPending;

  if (facilities.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!hasBuilding) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {!embedded ? (
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Receive Station</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pick your building first, then scan tracking.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Pick your building first, then scan tracking.</p>
        )}
        <AddWarehouseBuildingPanel
          onCreated={(id) => {
            setFacilityId(id);
            void qc.invalidateQueries({ queryKey: ['freight', 'facilities'] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Receive Station</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scan tracking. We’ll match the pre-alert if one exists.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Scan tracking. We’ll match the pre-alert if one exists.
        </p>
      )}

      <ScanStatusFlash message={flash} tone={flashTone} onClear={clearFlash} />

      <div
        className={`grid gap-3 rounded-xl border border-slate-200 bg-white p-4 ${
          showOwnerSelector ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        <div>
          <label className="text-xs font-medium text-slate-500">Our building</label>
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className={fieldClass}
          >
            {Object.entries(warehousesByCountry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cc, list]) => (
                <optgroup key={cc} label={cc}>
                  {list.map((f) => (
                    <option key={String(f.id)} value={String(f.id)}>
                      {String(f.name)} ({String(f.code)})
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        {showOwnerSelector ? (
          <div>
            <label className="text-xs font-medium text-slate-500">Which courier</label>
            <select
              value={ownerOrgId}
              onChange={(e) => setOwnerOrgId(e.target.value)}
              className={fieldClass}
              disabled={Boolean(lookupPkg)}
            >
              {activeCourierLinks.map((link) => {
                const id = String(link.courier_org_id ?? link.courier_org?.id ?? '');
                const label = link.is_self
                  ? 'In-house'
                  : String(link.courier_org?.name || 'Courier');
                return (
                  <option key={String(link.id)} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        ) : null}
        {!lookupPkg ? (
          <div>
            <label className="text-xs font-medium text-slate-500">Mailbox #</label>
            <select
              value={suiteCode}
              onChange={(e) => setSuiteCode(e.target.value)}
              className={`${fieldClass} font-mono`}
            >
              <option value="">
                {lookupDone && barcode.trim()
                  ? 'Needed only if this tracking is new'
                  : 'Needed only if this tracking is new'}
              </option>
              {(suites.data?.suites ?? []).map((s) => (
                <option key={String(s.id)} value={String(s.suite_code)}>
                  {String(s.suite_code)} · {String(s.contact_name || '')}
                </option>
              ))}
            </select>
            <input
              value={suiteScan}
              onChange={(e) => setSuiteScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applySuiteScan(suiteScan);
                }
              }}
              onBlur={() => {
                if (suiteScan.trim()) applySuiteScan(suiteScan);
              }}
              className="mt-2 w-full min-h-11 rounded-lg border border-dashed border-slate-300 px-3 py-3 font-mono text-sm"
              placeholder="Scan mailbox QR / type code…"
            />
            {lookupDone && barcode.trim() && !lookupPkg ? (
              <p className="mt-1 text-xs text-slate-600">New box — pick the mailbox.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <ScanBarcodeField
        ref={barcodeRef}
        value={barcode}
        onChange={setBarcode}
        onSubmit={() => void submitScan()}
        disabled={scan.isPending}
      />

      {lookupBusy ? (
        <p className="text-sm text-slate-500">Looking up tracking…</p>
      ) : null}

      {lookupPkg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">We found this</p>
          <p className="mt-1">
            Mailbox {lookupPkg.suites?.suite_code || '—'}
            {lookupPkg.suites?.contact_name ? ` · ${lookupPkg.suites.contact_name}` : ''}
            {' · '}
            {courierNameById[String(lookupPkg.owner_org_id ?? '')] || 'Courier'}
            {matchValue > 0 ? ` · value of this box $${matchValue.toFixed(2)}` : ''}
            {matchHasWeight ? ` · ${lookupPkg.weight_lbs} lb` : ''}
            {String(lookupPkg.status) === 'received_at_warehouse' ? ' · already on the floor' : ''}
          </p>
        </div>
      ) : null}

      {showWeightInline ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800">
            Weight (lbs)
            <input
              value={weightLbs}
              onChange={(e) => setWeightLbs(e.target.value)}
              inputMode="decimal"
              className={`${fieldClass} text-lg tabular-nums`}
            />
            <span className="mt-1 block text-xs text-slate-500">{kg.toFixed(3)} kg</span>
          </label>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canConfirm}
        onClick={() => void submitScan()}
        className="sticky bottom-0 z-10 w-full min-h-11 rounded-xl bg-amber-500 py-4 text-base font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {scan.isPending ? 'Receiving…' : 'Confirm receipt'}
      </button>

      <ScanDetailsDisclosure hint="dims, bin, packing slip">
        {!showWeightInline ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Weight (lbs)</label>
              <input
                value={weightLbs}
                onChange={(e) => setWeightLbs(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
              />
              <p className="mt-1 text-xs text-slate-500">{kg.toFixed(3)} kg</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Value of this box (US$)</label>
              <input
                value={declaredUsd}
                onChange={(e) => setDeclaredUsd(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Bin / rack</label>
              <input
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 font-mono"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">Value of this box (US$)</label>
              <input
                value={declaredUsd}
                onChange={(e) => setDeclaredUsd(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Bin / rack</label>
              <input
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 font-mono"
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">L (in)</label>
            <input
              value={lengthIn}
              onChange={(e) => setLengthIn(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">W (in)</label>
            <input
              value={widthIn}
              onChange={(e) => setWidthIn(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">H (in)</label>
            <input
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 tabular-nums"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <label className="flex min-h-11 items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={invoiceRequired}
              onChange={(e) => setInvoiceRequired(e.target.checked)}
            />
            <span>
              <span className="font-medium">Ask the courier for the customer invoice</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Optional flag. Does not block receive.
              </span>
            </span>
          </label>
          <div>
            <label className="text-xs font-medium text-slate-500">Packing slip (optional)</label>
            <input
              type="file"
              accept="application/pdf,image/*"
              className="mt-1 block w-full text-sm text-slate-600"
              onChange={(e) => setWarehouseSlip(e.target.files?.[0] ?? null)}
            />
            {warehouseSlip && (
              <p className="mt-1 text-xs text-slate-500">{warehouseSlip.name}</p>
            )}
          </div>
        </div>
      </ScanDetailsDisclosure>
    </div>
  );
}
