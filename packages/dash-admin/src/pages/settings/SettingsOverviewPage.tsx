import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  listAdminSettings,
  listSettingHistory,
  type AdminSettingRow,
  type PendingChangeRow,
  type SettingChangeRow,
} from '@roam/dash-admin-client';
import { SETTINGS_BY_KEY } from '@roam/rush-settings';
import { formatSettingValue, labelForKey, relativeTime } from './settingsFormat';
import type { SettingsOutletContext } from './SettingsLayout';

type AppCard = {
  id: 'customer' | 'courier' | 'partner';
  title: string;
  to: string;
  statusKey: string;
  statusOnLabel: string;
  statusOffLabel: string;
  versionKey: string;
  announcementKey: string;
};

const APP_CARDS: AppCard[] = [
  {
    id: 'customer',
    title: 'Roam Rush',
    to: '/settings/customer/ordering',
    statusKey: 'customer.ordering.enabled',
    statusOnLabel: 'Taking orders',
    statusOffLabel: 'Orders paused',
    versionKey: 'platform.app_version.customer.android',
    announcementKey: 'platform.announcement.customer',
  },
  {
    id: 'courier',
    title: 'Courier',
    to: '/settings/courier/dispatch',
    statusKey: 'courier.signup.mode',
    statusOnLabel: 'Sign-up open',
    statusOffLabel: 'Sign-up closed',
    versionKey: 'platform.app_version.courier.android',
    announcementKey: 'platform.announcement.courier',
  },
  {
    id: 'partner',
    title: 'Partner',
    to: '/settings/partner/sign-up',
    statusKey: 'partner.signup.mode',
    statusOnLabel: 'Open',
    statusOffLabel: 'Closed',
    versionKey: 'platform.app_version.partner.android',
    announcementKey: 'platform.announcement.partner',
  },
];

export function SettingsOverviewPage() {
  const { session, setPendingCount } = useOutletContext<SettingsOutletContext>();
  const [rows, setRows] = useState<AdminSettingRow[]>([]);
  const [pending, setPending] = useState<PendingChangeRow[]>([]);
  const [history, setHistory] = useState<SettingChangeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listAdminSettings(session.access_token),
      listSettingHistory(session.access_token, { limit: 8 }),
    ])
      .then(([list, hist]) => {
        if (cancelled) return;
        setRows(list.settings);
        setPending(list.pending);
        setPendingCount(list.pending.length);
        setHistory(hist.history);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.access_token, setPendingCount]);

  const byKey = useMemo(() => {
    const map = new Map<string, AdminSettingRow>();
    for (const row of rows) map.set(row.key, row);
    return map;
  }, [rows]);

  const envCount = rows.filter((r) => r.envActive).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
        <p className="text-sm text-slate-400">Status across the three apps.</p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {APP_CARDS.map((card) => {
          const status = byKey.get(card.statusKey);
          const version = byKey.get(card.versionKey);
          const announcements = byKey.get(card.announcementKey);
          const statusLabel = statusLabelFor(card, status);
          const minVersion =
            version && typeof version.value === 'object' && version.value
              ? String((version.value as { minVersion?: string }).minVersion || '—')
              : '—';
          const bannerCount = Array.isArray(announcements?.value)
            ? (announcements!.value as unknown[]).length
            : 0;
          return (
            <Link
              key={card.id}
              to={card.to}
              className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 hover:border-slate-600"
            >
              <p className="font-medium text-slate-100">{card.title}</p>
              <p className="mt-2 text-sm text-emerald-300/90">● {statusLabel}</p>
              <p className="mt-1 text-xs text-slate-400">Min app {minVersion}</p>
              <p className="mt-1 text-xs text-slate-500">
                {bannerCount > 0 ? `${bannerCount} banner${bannerCount === 1 ? '' : 's'}` : 'No banner'}
              </p>
            </Link>
          );
        })}
      </div>

      {envCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span>
            ⚠ {envCount} setting{envCount === 1 ? '' : 's'} overridden by a server variable
          </span>
          <Link to="/settings/kill-switches" className="text-amber-200 underline-offset-2 hover:underline">
            Review
          </Link>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
          <span>
            ⏳ {pending.length} change{pending.length === 1 ? '' : 's'} waiting for approval
          </span>
          <Link to="/settings/approvals" className="text-amber-300 underline-offset-2 hover:underline">
            Review
          </Link>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-200">Recent changes</h3>
          <Link to="/settings/history" className="text-xs text-slate-400 hover:text-white">
            Full history
          </Link>
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          {history.length === 0 ? (
            <li className="text-slate-500">No changes yet.</li>
          ) : (
            history.map((row) => {
              const def = SETTINGS_BY_KEY.get(row.key);
              return (
                <li key={row.id} className="rounded-lg border border-slate-800 px-3 py-2">
                  <span className="text-slate-100">{labelForKey(row.key)}</span>
                  {' · '}
                  <span className="text-slate-400">
                    {formatSettingValue(row.old_value, def)} → {formatSettingValue(row.new_value, def)}
                  </span>
                  {' · '}
                  <span className="text-slate-500">{relativeTime(row.created_at)}</span>
                  {row.reason ? (
                    <>
                      {' · '}
                      <span className="text-slate-500">&ldquo;{row.reason}&rdquo;</span>
                    </>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function statusLabelFor(card: AppCard, status: AdminSettingRow | undefined): string {
  if (!status) return '—';
  if (card.id === 'partner' || card.id === 'courier') {
    const mode = String(status.value ?? '');
    if (mode === 'closed') return card.statusOffLabel;
    if (mode === 'invite_only' || mode === 'invite' || mode === 'fleet_only') return 'Invite only';
    return card.statusOnLabel;
  }
  return status.value === false ? card.statusOffLabel : card.statusOnLabel;
}
