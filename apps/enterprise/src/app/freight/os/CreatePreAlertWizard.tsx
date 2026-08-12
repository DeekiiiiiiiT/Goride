import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { useSuites } from '@/app/hooks/useFreight';
import { InvoiceFillSuggestions } from '@/app/freight/invoiceParse/InvoiceFillSuggestions';
import {
  applySuggestionToBlanks,
  parseRetailInvoice,
} from '@/app/freight/invoiceParse/parseRetailInvoice';
import type { InvoiceParseSuggestion, InvoiceShipToHint } from '@/app/freight/invoiceParse/types';
import { matchWarehouseFromShipTo } from '@/app/freight/invoiceParse/matchWarehouseFromShipTo';
import { DOC_ROLE } from '@/app/freight/os/packageDuty/docRoles';

type WizardStep = 'order' | 'packages' | 'review';

type DraftLine = {
  key: string;
  description: string;
  quantity: string;
  unitValueUsd: string;
};

type DraftPackage = {
  key: string;
  tracking: string;
  weightLbs: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  declaredValueUsd: string;
  lineKeys: string[];
};

function newKey(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
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

/** Create pre-alert wizard: Order → line items → packages (one tracking # each). */
export function CreatePreAlertForm({ onSuccess }: { onSuccess?: () => void }) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const suites = useSuites();
  const [step, setStep] = useState<WizardStep>('order');
  const [formError, setFormError] = useState<string | null>(null);

  const [suiteId, setSuiteId] = useState('');
  const [pendingSuiteCode, setPendingSuiteCode] = useState<string | null>(null);
  const [pendingShipTo, setPendingShipTo] = useState<InvoiceShipToHint | null>(null);
  const [retailer, setRetailer] = useState('');
  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [orderTotalUsd, setOrderTotalUsd] = useState('');
  const [warehouseMode, setWarehouseMode] = useState<'roam' | 'external'>('roam');
  const [intendedFacilityId, setIntendedFacilityId] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [parseReading, setParseReading] = useState(false);
  const [invoiceSuggestion, setInvoiceSuggestion] = useState<InvoiceParseSuggestion | null>(
    null,
  );
  const [lines, setLines] = useState<DraftLine[]>([
    { key: newKey('line'), description: '', quantity: '1', unitValueUsd: '' },
  ]);
  const [packages, setPackages] = useState<DraftPackage[]>([
    {
      key: newKey('pkg'),
      tracking: '',
      weightLbs: '',
      lengthIn: '',
      widthIn: '',
      heightIn: '',
      declaredValueUsd: '',
      lineKeys: [],
    },
  ]);

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

  const assignedLineKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of packages) for (const k of p.lineKeys) set.add(k);
    return set;
  }, [packages]);

  const packageValuesSum = useMemo(() => {
    return packages.reduce((sum, p) => {
      const explicit = Number(p.declaredValueUsd);
      if (Number.isFinite(explicit) && p.declaredValueUsd.trim()) return sum + explicit;
      const fromLines = lines
        .filter((l) => p.lineKeys.includes(l.key))
        .reduce((s, l) => s + lineTotalUsd(l), 0);
      return sum + fromLines;
    }, 0);
  }, [packages, lines]);

  const orderTotalNum = Number(orderTotalUsd);
  const valueMismatch =
    Number.isFinite(orderTotalNum) &&
    orderTotalNum > 0 &&
    Math.abs(packageValuesSum - orderTotalNum) > 0.05;

  const create = useMutation({
    mutationFn: async () => {
      const intended =
        warehouseMode === 'roam' ? intendedFacilityId || null : null;
      if (warehouseMode === 'roam' && !intended) {
        throw new Error('Pick a Roam warehouse, or switch to External (CSV).');
      }
      if (!suiteId) throw new Error('Select a suite.');
      if (!packages.some((p) => p.tracking.trim())) {
        throw new Error('Add at least one package tracking number.');
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

      const packagePayload = packages
        .filter((p) => p.tracking.trim())
        .map((p) => {
          const idxs = p.lineKeys
            .map((k) => lineKeyToIndex.get(k))
            .filter((n): n is number => n != null);
          const fromLines = lines
            .filter((l) => p.lineKeys.includes(l.key))
            .reduce((s, l) => s + lineTotalUsd(l), 0);
          const declared =
            usdToMinor(p.declaredValueUsd) ??
            (idxs.length ? Math.round(fromLines * 100) : null);
          return {
            courierTrackingNumber: p.tracking.trim(),
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
      setInvoiceSuggestion(suggestion);
      // Auto-match suite + warehouse from ship-to as soon as invoice is read
      matchSuiteFromCode(suggestion.suiteCode);
      matchWarehouseFromSuggestion(suggestion.shipTo);
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

  function applyInvoiceSuggestion() {
    if (!invoiceSuggestion) return;
    const filled = applySuggestionToBlanks(
      {
        retailer,
        declaredValueUsd: orderTotalUsd,
        externalOrderNumber,
      },
      invoiceSuggestion,
    );
    setRetailer(filled.retailer ?? '');
    setOrderTotalUsd(filled.declaredValueUsd ?? '');
    setExternalOrderNumber(filled.externalOrderNumber ?? '');
    matchSuiteFromCode(invoiceSuggestion.suiteCode);
    matchWarehouseFromSuggestion(invoiceSuggestion.shipTo);

    if (invoiceSuggestion.lines.length > 0) {
      setLines(
        invoiceSuggestion.lines.map((l) => ({
          key: newKey('line'),
          description: l.description,
          quantity: String(l.quantity ?? 1),
          unitValueUsd:
            l.unitValueUsd != null
              ? String(l.unitValueUsd)
              : l.lineTotalUsd != null
                ? String(l.lineTotalUsd)
                : '',
        })),
      );
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
      setFormError('Pick a Roam warehouse, or switch to External (CSV).');
      return;
    }
    if (!lines.some((l) => l.description.trim()) && !invoiceFile) {
      setFormError('Add at least one line item, or upload an invoice.');
      return;
    }
    // Single package convenience: assign all lines if only one box and none assigned
    if (packages.length === 1 && packages[0].lineKeys.length === 0) {
      setPackages([
        {
          ...packages[0],
          lineKeys: lines.filter((l) => l.description.trim()).map((l) => l.key),
        },
      ]);
    }
    setStep('packages');
  }

  function goReview(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!packages.some((p) => p.tracking.trim())) {
      setFormError('Enter at least one tracking number.');
      return;
    }
    setStep('review');
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
            ['order', '1. Order'],
            ['packages', '2. Packages'],
            ['review', '3. Review'],
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Suite
              <select
                required
                value={suiteId}
                onChange={(e) => setSuiteId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {(suites.data?.suites ?? []).map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.suite_code)} — {String(s.contact_name || '')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Order #
              <input
                value={externalOrderNumber}
                onChange={(e) => setExternalOrderNumber(e.target.value)}
                placeholder="111-7351808-5310605"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block text-sm">
              Retailer
              <input
                value={retailer}
                onChange={(e) => setRetailer(e.target.value)}
                placeholder="Amazon, Shein…"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Order total (USD)
              <input
                type="number"
                step="0.01"
                min={0}
                value={orderTotalUsd}
                onChange={(e) => setOrderTotalUsd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <fieldset className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Destination warehouse
            </legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={warehouseMode === 'roam'}
                  onChange={() => setWarehouseMode('roam')}
                />
                Roam Warehouse (in-app)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={warehouseMode === 'external'}
                  onChange={() => setWarehouseMode('external')}
                />
                External warehouse (CSV handoff)
              </label>
            </div>
            {warehouseMode === 'roam' ? (
              <select
                value={intendedFacilityId}
                onChange={(e) => setIntendedFacilityId(e.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select warehouse…</option>
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
                Order stays unassigned. Export CSV from Expected to hand off externally.
              </p>
            )}
          </fieldset>

          <div className="block text-sm">
            <p className="font-medium text-slate-800">{DOC_ROLE.customer_invoice.label}</p>
            <p className="mt-0.5 text-xs font-normal text-slate-500">
              Upload once for the whole order — shared across all packages at seal
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <Upload className="h-4 w-4" aria-hidden />
                {invoiceFile ? 'Replace file' : 'Upload invoice'}
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
              {invoiceFile ? (
                <p className="min-w-0 flex-1 truncate text-xs text-slate-600">
                  {invoiceFile.name}
                </p>
              ) : (
                <p className="text-xs text-slate-400">PDF or image</p>
              )}
            </div>
          </div>

          {(parseReading || invoiceSuggestion) && (
            <InvoiceFillSuggestions
              reading={parseReading}
              suggestion={
                invoiceSuggestion ?? {
                  source: 'pdf_text',
                  retailer: null,
                  description: null,
                  declaredValueUsd: null,
                  weightLbs: null,
                  currencyHint: null,
                  confidence: 'none',
                  warnings: [],
                  itemLabels: [],
                  externalOrderNumber: null,
                  suiteCode: null,
                  shipTo: null,
                  orderTotalUsd: null,
                  lines: [],
                }
              }
              onApply={applyInvoiceSuggestion}
              onDismiss={() => setInvoiceSuggestion(null)}
            />
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Line items</p>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: newKey('line'), description: '', quantity: '1', unitValueUsd: '' },
                  ])
                }
                className="text-xs font-semibold text-amber-800 underline"
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
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
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
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
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
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Continue to packages
          </button>
        </form>
      )}

      {step === 'packages' && (
        <form onSubmit={goReview} className="space-y-3">
          <p className="text-sm text-slate-600">
            One tracking number = one physical box. Assign invoice lines to each box (Amazon often
            splits deliveries).
          </p>
          {packages.map((pkg, pkgIdx) => {
            const autoValue = lines
              .filter((l) => pkg.lineKeys.includes(l.key))
              .reduce((s, l) => s + lineTotalUsd(l), 0);
            return (
              <div
                key={pkg.key}
                className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Package {pkgIdx + 1}</p>
                  {packages.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPackages((prev) => prev.filter((p) => p.key !== pkg.key))
                      }
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="block text-sm">
                  Tracking #
                  <input
                    required
                    value={pkg.tracking}
                    onChange={(e) =>
                      setPackages((prev) =>
                        prev.map((p) =>
                          p.key === pkg.key ? { ...p, tracking: e.target.value } : p,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
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
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    Declared USD
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={pkg.declaredValueUsd}
                      placeholder={autoValue > 0 ? autoValue.toFixed(2) : ''}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((p) =>
                            p.key === pkg.key
                              ? { ...p, declaredValueUsd: e.target.value }
                              : p,
                          ),
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
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
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
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
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
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
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                  </label>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assign lines
                  </p>
                  <div className="mt-1 space-y-1">
                    {lines
                      .filter((l) => l.description.trim())
                      .map((line) => {
                        const takenElsewhere =
                          assignedLineKeys.has(line.key) && !pkg.lineKeys.includes(line.key);
                        return (
                          <label
                            key={line.key}
                            className={`flex items-start gap-2 rounded border px-2 py-1.5 text-sm ${
                              takenElsewhere
                                ? 'border-slate-100 bg-slate-50 text-slate-400'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={takenElsewhere}
                              checked={pkg.lineKeys.includes(line.key)}
                              onChange={(e) => {
                                setPackages((prev) =>
                                  prev.map((p) => {
                                    if (p.key !== pkg.key) return p;
                                    const next = e.target.checked
                                      ? [...p.lineKeys, line.key]
                                      : p.lineKeys.filter((k) => k !== line.key);
                                    return { ...p, lineKeys: next };
                                  }),
                                );
                              }}
                            />
                            <span>
                              {line.description}
                              {line.unitValueUsd
                                ? ` · $${lineTotalUsd(line).toFixed(2)}`
                                : ''}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                  <button
                    type="button"
                    className="mt-1 text-xs font-semibold text-amber-800 underline"
                    onClick={() => {
                      const free = lines
                        .filter((l) => l.description.trim() && !assignedLineKeys.has(l.key))
                        .map((l) => l.key);
                      setPackages((prev) =>
                        prev.map((p) =>
                          p.key === pkg.key
                            ? { ...p, lineKeys: [...p.lineKeys, ...free] }
                            : p,
                        ),
                      );
                    }}
                  >
                    Assign all remaining
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setPackages((prev) => [
                ...prev,
                {
                  key: newKey('pkg'),
                  tracking: '',
                  weightLbs: '',
                  lengthIn: '',
                  widthIn: '',
                  heightIn: '',
                  declaredValueUsd: '',
                  lineKeys: [],
                },
              ])
            }
            className="text-sm font-semibold text-amber-800 underline"
          >
            Add another package
          </button>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('order')}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Back
            </button>
            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Continue to review
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
              line(s) · {packages.filter((p) => p.tracking.trim()).length} package(s)
            </p>
            <p className="mt-1">
              Invoice: {invoiceFile ? invoiceFile.name : 'None yet (needed before seal)'}
            </p>
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('packages')}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => void onCreate()}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {create.isPending ? 'Creating…' : 'Create pre-alert'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
