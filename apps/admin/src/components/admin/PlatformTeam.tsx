// Stitch: dominion-redesign/6f4a15ed7e5042329e4453061bf33505
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Loader2,
  AlertCircle,
  Shield,
  Headset,
  BarChart3,
  MoreVertical,
  Mail,
  LogOut,
  ShieldBan,
  ShieldCheck,
  RefreshCw,
  UserPlus,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ArrowLeftRight,
  Copy,
  Check,
  X,
  KeyRound,
  Info,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { recoveryRedirectForSurface } from '@roam/auth-client';
import { toast } from 'sonner';
import { ConfirmationModal } from './ConfirmationModal';
import { SetPasswordModal } from './SetPasswordModal';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface PlatformMember {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string | null;
  lastSignIn: string | null;
  status: 'active' | 'inactive';
  isSuspended: boolean;
}

type SortKey = 'name' | 'email' | 'role' | 'createdAt' | 'lastSignIn' | 'status';
type SortDir = 'asc' | 'desc';

// -------------------------------------------------------------------
// Role display config
// -------------------------------------------------------------------
const ROLE_LABEL: Record<string, string> = {
  platform_owner: 'Owner',
  platform_support: 'Support',
  platform_analyst: 'Analyst',
};

const ROLE_COLOR: Record<string, string> = {
  platform_owner: 'bg-amber-500/15 text-amber-400',
  platform_support: 'bg-blue-500/15 text-blue-400',
  platform_analyst: 'bg-slate-200 text-slate-700 dark:bg-slate-600/30 dark:text-slate-300',
};

const ROLE_ICON: Record<string, React.ComponentType<any>> = {
  platform_owner: Shield,
  platform_support: Headset,
  platform_analyst: BarChart3,
};

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function PlatformTeam() {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const accessToken = session?.access_token;
  const currentUserId = user?.id;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('role');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dropdown
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Modals
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', onConfirm: () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('platform_support');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ password: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Change role modal
  const [roleChangeTarget, setRoleChangeTarget] = useState<PlatformMember | null>(null);
  const [newRole, setNewRole] = useState<string>('platform_support');
  const [roleChangeLoading, setRoleChangeLoading] = useState(false);

  // Phase 7: Set Password modal
  const [setPasswordTarget, setSetPasswordTarget] = useState<PlatformMember | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch platform team
  const { data: members = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['adminPlatformTeam'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-team`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.members || [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as Error).message : null;

  // Filtered + sorted
  const displayed = useMemo(() => {
    let list = [...members];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m: PlatformMember) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      );
    }

    if (roleFilter !== 'all') {
      list = list.filter((m: PlatformMember) => m.role === roleFilter);
    }

    if (statusFilter === 'suspended') {
      list = list.filter((m: PlatformMember) => m.isSuspended);
    } else if (statusFilter !== 'all') {
      list = list.filter((m: PlatformMember) => !m.isSuspended && m.status === statusFilter);
    }

    // Sort — always put owner first, then sort within
    list.sort((a: PlatformMember, b: PlatformMember) => {
      // Owner always first
      if (a.role === 'platform_owner' && b.role !== 'platform_owner') return -1;
      if (b.role === 'platform_owner' && a.role !== 'platform_owner') return 1;

      let aVal: any = (a as any)[sortKey] || '';
      let bVal: any = (b as any)[sortKey] || '';
      if (sortKey === 'createdAt' || sortKey === 'lastSignIn') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [members, search, roleFilter, statusFilter, sortKey, sortDir]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(displayed.length / rowsPerPage);
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return displayed.slice(start, start + rowsPerPage);
  }, [displayed, currentPage, rowsPerPage]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-slate-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-amber-400" />
      : <ChevronDown className="w-3 h-3 text-amber-400" />;
  };

  // ---------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------
  const isOwnerRow = (m: PlatformMember) => m.role === 'platform_owner';
  const isSelf = (m: PlatformMember) => m.id === currentUserId;

  const handleResetPassword = (m: PlatformMember) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Reset Password',
      message: `Send a password reset link to ${m.name || 'this user'} (${m.email})?`,
      variant: 'warning',
      confirmLabel: 'Reset Password',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              email: m.email,
              redirectTo: recoveryRedirectForSurface('dominion'),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`Password reset initiated for ${m.email}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          console.error('Reset password error:', err);
          toast.error(err.message || 'Failed to reset password');
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleForceLogout = (m: PlatformMember) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Force Logout',
      message: `Force logout ${m.name || 'this user'}? They will be removed from all active sessions.`,
      variant: 'danger',
      confirmLabel: 'Force Logout',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/force-logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: m.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`All sessions terminated for ${m.name || m.email}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          refetch();
        } catch (err: any) {
          console.error('Force logout error:', err);
          toast.error(err.message || 'Failed to force logout');
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleToggleSuspend = (m: PlatformMember) => {
    setOpenDropdown(null);
    const isSuspending = !m.isSuspended;
    setConfirmModal({
      isOpen: true,
      title: isSuspending ? 'Suspend Account' : 'Reactivate Account',
      message: isSuspending
        ? `Suspend ${m.name || 'this user'}'s account? They will be unable to log in until reactivated.`
        : `Reactivate ${m.name || 'this user'}'s account? They will be able to log in again.`,
      variant: isSuspending ? 'danger' : 'default',
      confirmLabel: isSuspending ? 'Suspend Account' : 'Reactivate',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/toggle-suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: m.id, suspend: isSuspending }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${m.name || m.email} has been ${isSuspending ? 'suspended' : 'reactivated'}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          refetch();
        } catch (err: any) {
          console.error('Toggle suspend error:', err);
          toast.error(err.message || `Failed to ${isSuspending ? 'suspend' : 'reactivate'} account`);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleRemove = (m: PlatformMember) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Remove from Platform Team',
      message: `Permanently remove ${m.name || 'this user'} (${m.email}) from the platform team? This will delete their account entirely. This action cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Remove Permanently',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-team/${m.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${m.name || m.email} has been removed from the platform team`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          refetch();
        } catch (err: any) {
          console.error('Remove platform member error:', err);
          toast.error(err.message || 'Failed to remove team member');
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const openChangeRole = (m: PlatformMember) => {
    setOpenDropdown(null);
    setRoleChangeTarget(m);
    setNewRole(m.role === 'platform_support' ? 'platform_analyst' : 'platform_support');
  };

  const handleChangeRole = async () => {
    if (!roleChangeTarget) return;
    setRoleChangeLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-team/${roleChangeTarget.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`${roleChangeTarget.name || roleChangeTarget.email}'s role changed to ${ROLE_LABEL[newRole] || newRole}`);
      setRoleChangeTarget(null);
      refetch();
    } catch (err: any) {
      console.error('Change role error:', err);
      toast.error(err.message || 'Failed to change role');
    } finally {
      setRoleChangeLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // Invite handler
  // ---------------------------------------------------------------
  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/team/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setInviteResult({ password: data.temporaryPassword, email: inviteEmail.trim() });
      queryClient.invalidateQueries({ queryKey: ['adminPlatformTeam'] });
    } catch (err: any) {
      console.error('Invite error:', err);
      toast.error(err.message || 'Failed to invite team member');
    } finally {
      setInviteLoading(false);
    }
  };

  const closeInviteModal = () => {
    setInviteOpen(false);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('platform_support');
    setInviteResult(null);
    setCopied(false);
  };

  const handleCopyPassword = () => {
    if (!inviteResult) return;
    navigator.clipboard.writeText(inviteResult.password);
    setCopied(true);
    toast.success('Password copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedMember = paginatedList.find((m: PlatformMember) => !isOwnerRow(m) && !isSelf(m)) || null;

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-7xl p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">&gt;</span>
          <span>Platform</span>
          <span className="text-slate-400">&gt;</span>
          <span className="font-medium text-slate-900">Staff and roles</span>
        </nav>
        <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          REGION: JM-KGN
        </span>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff and roles</h1>
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
              Owner only
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Roam staff. Customer accounts are not listed here.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            Invite
          </button>
          <button
            type="button"
            onClick={() => selectedMember && openChangeRole(selectedMember)}
            disabled={!selectedMember}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Change role
          </button>
          <button
            type="button"
            onClick={() => selectedMember && handleToggleSuspend(selectedMember)}
            disabled={!selectedMember}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-amber-700 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50"
          >
            <ShieldBan className="h-4 w-4" />
            Suspend
          </button>
          <button
            type="button"
            onClick={() => selectedMember && handleForceLogout(selectedMember)}
            disabled={!selectedMember}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <option value="all">All Roles</option>
          <option value="platform_owner">Owner</option>
          <option value="platform_support">Support</option>
          <option value="platform_analyst">Analyst</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="mb-6 overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm">
          <div className="w-full overflow-x-auto" style={{ overflow: 'visible' }}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <SortableHeader label="Name" col="name" />
                  <SortableHeader label="Email" col="email" />
                  <SortableHeader label="Role" col="role" />
                  <SortableHeader label="Status" col="status" />
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100 text-slate-400">
                          <Shield className="h-6 w-6" aria-hidden />
                        </div>
                        <div className="text-sm font-medium text-slate-900">The data is not in yet</div>
                        <p className="mt-1 max-w-sm text-xs text-slate-400">
                          {search || roleFilter !== 'all' || statusFilter !== 'all'
                            ? 'Try adjusting your search or filter.'
                            : 'No internal operator identities have been registered to this partition registry.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((m: PlatformMember) => {
                    const RoleIcon = ROLE_ICON[m.role] || Shield;
                    const roleColor = ROLE_COLOR[m.role] || ROLE_COLOR.platform_analyst;
                    const showActions = !isOwnerRow(m) && !isSelf(m);
                    return (
                      <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="whitespace-nowrap px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500">
                              {(m.name || m.email)[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="max-w-[200px] truncate font-medium text-slate-900">
                                {m.name || '(No name)'}
                              </span>
                              {isSelf(m) ? (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                                  You
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[220px] truncate whitespace-nowrap px-6 py-3 text-slate-500">
                          {m.email}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${roleColor}`}>
                            <RoleIcon className="h-3 w-3" />
                            {ROLE_LABEL[m.role] || m.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          {m.isSuspended ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              Suspended
                            </span>
                          ) : m.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-right">
                          {showActions ? (
                            <div className="relative" ref={openDropdown === m.id ? dropdownRef : undefined}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (openDropdown === m.id) {
                                    setOpenDropdown(null);
                                  } else {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setDropdownPos({ top: rect.bottom + 4, left: rect.right - 192 });
                                    setOpenDropdown(m.id);
                                  }
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                title="More actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {openDropdown === m.id ? (
                                <div
                                  ref={dropdownRef}
                                  className="fixed w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
                                  style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                                >
                                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => openChangeRole(m)}>
                                    <ArrowLeftRight className="h-4 w-4" /> Change Role
                                  </button>
                                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => handleResetPassword(m)}>
                                    <Mail className="h-4 w-4" /> Reset Password
                                  </button>
                                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpenDropdown(null); setSetPasswordTarget(m); }}>
                                    <KeyRound className="h-4 w-4" /> Set New Password
                                  </button>
                                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => handleForceLogout(m)}>
                                    <LogOut className="h-4 w-4" /> Force Logout
                                  </button>
                                  <div className="my-1 border-t border-slate-200" />
                                  {m.isSuspended ? (
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-700 hover:bg-slate-50" onClick={() => handleToggleSuspend(m)}>
                                      <ShieldCheck className="h-4 w-4" /> Reactivate Account
                                    </button>
                                  ) : (
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-slate-50" onClick={() => handleToggleSuspend(m)}>
                                      <ShieldBan className="h-4 w-4" /> Suspend Account
                                    </button>
                                  )}
                                  <div className="my-1 border-t border-slate-200" />
                                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-slate-50" onClick={() => handleRemove(m)}>
                                    <Trash2 className="h-4 w-4" /> Remove
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">{isSelf(m) ? 'You' : 'Owner'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!loading && !error && displayed.length > 0 ? (
        <div className="mb-6 flex flex-col items-center justify-between gap-3 rounded-[12px] border border-slate-200 bg-white px-4 py-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <span className="text-sm text-slate-600">
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, displayed.length)}
            {'-'}
            {Math.min(currentPage * rowsPerPage, displayed.length)} of {displayed.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm text-slate-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-blue-600" aria-hidden />
          <div>
            <span className="font-medium text-slate-800">Partition scope:</span> Internal operator roster under Roam Kingston Central Command. Customer accounts are isolated in Fleet Admin.
          </div>
        </div>
        <div className="font-mono text-[11px] tracking-tight text-slate-500">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {!inviteResult ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Invite Platform Staff</h2>
                  <button onClick={closeInviteModal} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="e.g. Jane Smith"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="jane@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
                  >
                    <option value="platform_support">Support — Can view customers, fuel & toll data</option>
                    <option value="platform_analyst">Analyst — Dashboard access only</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={closeInviteModal}
                    className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border border-slate-300 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvite}
                    disabled={!inviteName.trim() || !inviteEmail.trim() || inviteLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {inviteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Send Invite
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Staff Invited Successfully</h2>
                  <button onClick={closeInviteModal} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  <p className="text-sm text-emerald-300">
                    Account created for <strong>{inviteResult.email}</strong>. Share the temporary password below securely.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Temporary Password</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteResult.password}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono focus:outline-none"
                    />
                    <button
                      onClick={handleCopyPassword}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs text-amber-300">
                    This password will not be shown again. Make sure to copy it and share it securely with the new team member.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={closeInviteModal}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleChangeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Change Role</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Change role for <strong className="text-slate-900 dark:text-white">{roleChangeTarget.name || roleChangeTarget.email}</strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">New Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
              >
                <option value="platform_support">Support</option>
                <option value="platform_analyst">Analyst</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setRoleChangeTarget(null)}
                disabled={roleChangeLoading}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border border-slate-300 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeRole}
                disabled={roleChangeLoading || newRole === roleChangeTarget.role}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {roleChangeLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmLabel={confirmModal.confirmLabel}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        loading={confirmLoading}
      />

      {/* Set Password Modal */}
      {setPasswordTarget && (
        <SetPasswordModal
          isOpen={true}
          userId={setPasswordTarget.id}
          userName={setPasswordTarget.name}
          userEmail={setPasswordTarget.email}
          accessToken={accessToken || ''}
          onClose={() => setSetPasswordTarget(null)}
        />
      )}
    </div>
  );

  // Inner component for sortable table headers
  function SortableHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <th className="whitespace-nowrap px-6 py-3">
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-900"
        >
          {label}
          <SortIcon col={col} />
        </button>
      </th>
    );
  }
}