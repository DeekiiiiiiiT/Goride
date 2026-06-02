import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { AlertTriangle, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import {
  SUPPORT_CANCEL_REASONS,
  forceCancelRide,
  forceCompleteRide,
  getRideAudit,
  getRideById,
  getStuckTrips,
  isFullRideUuid,
  type RideAuditEvent,
  type SupportCancelReasonCode,
  type SupportRideRow,
} from '../services/supportService';

interface OutletContext {
  session: Session;
}

const ACTIVE_STATUSES = new Set([
  'matching',
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
]);

function formatGpsAge(iso: string | null | undefined): string {
  if (!iso) return 'No GPS';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function statusBadgeClass(status: RideRequestRow['status']): string {
  switch (status) {
    case 'on_trip':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'matching':
      return 'bg-amber-500/20 text-amber-300';
    case 'driver_en_route_pickup':
      return 'bg-blue-500/20 text-blue-300';
    case 'driver_arrived_pickup':
      return 'bg-violet-500/20 text-violet-300';
    case 'cancelled':
      return 'bg-red-500/20 text-red-300';
    case 'completed':
      return 'bg-slate-500/20 text-slate-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
}

function auditSummary(event: RideAuditEvent): string {
  const p = event.payload;
  if (!p) return '';
  const parts: string[] = [];
  if (p.from_status && p.to_status) parts.push(`${p.from_status} → ${p.to_status}`);
  if (p.reason) parts.push(String(p.reason));
  if (p.support_reason_code) parts.push(String(p.support_reason_code));
  if (p.from_status && !p.to_status) parts.push(`from ${p.from_status}`);
  return parts.join(' · ');
}

export function SupportToolsPage() {
  const { session } = useOutletContext<OutletContext>();
  const token = session.access_token;

  const [stuckRides, setStuckRides] = useState<SupportRideRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueRefreshing, setQueueRefreshing] = useState(false);

  const [lookupInput, setLookupInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  const [selectedRide, setSelectedRide] = useState<SupportRideRow | null>(null);
  const [auditEvents, setAuditEvents] = useState<RideAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCode, setCancelCode] = useState<SupportCancelReasonCode>('stuck_offline');
  const [cancelNote, setCancelNote] = useState('');
  const [acting, setActing] = useState(false);

  const loadAudit = useCallback(
    async (rideId: string) => {
      if (!token) return;
      setAuditLoading(true);
      try {
        const { events } = await getRideAudit(token, rideId);
        setAuditEvents(events);
      } catch {
        setAuditEvents([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [token],
  );

  const selectRide = useCallback(
    async (ride: SupportRideRow) => {
      setSelectedRide(ride);
      setLookupInput(ride.id);
      await loadAudit(ride.id);
    },
    [loadAudit],
  );

  const loadQueue = useCallback(async () => {
    if (!token) return;
    setQueueRefreshing(true);
    try {
      const { rides } = await getStuckTrips(token, 15);
      setStuckRides(rides);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load stuck trips');
      setStuckRides([]);
    } finally {
      setQueueLoading(false);
      setQueueRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleLookup = async () => {
    const raw = lookupInput.trim();
    if (raw.length < 8) {
      toast.error('Enter at least 8 characters of the ride ID');
      return;
    }
    if (!isFullRideUuid(raw)) {
      toast.error('Enter the full ride UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
      return;
    }
    setLookupLoading(true);
    try {
      const { ride } = await getRideById(token, raw);
      await selectRide(ride);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ride not found');
    } finally {
      setLookupLoading(false);
    }
  };

  const refreshSelected = async () => {
    if (!selectedRide || !token) return;
    try {
      const { ride } = await getRideById(token, selectedRide.id);
      setSelectedRide(ride);
      await loadAudit(ride.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh ride');
    }
  };

  const handleCancel = async () => {
    if (!selectedRide) return;
    const label = SUPPORT_CANCEL_REASONS.find((r) => r.value === cancelCode)?.label ?? cancelCode;
    if (
      !window.confirm(
        `Cancel ride ${selectedRide.id.slice(0, 8)}…?\nReason: ${label}\nThis clears driver on-trip in admin.`,
      )
    ) {
      return;
    }
    setActing(true);
    try {
      const { ride } = await forceCancelRide(token, selectedRide.id, {
        support_reason_code: cancelCode,
        support_note: cancelNote,
      });
      toast.success('Ride cancelled');
      setSelectedRide(ride);
      setCancelOpen(false);
      setCancelNote('');
      await loadAudit(ride.id);
      await loadQueue();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setActing(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedRide || selectedRide.status !== 'on_trip') return;
    if (
      !window.confirm(
        `Mark ride ${selectedRide.id.slice(0, 8)}… completed?\nOnly use if the passenger was dropped off.`,
      )
    ) {
      return;
    }
    setActing(true);
    try {
      const { ride } = await forceCompleteRide(token, selectedRide.id);
      toast.success('Ride marked completed');
      setSelectedRide(ride);
      await loadAudit(ride.id);
      await loadQueue();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setActing(false);
    }
  };

  const isActive = selectedRide ? ACTIVE_STATUSES.has(selectedRide.status) : false;
  const isTerminal =
    selectedRide?.status === 'completed' || selectedRide?.status === 'cancelled';

  return (
    <div className="space-y-8 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Support Tools</h2>
        <p className="text-sm text-slate-400 mt-1">
          Find stuck trips and cancel or complete rides without SQL. All actions are audited.
        </p>
      </div>

      {/* Stuck queue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-white">Stuck trips</h3>
            <span className="text-xs text-slate-500">Active + GPS older than 15 min</span>
          </div>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={queueRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {queueRefreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </button>
        </div>

        {queueLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : stuckRides.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-6 text-center text-sm text-slate-500">
            No stuck trips right now.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Ride</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">GPS</th>
                  <th className="px-4 py-2.5 font-medium">Driver</th>
                  <th className="px-4 py-2.5 font-medium">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {stuckRides.map((ride) => (
                  <tr
                    key={ride.id}
                    className={`border-b border-slate-800/80 cursor-pointer hover:bg-slate-900/40 ${
                      selectedRide?.id === ride.id ? 'bg-violet-500/10' : ''
                    }`}
                    onClick={() => void selectRide(ride)}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                      {ride.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(ride.status)}`}
                      >
                        {ride.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-amber-400 text-xs">
                      {formatGpsAge(ride.last_driver_location_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[140px] truncate">
                      {ride.driver_display_name ?? ride.driver_email ?? ride.assigned_driver_user_id?.slice(0, 8) ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[180px] truncate">
                      {ride.pickup_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lookup */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-white">Trip lookup</h3>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="search"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLookup();
              }}
              placeholder="Full ride UUID…"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/50 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={lookupLoading}
            onClick={() => void handleLookup()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </div>
      </section>

      {/* Intervention */}
      {selectedRide ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-white">Selected trip</h3>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(selectedRide.status)}`}
                >
                  {selectedRide.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="font-mono text-xs text-slate-500 mt-1 break-all">{selectedRide.id}</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshSelected()}
              className="text-xs text-slate-400 hover:text-white"
            >
              Refresh
            </button>
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-[10px] uppercase text-slate-500">Last GPS</dt>
              <dd className="text-amber-300 text-xs mt-0.5">
                {formatGpsAge(selectedRide.last_driver_location_at)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-slate-500">Driver</dt>
              <dd className="text-xs mt-0.5">
                {selectedRide.assigned_driver_user_id ? (
                  <Link
                    to={`/users/${selectedRide.assigned_driver_user_id}`}
                    className="text-violet-300 hover:text-violet-200"
                  >
                    {selectedRide.driver_display_name ?? selectedRide.driver_email ?? 'View driver'}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-slate-500">Trip started</dt>
              <dd className="text-xs text-slate-300 mt-0.5">{formatWhen(selectedRide.trip_started_at)}</dd>
            </div>
            <div className="col-span-2 md:col-span-3">
              <dt className="text-[10px] uppercase text-slate-500">Pickup</dt>
              <dd className="text-xs text-slate-400 mt-0.5">{selectedRide.pickup_address ?? '—'}</dd>
            </div>
            <div className="col-span-2 md:col-span-3">
              <dt className="text-[10px] uppercase text-slate-500">Drop-off</dt>
              <dd className="text-xs text-slate-400 mt-0.5">{selectedRide.dropoff_address ?? '—'}</dd>
            </div>
          </dl>

          {isTerminal ? (
            <p className="text-sm text-slate-500">
              This trip is {selectedRide.status}. No further actions available.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedRide.status === 'on_trip' ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void handleComplete()}
                  className="rounded-lg border border-emerald-700/60 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
                >
                  Mark completed
                </button>
              ) : null}
              {isActive ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setCancelOpen(true)}
                  className="rounded-lg bg-red-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  Cancel trip
                </button>
              ) : null}
            </div>
          )}

          {cancelOpen && isActive ? (
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
              <p className="text-sm font-medium text-white">Cancel reason</p>
              <select
                value={cancelCode}
                onChange={(e) => setCancelCode(e.target.value as SupportCancelReasonCode)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              >
                {SUPPORT_CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder="Optional note for audit log…"
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void handleCancel()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelOpen(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {/* Audit */}
          <div className="border-t border-slate-800 pt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">
              Audit log
            </h4>
            {auditLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            ) : auditEvents.length === 0 ? (
              <p className="text-xs text-slate-600">No audit events for this ride.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {auditEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="text-xs border border-slate-800/80 rounded-lg px-3 py-2 bg-slate-950/30"
                  >
                    <div className="flex justify-between gap-2 text-slate-400">
                      <span className="font-mono text-slate-300">{ev.event_type}</span>
                      <span>{formatWhen(ev.created_at)}</span>
                    </div>
                    {auditSummary(ev) ? (
                      <p className="text-slate-500 mt-1">{auditSummary(ev)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
