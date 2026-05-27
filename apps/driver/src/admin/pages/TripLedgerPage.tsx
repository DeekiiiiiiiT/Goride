import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoneyMinor } from '@roam/types/rides';
import { listPlatformLedgerTrips, type PlatformLedgerTripRow } from '../services/driverAdminService';

interface OutletContext {
  session: Session;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function TripLedgerPage() {
  const { session } = useOutletContext<OutletContext>();
  const token = session.access_token;

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<PlatformLedgerTripRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [lineKind, setLineKind] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listPlatformLedgerTrips(token, {
        page,
        limit: 50,
        q: q.trim() || undefined,
        status: status || undefined,
        payment_method: paymentMethod === 'cash' || paymentMethod === 'card' ? paymentMethod : undefined,
        line_kind: lineKind || undefined,
      });
      setTrips(res.trips);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load trip ledger');
      setTrips([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, page, q, status, paymentMethod, lineKind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Trip ledger</h2>
        <p className="text-sm text-slate-400 mt-1">
          Roam platform trips with payment line breakdown ({total} total)
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            placeholder="Search pickup address…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500"
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
          <option value="on_trip">On trip</option>
          <option value="matching">Matching</option>
        </select>
        <select
          value={paymentMethod}
          onChange={(e) => {
            setPage(1);
            setPaymentMethod(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
        >
          <option value="">All payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
        </select>
        <select
          value={lineKind}
          onChange={(e) => {
            setPage(1);
            setLineKind(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
        >
          <option value="">All line kinds</option>
          <option value="fare_earning">Fare earning</option>
          <option value="tip">Tip</option>
          <option value="platform_fee">Platform fee</option>
          <option value="trip_cancelled">Trip cancelled</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        ) : trips.length === 0 ? (
          <p className="text-center py-12 text-slate-500 text-sm">No trips found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="px-2 py-3 w-8" />
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pickup</th>
                <th className="px-4 py-3">Dropoff</th>
                <th className="px-4 py-3">Gross fare</th>
                <th className="px-4 py-3">Driver net</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Lines</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const expanded = expandedId === t.id;
                const lines = t.ledger_lines ?? [];
                return (
                  <React.Fragment key={t.id}>
                    <tr
                      className="border-b border-slate-800/80 hover:bg-slate-900/50 cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                    >
                      <td className="px-2 py-3 text-slate-500">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {formatWhen(t.completed_at ?? t.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {t.assigned_driver_user_id ? (
                          <Link
                            to={`/users/${t.assigned_driver_user_id}`}
                            className="text-violet-300 hover:text-violet-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t.driver_display_name ?? t.assigned_driver_user_id.slice(0, 8)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 capitalize">
                        {t.status.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3 text-slate-400 truncate max-w-[180px]">
                        {t.pickup_address ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 truncate max-w-[180px]">
                        {t.dropoff_address ?? '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoneyMinor(t.fare_final_minor ?? t.fare_estimate_minor, t.currency)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-emerald-400">
                        {t.driver_net_minor != null
                          ? formatMoneyMinor(t.driver_net_minor, t.currency)
                          : formatMoneyMinor(t.fare_final_minor ?? t.fare_estimate_minor, t.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 capitalize">
                        {t.payment_method ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 tabular-nums">
                        {t.ledger_line_count ?? lines.length ?? 0}
                      </td>
                    </tr>
                    {expanded && lines.length > 0 && (
                      <tr className="bg-slate-900/40">
                        <td colSpan={10} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 text-left">
                                <th className="py-1 pr-4">Kind</th>
                                <th className="py-1 pr-4">Description</th>
                                <th className="py-1 pr-4 text-right">Paid to driver</th>
                                <th className="py-1 text-right">Gross</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line) => (
                                <tr key={line.id} className="text-slate-400">
                                  <td className="py-1 pr-4">{line.line_kind}</td>
                                  <td className="py-1 pr-4">{line.description}</td>
                                  <td className="py-1 pr-4 text-right tabular-nums">
                                    {formatMoneyMinor(line.paid_to_you_minor, t.currency)}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {formatMoneyMinor(line.earnings_gross_minor, t.currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 50 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
