import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { CreatePreAlertForm } from '@/app/freight/os/CreatePreAlertWizard';

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

export { CreatePreAlertForm };

/** Modal create flow for Packages hub. */
export function CreatePreAlertOverlay({ onClose }: { onClose: () => void }) {
  return (
    <PreAlertOverlayShell
      title="Create pre-alert"
      subtitle="Order → line items → packages (one tracking number per box)."
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
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Pre-alerts</h1>
            <p className="mt-1 text-sm text-slate-500">
              Expected inbound parcels — one tracking number per package under a retail order.
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
      )}

      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Export warehouse filter
            <select
              value={exportFacilityId}
              onChange={(e) => setExportFacilityId(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="external">External / unassigned</option>
              <option value="">All</option>
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
          </label>
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
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Suite</th>
              <th className="px-4 py-2">Retailer</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.packages ?? []).map((p) => {
              const suite = p.suites as { suite_code?: string } | null;
              const order = p.retail_orders as {
                external_order_number?: string | null;
                invoice_storage_path?: string | null;
                invoice_file_name?: string | null;
              } | null;
              const fac = (facilities.data?.facilities ?? []).find(
                (f) => String(f.id) === String(p.intended_facility_id ?? ''),
              );
              const hasInvoice = Boolean(
                p.invoice_storage_path ||
                  p.invoice_file_name ||
                  order?.invoice_storage_path ||
                  order?.invoice_file_name,
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
                  <td className="px-4 py-2 font-mono text-xs">
                    {order?.external_order_number || '—'}
                  </td>
                  <td className="px-4 py-2">{suite?.suite_code || '—'}</td>
                  <td className="px-4 py-2">{String(p.retailer || '—')}</td>
                  <td className="px-4 py-2 text-xs">
                    {fac
                      ? `${String(fac.name)} (${String(fac.country_code || '')})`
                      : 'External / CSV'}
                  </td>
                  <td className="px-4 py-2 text-xs">{hasInvoice ? 'On file' : '—'}</td>
                </tr>
              );
            })}
            {!list.isLoading && !(list.data?.packages ?? []).length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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
