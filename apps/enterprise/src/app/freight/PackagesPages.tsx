import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { usePackage, usePackages, usePipelineDashboard } from '@/app/hooks/useFreight';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { freightService } from '@/app/services/freightService';
import { CreatePreAlertOverlay, PreAlertsPage } from '@/app/freight/os/PreAlertsPage';
import { InvoiceAuditQueuePage } from '@/app/freight/os/InvoiceAuditQueuePage';

type WorkspaceTab = 'all' | 'expected' | 'needs-invoice';

function parseTab(raw: string | null): WorkspaceTab {
  if (raw === 'expected' || raw === 'needs-invoice') return raw;
  return 'all';
}

/** Tabbed package hub: All | Expected | Needs invoice. */
export function PackagesWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
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
    { id: 'all', label: 'All' },
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
            International mailbox parcels — pre-alert through invoice ready.
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
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
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
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
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

      {tab === 'all' && <AllPackagesPanel onCreatePreAlert={() => setCreateOpen(true)} />}
      {tab === 'expected' && <PreAlertsPage embedded />}
      {tab === 'needs-invoice' && showNeedsInvoice && <InvoiceAuditQueuePage embedded />}

      {createOpen ? <CreatePreAlertOverlay onClose={() => setCreateOpen(false)} /> : null}
    </div>
  );
}

/** All-packages table (hub panel or warehouse list). */
export function AllPackagesPanel({
  onCreatePreAlert,
}: {
  onCreatePreAlert?: () => void;
}) {
  const dash = usePipelineDashboard();
  const { data, isLoading, error } = usePackages();
  const counts = dash.data?.counts ?? {};
  const packages = data?.packages ?? [];

  return (
    <div className="space-y-6">
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

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">No packages yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create a pre-alert so inbound parcels show up before they arrive.
          </p>
          {onCreatePreAlert ? (
            <button
              type="button"
              onClick={onCreatePreAlert}
              className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Create pre-alert
            </button>
          ) : (
            <Link
              to="/app/packages?tab=expected"
              className="mt-4 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Create pre-alert
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Tracking</th>
                <th className="px-4 py-2">Suite</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Weight</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => {
                const suite = p.suites as { suite_code?: string } | null;
                return (
                  <tr key={String(p.id)} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        to={`/app/packages/${p.id}`}
                        className="font-medium text-amber-800 underline"
                      >
                        {String(p.courier_tracking_number || p.id).slice(0, 24)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{suite?.suite_code || '—'}</td>
                    <td className="px-4 py-2">{String(p.status).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2">
                      {p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Warehouse list — panel + simple title (no hub tabs). */
export function PackagesListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Packages</h1>
        <p className="mt-1 text-sm text-slate-500">
          International mailbox parcels — pre-alert through delivery.
        </p>
      </div>
      <AllPackagesPanel />
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
