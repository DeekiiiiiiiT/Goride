import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CourierPresenceMap } from '../components/CourierPresenceMap';
import { listCourierPresence } from '../services/courierAdminService';
import type { CourierPresenceRow } from '@roam/types/courier';

type Filter = 'all' | 'online' | 'on_delivery';

const REFRESH_MS = 15_000;

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return new Date(iso).toLocaleString();
}

function courierLabel(c: CourierPresenceRow): string {
  return c.display_name?.trim() || c.email?.trim() || c.phone?.trim() || `Courier ${c.courier_id.slice(0, 8)}`;
}

export function CourierPresenceManager() {
  const { session } = useOutletContext<{ session: Session }>();
  const token = session.access_token;

  const [couriers, setCouriers] = useState<CourierPresenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listCourierPresence(token, { limit: 200 });
      setCouriers(res.couriers);
      setLastUpdated(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load presence');
      setCouriers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return couriers;
    return couriers.filter((c) => c.live_status === filter);
  }, [couriers, filter]);

  const selected = couriers.find((c) => c.courier_id === selectedId) ?? null;

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            Courier Presence
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Live map from courier_availability GPS. {lastUpdated ? `Updated ${formatWhen(lastUpdated.toISOString())}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {(['all', 'online', 'on_delivery'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              filter === f
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 text-slate-400'
            }`}
          >
            {f === 'all' ? 'All' : f === 'online' ? 'Online' : 'On delivery'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CourierPresenceMap
            couriers={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden max-h-[420px] overflow-y-auto">
          <ul className="divide-y divide-slate-800 text-sm">
            {filtered.map((c) => (
              <li key={c.courier_id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.courier_id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-900/60 ${
                    selectedId === c.courier_id ? 'bg-emerald-500/10' : ''
                  }`}
                >
                  <p className="font-medium text-white">{courierLabel(c)}</p>
                  <p className="text-xs text-slate-500 capitalize mt-0.5">{c.live_status}</p>
                  <p className="text-xs text-slate-600 mt-0.5">Last seen {formatWhen(c.last_seen)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm space-y-1">
          <p className="font-medium text-white">{courierLabel(selected)}</p>
          <p>Status: {selected.live_status}</p>
          {selected.order_id && <p>Active order: {selected.order_id}</p>}
          {selected.delivery_address && <p>Delivery: {selected.delivery_address}</p>}
        </div>
      )}
    </div>
  );
}
