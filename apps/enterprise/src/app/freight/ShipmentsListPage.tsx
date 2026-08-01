import { Link } from 'react-router-dom';
import { useFreightShipments } from '@/app/hooks/useFreight';

export function ShipmentsListPage() {
  const { data, isLoading, error } = useFreightShipments();
  const rows = data?.shipments ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Shipments</h1>
          <p className="mt-1 text-sm text-slate-500">Track bookings, legs, and delivery status.</p>
        </div>
        <Link
          to="/app/shipments/new"
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          New shipment
        </Link>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium">No shipments</p>
          <p className="mt-1 text-sm text-slate-500">Book a multi-leg shipment to start tracking.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      to={`/app/shipments/${row.id}`}
                      className="font-medium text-amber-800 underline-offset-2 hover:underline"
                    >
                      {String(row.reference_code)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {String(row.origin_label)} → {String(row.destination_label)}
                  </td>
                  <td className="px-4 py-3 uppercase text-slate-500">{String(row.mode)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === 'exception'
                          ? 'bg-red-100 text-red-800'
                          : row.status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {String(row.status).replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
