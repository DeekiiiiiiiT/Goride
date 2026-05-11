import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Loader2,
  AlertCircle,
  UsersRound,
  ChevronUp,
  ChevronDown,
  Filter,
  RefreshCw,
  MoreVertical,
  Mail,
  LogOut,
  ShieldBan,
  ShieldCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  UserCog,
  Trash2,
  X,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { resolveRole } from '../../utils/permissions';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from 'sonner@2.0.3';
import { ConfirmationModal } from './ConfirmationModal';
import { SetPasswordModal } from './SetPasswordModal';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  status: 'active' | 'inactive';
  isSuspended: boolean;
}

type SortKey = 'name' | 'email' | 'role' | 'organizationName' | 'createdAt' | 'lastSignIn' | 'status';
type SortDir = 'asc' | 'desc';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function roleLabel(role: string): string {
  switch (role) {
    case 'fleet_manager': return 'Fleet Manager';
    case 'fleet_accountant': return 'Fleet Accountant';
    case 'fleet_viewer': return 'Fleet Viewer';
    default: return role;
  }
}

function roleBadgeClasses(role: string): string {
  switch (role) {
    case 'fleet_manager': return 'bg-blue-500/15 text-blue-400';
    case 'fleet_accountant': return 'bg-emerald-500/15 text-emerald-400';
    case 'fleet_viewer': return 'bg-slate-700/50 text-slate-400';
    default: return 'bg-slate-700/50 text-slate-400';
  }
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function TeamMembers() {
  const { session, role } = useAuth();
  const queryClient = useQueryClient();

  const resolved = resolveRole(role || (session?.user as any)?.user_metadata?.role);
  const isPlatformOwner = resolved === 'platform_owner';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'default'; confirmLabel: string; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', onConfirm: () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Change role modal
  const [changeRoleMember, setChangeRoleMember] = useState<TeamMember | null>(null);
  const [newRole, setNewRole] = useState('fleet_manager');
  const [changeRoleLoading, setChangeRoleLoading] = useState(false);

  // Phase 7: Set Password modal
  const [setPasswordTarget, setSetPasswordTarget] = useState<TeamMember | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const accessToken = session?.access_token;

  const { data: members = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['adminTeamMembers'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/team-members`, {
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

  const stats = useMemo(() => {
    const total = members.length;
    const managers = members.filter((m: TeamMember) => m.role === 'fleet_manager').length;
    const accountants = members.filter((m: TeamMember) => m.role === 'fleet_accountant').length;
    const viewers = members.filter((m: TeamMember) => m.role === 'fleet_viewer').length;
    return { total, managers, accountants, viewers };
  }, [members]);

  const orgNames = useMemo(() => {
    const names = new Set<string>();
    members.forEach((m: TeamMember) => { if (m.organizationName) names.add(m.organizationName); });
    return Array.from(names).sort();
  }, [members]);

  const displayed = useMemo(() => {
    let list = [...members] as TeamMember[];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    if (roleFilter !== 'all') list = list.filter(m => m.role === roleFilter);
    if (orgFilter !== 'all') list = list.filter(m => m.organizationName === orgFilter);
    if (statusFilter === 'suspended') list = list.filter(m => m.isSuspended);
    else if (statusFilter !== 'all') list = list.filter(m => !m.isSuspended && m.status === statusFilter);

    list.sort((a, b) => {
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
  }, [members, search, roleFilter, orgFilter, statusFilter, sortKey, sortDir]);

  useEffect(() => { setCurrentPage(1); }, [search, roleFilter, orgFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(displayed.length / rowsPerPage);
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return displayed.slice(start, start + rowsPerPage);
  }, [displayed, currentPage, rowsPerPage]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-slate-600" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-amber-400" /> : <ChevronDown className="w-3 h-3 text-amber-400" />;
  };

  function SortableHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <th className="px-4 py-3 whitespace-nowrap">
        <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-white transition-colors">
          {label}
          <SortIcon col={col} />
        </button>
      </th>
    );
  }

  // Actions
  const handleChangeRoleSubmit = async () => {
    if (!changeRoleMember) return;
    setChangeRoleLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/team-members/${changeRoleMember.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`${changeRoleMember.name || changeRoleMember.email}'s role changed to ${roleLabel(newRole)}`);
      setChangeRoleMember(null);
      queryClient.invalidateQueries({ queryKey: ['adminTeamMembers'] });
    } catch (err: any) {
      console.error('Change role error:', err);
      toast.error(err.message || 'Failed to change role');
    } finally {
      setChangeRoleLoading(false);
    }
  };

  const handleRemove = (member: TeamMember) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Remove Team Member',
      message: `Permanently delete ${member.name || member.email} from the system? This will remove their account entirely. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Remove Member',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/team-members/${member.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${member.name || member.email} has been removed`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminTeamMembers'] });
        } catch (err: any) {
          console.error('Remove member error:', err);
          toast.error(err.message || 'Failed to remove member');
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleResetPassword = (member: TeamMember) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true, title: 'Reset Password',
      message: `Send a password reset for ${member.name || 'this member'} (${member.email})?`,
      variant: 'warning', confirmLabel: 'Reset Password',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ email: member.email }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`Password reset initiated for ${member.email}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          console.error('Reset password error:', err);
          toast.error(err.message || 'Failed to reset password');
        } finally { setConfirmLoading(false); }
      },
    });
  };

  const handleForceLogout = (member: TeamMember) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true, title: 'Force Logout',
      message: `Force logout ${member.name || 'this member'}? They will be removed from all active sessions.`,
      variant: 'danger', confirmLabel: 'Force Logout',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/force-logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: member.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`All sessions terminated for ${member.name || member.email}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminTeamMembers'] });
        } catch (err: any) {
          console.error('Force logout error:', err);
          toast.error(err.message || 'Failed to force logout');
        } finally { setConfirmLoading(false); }
      },
    });
  };

  const handleToggleSuspend = (member: TeamMember) => {
    setOpenDropdown(null);
    const isSuspending = !member.isSuspended;
    setConfirmModal({
      isOpen: true,
      title: isSuspending ? 'Suspend Account' : 'Reactivate Account',
      message: isSuspending
        ? `Suspend ${member.name || 'this member'}'s account? They will be unable to log in until reactivated.`
        : `Reactivate ${member.name || 'this member'}'s account?`,
      variant: isSuspending ? 'danger' : 'default',
      confirmLabel: isSuspending ? 'Suspend Account' : 'Reactivate',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/toggle-suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: member.id, suspend: isSuspending }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${member.name || member.email} has been ${isSuspending ? 'suspended' : 'reactivated'}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminTeamMembers'] });
        } catch (err: any) {
          console.error('Toggle suspend error:', err);
          toast.error(err.message || `Failed to ${isSuspending ? 'suspend' : 'reactivate'} account`);
        } finally { setConfirmLoading(false); }
      },
    });
  };

  // CSV Export
  const handleExport = () => {
    const DQ = String.fromCharCode(34);
    const esc = (v: string) => (v.includes(',') || v.includes(DQ) || v.includes('\n')) ? DQ + v.replace(new RegExp(DQ, 'g'), DQ + DQ) + DQ : v;
    const headers = ['Name', 'Email', 'Role', 'Organization', 'Signed Up', 'Last Active', 'Status'];
    const rows = displayed.map(m => [
      esc(m.name || '(No name)'), esc(m.email), esc(roleLabel(m.role)), esc(m.organizationName || 'N/A'),
      esc(formatDate(m.createdAt)), esc(m.lastSignIn ? formatDate(m.lastSignIn) : 'Never'),
      esc(m.isSuspended ? 'Suspended' : m.status === 'active' ? 'Active' : 'Inactive'),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roam-fleet-team-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Fleet Team Members</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {displayed.length} result{displayed.length !== 1 ? 's' : ''}
            {displayed.length !== members.length ? ` (filtered from ${members.length})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={displayed.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => refetch()} disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Members', value: stats.total, color: 'text-white' },
          { label: 'Fleet Managers', value: stats.managers, color: 'text-blue-400' },
          { label: 'Fleet Accountants', value: stats.accountants, color: 'text-emerald-400' },
          { label: 'Fleet Viewers', value: stats.viewers, color: 'text-slate-300' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="appearance-none px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer">
          <option value="all">All Roles</option>
          <option value="fleet_manager">Fleet Manager</option>
          <option value="fleet_accountant">Fleet Accountant</option>
          <option value="fleet_viewer">Fleet Viewer</option>
        </select>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
            className="appearance-none pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer">
            <option value="all">All Organizations</option>
            {orgNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="appearance-none px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && displayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-slate-800 p-4 rounded-2xl mb-4"><UsersRound className="w-8 h-8 text-slate-500" /></div>
          <h3 className="text-base font-semibold text-white mb-1">
            {search || roleFilter !== 'all' || orgFilter !== 'all' || statusFilter !== 'all' ? 'No matching team members' : 'No team members yet'}
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            {search || roleFilter !== 'all' || orgFilter !== 'all' || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Fleet team members will appear here once fleet owners invite them.'}
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
                  <SortableHeader label="Organization" col="organizationName" />
                  <SortableHeader label="Signed Up" col="createdAt" />
                  <SortableHeader label="Last Active" col="lastSignIn" />
                  <SortableHeader label="Status" col="status" />
                  <th className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedList.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                          {(m.name || m.email)[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-white truncate max-w-[200px]">{m.name || '(No name)'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap truncate max-w-[220px]">{m.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${roleBadgeClasses(m.role)}`}>
                        {roleLabel(m.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap truncate max-w-[180px]">{m.organizationName || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatRelative(m.lastSignIn)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {m.isSuspended ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Suspended
                        </span>
                      ) : m.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="relative" ref={openDropdown === m.id ? dropdownRef : undefined}>
                        <button
                          onClick={(e) => {
                            if (openDropdown === m.id) { setOpenDropdown(null); return; }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDropdownPos({ top: rect.bottom + 4, left: rect.right - 192 });
                            setOpenDropdown(m.id);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="More actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openDropdown === m.id && (
                          <div ref={dropdownRef} className="fixed w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1"
                            style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}>
                            {isPlatformOwner && (
                              <button className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => { setOpenDropdown(null); setChangeRoleMember(m); setNewRole(m.role); }}>
                                <UserCog className="w-4 h-4" /> Change Role
                              </button>
                            )}
                            <button className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                              onClick={() => handleResetPassword(m)}>
                              <Mail className="w-4 h-4" /> Reset Password
                            </button>
                            {isPlatformOwner && (
                              <button className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => { setOpenDropdown(null); setSetPasswordTarget(m); }}>
                                <KeyRound className="w-4 h-4" /> Set New Password
                              </button>
                            )}
                            <button className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                              onClick={() => handleForceLogout(m)}>
                              <LogOut className="w-4 h-4" /> Force Logout
                            </button>
                            <div className="border-t border-slate-700 my-1" />
                            {m.isSuspended ? (
                              <button className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => handleToggleSuspend(m)}>
                                <ShieldCheck className="w-4 h-4" /> Reactivate Account
                              </button>
                            ) : (
                              <button className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => handleToggleSuspend(m)}>
                                <ShieldBan className="w-4 h-4" /> Suspend Account
                              </button>
                            )}
                            {isPlatformOwner && (
                              <>
                                <div className="border-t border-slate-700 my-1" />
                                <button className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleRemove(m)}>
                                  <Trash2 className="w-4 h-4" /> Remove from Org
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
            <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50">
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
            </select>
          </div>
          <span className="text-sm text-slate-400">
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, displayed.length)}-{Math.min(currentPage * rowsPerPage, displayed.length)} of {displayed.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-300 px-2">{currentPage} / {totalPages || 1}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {changeRoleMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Change Role</h2>
              <button onClick={() => setChangeRoleMember(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-400">
              Change role for <span className="text-white font-medium">{changeRoleMember.name || changeRoleMember.email}</span>
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">New Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                <option value="fleet_manager">Fleet Manager</option>
                <option value="fleet_accountant">Fleet Accountant</option>
                <option value="fleet_viewer">Fleet Viewer</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setChangeRoleMember(null)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleChangeRoleSubmit} disabled={newRole === changeRoleMember.role || changeRoleLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50">
                {changeRoleLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Role
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
}