import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  AlertCircle,
  ShieldBan,
  ShieldCheck,
  KeyRound,
  LogOut,
  UserPlus,
  UserMinus,
  ArrowLeftRight,
  Link2,
  Unlink,
  Search,
  RefreshCw,
  ClipboardList,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface AuditEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  targetEmail: string;
  details?: string;
  timestamp: string;
}

// -------------------------------------------------------------------
// Action config
// -------------------------------------------------------------------
const ACTION_CONFIG: Record<string, { icon: React.ComponentType<any>; label: string; color: string; category: string }> = {
  suspend_user:         { icon: ShieldBan,       label: 'Suspended',                color: 'text-red-400 bg-red-500/15',         category: 'suspend' },
  reactivate_user:      { icon: ShieldCheck,     label: 'Reactivated',              color: 'text-emerald-400 bg-emerald-500/15', category: 'suspend' },
  reset_password:       { icon: KeyRound,        label: 'Reset password for',       color: 'text-amber-400 bg-amber-500/15',     category: 'password' },
  set_password:         { icon: KeyRound,        label: 'Set password for',         color: 'text-amber-400 bg-amber-500/15',     category: 'password' },
  force_logout:         { icon: LogOut,          label: 'Forced logout for',        color: 'text-orange-400 bg-orange-500/15',   category: 'password' },
  create_customer:      { icon: UserPlus,        label: 'Created customer',         color: 'text-blue-400 bg-blue-500/15',       category: 'invite' },
  invite_platform_staff:{ icon: UserPlus,        label: 'Invited platform staff',   color: 'text-blue-400 bg-blue-500/15',       category: 'invite' },
  change_platform_role: { icon: ArrowLeftRight,  label: 'Changed platform role for',color: 'text-purple-400 bg-purple-500/15',   category: 'role' },
  remove_platform_staff:{ icon: UserMinus,       label: 'Removed platform staff',   color: 'text-red-400 bg-red-500/15',         category: 'remove' },
  link_driver:          { icon: Link2,           label: 'Linked driver',            color: 'text-cyan-400 bg-cyan-500/15',       category: 'link' },
  unlink_driver:        { icon: Unlink,          label: 'Unlinked driver',          color: 'text-slate-400 bg-slate-500/15',     category: 'link' },
  change_team_role:     { icon: UserCog,         label: 'Changed team role for',    color: 'text-purple-400 bg-purple-500/15',   category: 'role' },
  remove_team_member:   { icon: UserMinus,       label: 'Removed team member',      color: 'text-red-400 bg-red-500/15',         category: 'remove' },
};

const CATEGORY_FILTERS = [
  { value: 'all', label: 'All Actions' },
  { value: 'suspend', label: 'Suspend / Reactivate' },
  { value: 'password', label: 'Password & Logout' },
  { value: 'role', label: 'Role Changes' },
  { value: 'invite', label: 'Invites & Create' },
  { value: 'remove', label: 'Remove' },
  { value: 'link', label: 'Link / Unlink' },
];

const DATE_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatAbsolute(iso);
}

function isWithinDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() < days * 24 * 60 * 60 * 1000;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function ActivityLog() {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(50);

  const { data: entries = [], isLoading, error: queryError, refetch } = useQuery<AuditEntry[]>({
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

  const filtered = useMemo(() => {
    let list = [...entries];

    // Category filter
    if (categoryFilter !== 'all') {
      list = list.filter(e => {
        const cfg = ACTION_CONFIG[e.action];
        return cfg?.category === categoryFilter;
      });
    }

    // Date filter
    if (dateFilter === 'today') list = list.filter(e => isToday(e.timestamp));
    else if (dateFilter === '7d') list = list.filter(e => isWithinDays(e.timestamp, 7));
    else if (dateFilter === '30d') list = list.filter(e => isWithinDays(e.timestamp, 30));

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.actorName.toLowerCase().includes(q) ||
        e.targetEmail.toLowerCase().includes(q) ||
        (e.details || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [entries, categoryFilter, dateFilter, search]);

  const visibleEntries = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Activity Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
            {filtered.length !== entries.length ? ` (filtered from ${entries.length})` : ''}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by actor or target email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); setVisibleCount(50); }}
          className="appearance-none px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
        >
          {CATEGORY_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); setVisibleCount(50); }}
          className="appearance-none px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
        >
          {DATE_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-slate-800 p-4 rounded-2xl mb-4">
            <ClipboardList className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {entries.length === 0 ? 'No activity recorded yet' : 'No matching entries'}
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            {entries.length === 0
              ? 'Actions will appear here as you manage users.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && !error && visibleEntries.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          <div className="divide-y divide-slate-800/60">
            {visibleEntries.map((entry, idx) => {
              const cfg = ACTION_CONFIG[entry.action] || {
                icon: ClipboardList,
                label: entry.action,
                color: 'text-slate-400 bg-slate-500/15',
                category: 'other',
              };
              const Icon = cfg.icon;
              const [iconText, iconBg] = cfg.color.split(' ');

              return (
                <div key={`${entry.timestamp}-${idx}`} className="flex gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                    <Icon className={`w-4.5 h-4.5 ${iconText}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 leading-relaxed">
                      <span className="font-semibold text-white">{entry.actorName}</span>
                      {' '}{cfg.label}{' '}
                      {entry.targetEmail && (
                        <span className="font-semibold text-white">{entry.targetEmail}</span>
                      )}
                    </p>
                    {entry.details && (
                      <p className="text-xs text-slate-500 mt-0.5">{entry.details}</p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right" title={formatAbsolute(entry.timestamp)}>
                    <p className="text-xs text-slate-500">{formatRelative(entry.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="px-5 py-3 border-t border-slate-800">
              <button
                onClick={() => setVisibleCount(v => v + 50)}
                className="w-full text-center text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
