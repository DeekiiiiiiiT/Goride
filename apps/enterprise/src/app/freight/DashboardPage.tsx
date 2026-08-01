import { Link } from 'react-router-dom';
import { useFreightDashboard } from '@/app/hooks/useFreight';

const STATUS_ORDER = [
  'draft',
  'booked',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'cancelled',
] as const;

export function DashboardPage() {
  const { data, isLoading, error } = useFreightDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Operations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Jamaica freight overview · America/Jamaica — domestic shipments + intl mailbox pipeline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/packages"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Packages
          </Link>
          <Link
            to="/app/shipments/new"
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            New shipment
          </Link>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading dashboard…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_ORDER.map((status) => (
              <div
                key={status}
                className={`rounded-xl border px-4 py-3 ${
                  status === 'exception'
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {status.replace(/_/g, ' ')}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {data?.counts?.[status] ?? 0}
                </p>
              </div>
            ))}
          </div>
          {(data?.exceptions ?? 0) > 0 && (
            <p className="text-sm font-medium text-red-700">
              {data?.exceptions} shipment(s) in exception — review the shipments list.
            </p>
          )}
          {Object.keys(data?.counts ?? {}).length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">No shipments yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first domestic Jamaica shipment to get started.
              </p>
              <Link
                to="/app/shipments/new"
                className="mt-4 inline-block text-sm font-semibold text-amber-700 underline"
              >
                Create shipment
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
