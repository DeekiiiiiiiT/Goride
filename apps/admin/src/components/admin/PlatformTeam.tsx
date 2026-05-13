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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from 'sonner@2.0.3';
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
  platform_analyst: 'bg-slate-600/30 text-slate-300',
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
            body: JSON.stringify({ email: m.email }),
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

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Platform Team</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {displayed.length} member{displayed.length !== 1 ? 's' : ''}
            {displayed.length !== members.length ? ` (filtered from ${members.length})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Staff
          </button>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
          />
        </div>

        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="appearance-none px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
        >
          <option value="all">All Roles</option>
          <option value="platform_owner">Owner</option>
          <option value="platform_support">Support</option>
          <option value="platform_analyst">Analyst</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="appearance-none px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && displayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-slate-800 p-4 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {search || roleFilter !== 'all' || statusFilter !== 'all' ? 'No matching members' : 'No platform team members yet'}
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            {search || roleFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Invite support or analyst staff to help manage the platform.'}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && displayed.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          <div className="overflow-x-auto" style={{ overflow: 'visible' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <SortableHeader label="Name" col="name" />
                  <SortableHeader label="Email" col="email" />
                  <SortableHeader label="Role" col="role" />
                  <SortableHeader label="Signed Up" col="createdAt" />
                  <SortableHeader label="Last Active" col="lastSignIn" />
                  <SortableHeader label="Status" col="status" />
                  <th className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedList.map((m: PlatformMember) => {
                  const RoleIcon = ROLE_ICON[m.role] || Shield;
                  const roleColor = ROLE_COLOR[m.role] || ROLE_COLOR.platform_analyst;
                  const showActions = !isOwnerRow(m) && !isSelf(m);
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                            {(m.name || m.email)[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white truncate max-w-[200px]">
                              {m.name || '(No name)'}
                            </span>
                            {isSelf(m) && (
                              <span className="text-[10px] uppercase tracking-wider text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-semibold">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap truncate max-w-[220px]">
                        {m.email}
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleColor}`}>
                          <RoleIcon className="w-3 h-3" />
                          {ROLE_LABEL[m.role] || m.role}
                        </span>
                      </td>
                      {/* Signed Up */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {formatDate(m.createdAt)}
                      </td>
                      {/* Last Active */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {formatRelative(m.lastSignIn)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {m.isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Suspended
                          </span>
                        ) : m.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Inactive
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {showActions ? (
                          <div className="relative" ref={openDropdown === m.id ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => {
                                if (openDropdown === m.id) {
                                  setOpenDropdown(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setDropdownPos({ top: rect.bottom + 4, left: rect.right - 192 });
                                  setOpenDropdown(m.id);
                                }
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                              title="More actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openDropdown === m.id && (
                              <div
                                ref={dropdownRef}
                                className="fixed w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1"
                                style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                              >
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => openChangeRole(m)}
                                >
                                  <ArrowLeftRight className="w-4 h-4" /> Change Role
                                </button>
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleResetPassword(m)}
                                >
                                  <Mail className="w-4 h-4" /> Reset Password
                                </button>
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => { setOpenDropdown(null); setSetPasswordTarget(m); }}
                                >
                                  <KeyRound className="w-4 h-4" /> Set New Password
                                </button>
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleForceLogout(m)}
                                >
                                  <LogOut className="w-4 h-4" /> Force Logout
                                </button>
                                <div className="border-t border-slate-700 my-1" />
                                {m.isSuspended ? (
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2"
                                    onClick={() => handleToggleSuspend(m)}
                                  >
                                    <ShieldCheck className="w-4 h-4" /> Reactivate Account
                                  </button>
                                ) : (
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                                    onClick={() => handleToggleSuspend(m)}
                                  >
                                    <ShieldBan className="w-4 h-4" /> Suspend Account
                                  </button>
                                )}
                                <div className="border-t border-slate-700 my-1" />
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleRemove(m)}
                                >
                                  <Trash2 className="w-4 h-4" /> Remove
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">{isSelf(m) ? 'You' : 'Owner'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && displayed.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <span className="text-sm text-slate-400">
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, displayed.length)}{'-'}{Math.min(currentPage * rowsPerPage, displayed.length)} of {displayed.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-300 px-2">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {!inviteResult ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Invite Platform Staff</h2>
                  <button onClick={closeInviteModal} className="p-1 text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="e.g. Jane Smith"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="jane@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
                  >
                    <option value="platform_support">Support — Can view customers, fuel & toll data</option>
                    <option value="platform_analyst">Analyst — Dashboard access only</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={closeInviteModal}
                    className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
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
                  <h2 className="text-lg font-bold text-white">Staff Invited Successfully</h2>
                  <button onClick={closeInviteModal} className="p-1 text-slate-400 hover:text-white">
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
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none"
                    />
                    <button
                      onClick={handleCopyPassword}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
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
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Change Role</h2>
            <p className="text-sm text-slate-400">
              Change role for <strong className="text-white">{roleChangeTarget.name || roleChangeTarget.email}</strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">New Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
              >
                <option value="platform_support">Support</option>
                <option value="platform_analyst">Analyst</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setRoleChangeTarget(null)}
                disabled={roleChangeLoading}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
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
      <th className="px-4 py-3 whitespace-nowrap">
        <button
          onClick={() => toggleSort(col)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-white transition-colors"
        >
          {label}
          <SortIcon col={col} />
        </button>
      </th>
    );
  }
}