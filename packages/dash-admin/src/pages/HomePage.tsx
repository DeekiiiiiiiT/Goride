import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { getJwtRoles } from '@roam/auth-client';
import { getConsoleSummary, getDashboardStats, type AttentionQueue, type ConsoleSummary } from '@roam/dash-admin-client';
import { canOpenCapabilityForRoles } from '../config/dashAdminCapabilities';
import { formatMoney } from '../components/ui/format';
import { StatTile } from '../components/ui/bits';
import { isCourierOnlyRole } from '../utils/isCourierOnlyRole';
import type { AdminOutletContext } from '../DashAdminPortal';

function ageLabel(iso: string | null) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return `oldest ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `oldest ${hours}h`;
  return `oldest ${Math.round(hours / 24)}d`;
}

function greeting(name: string) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${hello}, ${name}`;
}

function changeLabel(current: number | null, previous: number | null) {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 'same as last week' : 'up from last week';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return 'same as last week';
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs last week`;
}

export function HomePage() {
  const { session, attention } = useOutletContext<AdminOutletContext>();
  const roles = getJwtRoles(session.user);
  const roleKey = roles.join(',');
  const sales = canOpenCapabilityForRoles(roles, 'finance');
  const name = session.user.email?.split('@')[0] || 'there';
  const queues: AttentionQueue[] | null = attention === undefined ? null : attention;
  const [summary, setSummary] = useState<ConsoleSummary | null>(null);
  const [fallback, setFallback] = useState<Awaited<ReturnType<typeof getDashboardStats>> | null>(null);

  useEffect(() => {
    void getConsoleSummary(session.access_token).then(setSummary).catch(() => setSummary(null));
    if (roleKey.split(',').some((role) => isCourierOnlyRole(role)) && !sales) {
      void getDashboardStats(session.access_token).then(setFallback).catch(() => setFallback(null));
    }
  }, [session.access_token, sales, roleKey]);

  const showSales = sales && summary?.salesVisible !== false && summary?.ordersToday != null;
  const peak = Math.max(1, ...(summary?.byHour ?? []).flatMap((bucket) => [bucket.today, bucket.lastWeek]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{greeting(name)}</h1>
        <p className="text-sm text-slate-400 mt-1">What needs a person, then how the day is going.</p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
        <h2 className="text-sm font-medium text-slate-300">Needs attention</h2>
        {queues == null ? (
          <p className="text-sm text-slate-400">The attention feed is not available yet. Open a queue from the menu.</p>
        ) : queues.length === 0 ? (
          <p className="text-sm text-emerald-300">All clear</p>
        ) : queues.map((queue) => (
          <div key={queue.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className={queue.breached ? 'text-red-300' : 'text-amber-200'}>{queue.count}</span>
            <span className="text-slate-100">{queue.label}</span>
            <span className="text-slate-500">{ageLabel(queue.oldestAt)}{queue.breached ? ' · past the limit' : ''}</span>
            <Link to={queue.href} className="ml-auto text-amber-300">Review</Link>
          </div>
        ))}
      </section>

      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {showSales && (
              <StatTile label="Orders today" value={String(summary.ordersToday)} delta={changeLabel(summary.ordersToday, summary.ordersPrevious) || undefined} href="/orders?view=all" />
            )}
            {showSales && (
              <StatTile label="Sales today" value={formatMoney(summary.gmvToday)} delta={changeLabel(summary.gmvToday, summary.gmvPrevious) || undefined} href="/finance?tab=overview" />
            )}
            <StatTile label="Live now" value={String(summary.liveNow)} href="/dispatch" />
            <StatTile label="Couriers online" value={`${summary.couriersOnline} / ${summary.couriersBusy} busy`} href="/dispatch?tab=map" />
            {showSales && summary.avgEtaMin != null && (
              <StatTile label="Average delivery" value={`${summary.avgEtaMin} min`} />
            )}
          </div>
          {showSales && (
            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-800 p-4">
                <h2 className="text-sm text-slate-300 mb-3">Orders by hour, today and last week</h2>
                <div className="flex items-end gap-1 h-24">
                  {summary.byHour.map((bucket) => (
                    <div key={bucket.hour} className="flex-1 flex items-end gap-px h-full" title={`${bucket.hour}:00 · ${bucket.today} today · ${bucket.lastWeek} last week`}>
                      <div className="flex-1 bg-slate-600 rounded-sm" style={{ height: `${Math.max(bucket.lastWeek > 0 ? 4 : 0, (bucket.lastWeek / peak) * 100)}%` }} />
                      <div className="flex-1 bg-amber-500/80 rounded-sm" style={{ height: `${Math.max(bucket.today > 0 ? 4 : 0, (bucket.today / peak) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-slate-800 p-4 space-y-2">
                <h2 className="text-sm text-slate-300">By market</h2>
                {summary.byMarket.length === 0 ? <p className="text-sm text-slate-500">No orders yet today.</p> : summary.byMarket.map((row) => (
                  <p key={row.name} className="flex justify-between text-sm text-slate-200">
                    <span>{row.name}</span>
                    <span>{row.orders} · {formatMoney(row.gmv)}</span>
                  </p>
                ))}
                <Link to="/reports" className="inline-block text-sm text-amber-300">Open reports</Link>
              </section>
            </div>
          )}
        </>
      )}

      {fallback?.scope === 'courier' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Active couriers" value={String(fallback.courier.active_couriers)} href="/couriers" />
          <StatTile label="Compliance queue" value={String(fallback.courier.pending_compliance)} href="/couriers?tab=compliance" />
        </div>
      )}
    </div>
  );
}
