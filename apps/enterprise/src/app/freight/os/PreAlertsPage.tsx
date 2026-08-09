import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { useSuites } from '@/app/hooks/useFreight';
import { InvoiceFillSuggestions } from '@/app/freight/invoiceParse/InvoiceFillSuggestions';
import {
  applySuggestionToBlanks,
  parseRetailInvoice,
} from '@/app/freight/invoiceParse/parseRetailInvoice';
import type { InvoiceParseSuggestion } from '@/app/freight/invoiceParse/types';
import { DOC_ROLE } from '@/app/freight/os/packageDuty/docRoles';

function PreAlertOverlayShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-alert-overlay-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="pre-alert-overlay-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Create form — used in overlay (and optionally inline). */
export function CreatePreAlertForm({ onSuccess }: { onSuccess?: () => void }) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const suites = useSuites();
  const [formError, setFormError] = useState<string | null>(null);
  const [warehouseMode, setWarehouseMode] = useState<'roam' | 'external'>('roam');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [retailer, setRetailer] = useState('');
  const [description, setDescription] = useState('');
  const [declaredValueUsd, setDeclaredValueUsd] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [parseReading, setParseReading] = useState(false);
  const [invoiceSuggestion, setInvoiceSuggestion] = useState<InvoiceParseSuggestion | null>(
    null,
  );

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

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await freightService.createPackage(body, organizationId);
      const pkgId = String(res.package?.id ?? '');
      if (pkgId && invoiceFile) {
        await freightService.uploadPackageInvoice(
          pkgId,
          invoiceFile,
          organizationId,
          'customer',
        );
      }
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'pre-alerts'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      setInvoiceFile(null);
      setInvoiceSuggestion(null);
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
    } finally {
      setParseReading(false);
    }
  }

  function applyInvoiceSuggestion() {
    if (!invoiceSuggestion) return;
    const filled = applySuggestionToBlanks(
      { retailer, description, declaredValueUsd, weightLbs },
      invoiceSuggestion,
    );
    setRetailer(filled.retailer ?? '');
    setDescription(filled.description ?? '');
    setDeclaredValueUsd(filled.declaredValueUsd ?? '');
    setWeightLbs(filled.weightLbs ?? '');
    setInvoiceSuggestion(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const intended =
      warehouseMode === 'roam' ? String(fd.get('intendedFacilityId') || '') : null;
    if (warehouseMode === 'roam' && !intended) {
      setFormError('Pick a Roam warehouse, or switch to External (CSV).');
      return;
    }
    try {
      await create.mutateAsync({
        suiteId: (fd.get('suiteId') as string) || null,
        courierTrackingNumber: fd.get('courierTrackingNumber') || null,
        description: description || null,
        retailer: retailer || null,
        declaredValueUsdMinor: declaredValueUsd
          ? Math.round(Number(declaredValueUsd) * 100)
          : null,
        weightLbs: weightLbs ? Number(weightLbs) : null,
        lengthIn: fd.get('lengthIn') ? Number(fd.get('lengthIn')) : null,
        widthIn: fd.get('widthIn') ? Number(fd.get('widthIn')) : null,
        heightIn: fd.get('heightIn') ? Number(fd.get('heightIn')) : null,
        intendedFacilityId: intended,
      });
      form.reset();
      setWarehouseMode('roam');
      setRetailer('');
      setDescription('');
      setDeclaredValueUsd('');
      setWeightLbs('');
      setInvoiceSuggestion(null);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Suite
          <select
            name="suiteId"
            required
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
          Courier tracking #
          <input
            name="courierTrackingNumber"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          Retailer
          <input
            name="retailer"
            value={retailer}
            onChange={(e) => setRetailer(e.target.value)}
            placeholder="Amazon, Shein…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Description
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Declared value (USD)
          <input
            name="declaredValueUsd"
            type="number"
            step="0.01"
            min={0}
            value={declaredValueUsd}
            onChange={(e) => setDeclaredValueUsd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Weight (lb, optional)
          <input
            name="weightLbs"
            type="number"
            step="0.01"
            min={0}
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">
          L (in)
          <input
            name="lengthIn"
            type="number"
            step="0.1"
            min={0}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          W (in)
          <input
            name="widthIn"
            type="number"
            step="0.1"
            min={0}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          H (in)
          <input
            name="heightIn"
            type="number"
            step="0.1"
            min={0}
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
            name="intendedFacilityId"
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            defaultValue=""
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
            Pre-alert stays unassigned. Export CSV from the Expected tab to hand off externally.
          </p>
        )}
      </fieldset>

      <label className="block text-sm">
        {DOC_ROLE.customer_invoice.label}
        <span className="mt-0.5 block text-xs font-normal text-slate-500">
          Optional for pre-alert · needed before seal
        </span>
        <input
          type="file"
          accept="application/pdf,image/*"
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            void onInvoiceSelected(e.target.files?.[0] ?? null);
          }}
        />
        {invoiceFile && <p className="mt-1 text-xs text-slate-500">{invoiceFile.name}</p>}
      </label>

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
            }
          }
          onApply={applyInvoiceSuggestion}
          onDismiss={() => setInvoiceSuggestion(null)}
        />
      )}

      {formError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      {create.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(create.error as Error).message}
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
      >
        {create.isPending ? 'Saving…' : 'Create pre-alert'}
      </button>
    </form>
  );
}

/** Modal create flow for Packages hub. */
export function CreatePreAlertOverlay({ onClose }: { onClose: () => void }) {
  return (
    <PreAlertOverlayShell
      title="Create pre-alert"
      subtitle="Register an expected package for warehouse matching."
      onClose={onClose}
    >
      <CreatePreAlertForm onSuccess={onClose} />
    </PreAlertOverlayShell>
  );
}

/** Courier-owned pre-alerts — list + CSV export (create lives in overlay). */
export function PreAlertsPage({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, session } = useAuth();
  const [exportFacilityId, setExportFacilityId] = useState<string>('external');
  const [listFilter, setListFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const facilities = useQuery({
    queryKey: ['freight', 'facilities', organizationId, 'warehouse'],
    queryFn: () => freightService.listFacilities(organizationId, 'warehouse'),
    enabled: Boolean(session),
  });

  const list = useQuery({
    queryKey: ['freight', 'pre-alerts', organizationId, listFilter],
    queryFn: () =>
      freightService.listPreAlerts(organizationId, {
        intendedFacilityId: listFilter || undefined,
      }),
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

  const exporting = useMutation({
    mutationFn: async () => {
      const res = await freightService.exportPreAlertsCsv(organizationId, {
        intendedFacilityId: exportFacilityId || undefined,
      });
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pre-alerts-${exportFacilityId || 'all'}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return res;
    },
  });

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Pre-Alerts</h1>
            <p className="mt-1 text-sm text-slate-500">
              Create expected packages for warehouse matching. Send in-app to a Roam warehouse, or
              export CSV for an external warehouse.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Create pre-alert
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Expected packages waiting for warehouse receive. Export CSV for external warehouses.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="text-xs font-medium text-slate-500">Export filter</label>
            <select
              value={exportFacilityId}
              onChange={(e) => setExportFacilityId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="external">External only (no Roam warehouse)</option>
              <option value="">All expected</option>
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
          <button
            type="button"
            disabled={exporting.isPending}
            onClick={() => exporting.mutate()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting.isPending ? 'Exporting…' : 'Export pre-alerts CSV'}
          </button>
        </div>
        {exporting.error && (
          <p className="mt-2 text-sm text-red-700">{(exporting.error as Error).message}</p>
        )}
        {exporting.isSuccess && (
          <p className="mt-2 text-sm text-green-700">
            Downloaded {exporting.data.count} pre-alert(s).
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">Expected packages</h2>
          <select
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="">All</option>
            <option value="external">External only</option>
            {Object.entries(warehousesByCountry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cc, list]) => (
                <optgroup key={cc} label={cc}>
                  {list.map((f) => (
                    <option key={String(f.id)} value={String(f.id)}>
                      {String(f.name)}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        {list.isLoading && <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>}
        {list.error && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(list.error as Error).message}
          </p>
        )}
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Tracking</th>
              <th className="px-4 py-2">Suite</th>
              <th className="px-4 py-2">Retailer</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Customer invoice</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.packages ?? []).map((p) => {
              const suite = p.suites as { suite_code?: string } | null;
              const fac = (facilities.data?.facilities ?? []).find(
                (f) => String(f.id) === String(p.intended_facility_id ?? ''),
              );
              return (
                <tr key={String(p.id)} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      to={`/app/packages/${p.id}`}
                      className="font-medium text-amber-800 underline"
                    >
                      {String(p.courier_tracking_number || p.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{suite?.suite_code || '—'}</td>
                  <td className="px-4 py-2">{String(p.retailer || '—')}</td>
                  <td className="px-4 py-2 text-xs">
                    {fac
                      ? `${String(fac.name)} (${String(fac.country_code || '')})`
                      : 'External / CSV'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {p.invoice_storage_path || p.invoice_file_name ? 'On file' : '—'}
                  </td>
                </tr>
              );
            })}
            {!list.isLoading && !(list.data?.packages ?? []).length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No expected pre-alerts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {showCreate ? <CreatePreAlertOverlay onClose={() => setShowCreate(false)} /> : null}
    </div>
  );
}
