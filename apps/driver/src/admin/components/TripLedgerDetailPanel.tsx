import React from 'react';
import { Link } from 'react-router-dom';
import { formatMoneyMinor, type FareBreakdown } from '@roam/types/rides';
import type { PlatformLedgerTripRow } from '../services/driverAdminService';

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function formatDistance(km: number | null | undefined) {
  if (km == null || Number.isNaN(km)) return '—';
  return `${Number(km).toFixed(1)} km`;
}

function formatDuration(min: number | null | undefined) {
  if (min == null || Number.isNaN(min)) return '—';
  const n = Math.round(min);
  if (n < 1) return '<1 min';
  if (n >= 60) {
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${n} min`;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-300 mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function resolveFareBreakdown(trip: PlatformLedgerTripRow): FareBreakdown | null {
  const raw = trip.fare_final_breakdown ?? trip.fare_breakdown;
  return raw && typeof raw === 'object' ? raw : null;
}

interface TripLedgerDetailPanelProps {
  trip: PlatformLedgerTripRow;
  colSpan: number;
}

export function TripLedgerDetailPanel({ trip, colSpan }: TripLedgerDetailPanelProps) {
  const lines = trip.ledger_lines ?? [];
  const breakdown = resolveFareBreakdown(trip);
  const platformFee = trip.platform_fee_minor;
  const tipMinor = trip.tip_minor;
  const isTerminal = trip.status === 'completed' || trip.status === 'cancelled';

  return (
    <tr className="bg-slate-900/40">
      <td colSpan={colSpan} className="px-6 py-4 border-b border-slate-800/80">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-white">Trip details</h4>
            <span className="text-xs font-mono text-slate-500">{trip.id}</span>
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <DetailField label="Request time" value={formatWhen(trip.created_at)} />
            <DetailField label="Completed" value={formatWhen(trip.completed_at)} />
            <DetailField label="En route to pickup" value={formatWhen(trip.en_route_at)} />
            <DetailField label="Arrived at pickup" value={formatWhen(trip.arrived_pickup_at)} />
            <DetailField label="Trip started" value={formatWhen(trip.trip_started_at)} />
            <DetailField label="Last updated" value={formatWhen(trip.updated_at)} />
            <DetailField
              label="Rider"
              value={
                <Link
                  to={`/users/${trip.rider_user_id}`}
                  className="text-violet-300 hover:text-violet-200 font-mono text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  {trip.rider_user_id.slice(0, 8)}…
                </Link>
              }
            />
            <DetailField label="Vehicle" value={trip.vehicle_option} />
            <DetailField label="Distance (est.)" value={formatDistance(trip.distance_estimate_km)} />
            <DetailField
              label="Duration (est.)"
              value={formatDuration(trip.duration_estimate_minutes ?? null)}
            />
            <DetailField
              label="Surge"
              value={trip.surge_multiplier != null ? `${trip.surge_multiplier}×` : null}
            />
            <DetailField label="Matching wave" value={String(trip.matching_wave ?? 0)} />
            <DetailField
              label="Fare estimate"
              value={formatMoneyMinor(trip.fare_estimate_minor, trip.currency)}
            />
            <DetailField
              label="Fare final"
              value={
                trip.fare_final_minor != null
                  ? formatMoneyMinor(trip.fare_final_minor, trip.currency)
                  : null
              }
            />
            {platformFee != null && platformFee > 0 && (
              <DetailField
                label="Platform fee"
                value={formatMoneyMinor(platformFee, trip.currency)}
              />
            )}
            {tipMinor != null && tipMinor > 0 && (
              <DetailField label="Tip" value={formatMoneyMinor(tipMinor, trip.currency)} />
            )}
            {trip.cash_received_minor != null && (
              <DetailField
                label="Cash received"
                value={formatMoneyMinor(trip.cash_received_minor, trip.currency)}
              />
            )}
            {trip.cash_settlement_outcome && (
              <DetailField label="Cash outcome" value={trip.cash_settlement_outcome} />
            )}
            {trip.cash_settlement_status && (
              <DetailField label="Settlement status" value={trip.cash_settlement_status} />
            )}
            {trip.cash_settlement_snapshot && (
              <>
                <DetailField
                  label="Settlement version"
                  value={String(
                    (trip.cash_settlement_snapshot as { settlement_version?: number }).settlement_version ?? '—',
                  )}
                />
                <DetailField
                  label="Debt opened"
                  value={
                    (trip.cash_settlement_snapshot as { debt_opened_minor?: number }).debt_opened_minor != null
                      ? formatMoneyMinor(
                          Number((trip.cash_settlement_snapshot as { debt_opened_minor?: number }).debt_opened_minor),
                          trip.currency,
                        )
                      : null
                  }
                />
              </>
            )}
            {trip.settled_at && (
              <DetailField label="Settled at" value={formatWhen(trip.settled_at)} />
            )}
            <DetailField
              label="Driver net"
              value={
                trip.driver_net_minor != null
                  ? formatMoneyMinor(trip.driver_net_minor, trip.currency)
                  : null
              }
            />
            {trip.status === 'cancelled' && (
              <>
                <DetailField label="Cancelled by" value={trip.cancelled_by ?? '—'} />
                <DetailField label="Cancel reason" value={trip.cancel_reason ?? '—'} />
              </>
            )}
          </dl>

          {breakdown && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                Fare breakdown
              </p>
              <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                <DetailField
                  label="Base fare"
                  value={formatMoneyMinor(breakdown.base_minor, trip.currency)}
                />
                <DetailField
                  label="Booking fee"
                  value={formatMoneyMinor(breakdown.booking_fee_minor, trip.currency)}
                />
                <DetailField
                  label="Distance component"
                  value={formatMoneyMinor(breakdown.distance_component_minor, trip.currency)}
                />
                <DetailField
                  label="Time component"
                  value={formatMoneyMinor(breakdown.time_component_minor, trip.currency)}
                />
                <DetailField
                  label="Subtotal before surge"
                  value={formatMoneyMinor(breakdown.subtotal_before_surge_minor, trip.currency)}
                />
                <DetailField
                  label="After surge"
                  value={formatMoneyMinor(breakdown.after_surge_minor, trip.currency)}
                />
                {breakdown.estimated_tolls_minor != null && breakdown.estimated_tolls_minor > 0 && (
                  <DetailField
                    label="Est. tolls"
                    value={formatMoneyMinor(breakdown.estimated_tolls_minor, trip.currency)}
                  />
                )}
                {breakdown.min_fare_applied && (
                  <DetailField label="Min fare applied" value="Yes" />
                )}
              </dl>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
              Payment ledger lines
            </p>
            {lines.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-left border-b border-slate-800">
                    <th className="py-1.5 pr-4 font-normal">Kind</th>
                    <th className="py-1.5 pr-4 font-normal">Description</th>
                    <th className="py-1.5 pr-4 font-normal">Reported</th>
                    <th className="py-1.5 pr-4 text-right font-normal">Paid to driver</th>
                    <th className="py-1.5 text-right font-normal">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="text-slate-400 border-b border-slate-800/50">
                      <td className="py-1.5 pr-4">{line.line_kind}</td>
                      <td className="py-1.5 pr-4">{line.description}</td>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        {formatWhen(line.reporting_at)}
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">
                        {formatMoneyMinor(line.paid_to_you_minor, trip.currency)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatMoneyMinor(line.earnings_gross_minor, trip.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">
                {isTerminal
                  ? 'No payment lines recorded yet. Run rides ledger backfill for trips completed before the ledger hook, or complete a new trip after deploy.'
                  : 'Payment lines are created when the trip completes or is cancelled.'}
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
