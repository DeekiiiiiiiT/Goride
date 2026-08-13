import { useMemo, useState } from 'react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { freightService } from '@/app/services/freightService';
import { useWarehouseCourierLinks } from '@/app/hooks/useWarehouseCourierLinks';

function money(minor: number, currency = 'USD') {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

/** Storage / handling statements and invoices (paid offline — no gateway). */
export function WarehouseBillingStatementPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const linksQ = useWarehouseCourierLinks();
  const [courierOrgId, setCourierOrgId] = useState('');
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const statement = useQuery({
    queryKey: ['warehouse-billing-statement', organizationId, courierOrgId || 'all'],
    enabled: Boolean(organizationId),
    queryFn: () => freightService.warehouseBillingStatement(organizationId, courierOrgId || null, true),
  });
  const invoicesQ = useQuery({
    queryKey: ['warehouse-billing-invoices', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => freightService.listWarehouseStorageInvoices(organizationId),
  });

  const accrue = useMutation({
    mutationFn: () => freightService.accrueWarehouseStorage(organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-billing-statement'] });
    },
  });
  const issue = useMutation({
    mutationFn: () =>
      freightService.issueWarehouseStorageInvoice(
        { courierOrgId, periodStart, periodEnd },
        organizationId,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-billing-statement'] });
      void qc.invalidateQueries({ queryKey: ['warehouse-billing-invoices'] });
    },
  });
  const markPaid = useMutation({
    mutationFn: (id: string) => freightService.markWarehouseStorageInvoicePaid(id, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-billing-invoices'] });
    },
  });

  const couriers = useMemo(
    () =>
      (linksQ.data?.links ?? []).filter(
        (l) => String(l.status) === 'active' && !l.is_self,
      ),
    [linksQ.data?.links],
  );
  const lines = statement.data?.lines ?? [];
  const total = statement.data?.totalMinor ?? 0;
  const invoices = invoicesQ.data?.invoices ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Storage billing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Charge couriers for receive and storage days. Mark invoices paid when you collect offline.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-800">
          Courier
          <select
            value={courierOrgId}
            onChange={(e) => setCourierOrgId(e.target.value)}
            className="mt-1 block min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All open charges</option>
            {couriers.map((l) => (
              <option key={String(l.id)} value={String(l.courier_org_id)}>
                {l.courier_org?.name || String(l.courier_org_id).slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => accrue.mutate()}
          disabled={accrue.isPending}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
        >
          {accrue.isPending ? 'Counting…' : 'Count today’s storage'}
        </button>
        <label className="text-sm text-slate-700">
          From
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          To
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={issue.isPending || !courierOrgId}
          onClick={() => issue.mutate()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {issue.isPending ? 'Issuing…' : 'Issue invoice'}
        </button>
      </div>

      {(accrue.error || issue.error || markPaid.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {((accrue.error || issue.error || markPaid.error) as Error).message}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          Unbilled total:{' '}
          <span className="font-semibold text-slate-900">
            {money(total, statement.data?.currency || 'USD')}
          </span>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No unbilled lines. Set storage prices on Courier partners, then receive boxes.
                </td>
              </tr>
            )}
            {lines.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100">
                <td className="px-4 py-2">{String(row.occurred_on)}</td>
                <td className="px-4 py-2 capitalize">{String(row.event_type).replace(/_/g, ' ')}</td>
                <td className="px-4 py-2">
                  {money(
                    Number(row.unit_amount_minor || 0) * Number(row.quantity || 0),
                    String(row.currency || 'USD'),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">Invoices</h2>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Number</th>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No invoices yet.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={String(inv.id)} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs">{String(inv.invoice_number)}</td>
                <td className="px-4 py-2 text-slate-600">
                  {String(inv.period_start)} → {String(inv.period_end)}
                </td>
                <td className="px-4 py-2">
                  {money(Number(inv.total_minor || 0), String(inv.currency || 'USD'))}
                </td>
                <td className="px-4 py-2 capitalize">{String(inv.status).replace(/_/g, ' ')}</td>
                <td className="px-4 py-2">
                  {String(inv.status) === 'issued' ? (
                    <button
                      type="button"
                      disabled={markPaid.isPending}
                      onClick={() => markPaid.mutate(String(inv.id))}
                      className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white"
                    >
                      Mark paid
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
