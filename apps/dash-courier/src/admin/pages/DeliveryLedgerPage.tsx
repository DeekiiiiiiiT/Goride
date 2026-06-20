import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listDeliveryLedger } from '../services/courierAdminService';
import type { CourierDeliveryLedgerRow } from '@roam/types/courier';

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(n);
}

export function DeliveryLedgerPage() {
  const { session } = useOutletContext<{ session: Session }>();
  const token = session.access_token;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CourierDeliveryLedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listDeliveryLedger(token, {
        page,
        limit: 50,
        q: q.trim() || undefined,
        status: status || undefined,
      });
      setRows(res.deliveries);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load ledger');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, page, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Delivery ledger</h2>
        <p className="text-sm text-slate-400 mt-1">Platform delivery orders ({total} total)</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            placeholder="Search delivery address…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="in_transit">In transit</option>
          <option value="picked_up">Picked up</option>
          <option value="ready">Ready</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Courier</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3 text-white">{r.order_number}</td>
                  <td className="px-4 py-3 text-slate-400">{r.courier_display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{r.merchant_name ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-slate-300">{r.status}</td>
                  <td className="px-4 py-3">{formatMoney(r.total)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatWhen(r.placed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm text-slate-500">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-slate-700 rounded disabled:opacity-40">Prev</button>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-slate-700 rounded disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
