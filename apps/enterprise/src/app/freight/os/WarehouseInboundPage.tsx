import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

/** Warehouse inbound queue — packages at US intake awaiting handoff. */
export function WarehouseInboundPage() {
  const { organizationId, session } = useAuth();
  const q = useQuery({
    queryKey: ['freight', 'packages', organizationId, 'warehouse-inbound'],
    queryFn: () => freightService.listPackages(organizationId),
    enabled: Boolean(session),
  });

  const rows = (q.data?.packages ?? []).filter((p) => {
    const st = String(p.status ?? '');
    return st === 'received_at_warehouse' || st === 'expected';
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inbound</h1>
          <p className="mt-1 text-sm text-slate-500">
            Packages at the warehouse — receive on the floor, flag invoice required, hand off to
            Courier.
          </p>
        </div>
        <Link
          to="/warehouse/receive"
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Open Receive Station
        </Link>
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {q.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(q.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!q.isLoading && rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            No inbound packages yet. Scan at Receive Station to start.
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Tracking</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Invoice required</th>
                <th className="px-4 py-2">Weight</th>
                <th className="px-4 py-2">Bin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={String(p.id)} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {String(p.courier_tracking_number ?? p.id)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {String(p.status ?? '').replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.invoice_required_from_customer ? (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {String(p.bin_location ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
