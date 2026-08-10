import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { useWarehouseCourierLinks } from '@/app/hooks/useWarehouseCourierLinks';
import { freightService } from '@/app/services/freightService';
import { DOC_ROLE } from '@/app/freight/os/packageDuty/docRoles';
import {
  ScanBarcodeField,
  ScanDetailsDisclosure,
  ScanFlashTone,
  ScanStatusFlash,
} from '@/app/freight/os/scan';

/** Gun-friendly Warehouse Receive Station — wired to /scans. */
export function WarehouseReceiveStationPage({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
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

  useEffect(() => {
    const first = facilities.data?.facilities?.[0];
    if (first && !facilityId) setFacilityId(String(first.id));
  }, [facilities.data, facilityId]);

  // Default owner to this org (in-house) when links load
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

  const warehousesByCountry = (
    (facilities.data?.facilities ?? []) as Record<string, unknown>[]
  ).reduce<Record<string, Record<string, unknown>[]>>((acc, f) => {
    const cc = String(f.country_code || '??').toUpperCase();
    if (!acc[cc]) acc[cc] = [];
    acc[cc].push(f);
    return acc;
  }, {});

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
        setFlash(`Matched pre-alert ${tracking} · suite ${matchedSuite} · received`);
      } else if (res.createdUnknown) {
        setFlashTone('ok');
        setFlash(
          `Received new ${tracking} · status ${String(res.package?.status ?? '')}${
            invoiceRequired ? ' · invoice required from customer' : ''
          }`,
        );
      } else {
        setFlashTone('ok');
        setFlash(
          `Received ${tracking} · status ${String(res.package?.status ?? '')}${
            invoiceRequired ? ' · invoice required from customer' : ''
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
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      barcodeRef.current?.focus();
    },
    onError: (err) => {
      setFlashTone('error');
      setFlash((err as Error).message);
    },
  });

  function submitScan() {
    if (!barcode.trim() || scan.isPending) return;
    if (!facilityId) {
      setFlashTone('error');
      setFlash('Select a warehouse.');
      return;
    }
    if (!suiteCode) {
      setFlashTone('error');
      setFlash('Select or scan a suite (required for unknown scans).');
      return;
    }
    scan.mutate();
  }

  const kg = (Number(weightLbs) || 0) * 0.453592;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Receive Station</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scan barcode → confirm suite. Desk fields stay one tap away.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Scan barcode → confirm suite. Desk fields stay one tap away.
        </p>
      )}

      <ScanStatusFlash message={flash} tone={flashTone} onClear={clearFlash} />

      <div
        className={`grid gap-3 rounded-xl border border-slate-200 bg-white p-4 ${
          showOwnerSelector ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        <div>
          <label className="text-xs font-medium text-slate-500">Warehouse</label>
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            <label className="text-xs font-medium text-slate-500">Courier / owner</label>
            <select
              value={ownerOrgId}
              onChange={(e) => setOwnerOrgId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 font-mono text-xs"
            placeholder="Scan suite QR / type suite code…"
          />
        </div>
      </div>

      <ScanBarcodeField
        ref={barcodeRef}
        value={barcode}
        onChange={setBarcode}
        onSubmit={submitScan}
        disabled={scan.isPending}
      />

      <button
        type="button"
        disabled={!barcode || !facilityId || !suiteCode || scan.isPending}
        onClick={submitScan}
        className="w-full rounded-xl bg-amber-500 py-4 text-base font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {scan.isPending ? 'Receiving…' : 'Confirm receipt'}
      </button>

      <ScanDetailsDisclosure hint="weight, dims, bin, invoice flags">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Weight (lbs)</label>
            <input
              value={weightLbs}
              onChange={(e) => setWeightLbs(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-500">{kg.toFixed(3)} kg</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Declared value (US$)</label>
            <input
              value={declaredUsd}
              onChange={(e) => setDeclaredUsd(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-500">Declared value</p>
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

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">L (in)</label>
            <input
              value={lengthIn}
              onChange={(e) => setLengthIn(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">W (in)</label>
            <input
              value={widthIn}
              onChange={(e) => setWidthIn(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">H (in)</label>
            <input
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={invoiceRequired}
              onChange={(e) => setInvoiceRequired(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                {DOC_ROLE.customer_invoice.shortLabel} required (soft hold)
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Flag tells the courier to chase the customer invoice. Warehouse can clear
                anytime — does not block receive.
              </span>
            </span>
          </label>
          <div>
            <label className="text-xs font-medium text-slate-500">
              {DOC_ROLE.warehouse_slip.label} (optional reference)
            </label>
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
