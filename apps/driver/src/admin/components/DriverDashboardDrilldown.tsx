import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverComplianceRow, DriverDirectoryRow, DriverLiveStatus } from '@roam/types/driver';
import { listComplianceQueue, listDrivers } from '../services/driverAdminService';
import { ComplianceQueueTableCompact } from './ComplianceQueueTable';

export type DriverDashboardTab = 'total' | 'online' | 'on_trip' | 'active' | 'compliance';

const TAB_META: Record<
  DriverDashboardTab,
  { label: string; description: string }
> = {
  total: {
    label: 'All drivers',
    description: 'Every registered driver account.',
  },
  online: {
    label: 'Online now',
    description: 'Available for dispatch (recent GPS, not on a trip).',
  },
  on_trip: {
    label: 'On trip',
    description: 'Drivers with an active ride in progress.',
  },
  active: {
    label: 'Active drivers',
    description: 'Onboarded accounts with active status.',
  },
  compliance: {
    label: 'Compliance queue',
    description: 'Drivers awaiting activation or with compliance blockers.',
  },
};

const LIST_LIMIT = 100;

function LiveBadge({ status }: { status: DriverLiveStatus }) {
  const styles =
    status === 'online'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'on_trip'
        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
        : 'bg-slate-500/15 text-slate-400 border-slate-600/40';
  const label = status === 'on_trip' ? 'On trip' : status === 'online' ? 'Online' : 'Offline';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

type Props = {
  accessToken: string;
  activeTab: DriverDashboardTab;
  onTabChange: (tab: DriverDashboardTab) => void;
};

export function DriverDashboardDrilldown({ accessToken, activeTab, onTabChange }: Props) {
  const [drivers, setDrivers] = useState<DriverDirectoryRow[]>([]);
  const [complianceRows, setComplianceRows] = useState<DriverComplianceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      if (activeTab === 'compliance') {
        const res = await listComplianceQueue(accessToken, { limit: LIST_LIMIT });
        setComplianceRows(res.drivers);
        setDrivers([]);
        return;
      }

      let rows: DriverDirectoryRow[] = [];
      if (activeTab === 'online') {
        const res = await listDrivers(accessToken, { live_status: 'online', limit: LIST_LIMIT, sort: 'last_ride' });
        rows = res.drivers;
      } else if (activeTab === 'on_trip') {
        const res = await listDrivers(accessToken, { live_status: 'on_trip', limit: LIST_LIMIT, sort: 'last_ride' });
        rows = res.drivers;
      } else if (activeTab === 'active') {
        const res = await listDrivers(accessToken, {
          status: 'active',
          onboarding: 'complete',
          limit: LIST_LIMIT,
          sort: 'last_ride',
        });
        rows = res.drivers;
      } else {
        const res = await listDrivers(accessToken, { limit: LIST_LIMIT, sort: 'signup' });
        rows = res.drivers;
      }
      setDrivers(rows);
      setComplianceRows([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load driver list');
      setDrivers([]);
      setComplianceRows([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeTab]);

  useEffect(() => {
    void load();
  }, [load]);

  const meta = TAB_META[activeTab];
  const rowCount = activeTab === 'compliance' ? complianceRows.length : drivers.length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-slate-800 bg-slate-900/50">
        {(Object.keys(TAB_META) as DriverDashboardTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            {TAB_META[tab].label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/80">
        <div>
          <p className="text-sm font-medium text-white">{meta.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {activeTab === 'compliance' ? (
        <ComplianceQueueTableCompact rows={complianceRows} loading={loading} />
      ) : loading ? (
        <div className="flex items-center justify-center py-14 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : drivers.length === 0 ? (
        <p className="text-center py-14 text-slate-500 text-sm">No drivers in this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium">Live</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">Last online</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr
                  key={d.user_id}
                  className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link to={`/users/${d.user_id}`} className="block group">
                      <p className="font-medium text-white group-hover:text-violet-300 truncate max-w-[220px]">
                        {d.display_name || d.email || 'Unnamed driver'}
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-[240px]">
                        {d.email ?? d.phone ?? d.user_id}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <LiveBadge status={d.live_status} />
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-300">{d.status}</td>
                  <td className="px-4 py-3 capitalize text-slate-400">{d.mode || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatWhen(d.last_online_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rowCount > 0 && (
        <p className="px-4 py-2 text-xs text-slate-600 border-t border-slate-800/80">
          Showing {rowCount} driver{rowCount === 1 ? '' : 's'}
          {rowCount >= LIST_LIMIT ? ` (up to ${LIST_LIMIT})` : ''}.
          {' '}
          {activeTab === 'compliance' ? (
            <Link to="/compliance" className="text-violet-400 hover:text-violet-300">
              Open compliance workspace →
            </Link>
          ) : (
            <Link to="/users" className="text-violet-400 hover:text-violet-300">
              Open full directory →
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
