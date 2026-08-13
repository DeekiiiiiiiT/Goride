import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useDeletePackage, usePackage, usePipelineDashboard } from '@/app/hooks/useFreight';
import { useWarehouseCourierLinks } from '@/app/hooks/useWarehouseCourierLinks';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { freightService } from '@/app/services/freightService';
import { CreatePreAlertOverlay, PreAlertsPage } from '@/app/freight/os/PreAlertsPage';
import { PreAlertChooser, type PreAlertEntry } from '@/app/freight/os/PreAlertChooser';
import { InvoiceAuditQueuePage } from '@/app/freight/os/InvoiceAuditQueuePage';
import { FREIGHT_FORWARDER_PATH, isFreightForwarderPath } from '@/app/productDoor';

const PACKAGE_DELETE_LOCKED = new Set([
  'manifested',
  'in_transit_intl',
  'customs_hold',
  'customs_cleared',
]);

type WorkspaceTab = 'all' | 'expected' | 'needs-invoice';

function parseTab(raw: string | null): WorkspaceTab {
  if (raw === 'expected' || raw === 'needs-invoice') return raw;
  return 'all';
}

/** Tabbed package hub: All | Expected | Needs invoice. */
export function PackagesWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [createEntry, setCreateEntry] = useState<PreAlertEntry | 'chooser'>('chooser');

  function openCreate(entry: PreAlertEntry | 'chooser' = 'chooser') {
    setCreateEntry(entry);
    setCreateOpen(true);
  }
  const requestedTab = parseTab(params.get('tab'));
  const { organizationId, session } = useAuth();
  const { isModuleEnabled } = useModuleAccess();
  const { canAccessModule } = useSeatAccess();
  const showNeedsInvoice =
    isModuleEnabled('freight_invoice_audit') && canAccessModule('freight_invoice_audit');
  const tab: WorkspaceTab =
    requestedTab === 'needs-invoice' && !showNeedsInvoice ? 'all' : requestedTab;

  const pipelineQ = useQuery({
    queryKey: ['freight', 'pipeline-command', organizationId],
    queryFn: () => freightService.pipelineCommand(organizationId),
    enabled: Boolean(session),
  });

  const expectedCount = pipelineQ.data?.counts?.expected ?? 0;
  const allCount = Object.values(pipelineQ.data?.counts ?? {}).reduce(
    (sum, n) => sum + Number(n || 0),
    0,
  );
  const needsInvoiceCount =
    pipelineQ.data?.needsYou?.find((i) => i.key === 'needs_invoice')?.count ?? 0;

  function setTab(next: WorkspaceTab) {
    setParams(next === 'all' ? {} : { tab: next }, { replace: true });
  }

  useEffect(() => {
    if (requestedTab === 'needs-invoice' && !showNeedsInvoice) {
      setParams({}, { replace: true });
    }
  }, [requestedTab, showNeedsInvoice, setParams]);

  const tabs: { id: WorkspaceTab; label: string; badge?: number; hidden?: boolean }[] = [
    { id: 'all', label: 'All', badge: allCount },
    { id: 'expected', label: 'Expected', badge: expectedCount },
    {
      id: 'needs-invoice',
      label: 'Needs invoice',
      badge: needsInvoiceCount,
      hidden: !showNeedsInvoice,
    },
  ];

  const attentionBits: { label: string; tab: WorkspaceTab; count: number }[] = [];
  if (needsInvoiceCount > 0 && showNeedsInvoice) {
    attentionBits.push({
      label: 'Needs invoice',
      tab: 'needs-invoice',
      count: needsInvoiceCount,
    });
  }
  if (expectedCount > 0) {
    attentionBits.push({ label: 'Expected', tab: 'expected', count: expectedCount });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Packages</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tell us a parcel is coming before it arrives.
          </p>
          {attentionBits.length > 0 && (
            <p className="mt-2 text-sm text-slate-700">
              Needs you:{' '}
              {attentionBits.map((bit, i) => (
                <span key={bit.tab}>
                  {i > 0 ? ' · ' : null}
                  <button
                    type="button"
                    onClick={() => setTab(bit.tab)}
                    className="font-semibold text-amber-800 underline"
                  >
                    {bit.label} ({bit.count})
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => openCreate('chooser')}
          className="min-h-11 rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Create pre-alert
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                tab === t.id
                  ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
              {t.badge != null && t.badge > 0 ? (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-950">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
      </div>

      {tab === 'all' && (
        <AllPackagesPanel onCreatePreAlert={(entry) => openCreate(entry ?? 'chooser')} />
      )}
      {tab === 'expected' && (
        <PreAlertsPage embedded onCreatePreAlert={(entry) => openCreate(entry)} />
      )}
      {tab === 'needs-invoice' && showNeedsInvoice && <InvoiceAuditQueuePage embedded />}

      {createOpen ? (
        <CreatePreAlertOverlay
          key={createEntry}
          initialEntry={createEntry}
          onClose={() => {
            setCreateOpen(false);
            setCreateEntry('chooser');
          }}
        />
      ) : null}
    </div>
  );
}

/** All-packages table (hub panel or warehouse list). */
export function AllPackagesPanel({
  onCreatePreAlert,
  warehouseMode = false,
}: {
  onCreatePreAlert?: (entry?: PreAlertEntry) => void;
  warehouseMode?: boolean;
}) {
  const navigate = useNavigate();
  const { organizationId, session } = useAuth();
  const dash = usePipelineDashboard();
  const linksQ = useWarehouseCourierLinks();

  const packagesQ = useQuery({
    queryKey: [
      'freight',
      'packages',
      organizationId,
      warehouseMode ? 'warehouse-floor' : 'all',
    ],
    queryFn: () =>
      freightService.listPackages(
        organizationId,
        undefined,
        warehouseMode ? { scope: 'warehouse' } : undefined,
      ),
    enabled: Boolean(session),
  });
  const deletePkg = useDeletePackage();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    tracking: string;
  } | null>(null);

  async function confirmDeletePackage() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deletePkg.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  }

  const courierNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const link of linksQ.data?.links ?? []) {
      const courierId = String(link.courier_org_id ?? link.courier_org?.id ?? '');
      if (!courierId) continue;
      map[courierId] = link.is_self
        ? 'In-house'
        : String(link.courier_org?.name || 'Courier');
    }
    return map;
  }, [linksQ.data?.links]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  const counts = dash.data?.counts ?? {};
  const packages = packagesQ.data?.packages ?? [];
  const { isLoading, error } = packagesQ;

  return (
    <div className="space-y-6">
      {!warehouseMode ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(counts)
            .slice(0, 10)
            .map(([status, n]) => {
              const quiet = Number(n) === 0;
              return (
                <div
                  key={status}
                  className={`rounded-xl border px-3 py-2 ${
                    quiet
                      ? 'border-slate-100 bg-slate-50/80 opacity-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {status.replace(/_/g, ' ')}
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{n}</p>
                </div>
              );
            })}
        </div>
      ) : null}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}
      {deleteError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </p>
      )}

      {!isLoading && !error && packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10">
          <p className="text-center text-sm font-medium text-slate-800">No packages yet</p>
          <p className="mt-1 text-center text-sm text-slate-500">
            {warehouseMode
              ? 'Scan at Receive Station to put packages on the floor.'
              : 'Tell us a parcel is coming before it arrives.'}
          </p>
          {warehouseMode ? (
            <div className="mt-4 text-center">
              <Link
                to={`${FREIGHT_FORWARDER_PATH}/receive`}
                className="inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
              >
                Open Receive Station
              </Link>
            </div>
          ) : onCreatePreAlert ? (
            <div className="mx-auto mt-4 max-w-lg">
              <PreAlertChooser onPick={(entry) => onCreatePreAlert(entry)} />
            </div>
          ) : (
            <div className="mt-4 text-center">
              <Link
                to="/app/packages?tab=expected"
                className="inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
              >
                Create pre-alert
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Tracking</th>
                {warehouseMode ? <th className="px-4 py-2">Courier</th> : null}
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Suite</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Weight</th>
                <th className="px-4 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => {
                const suite = p.suites as { suite_code?: string } | null;
                const order = p.retail_orders as {
                  external_order_number?: string | null;
                } | null;
                const ownerId = String(p.owner_org_id ?? p.organization_id ?? '');
                const tracking = String(p.courier_tracking_number || 'No tracking yet');
                const locked = PACKAGE_DELETE_LOCKED.has(String(p.status));
                return (
                  <tr
                    key={String(p.id)}
                    className={`${warehouseMode ? '' : 'cursor-pointer'} border-b border-slate-50 hover:bg-slate-50`}
                    onClick={() => {
                      if (!warehouseMode) navigate(`/app/packages/${p.id}`);
                    }}
                  >
                    <td className="px-4 py-3">
                      {warehouseMode ? (
                        <span className="font-mono text-xs">{tracking.slice(0, 24)}</span>
                      ) : (
                        <Link
                          to={`/app/packages/${p.id}`}
                          className="block min-h-11 py-2 font-medium text-amber-800 underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {tracking.slice(0, 24)}
                        </Link>
                      )}
                    </td>
                    {warehouseMode ? (
                      <td className="px-4 py-3">{courierNames[ownerId] ?? '—'}</td>
                    ) : null}
                    <td className="px-4 py-3 font-mono text-xs">
                      {order?.external_order_number || '—'}
                    </td>
                    <td className="px-4 py-3">{suite?.suite_code || '—'}</td>
                    <td className="px-4 py-3">{String(p.status).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      {p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          title={
                            locked
                              ? 'Locked after manifesto / customs'
                              : 'Delete package'
                          }
                          disabled={locked || deletePkg.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteError(null);
                            setPendingDelete({
                              id: String(p.id),
                              tracking: tracking || 'this package',
                            });
                          }}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setPendingDelete(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-package-title"
            className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id="delete-package-title" className="text-base font-semibold text-slate-900">
                  Delete package
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">This cannot be undone.</p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-slate-700">
                Delete{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {pendingDelete.tracking}
                </span>
                ?
              </p>
              {deleteError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletePkg.isPending}
                  onClick={() => void confirmDeletePackage()}
                  className="min-h-11 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {deletePkg.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Freight Forwarder floor list — panel + simple title (no hub tabs). */
export function PackagesListPage({ warehouseMode }: { warehouseMode?: boolean } = {}) {
  const location = useLocation();
  const isWarehouse = warehouseMode ?? isFreightForwarderPath(location.pathname);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isWarehouse ? 'Floor packages' : 'Packages'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isWarehouse
              ? 'Packages on this freight forwarder floor, tagged by courier.'
              : 'International mailbox parcels — pre-alert through delivery.'}
          </p>
        </div>
        {isWarehouse ? (
          <Link
            to={`${FREIGHT_FORWARDER_PATH}/receive`}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Open Receive Station
          </Link>
        ) : null}
      </div>
      <AllPackagesPanel warehouseMode={isWarehouse} />
    </div>
  );
}

/** Retired from /app/packages/:id routing — kept for reference / accidental imports. */
export function PackageDetailPage() {
  const { id } = useParams();
  const { data, isLoading, error } = usePackage(id);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {(error as Error).message}
      </p>
    );
  }
  if (!data?.package) return <p>Not found</p>;
  const p = data.package;
  const suite = p.suites as { suite_code?: string } | null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/packages" className="text-sm text-slate-500 hover:underline">
          ← Packages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {String(p.courier_tracking_number || p.id)}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {suite?.suite_code || 'No suite'} · {String(p.status).replace(/_/g, ' ')}
        </p>
      </div>

      <dl className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Description</dt>
          <dd className="font-medium">{String(p.description || '—')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Retailer</dt>
          <dd className="font-medium">{String(p.retailer || '—')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Weight</dt>
          <dd className="font-medium">{p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Dimensions (in)</dt>
          <dd className="font-medium">
            {p.length_in != null || p.width_in != null || p.height_in != null
              ? `${p.length_in ?? '—'} × ${p.width_in ?? '—'} × ${p.height_in ?? '—'}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Fulfillment</dt>
          <dd className="font-medium">{String(p.fulfillment_mode || '—').replace(/_/g, ' ')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Assignee preference</dt>
          <dd className="font-medium">
            {String(p.preferred_assignee_type || '—').replace(/_/g, ' ')}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Delivery address</dt>
          <dd className="font-medium">{String(p.delivery_address || '—')}</dd>
        </div>
      </dl>
    </div>
  );
}
