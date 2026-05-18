import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ArrowLeft, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverDetailDto, DriverLiveStatus } from '@roam/types/driver';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { getDriverDetail, listDriverTrips } from '../../services/driverAdminService';

type Tab = 'overview' | 'trips' | 'compliance';

interface OutletContext {
  session: Session;
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function LiveBadge({ status }: { status: DriverLiveStatus }) {
  const styles =
    status === 'online'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'on_trip'
        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  const label = status === 'on_trip' ? 'On trip' : status === 'online' ? 'Online' : 'Offline';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

export function DriverDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<OutletContext>();
  const token = session.access_token;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [driver, setDriver] = useState<DriverDetailDto | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [trips, setTrips] = useState<RideRequestRow[]>([]);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getDriverDetail(token, userId);
      setDriver(res.driver);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load driver';
      setLoadError(message);
      setDriver(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !userId || tab !== 'trips') return;
    void listDriverTrips(token, userId, { limit: 50 }).then((r) => setTrips(r.trips));
  }, [token, userId, tab]);

  const copyId = () => {
    if (!userId) return;
    void navigator.clipboard.writeText(userId);
    toast.success('User ID copied');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (loadError || !driver) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-red-300 max-w-lg mx-auto">{loadError ?? 'Driver not found'}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/users" className="text-sm text-slate-400 hover:text-white">
            Back to drivers
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-violet-400 hover:text-violet-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stats = driver.stats;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trips', label: 'Trips' },
    { id: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="space-y-6 text-slate-200">
      <Link
        to="/users"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to drivers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-white">
              {driver.display_name || driver.email || 'Driver'}
            </h2>
            <LiveBadge status={driver.live_status} />
            <span className="text-xs px-2 py-0.5 rounded border border-slate-700 text-slate-400">
              {driver.status}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">{driver.email}</p>
          <button
            type="button"
            onClick={copyId}
            className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 font-mono"
          >
            <Copy className="w-3 h-3" />
            {driver.user_id}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total trips" value={String(stats.total_trips ?? 0)} />
        <KpiCard label="Completed" value={String(stats.completed_trips ?? 0)} />
        <KpiCard
          label="Acceptance"
          value={stats.acceptance_rate_pct != null ? `${stats.acceptance_rate_pct}%` : '—'}
        />
        <KpiCard
          label="Completion"
          value={stats.completion_rate_pct != null ? `${stats.completion_rate_pct}%` : '—'}
        />
        <KpiCard
          label="Earnings"
          value={formatMoneyMinor(stats.lifetime_earnings_minor, 'JMD')}
        />
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-white">Profile</h3>
            <Row label="Mode" value={driver.mode} />
            <Row label="Onboarding" value={driver.onboarding_complete ? 'Complete' : 'Incomplete'} />
            <Row label="Phone" value={driver.phone ?? '—'} />
            <Row label="Last sign-in" value={formatWhen(driver.last_sign_in_at)} />
            <Row label="Last ride" value={formatWhen(stats.last_ride_at)} />
            <Row label="Last online" value={formatWhen(stats.last_online_at)} />
          </section>
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-white">Offers</h3>
            <Row label="Sent" value={String(stats.offers_sent ?? 0)} />
            <Row label="Accepted" value={String(stats.offers_accepted ?? 0)} />
            <Row label="Declined" value={String(stats.offers_declined ?? 0)} />
          </section>
        </div>
      )}

      {tab === 'trips' && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {trips.length === 0 ? (
            <p className="text-center py-12 text-slate-500 text-sm">No trips yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pickup</th>
                  <th className="px-4 py-3">Fare</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800/80">
                    <td className="px-4 py-3 text-slate-300">{t.status}</td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]">
                      {t.pickup_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoneyMinor(t.fare_final_minor ?? t.fare_estimate_minor, t.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {formatWhen(t.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3 max-w-lg">
          <h3 className="text-sm font-medium text-white">Verification</h3>
          <Row label="Background check" value={driver.background_check_status ?? '—'} />
          <Row label="Insurance expiry" value={driver.insurance_expiry ?? '—'} />
          <p className="text-xs text-slate-500 pt-2">
            Full compliance workflow:{' '}
            <Link to="/compliance" className="text-violet-400 hover:text-violet-300">
              Compliance queue
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-white mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 text-right">{value}</span>
    </div>
  );
}
