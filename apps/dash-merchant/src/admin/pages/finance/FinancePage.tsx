import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { listDisputes, listPayouts } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function FinancePage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);
  const [disputes, setDisputes] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      listPayouts(session.access_token),
      listDisputes(session.access_token),
    ])
      .then(([p, d]) => {
        setPayouts((p as { payouts: Array<Record<string, unknown>> }).payouts);
        setDisputes((d as { disputes: Array<Record<string, unknown>> }).disputes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session.access_token]);

  if (loading) return <Loader2 className="w-8 h-8 animate-spin text-amber-400" />;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Finance</h2>

      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Payouts</h3>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {payouts.map((p) => (
                <tr key={String(p.id)}>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{String(p.merchant_id).slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-white">${Number(p.amount ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-400">{String(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Disputes</h3>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {disputes.map((d) => (
                <tr key={String(d.id)}>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{String(d.order_id).slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-slate-400">{String(d.reason)}</td>
                  <td className="px-4 py-3 text-slate-400">{String(d.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
