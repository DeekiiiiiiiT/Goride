import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';

type Outstanding = {
  warehouse_org_id: string;
  courier_org_id: string;
  warehouse_name: string;
  courier_name: string;
  totalMinor: number;
  currency: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  total_minor: number;
  currency: string;
  period_start: string;
  period_end: string;
  warehouse_name: string;
  courier_name: string;
};

function money(minor: number, currency = 'USD') {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function AdminStorageBillingPage({ accessToken }: { accessToken: string }) {
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/storage-billing`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setOutstanding((json.outstanding as Outstanding[]) || []);
      setInvoices((json.invoices as Invoice[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Storage billing</h2>
        <p className="mt-1 text-sm text-slate-500">
          Outstanding unbilled storage and issued invoices across all freight forwarders.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold">
              Unbilled
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Freight forwarder</th>
                  <th className="px-4 py-2">Courier</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      Nothing outstanding.
                    </td>
                  </tr>
                ) : null}
                {outstanding.map((o) => (
                  <tr
                    key={`${o.warehouse_org_id}:${o.courier_org_id}`}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-2.5">{o.warehouse_name || '—'}</td>
                    <td className="px-4 py-2.5">{o.courier_name || '—'}</td>
                    <td className="px-4 py-2.5">{money(o.totalMinor, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold">
              Invoices
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Freight forwarder</th>
                  <th className="px-4 py-2">Courier</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No invoices yet.
                    </td>
                  </tr>
                ) : null}
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-4 py-2.5">{i.warehouse_name}</td>
                    <td className="px-4 py-2.5">{i.courier_name}</td>
                    <td className="px-4 py-2.5">{money(Number(i.total_minor), i.currency)}</td>
                    <td className="px-4 py-2.5 capitalize">{i.status.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
