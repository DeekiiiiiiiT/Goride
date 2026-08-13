import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { useSuites } from '@/app/hooks/useFreight';
import {
  applySuggestionToBlanks,
  parseRetailInvoice,
} from '@/app/freight/invoiceParse/parseRetailInvoice';
import type { InvoiceParseSuggestion, InvoiceShipToHint } from '@/app/freight/invoiceParse/types';
import { matchWarehouseFromShipTo } from '@/app/freight/invoiceParse/matchWarehouseFromShipTo';

type WizardStep = 'order' | 'packages' | 'review';

type DraftLine = {
  key: string;
  description: string;
  quantity: string;
  unitValueUsd: string;
  deliveryGroupIndex: number | null;
  deliveryLabel: string | null;
};

type DraftPackage = {
  key: string;
  tracking: string;
  weightLbs: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  /** Always derived from assigned lines at submit; kept blank in UI. */
  declaredValueUsd: string;
  lineKeys: string[];
  deliveryLabel: string | null;
};

function newKey(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyPackage(partial?: Partial<DraftPackage>): DraftPackage {
  return {
    key: newKey('pkg'),
    tracking: '',
    weightLbs: '',
    lengthIn: '',
    widthIn: '',
    heightIn: '',
    declaredValueUsd: '',
    lineKeys: [],
    deliveryLabel: null,
    ...partial,
  };
}

function usdToMinor(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function lineTotalUsd(line: DraftLine): number {
  const qty = Number(line.quantity) || 1;
  const unit = Number(line.unitValueUsd);
  if (!Number.isFinite(unit)) return 0;
  return Math.round(unit * qty * 100) / 100;
}

function packageDeclaredFromLines(pkg: DraftPackage, allLines: DraftLine[]): number {
  return allLines
    .filter((l) => pkg.lineKeys.includes(l.key))
    .reduce((s, l) => s + lineTotalUsd(l), 0);
}

/** Split draft lines into one package per invoice delivery group. */
function packagesFromLines(
  nextLines: DraftLine[],
  previous: DraftPackage[] = [],
): DraftPackage[] {
  const active = nextLines.filter((l) => l.description.trim());
  if (active.length === 0) {
    return [previous[0] ? { ...previous[0], lineKeys: [] } : emptyPackage()];
  }

  const groupIds = [
    ...new Set(active.map((l) => (l.deliveryGroupIndex != null ? l.deliveryGroupIndex : 0))),
  ].sort((a, b) => a - b);

  return groupIds.map((gid, i) => {
    const groupLines = active.filter(
      (l) => (l.deliveryGroupIndex != null ? l.deliveryGroupIndex : 0) === gid,
    );
    const prev = previous[i];
    return emptyPackage({
      key: prev?.key ?? newKey('pkg'),
      tracking: prev?.tracking ?? '',
      weightLbs: prev?.weightLbs ?? '',
      lengthIn: prev?.lengthIn ?? '',
      widthIn: prev?.widthIn ?? '',
      heightIn: prev?.heightIn ?? '',
      lineKeys: groupLines.map((l) => l.key),
      deliveryLabel: groupLines[0]?.deliveryLabel ?? (groupIds.length > 1 ? `Shipment ${i + 1}` : null),
    });
  });
}

const fieldClass =
  'mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm';
const btnPrimary =
  'min-h-11 rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60';
const btnSecondary =
  'min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700';

/** Create pre-alert wizard: Order → line items → packages (one tracking # each). */
export function CreatePreAlertForm({
  onSuccess,
  onBack,
  invoiceFirst = false,
}: {
  onSuccess?: () => void;
  onBack?: () => void;
  invoiceFirst?: boolean;
}) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const suites = useSuites();
  const [step, setStep] = useState<WizardStep>('order');
  const [packageFocusIndex, setPackageFocusIndex] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const [suiteId, setSuiteId] = useState('');
  const [pendingSuiteCode, setPendingSuiteCode] = useState<string | null>(null);
  const [pendingShipTo, setPendingShipTo] = useState<InvoiceShipToHint | null>(null);
  const [retailer, setRetailer] = useState('');
  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [orderTotalUsd, setOrderTotalUsd] = useState('');
  const [estimatedTaxUsd, setEstimatedTaxUsd] = useState<number | null>(null);
  const [warehouseMode, setWarehouseMode] = useState<'roam' | 'external'>('roam');
  const [intendedFacilityId, setIntendedFacilityId] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [parseReading, setParseReading] = useState(false);
  const [invoiceSuggestion, setInvoiceSuggestion] = useState<InvoiceParseSuggestion | null>(
    null,
  );
  const [lines, setLines] = useState<DraftLine[]>([
    {
      key: newKey('line'),
      description: '',
      quantity: '1',
      unitValueUsd: '',
      deliveryGroupIndex: null,
      deliveryLabel: null,
    },
  ]);
  const [packages, setPackages] = useState<DraftPackage[]>([emptyPackage()]);

  const facilities = useQuery({
    queryKey: ['freight', 'facilities', organizationId, 'warehouse'],
    queryFn: () => freightService.listFacilities(organizationId, 'warehouse'),
    enabled: Boolean(session),
  });

  const warehousesByCountry = useMemo(() => {
    return (
      (facilities.data?.facilities ?? []) as Record<string, unknown>[]
    ).reduce<Record<string, Record<string, unknown>[]>>((acc, f) => {
      const cc = String(f.country_code || '??').toUpperCase();
      if (!acc[cc]) acc[cc] = [];
      acc[cc].push(f);
      return acc;
    }, {});
  }, [facilities.data?.facilities]);

  useEffect(() => {
    if (warehouseMode !== 'roam' || intendedFacilityId) return;
    const list = (facilities.data?.facilities ?? []) as Record<string, unknown>[];
    if (list.length === 1) {
      setIntendedFacilityId(String(list[0].id));
    }
  }, [facilities.data?.facilities, warehouseMode, intendedFacilityId]);

  const assignedLineKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of packages) for (const k of p.lineKeys) set.add(k);
    return set;
  }, [packages]);

  const packageValuesSum = useMemo(() => {
    return packages.reduce((sum, p) => sum + packageDeclaredFromLines(p, lines), 0);
  }, [packages, lines]);

  const focusPackage = packages[packageFocusIndex] ?? packages[0];
  const packageCount = packages.length;
  const showOrderFields = !invoiceFirst || Boolean(invoiceFile);

  const orderTotalNum = Number(orderTotalUsd);
  const valueGap =
    Number.isFinite(orderTotalNum) && orderTotalNum > 0
      ? Math.round((orderTotalNum - packageValuesSum) * 100) / 100
      : 0;
  const taxExplainsGap =
    estimatedTaxUsd != null &&
    estimatedTaxUsd > 0 &&
    Math.abs(valueGap - estimatedTaxUsd) <= 0.05;
  const valueMismatch =
    Number.isFinite(orderTotalNum) &&
    orderTotalNum > 0 &&
    Math.abs(valueGap) > 0.05 &&
    !taxExplainsGap;

  const create = useMutation({
    mutationFn: async () => {
      const intended =
        warehouseMode === 'roam' ? intendedFacilityId || null : null;
      if (warehouseMode === 'roam' && !intended) {
        throw new Error('Pick our freight forwarder, or switch to someone else’s freight forwarder.');
      }
      if (!suiteId) throw new Error('Select a suite.');
      if (!packages.length) {
        throw new Error('Add at least one package.');
      }

      const linePayload = lines
        .filter((l) => l.description.trim())
        .map((l, i) => ({
          description: l.description.trim(),
          quantity: Number(l.quantity) || 1,
          unitValueUsdMinor: usdToMinor(l.unitValueUsd),
          lineTotalUsdMinor: usdToMinor(String(lineTotalUsd(l))) ?? null,
          sortOrder: i,
        }));

      const lineKeyToIndex = new Map<string, number>();
      lines
        .filter((l) => l.description.trim())
        .forEach((l, i) => lineKeyToIndex.set(l.key, i));

      const packagePayload = packages.map((p) => {
          const idxs = p.lineKeys
            .map((k) => lineKeyToIndex.get(k))
            .filter((n): n is number => n != null);
          const fromLines = packageDeclaredFromLines(p, lines);
          const declared =
            fromLines > 0
              ? Math.round(fromLines * 100)
              : usdToMinor(p.declaredValueUsd);
          return {
            courierTrackingNumber: p.tracking.trim() || null,
            weightLbs: p.weightLbs ? Number(p.weightLbs) : null,
            lengthIn: p.lengthIn ? Number(p.lengthIn) : null,
            widthIn: p.widthIn ? Number(p.widthIn) : null,
            heightIn: p.heightIn ? Number(p.heightIn) : null,
            declaredValueUsdMinor: declared,
            intendedFacilityId: intended,
            lineIndexes: idxs,
          };
        });

      const res = await freightService.createRetailOrder(
        {
          suiteId,
          retailer: retailer || null,
          externalOrderNumber: externalOrderNumber || null,
          orderTotalUsdMinor: usdToMinor(orderTotalUsd),
          intendedFacilityId: intended,
          lines: linePayload,
          packages: packagePayload,
        },
        organizationId,
      );

      const orderId = String(res.order?.id ?? '');
      if (orderId && invoiceFile) {
        await freightService.uploadRetailOrderInvoice(
          orderId,
          invoiceFile,
          organizationId,
        );
      }
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'pre-alerts'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-command'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-dashboard'] });
      onSuccess?.();
    },
  });

  async function onInvoiceSelected(file: File | null) {
    setInvoiceFile(file);
    setInvoiceSuggestion(null);
    if (!file) return;
    setParseReading(true);
    try {
      const suggestion = await parseRetailInvoice(file);
      applyParsedInvoice(suggestion);
    } finally {
      setParseReading(false);
    }
  }

  function matchSuiteFromCode(suiteCode: string | null | undefined) {
    if (!suiteCode) return;
    const needle = suiteCode.trim().toUpperCase();
    const match = (suites.data?.suites ?? []).find(
      (s) => String(s.suite_code || '').trim().toUpperCase() === needle,
    );
    if (match?.id) {
      setSuiteId(String(match.id));
      setPendingSuiteCode(null);
      return;
    }
    // Suites list may still be loading — retry when it arrives
    setPendingSuiteCode(needle);
  }

  function matchWarehouseFromSuggestion(shipTo: InvoiceShipToHint | null | undefined) {
    if (!shipTo) return;
    const list = (facilities.data?.facilities ?? []) as Record<string, unknown>[];
    if (!list.length) {
      setPendingShipTo(shipTo);
      return;
    }
    const hit = matchWarehouseFromShipTo(shipTo, list);
    if (hit) {
      setWarehouseMode('roam');
      setIntendedFacilityId(hit.facilityId);
      setPendingShipTo(null);
      return;
    }
    setPendingShipTo(shipTo);
  }

  useEffect(() => {
    if (!pendingSuiteCode || suiteId) return;
    if (!(suites.data?.suites ?? []).length) return;
    matchSuiteFromCode(pendingSuiteCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rematch only when suite list / pending code changes
  }, [pendingSuiteCode, suiteId, suites.data?.suites]);

  useEffect(() => {
    if (!pendingShipTo || intendedFacilityId) return;
    if (!(facilities.data?.facilities ?? []).length) return;
    matchWarehouseFromSuggestion(pendingShipTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rematch when facilities load
  }, [pendingShipTo, intendedFacilityId, facilities.data?.facilities]);

  function applyParsedInvoice(suggestion: InvoiceParseSuggestion) {
    const filled = applySuggestionToBlanks(
      {
        retailer: '',
        declaredValueUsd: '',
        externalOrderNumber: '',
      },
      suggestion,
    );
    setRetailer(filled.retailer ?? '');
    setOrderTotalUsd(filled.declaredValueUsd ?? '');
    setExternalOrderNumber(filled.externalOrderNumber ?? '');
    setEstimatedTaxUsd(suggestion.estimatedTaxUsd);
    matchSuiteFromCode(suggestion.suiteCode);
    matchWarehouseFromSuggestion(suggestion.shipTo);

    if (suggestion.lines.length > 0) {
      const nextLines = suggestion.lines.map((l) => ({
        key: newKey('line'),
        description: l.description,
        quantity: String(l.quantity ?? 1),
        unitValueUsd:
          l.unitValueUsd != null
            ? String(l.unitValueUsd)
            : l.lineTotalUsd != null
              ? String(l.lineTotalUsd)
              : '',
        deliveryGroupIndex: l.deliveryGroupIndex ?? null,
        deliveryLabel: l.deliveryLabel ?? null,
      }));
      setLines(nextLines);
      setPackages((prev) => packagesFromLines(nextLines, prev));
      setPackageFocusIndex(0);
    }
    setInvoiceSuggestion(null);
  }

  function goPackages(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!suiteId) {
      setFormError('Select a suite.');
      return;
    }
    if (warehouseMode === 'roam' && !intendedFacilityId) {
      setFormError('Pick our freight forwarder, or switch to someone else’s freight forwarder.');
      return;
    }
    if (!lines.some((l) => l.description.trim()) && !invoiceFile) {
      setFormError('Add at least one line item, or upload an invoice.');
      return;
    }
    setPackages((prev) => {
      const rebuilt = packagesFromLines(lines, prev);
      // If only one group and no assignments somehow empty, assign all
      if (
        rebuilt.length === 1 &&
        rebuilt[0].lineKeys.length === 0 &&
        lines.some((l) => l.description.trim())
      ) {
        return [
          {
            ...rebuilt[0],
            lineKeys: lines.filter((l) => l.description.trim()).map((l) => l.key),
          },
        ];
      }
      return rebuilt;
    });
    setPackageFocusIndex(0);
    setStep('packages');
  }

  function goNextPackageStep(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (packageFocusIndex < packages.length - 1) {
      setPackageFocusIndex((i) => i + 1);
      return;
    }
    setStep('review');
  }

  function goBackFromPackages() {
    setFormError(null);
    if (packageFocusIndex > 0) {
      setPackageFocusIndex((i) => i - 1);
      return;
    }
    setStep('order');
  }

  async function onCreate() {
    setFormError(null);
    try {
      await create.mutateAsync();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
        {(
          [
            ['order', 'Step 1 · Order'],
            [
              'packages',
              step === 'packages' && packageCount > 1
                ? `Step 2 · Package ${Math.min(packageFocusIndex, packageCount - 1) + 1} of ${packageCount}`
                : 'Step 2 · Packages',
            ],
            ['review', 'Step 3 · Review'],
          ] as const
        ).map(([id, label]) => (
          <span
            key={id}
            className={`rounded-full px-2.5 py-1 ${
              step === id
                ? 'bg-amber-100 text-amber-950'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {step === 'order' && (
        <form onSubmit={goPackages} className="space-y-3">
          <div className="block text-sm">
            <p className="font-medium text-slate-800">Customer invoice (Amazon PDF)</p>
            <p className="mt-0.5 text-xs font-normal text-slate-500">
              Upload once for the whole order — shared across all packages at seal
            </p>
            <label
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center ${
                invoiceFile
                  ? 'min-h-11 flex-row gap-2 border-slate-200 bg-white py-3'
                  : 'min-h-[140px] border-slate-300 bg-slate-50 py-8 hover:border-amber-400'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void onInvoiceSelected(f);
              }}
            >
              <Upload className="h-5 w-5 text-amber-800" aria-hidden />
              <span className="text-sm font-semibold text-slate-800">
                {parseReading
                  ? 'Reading invoice…'
                  : invoiceFile
                    ? `Replace file · ${invoiceFile.name}`
                    : 'Tap or drop a PDF'}
              </span>
              {!invoiceFile && !parseReading ? (
                <span className="mt-1 text-xs text-slate-500">Amazon order details work best</span>
              ) : null}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(e) => {
                  void onInvoiceSelected(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {showOrderFields ? (
            <>
              {invoiceFile && lines.some((l) => l.description.trim()) ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  We found {externalOrderNumber || 'an order'}
                  {suiteId ? ' · suite matched' : ''}
                  {intendedFacilityId ? ' · freight forwarder matched' : ''} ·{' '}
                  {lines.filter((l) => l.description.trim()).length} item(s) · {packageCount} box
                  {packageCount === 1 ? '' : 'es'}. Fix anything that’s wrong below.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
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
                  Order #
                  <input
                    value={externalOrderNumber}
                    onChange={(e) => setExternalOrderNumber(e.target.value)}
                    placeholder="111-7351808-5310605"
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
                  Order total (USD)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={orderTotalUsd}
                    onChange={(e) => setOrderTotalUsd(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>

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
                    {Object.entries(warehousesByCountry)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([cc, list]) => (
                        <optgroup key={cc} label={cc}>
                          {list.map((f) => (
                            <option key={String(f.id)} value={String(f.id)}>
                              {String(f.name)} ({String(f.code)}) · {cc}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                ) : (
                  <p className="mt-3 text-xs text-slate-600">
                    Order stays unassigned. Export from Expected if you hand off outside.
                  </p>
                )}
              </fieldset>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">Line items</p>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        {
                          key: newKey('line'),
                          description: '',
                          quantity: '1',
                          unitValueUsd: '',
                          deliveryGroupIndex: null,
                          deliveryLabel: null,
                        },
                      ])
                    }
                    className={btnSecondary}
                  >
                    Add line
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.key}
                      className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_4.5rem_6rem_auto]"
                    >
                      <input
                        value={line.description}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, description: e.target.value } : l,
                            ),
                          )
                        }
                        placeholder="Item description"
                        className="min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                      />
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, quantity: e.target.value } : l,
                            ),
                          )
                        }
                        placeholder="Qty"
                        className="min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitValueUsd}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, unitValueUsd: e.target.value } : l,
                            ),
                          )
                        }
                        placeholder="USD"
                        className="min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        className={btnSecondary}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3">
            {onBack ? (
              <button type="button" onClick={onBack} className={btnSecondary}>
                Back
              </button>
            ) : null}
            {showOrderFields ? (
              <button type="submit" className={`${btnPrimary} flex-1`}>
                Continue to packages
              </button>
            ) : null}
          </div>
        </form>
      )}

      {step === 'packages' && focusPackage && (
        <form onSubmit={goNextPackageStep} className="space-y-3">
          <p className="text-sm text-slate-600">
            {packageCount > 1
              ? `Invoice split into ${packageCount} deliveries — paste tracking if you have it, or skip and add later.`
              : 'Paste tracking if you have it. You can skip and add it later from the package.'}
          </p>
          {(() => {
            const pkg = focusPackage;
            const pkgIdx = packageFocusIndex;
            const autoValue = packageDeclaredFromLines(pkg, lines);
            return (
              <div
                key={pkg.key}
                className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Package {pkgIdx + 1}
                      {packageCount > 1 ? ` of ${packageCount}` : ''}
                    </p>
                    {pkg.deliveryLabel ? (
                      <p className="text-xs text-slate-500">{pkg.deliveryLabel}</p>
                    ) : null}
                  </div>
                  {packageCount > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPackages((prev) => {
                          if (prev.length <= 1) return prev;
                          const next = prev.filter((p) => p.key !== pkg.key);
                          setPackageFocusIndex((i) => Math.min(i, next.length - 1));
                          return next;
                        });
                      }}
                      className={btnSecondary}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="block text-sm font-medium text-slate-800">
                  Tracking # <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    value={pkg.tracking}
                    placeholder="Paste now, or add later"
                    onChange={(e) =>
                      setPackages((prev) =>
                        prev.map((p) =>
                          p.key === pkg.key ? { ...p, tracking: e.target.value } : p,
                        ),
                      )
                    }
                    className={`${fieldClass} font-mono`}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="block text-xs">
                    Weight (lb)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={pkg.weightLbs}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((p) =>
                            p.key === pkg.key ? { ...p, weightLbs: e.target.value } : p,
                          ),
                        )
                      }
                      className="mt-1 w-full min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                    />
                  </label>
                  <div className="block text-xs">
                    <p className="font-medium text-slate-700">Value of this box</p>
                    <p className="mt-1 min-h-11 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                      ${autoValue.toFixed(2)}
                    </p>
                  </div>
                  <label className="block text-xs">
                    L
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pkg.lengthIn}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((p) =>
                            p.key === pkg.key ? { ...p, lengthIn: e.target.value } : p,
                          ),
                        )
                      }
                      className="mt-1 w-full min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    W / H
                    <div className="mt-1 flex gap-1">
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={pkg.widthIn}
                        onChange={(e) =>
                          setPackages((prev) =>
                            prev.map((p) =>
                              p.key === pkg.key ? { ...p, widthIn: e.target.value } : p,
                            ),
                          )
                        }
                        className="w-full min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={pkg.heightIn}
                        onChange={(e) =>
                          setPackages((prev) =>
                            prev.map((p) =>
                              p.key === pkg.key ? { ...p, heightIn: e.target.value } : p,
                            ),
                          )
                        }
                        className="w-full min-h-11 rounded border border-slate-300 px-3 py-3 text-sm"
                      />
                    </div>
                  </label>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Items in this box
                  </p>
                  <div className="mt-1 space-y-1">
                    {lines
                      .filter((l) => l.description.trim() && pkg.lineKeys.includes(l.key))
                      .map((line) => (
                        <label
                          key={line.key}
                          className="flex items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked
                            onChange={(e) => {
                              if (e.target.checked) return;
                              setPackages((prev) =>
                                prev.map((p) =>
                                  p.key === pkg.key
                                    ? {
                                        ...p,
                                        lineKeys: p.lineKeys.filter((k) => k !== line.key),
                                      }
                                    : p,
                                ),
                              );
                            }}
                          />
                          <span>
                            {line.description}
                            {line.unitValueUsd ? ` · $${lineTotalUsd(line).toFixed(2)}` : ''}
                          </span>
                        </label>
                      ))}
                    {pkg.lineKeys.length === 0 && (
                      <p className="text-xs text-slate-500">No items assigned to this package.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          <button
            type="button"
            onClick={() => {
              setPackages((prev) => [...prev, emptyPackage()]);
              setPackageFocusIndex(packages.length);
            }}
            className={btnSecondary}
          >
            Add another package
          </button>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3">
            <button
              type="button"
              onClick={goBackFromPackages}
              className={btnSecondary}
            >
              Back
            </button>
            <button type="submit" className={`${btnPrimary} flex-1`}>
              {packageFocusIndex < packageCount - 1
                ? `Continue to package ${packageFocusIndex + 2}`
                : 'Continue to review'}
            </button>
          </div>
        </form>
      )}

      {step === 'review' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p>
              <span className="font-semibold">Order</span>{' '}
              {externalOrderNumber || '—'} · {retailer || '—'} · suite selected
            </p>
            <p className="mt-1">
              Total ${Number(orderTotalUsd || 0).toFixed(2)} · {lines.filter((l) => l.description.trim()).length}{' '}
              line(s) · {packages.length} package(s)
              {packages.some((p) => !p.tracking.trim()) ? ' · tracking can be added later' : ''}
            </p>
            <p className="mt-1">
              Invoice: {invoiceFile ? invoiceFile.name : 'None yet (needed before seal)'}
            </p>
            {taxExplainsGap && (
              <p className="mt-2 text-slate-600">
                Order total includes estimated tax (${estimatedTaxUsd!.toFixed(2)}). Package
                declared values use merchandise only (${packageValuesSum.toFixed(2)}).
              </p>
            )}
            {valueMismatch && (
              <p className="mt-2 text-amber-900">
                Package declared values (${packageValuesSum.toFixed(2)}) don’t match order total
                (${Number(orderTotalUsd).toFixed(2)}) — confirm before create.
              </p>
            )}
            {lines.some((l) => l.description.trim() && !assignedLineKeys.has(l.key)) && (
              <p className="mt-2 text-amber-900">
                Some line items are not assigned to a package yet. You can still create — they’ll
                show as “items not on a package.”
              </p>
            )}
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3">
            <button
              type="button"
              onClick={() => {
                setPackageFocusIndex(Math.max(0, packages.length - 1));
                setStep('packages');
              }}
              className={btnSecondary}
            >
              Back
            </button>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => void onCreate()}
              className={`${btnPrimary} flex-1`}
            >
              {create.isPending ? 'Creating…' : 'Create pre-alert'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
