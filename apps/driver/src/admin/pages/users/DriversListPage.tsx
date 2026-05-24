import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, Search, MoreHorizontal, LogOut, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@roam/ui';
import type {
  DriverAccountStatus,
  DriverDirectoryRow,
  DriverLiveStatus,
} from '@roam/types/driver';
import {
  listDrivers,
  suspendDriver,
  unsuspendDriver,
  deactivateDriver,
  reactivateDriver,
  signOutDriver,
} from '../../services/driverAdminService';

const PAGE_SIZE = 50;

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All accounts' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'deactivated', label: 'Deactivated' },
];

const LIVE_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Any status' },
  { id: 'online', label: 'Online' },
  { id: 'on_trip', label: 'On trip' },
  { id: 'offline', label: 'Offline' },
];

interface OutletContext {
  session: Session;
}

const STATUS_TOOLTIPS: Record<DriverAccountStatus, string> = {
  active: 'Driver can sign in and accept trips.',
  pending: 'Account exists but onboarding is not complete yet.',
  suspended: 'Temporarily blocked by an admin. Can be unsuspended.',
  deactivated: 'Permanently blocked until an admin reactivates the account.',
};

const LIVE_TOOLTIPS: Record<DriverLiveStatus, string> = {
  online: 'Driver is available and was recently active.',
  on_trip: 'Driver is currently on an active trip.',
  offline: 'Driver is not available for trips right now.',
};

const ACTION_MENU_TOOLTIPS = {
  trigger: 'Open driver account actions',
  suspend: 'Temporarily block this driver from signing in',
  unsuspend: 'Restore access for a suspended driver',
  deactivate: 'Permanently block this driver until reactivated',
  reactivate: 'Restore a deactivated driver account',
  signOut: 'End all active sessions on every device',
  viewDetails: 'Open full driver profile and trip history',
} as const;

const MENU_WIDTH = 192;
const MENU_ESTIMATED_HEIGHT = 220;

type MenuPosition = { top: number; left: number };

function HoverTooltip({
  content,
  side = 'top',
  children,
}: {
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={6}
        className="max-w-[240px] bg-slate-800 text-slate-200 border border-slate-700 text-xs leading-relaxed"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function AccountBadge({ status }: { status: DriverAccountStatus }) {
  const styles =
    status === 'active'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'pending'
        ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
        : status === 'suspended'
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : 'bg-red-500/15 text-red-300 border-red-500/30';
  return (
    <HoverTooltip content={STATUS_TOOLTIPS[status]}>
      <span
        className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border cursor-help ${styles}`}
      >
        {status}
      </span>
    </HoverTooltip>
  );
}

function LiveDot({ status }: { status: DriverLiveStatus }) {
  const color =
    status === 'online'
      ? 'bg-emerald-400'
      : status === 'on_trip'
        ? 'bg-violet-400'
        : 'bg-slate-600';
  const label = status === 'on_trip' ? 'On trip' : status === 'online' ? 'Online' : 'Offline';
  return (
    <HoverTooltip content={LIVE_TOOLTIPS[status]}>
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 cursor-help">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        {label}
      </span>
    </HoverTooltip>
  );
}

function ActionMenuItem({
  label,
  tooltip,
  onClick,
  className = '',
  icon,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <HoverTooltip content={tooltip} side="left">
      <button
        type="button"
        className={`w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-white ${icon ? 'flex items-center gap-2' : ''} ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {icon}
        {label}
      </button>
    </HoverTooltip>
  );
}

type ModalType = 'suspend' | 'deactivate' | null;

export function DriversListPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;

  const [drivers, setDrivers] = useState<DriverDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [liveStatus, setLiveStatus] = useState('all');
  const [sort, setSort] = useState('last_ride');

  // Actions state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverDirectoryRow | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await listDrivers(accessToken, {
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        live_status: liveStatus === 'all' ? undefined : liveStatus,
        sort,
        page,
        limit: PAGE_SIZE,
      });
      setDrivers(res.drivers);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, status, liveStatus, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!openDropdown) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      setOpenDropdown(null);
      setMenuPosition(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
        setMenuPosition(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  const openActionsMenu = (userId: string, anchor: HTMLElement) => {
    if (openDropdown === userId) {
      setOpenDropdown(null);
      setMenuPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const openBelow = rect.bottom + MENU_ESTIMATED_HEIGHT <= window.innerHeight - 8;
    const top = openBelow
      ? rect.bottom + 4
      : Math.max(8, rect.top - MENU_ESTIMATED_HEIGHT - 4);

    setMenuPosition({ top, left });
    setOpenDropdown(userId);
  };

  const closeActionsMenu = () => {
    setOpenDropdown(null);
    setMenuPosition(null);
  };

  const menuDriver = openDropdown
    ? drivers.find((driver) => driver.user_id === openDropdown) ?? null
    : null;

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  // Action handlers
  const doSuspend = async () => {
    if (!accessToken || !selectedDriver || !reason.trim()) return;
    setActionLoading(true);
    try {
      await suspendDriver(accessToken, selectedDriver.user_id, reason.trim());
      toast.success('Driver suspended');
      setModal(null);
      setSelectedDriver(null);
      setReason('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to suspend');
    } finally {
      setActionLoading(false);
    }
  };

  const doUnsuspend = async (driver: DriverDirectoryRow) => {
    if (!accessToken) return;
    setActionLoading(true);
    try {
      await unsuspendDriver(accessToken, driver.user_id);
      toast.success('Driver unsuspended');
      closeActionsMenu();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to unsuspend');
    } finally {
      setActionLoading(false);
    }
  };

  const doDeactivate = async () => {
    if (!accessToken || !selectedDriver || !reason.trim()) return;
    setActionLoading(true);
    try {
      await deactivateDriver(accessToken, selectedDriver.user_id, reason.trim());
      toast.success('Driver deactivated');
      setModal(null);
      setSelectedDriver(null);
      setReason('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const doReactivate = async (driver: DriverDirectoryRow) => {
    if (!accessToken) return;
    setActionLoading(true);
    try {
      await reactivateDriver(accessToken, driver.user_id);
      toast.success('Driver reactivated');
      closeActionsMenu();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const doSignOut = async (driver: DriverDirectoryRow) => {
    if (!accessToken) return;
    if (!window.confirm(`Sign out ${driver.display_name || driver.email || 'this driver'} from all devices?`)) return;
    setActionLoading(true);
    try {
      await signOutDriver(accessToken, driver.user_id);
      toast.success('Driver signed out from all devices');
      closeActionsMenu();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sign out');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">User Management</h2>
        <p className="text-sm text-slate-400 mt-1">
          Search drivers, view live status, and review trip performance metrics.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Email, phone, name, or user ID…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
        >
          Search
        </button>
        <select
          value={sort}
          onChange={(e) => {
            setPage(1);
            setSort(e.target.value);
          }}
          className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white"
        >
          <option value="last_ride">Last ride</option>
          <option value="trips">Total trips</option>
          <option value="acceptance">Acceptance rate</option>
          <option value="signup">Signup date</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(f.id);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              status === f.id
                ? 'bg-violet-500/15 text-violet-300 border-violet-500/40'
                : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {LIVE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setPage(1);
              setLiveStatus(f.id);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              liveStatus === f.id
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading drivers…
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-center py-16 text-slate-500 text-sm">No drivers match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Live</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr
                    key={d.user_id}
                    className="border-b border-slate-800/80 hover:bg-slate-800/40 transition-colors"
                  >
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => navigate(`/users/${d.user_id}`)}
                    >
                      <p className="font-medium text-white truncate max-w-[200px]">
                        {d.display_name || d.email || 'Unnamed driver'}
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-[220px]">
                        {d.email ?? d.user_id}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <LiveDot status={d.live_status} />
                    </td>
                    <td className="px-4 py-3">
                      <AccountBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <HoverTooltip content={ACTION_MENU_TOOLTIPS.trigger}>
                        <button
                          type="button"
                          aria-label="Driver actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            openActionsMenu(d.user_id, e.currentTarget);
                          }}
                          disabled={actionLoading}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-50"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </HoverTooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {total} driver{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {menuDriver && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="fixed w-48 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 shadow-xl py-1 text-sm"
          style={{ top: menuPosition.top, left: menuPosition.left, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuDriver.status === 'active' && (
            <ActionMenuItem
              label="Suspend account"
              tooltip={ACTION_MENU_TOOLTIPS.suspend}
              onClick={() => {
                closeActionsMenu();
                setSelectedDriver(menuDriver);
                setModal('suspend');
              }}
            />
          )}
          {menuDriver.status === 'suspended' && (
            <ActionMenuItem
              label="Unsuspend account"
              tooltip={ACTION_MENU_TOOLTIPS.unsuspend}
              onClick={() => void doUnsuspend(menuDriver)}
            />
          )}
          {(menuDriver.status === 'active' || menuDriver.status === 'suspended') && (
            <ActionMenuItem
              label="Deactivate account"
              tooltip={ACTION_MENU_TOOLTIPS.deactivate}
              className="text-amber-300"
              onClick={() => {
                closeActionsMenu();
                setSelectedDriver(menuDriver);
                setModal('deactivate');
              }}
            />
          )}
          {menuDriver.status === 'deactivated' && (
            <ActionMenuItem
              label="Reactivate account"
              tooltip={ACTION_MENU_TOOLTIPS.reactivate}
              onClick={() => void doReactivate(menuDriver)}
            />
          )}

          <hr className="my-1 border-slate-800" />

          <ActionMenuItem
            label="Sign out all devices"
            tooltip={ACTION_MENU_TOOLTIPS.signOut}
            icon={<LogOut className="w-3.5 h-3.5" />}
            onClick={() => void doSignOut(menuDriver)}
          />

          <hr className="my-1 border-slate-800" />

          <ActionMenuItem
            label="View details"
            tooltip={ACTION_MENU_TOOLTIPS.viewDetails}
            className="text-violet-300"
            onClick={() => {
              closeActionsMenu();
              navigate(`/users/${menuDriver.user_id}`);
            }}
          />
        </div>,
        document.body,
      )}

      {/* Suspend Modal */}
      {modal === 'suspend' && selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setModal(null); setSelectedDriver(null); setReason(''); }} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Suspend Driver</h3>
              <button
                type="button"
                onClick={() => { setModal(null); setSelectedDriver(null); setReason(''); }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-2">
              Suspending <strong>{selectedDriver.display_name || selectedDriver.email}</strong> will temporarily block them from using the app.
            </p>
            <label className="block text-xs text-slate-500 mb-1 mt-4">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this driver being suspended?"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setModal(null); setSelectedDriver(null); setReason(''); }}
                className="px-3 py-2 rounded-lg border border-slate-700 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doSuspend()}
                disabled={!reason.trim() || actionLoading}
                className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-500 disabled:opacity-50"
              >
                {actionLoading ? 'Suspending...' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {modal === 'deactivate' && selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setModal(null); setSelectedDriver(null); setReason(''); }} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Deactivate Driver</h3>
              <button
                type="button"
                onClick={() => { setModal(null); setSelectedDriver(null); setReason(''); }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-2">
              Deactivating <strong>{selectedDriver.display_name || selectedDriver.email}</strong> is a stronger action. They will be blocked until manually reactivated.
            </p>
            <label className="block text-xs text-slate-500 mb-1 mt-4">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this driver being deactivated?"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setModal(null); setSelectedDriver(null); setReason(''); }}
                className="px-3 py-2 rounded-lg border border-slate-700 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doDeactivate()}
                disabled={!reason.trim() || actionLoading}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
