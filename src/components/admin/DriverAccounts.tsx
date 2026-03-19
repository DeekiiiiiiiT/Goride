import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Loader2,
  AlertCircle,
  Users,
  Car,
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
  Link2,
  Unlink,
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
interface Driver {
  id: string;
  email: string;
  name: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  status: 'active' | 'inactive';
  isSuspended: boolean;
  isLinked: boolean;
}

interface FleetOwner {
  id: string;
  email: string;
  name: string;
  businessType: string;
}

type SortKey = 'name' | 'email' | 'organizationName' | 'createdAt' | 'lastSignIn' | 'status';
type SortDir = 'asc' | 'desc';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function formatDate(iso: string | null): string {
  if (!iso) return '—';
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

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function DriverAccounts() {
  const { session, role } = useAuth();
  const queryClient = useQueryClient();

  const resolved = resolveRole(role || (session?.user as any)?.user_metadata?.role);
  const isPlatformOwner = resolved === 'platform_owner';
  const isPlatformSupport = resolved === 'platform_support';
  const canSuspend = isPlatformOwner || isPlatformSupport;
  const canResetPassword = isPlatformOwner || isPlatformSupport;
  const canLinkUnlink = isPlatformOwner;

  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', onConfirm: () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Link modal state
  const [linkDriverId, setLinkDriverId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSelectedOrg, setLinkSelectedOrg] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  // Phase 7: Set Password modal
  const [setPasswordTarget, setSetPasswordTarget] = useState<Driver | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const accessToken = session?.access_token;

  // Fetch drivers
  const { data: drivers = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['adminDrivers'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/drivers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.drivers || [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!accessToken,
  });

  // Fetch fleet owners for linking
  const { data: fleetOwners = [] } = useQuery<FleetOwner[]>({
    queryKey: ['adminCustomers'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.customers || [];
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as Error).message : null;

  // Summary stats
  const stats = useMemo(() => {
    const total = drivers.length;
    const linked = drivers.filter((d: Driver) => d.isLinked).length;
    const unlinked = total - linked;
    const suspended = drivers.filter((d: Driver) => d.isSuspended).length;
    return { total, linked, unlinked, suspended };
  }, [drivers]);

  // Unique org names for filter
  const orgNames = useMemo(() => {
    const names = new Set<string>();
    drivers.forEach((d: Driver) => { if (d.organizationName) names.add(d.organizationName); });
    return Array.from(names).sort();
  }, [drivers]);

  // Filtered + sorted
  const displayed = useMemo(() => {
    let list = [...drivers] as Driver[];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q));
    }

    if (orgFilter === 'unlinked') {
      list = list.filter(d => !d.isLinked);
    } else if (orgFilter !== 'all') {
      list = list.filter(d => d.organizationName === orgFilter);
    }

    if (statusFilter === 'suspended') {
      list = list.filter(d => d.isSuspended);
    } else if (statusFilter !== 'all') {
      list = list.filter(d => !d.isSuspended && d.status === statusFilter);
    }

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
  }, [drivers, search, orgFilter, statusFilter, sortKey, sortDir]);

  useEffect(() => { setCurrentPage(1); }, [search, orgFilter, statusFilter, sortKey, sortDir]);

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

  // Action handlers
  const handleUnlink = (driver: Driver) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Unlink Driver',
      message: `Remove ${driver.name || driver.email} from "${driver.organizationName}"? They will become an unlinked driver.`,
      variant: 'warning',
      confirmLabel: 'Unlink Driver',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/drivers/${driver.id}/unlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${driver.name || driver.email} has been unlinked`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminDrivers'] });
        } catch (err: any) {
          console.error('Unlink driver error:', err);
          toast.error(err.message || 'Failed to unlink driver');
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const openLinkModal = (driverId: string) => {
    setOpenDropdown(null);
    setLinkDriverId(driverId);
    setLinkSearch('');
    setLinkSelectedOrg(null);
  };

  const handleLinkSubmit = async () => {
    if (!linkDriverId || !linkSelectedOrg) return;
    setLinkLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/drivers/${linkDriverId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ organizationId: linkSelectedOrg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(data.message || 'Driver linked successfully');
      setLinkDriverId(null);
      queryClient.invalidateQueries({ queryKey: ['adminDrivers'] });
    } catch (err: any) {
      console.error('Link driver error:', err);
      toast.error(err.message || 'Failed to link driver');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleResetPassword = (driver: Driver) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Reset Password',
      message: `Send a password reset for ${driver.name || 'this driver'} (${driver.email})?`,
      variant: 'warning',
      confirmLabel: 'Reset Password',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ email: driver.email }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`Password reset initiated for ${driver.email}`);
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

  const handleForceLogout = (driver: Driver) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Force Logout',
      message: `Force logout ${driver.name || 'this driver'}? They will be removed from all active sessions.`,
      variant: 'danger',
      confirmLabel: 'Force Logout',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/force-logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: driver.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`All sessions terminated for ${driver.name || driver.email}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminDrivers'] });
        } catch (err: any) {
          console.error('Force logout error:', err);
          toast.error(err.message || 'Failed to force logout');
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleToggleSuspend = (driver: Driver) => {
    setOpenDropdown(null);
    const isSuspending = !driver.isSuspended;
    setConfirmModal({
      isOpen: true,
      title: isSuspending ? 'Suspend Account' : 'Reactivate Account',
      message: isSuspending
        ? `Suspend ${driver.name || 'this driver'}'s account? They will be unable to log in until reactivated.`
        : `Reactivate ${driver.name || 'this driver'}'s account? They will be able to log in again.`,
      variant: isSuspending ? 'danger' : 'default',
      confirmLabel: isSuspending ? 'Suspend Account' : 'Reactivate',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/toggle-suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: driver.id, suspend: isSuspending }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${driver.name || driver.email} has been ${isSuspending ? 'suspended' : 'reactivated'}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminDrivers'] });
        } catch (err: any) {
          console.error('Toggle suspend error:', err);
          toast.error(err.message || `Failed to ${isSuspending ? 'suspend' : 'reactivate'} account`);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  // CSV Export
  const handleExport = () => {
    const DQ = String.fromCharCode(34);
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes(DQ) || val.includes('\n')) {
        return DQ + val.replace(new RegExp(DQ, 'g'), DQ + DQ) + DQ;
      }
      return val;
    };

    const headers = ['Name', 'Email', 'Organization', 'Signed Up', 'Last Active', 'Status'];
    const rows = displayed.map(d => [
      escapeCSV(d.name || '(No name)'),
      escapeCSV(d.email),
      escapeCSV(d.isLinked ? (d.organizationName || 'Unknown') : 'Unlinked'),
      escapeCSV(formatDate(d.createdAt)),
      escapeCSV(d.lastSignIn ? formatDate(d.lastSignIn) : 'Never'),
      escapeCSV(d.isSuspended ? 'Suspended' : d.status === 'active' ? 'Active' : 'Inactive'),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roam-fleet-drivers-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered fleet owners for link modal
  const filteredFleetOwners = useMemo(() => {
    if (!linkSearch.trim()) return fleetOwners;
    const q = linkSearch.toLowerCase();
    return fleetOwners.filter((o: FleetOwner) => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q));
  }, [fleetOwners, linkSearch]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Driver Accounts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {displayed.length} result{displayed.length !== 1 ? 's' : ''}
            {displayed.length !== drivers.length ? ` (filtered from ${drivers.length})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={displayed.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
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

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Drivers', value: stats.total, color: 'text-white' },
          { label: 'Linked', value: stats.linked, color: 'text-emerald-400' },
          { label: 'Unlinked', value: stats.unlinked, color: 'text-amber-400' },
          { label: 'Suspended', value: stats.suspended, color: 'text-red-400' },
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
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <select
            value={orgFilter}
            onChange={e => setOrgFilter(e.target.value)}
            className="appearance-none pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
          >
            <option value="all">All Organizations</option>
            <option value="unlinked">Unlinked</option>
            {orgNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
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
          <div className="bg-slate-800 p-4 rounded-2xl mb-4">
            <Car className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {search || orgFilter !== 'all' || statusFilter !== 'all' ? 'No matching drivers' : 'No driver accounts yet'}
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            {search || orgFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Drivers will appear here after they sign up.'}
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
                {paginatedList.map(d => (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                          {(d.name || d.email)[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-white truncate max-w-[200px]">{d.name || '(No name)'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap truncate max-w-[220px]">{d.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.isLinked ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">
                          <Link2 className="w-3 h-3" />
                          {d.organizationName || 'Unknown'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
                          <Unlink className="w-3 h-3" />
                          Unlinked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(d.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatRelative(d.lastSignIn)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.isSuspended ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Suspended
                        </span>
                      ) : d.status === 'active' ? (
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
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="relative" ref={openDropdown === d.id ? dropdownRef : undefined}>
                        <button
                          onClick={(e) => {
                            if (openDropdown === d.id) { setOpenDropdown(null); return; }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDropdownPos({ top: rect.bottom + 4, left: rect.right - 192 });
                            setOpenDropdown(d.id);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="More actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openDropdown === d.id && (
                          <div
                            ref={dropdownRef}
                            className="fixed w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1"
                            style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                          >
                            {canLinkUnlink && !d.isLinked && (
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => openLinkModal(d.id)}
                              >
                                <Link2 className="w-4 h-4" /> Link to Organization
                              </button>
                            )}
                            {canLinkUnlink && d.isLinked && (
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-amber-400 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => handleUnlink(d)}
                              >
                                <Unlink className="w-4 h-4" /> Unlink from Org
                              </button>
                            )}
                            {canLinkUnlink && <div className="border-t border-slate-700 my-1" />}
                            {canResetPassword && (
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => handleResetPassword(d)}
                              >
                                <Mail className="w-4 h-4" /> Reset Password
                              </button>
                            )}
                            {isPlatformOwner && (
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                onClick={() => { setOpenDropdown(null); setSetPasswordTarget(d); }}
                              >
                                <KeyRound className="w-4 h-4" /> Set New Password
                              </button>
                            )}
                            <button
                              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                              onClick={() => handleForceLogout(d)}
                            >
                              <LogOut className="w-4 h-4" /> Force Logout
                            </button>
                            <div className="border-t border-slate-700 my-1" />
                            {canSuspend && (
                              d.isSuspended ? (
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleToggleSuspend(d)}
                                >
                                  <ShieldCheck className="w-4 h-4" /> Reactivate Account
                                </button>
                              ) : (
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleToggleSuspend(d)}
                                >
                                  <ShieldBan className="w-4 h-4" /> Suspend Account
                                </button>
                              )
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
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-300 px-2">{currentPage} / {totalPages || 1}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Link to Organization Modal */}
      {linkDriverId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Link Driver to Organization</h2>
              <button onClick={() => setLinkDriverId(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Search Fleet Owners</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredFleetOwners.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No fleet owners found.</p>
              ) : (
                filteredFleetOwners.map((o: FleetOwner) => (
                  <button
                    key={o.id}
                    onClick={() => setLinkSelectedOrg(o.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      linkSelectedOrg === o.id
                        ? 'bg-amber-500/20 border border-amber-500/50 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-transparent'
                    }`}
                  >
                    <span className="font-medium">{o.name || '(No name)'}</span>
                    <span className="text-slate-500 ml-2 text-xs">{o.email}</span>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setLinkDriverId(null)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSubmit}
                disabled={!linkSelectedOrg || linkLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {linkLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Link Driver
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