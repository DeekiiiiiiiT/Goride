import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DriverPresenceMap } from '../components/DriverPresenceMap';
import { DriverPresenceActionsPanel } from '../components/DriverPresenceActionsPanel';
import { listDriverPresence, type DriverPresenceRow } from '../services/driverAdminService';
import { canWriteDriverAdmin } from '../utils/driverAdminRoles';

type Filter = 'all' | 'online' | 'on_trip';

const REFRESH_MS = 15_000;

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function LiveBadge({ status }: { status: string }) {
  const styles =
    status === 'online'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'on_trip'
        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
        : 'bg-slate-500/15 text-slate-400 border-slate-600/40';
  const label =
    status === 'on_trip' ? 'On trip' : status === 'online' ? 'Online' : 'Offline';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

function driverLabel(d: DriverPresenceRow): string {
  if (d.display_name?.trim()) return d.display_name.trim();
  if (d.email?.trim()) return d.email.trim();
  if (d.phone?.trim()) return d.phone.trim();
  return `Driver ${d.driver_id.slice(0, 8)}`;
}

function formatTripStatus(status: string | null | undefined): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ');
}

export function DriverPresenceManager() {
  const { session } = useOutletContext<{ session: Session }>();
  const token = session.access_token;
  const canWrite = canWriteDriverAdmin(session.user);

  const [drivers, setDrivers] = useState<DriverPresenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listDriverPresence(token, { limit: 200 });
      setDrivers(res.drivers);
      setLastUpdated(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load driver presence');
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'online') return drivers.filter((d) => d.live_status === 'online');
    if (filter === 'on_trip') return drivers.filter((d) => d.live_status === 'on_trip');
    return drivers;
  }, [drivers, filter]);

  const counts = useMemo(
    () => ({
      all: drivers.length,
      online: drivers.filter((d) => d.live_status === 'online').length,
      on_trip: drivers.filter((d) => d.live_status === 'on_trip').length,
    }),
    [drivers],
  );

  const mapDrivers = filtered.filter((d) => d.lat != null && d.lng != null);
  const selectedDriver = selectedId ? drivers.find((d) => d.driver_id === selectedId) ?? null : null;

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            Driver Presence
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Live driver locations, trip status, and ops controls. Refreshes every 15 seconds.
          </p>
          {lastUpdated && (
            <p className="text-xs text-slate-600 mt-1">
              Last updated {formatWhen(lastUpdated.toISOString())}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', `All (${counts.all})`],
            ['online', `Online (${counts.online})`],
            ['on_trip', `On trip (${counts.on_trip})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              filter === id
                ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
                : 'text-slate-400 border-slate-800 hover:bg-slate-800/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-3">
          <DriverPresenceMap
            drivers={mapDrivers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            height="440px"
          />
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Online
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-400" /> On trip
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Offline / stale
            </span>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden flex flex-col max-h-[560px]">
          {loading && drivers.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <MapPin className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No drivers in this view.</p>
              <p className="text-xs text-slate-600 mt-2">
                Drivers appear here when they go online in the driver app and report GPS location.
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-slate-800 overflow-y-auto flex-1 min-h-0">
                {filtered.map((d) => {
                  const name = driverLabel(d);
                  const selected = selectedId === d.driver_id;
                  return (
                    <li key={d.driver_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.driver_id)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-colors ${
                          selected ? 'bg-violet-500/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-white truncate text-sm">{name}</p>
                          <LiveBadge status={d.live_status} />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatWhen(d.last_seen)}
                          {d.live_status === 'on_trip' && d.trip_status
                            ? ` · ${formatTripStatus(d.trip_status)}`
                            : ''}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selectedDriver ? (
                <DriverPresenceActionsPanel
                  driver={selectedDriver}
                  token={token}
                  canWrite={canWrite}
                  onRefresh={() => void load()}
                />
              ) : (
                <div className="border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-600">
                  Select a driver to view trip details and admin controls.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
