import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoneyMinor } from '@roam/types/rides';
import type { RideRequestRow } from '@roam/types/rides';
import { AdminCashSettleModal } from '../components/AdminCashSettleModal';
import { AdminCashTripActions } from '../components/AdminCashTripActions';
import {
  adminForceCompleteRide,
  adminReleaseCashSettlement,
  adminSettleCashRide,
  listPlatformLedgerTrips,
  type PlatformLedgerTripRow,
} from '../services/ridesAdminService';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [lineKind, setLineKind] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [settleRide, setSettleRide] = useState<RideRequestRow | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listPlatformLedgerTrips(token, {
        page,
        limit: 50,
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
  }, [token, page, status, paymentMethod, lineKind]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRelease = async (trip: PlatformLedgerTripRow) => {
    if (
      !window.confirm(
        `Release ride ${trip.id.slice(0, 8)}… to cash settlement? Driver must enter cash received.`,
      )
    ) {
      return;
    }
    setActingId(trip.id);
    try {
      await adminReleaseCashSettlement(token, trip.id);
      toast.success('Released to cash settlement');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Release failed');
    } finally {
      setActingId(null);
    }
  };

  const runCompleteCard = async (trip: PlatformLedgerTripRow) => {
    if (
      !window.confirm(
        `Mark ride ${trip.id.slice(0, 8)}… completed? Use only if the passenger was dropped off.`,
      )
    ) {
      return;
    }
    setActingId(trip.id);
    try {
      await adminForceCompleteRide(token, trip.id);
      toast.success('Ride marked completed');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setActingId(null);
    }
  };

  const runSettle = async (cashReceivedMinor: number) => {
    if (!settleRide) return;
    setActingId(settleRide.id);
    try {
      const result = await adminSettleCashRide(token, settleRide.id, cashReceivedMinor);
      toast.success(
        result.cash_settlement
          ? `Settled (${result.cash_settlement.outcome})`
          : 'Ride settled and completed',
      );
      setSettleRide(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Settle failed');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Trip ledger</h2>
        <p className="text-sm text-slate-400 mt-1">
          Passenger-side payment history ({total} trips)
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="awaiting_cash_settlement">Awaiting cash settlement</option>
          <option value="on_trip">On trip</option>
        </select>
        <select
          value={paymentMethod}
          onChange={(e) => {
            setPage(1);
            setPaymentMethod(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
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
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
        >
          <option value="">All line kinds</option>
          <option value="fare_earning">Fare earning</option>
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
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Pickup</th>
                <th className="px-4 py-3">Charged</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const expanded = expandedId === t.id;
                const lines = t.ledger_lines ?? [];
                const showOps =
                  t.status === 'awaiting_cash_settlement' || t.status === 'on_trip';
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
                        <Link
                          to={`/admin/users/${t.rider_user_id}`}
                          className="text-violet-300 hover:text-violet-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.rider_user_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                        {t.assigned_driver_user_id?.slice(0, 8) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]">
                        {t.pickup_address ?? '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoneyMinor(t.fare_final_minor ?? t.fare_estimate_minor, t.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 capitalize">
                        {t.payment_method ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 capitalize">
                        {t.status.replace(/_/g, ' ')}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-900/40">
                        <td colSpan={8} className="px-6 py-3 space-y-3">
                          {showOps && (
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xs text-amber-300/90">
                                {t.status === 'awaiting_cash_settlement'
                                  ? 'Cash settlement pending — settle with the amount received, or let the driver confirm in the app.'
                                  : 'Ride on trip — release to cash settlement after drop-off, or complete for card trips.'}
                              </p>
                              <AdminCashTripActions
                                ride={t}
                                busy={actingId === t.id}
                                onRelease={runRelease}
                                onSettle={setSettleRide}
                                onCompleteCard={runCompleteCard}
                              />
                            </div>
                          )}
                          {lines.length > 0 ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 text-left">
                                  <th className="py-1 pr-4">Kind</th>
                                  <th className="py-1 pr-4">Description</th>
                                  <th className="py-1 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lines.map((line) => (
                                  <tr key={line.id} className="text-slate-400">
                                    <td className="py-1 pr-4">{line.line_kind}</td>
                                    <td className="py-1 pr-4">{line.description}</td>
                                    <td className="py-1 text-right tabular-nums">
                                      {formatMoneyMinor(line.earnings_gross_minor, t.currency)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-slate-500">No ledger lines yet.</p>
                          )}
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

      <AdminCashSettleModal
        ride={settleRide}
        open={settleRide != null}
        submitting={actingId === settleRide?.id}
        onClose={() => setSettleRide(null)}
        onConfirm={runSettle}
      />
    </div>
  );
}
