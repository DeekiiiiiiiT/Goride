// Stitch: dominion-redesign/3f142d7aaf4b4ae5925baae600d7597f
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  AlertCircle,
  Inbox,
  Info,
  Filter,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';

interface AuditEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  targetEmail: string;
  details?: string;
  timestamp: string;
}

const ACTION_LABEL: Record<string, string> = {
  suspend_user: 'Suspended',
  reactivate_user: 'Reactivated',
  reset_password: 'Reset password',
  set_password: 'Set password',
  force_logout: 'Forced logout',
  create_customer: 'Created customer',
  invite_platform_staff: 'Invited platform staff',
  change_platform_role: 'Changed platform role',
  remove_platform_staff: 'Removed platform staff',
  link_driver: 'Linked driver',
  unlink_driver: 'Unlinked driver',
  change_team_role: 'Changed team role',
  remove_team_member: 'Removed team member',
  'roam_dash.merchant_status_changed': 'Updated Roam Rush merchant',
};

const DATE_FILTERS = [
  { value: 'all', label: 'All recorded' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function isWithinDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() < days * 24 * 60 * 60 * 1000;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function ActivityLog() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  const [whoFilter, setWhoFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [draftWho, setDraftWho] = useState('all');
  const [draftAction, setDraftAction] = useState('all');
  const [draftDate, setDraftDate] = useState('all');

  const { data: entries = [], isLoading, error: queryError } = useQuery<AuditEntry[]>({
    queryKey: ['adminAuditLog'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/audit-log?limit=500`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.entries || [];
    },
    staleTime: 30 * 1000,
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as Error).message : null;

  const actors = useMemo(() => {
    const names = new Set<string>();
    entries.forEach((e) => {
      if (e.actorName) names.add(e.actorName);
    });
    return Array.from(names).sort();
  }, [entries]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => set.add(e.action));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    let list = [...entries];
    if (actionFilter !== 'all') list = list.filter((e) => e.action === actionFilter);
    if (whoFilter !== 'all') list = list.filter((e) => e.actorName === whoFilter);
    if (dateFilter === 'today') list = list.filter((e) => isToday(e.timestamp));
    else if (dateFilter === '7d') list = list.filter((e) => isWithinDays(e.timestamp, 7));
    else if (dateFilter === '30d') list = list.filter((e) => isWithinDays(e.timestamp, 30));
    return list;
  }, [entries, actionFilter, whoFilter, dateFilter]);

  const applyFilters = () => {
    setWhoFilter(draftWho);
    setActionFilter(draftAction);
    setDateFilter(draftDate);
  };

  const resetFilters = () => {
    setDraftWho('all');
    setDraftAction('all');
    setDraftDate('all');
    setWhoFilter('all');
    setActionFilter('all');
    setDateFilter('all');
  };

  return (
    <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-6 p-8 text-slate-900">
      <div className="flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Platform</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-900">Activity log</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Activity log</h1>
          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">
            Owner only
          </span>
        </div>
        <p className="text-sm font-normal text-slate-500">This reads the audit log.</p>
      </div>

      <section className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500" htmlFor="when-filter">
              When
            </label>
            <select
              id="when-filter"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="w-40 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {DATE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500" htmlFor="who-filter">
              Who
            </label>
            <select
              id="who-filter"
              value={draftWho}
              onChange={(e) => setDraftWho(e.target.value)}
              className="w-36 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              <option value="all">All principals</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500" htmlFor="action-filter">
              Action
            </label>
            <select
              id="action-filter"
              value={draftAction}
              onChange={(e) => setDraftAction(e.target.value)}
              className="w-36 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a] || a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            <span>Apply</span>
          </button>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50/75 px-6 py-3 font-mono text-[11px] font-semibold tracking-wider text-slate-500">
          <div className="col-span-3">WHEN</div>
          <div className="col-span-3">WHO</div>
          <div className="col-span-3">ACTION</div>
          <div className="col-span-3">TARGET</div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 shadow-inner">
              <Inbox className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mb-1 text-sm font-medium text-slate-600">The data is not in yet</h3>
            <p className="max-w-sm text-xs text-slate-400">
              No audit log events recorded for this partition yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((entry, idx) => (
              <div
                key={`${entry.timestamp}-${idx}`}
                className="grid grid-cols-12 px-6 py-3 text-xs text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-3 font-mono text-slate-500" title={formatAbsolute(entry.timestamp)}>
                  {formatAbsolute(entry.timestamp)}
                </div>
                <div className="col-span-3 font-medium text-slate-900">{entry.actorName || '—'}</div>
                <div className="col-span-3">{ACTION_LABEL[entry.action] || entry.action}</div>
                <div className="col-span-3 truncate text-slate-500">
                  {entry.targetEmail || entry.details || '—'}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-3 font-mono text-xs text-slate-400">
          <span>{filtered.length} entries found</span>
          <span>Buffer: SYNCED</span>
        </div>
      </section>

      <footer className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50 p-3.5">
        <Info className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
        <div className="flex-1 font-mono text-xs leading-normal text-slate-600">
          <span className="font-medium text-slate-800">Partition scope:</span> Audit trail stream for
          Roam Kingston Command Node. LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </footer>
    </div>
  );
}
