import { useAuth } from '@/app/auth/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { freightService } from '@/app/services/freightService';

/** Read-only storage / handling statement scaffold. */
export function WarehouseBillingStatementPage() {
  const { organizationId } = useAuth();
  const q = useQuery({
    queryKey: ['warehouse-billing-statement', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => freightService.warehouseBillingStatement(organizationId),
  });

  const lines = q.data?.lines ?? [];
  const total = q.data?.totalMinor ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Storage billing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scaffold ledger of receive / storage / handoff lines charged to couriers. Amounts
          stay at zero until live pricing is configured.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          Statement total:{' '}
          <span className="font-semibold text-slate-900">
            {(total / 100).toFixed(2)} {q.data?.currency || 'USD'}
          </span>
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">Courier</th>
              <th className="px-4 py-2">Package</th>
              <th className="px-4 py-2">Qty</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No ledger lines yet — receives will start a trail.
                </td>
              </tr>
            )}
            {lines.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100">
                <td className="px-4 py-2">{String(row.occurred_on)}</td>
                <td className="px-4 py-2 capitalize">{String(row.event_type)}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {String(row.courier_org_id).slice(0, 8)}…
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {row.package_id ? String(row.package_id).slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-4 py-2">{String(row.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
