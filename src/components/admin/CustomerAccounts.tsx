import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Loader2,
  AlertCircle,
  Users,
  Car,
  Package,
  Navigation,
  Truck,
  Ship,
  ChevronUp,
  ChevronDown,
  Filter,
  RefreshCw,
  Pencil,
  MoreVertical,
  Mail,
  LogOut,
  ShieldBan,
  ShieldCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Copy,
  Check,
  X,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { resolveRole } from '../../utils/permissions';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from 'sonner@2.0.3';
import { ConfirmationModal } from './ConfirmationModal';
import { OrganizationDetail } from './OrganizationDetail';
import { SetPasswordModal } from './SetPasswordModal';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface Customer {
  id: string;
  email: string;
  name: string;
  businessType: string;
  createdAt: string | null;
  lastSignIn: string | null;
  status: 'active' | 'inactive';
  isSuspended: boolean;
}

type SortKey = 'name' | 'email' | 'businessType' | 'createdAt' | 'lastSignIn' | 'status';
type SortDir = 'asc' | 'desc';

// -------------------------------------------------------------------
// Business type icon mapping
// -------------------------------------------------------------------
const BIZ_ICON: Record<string, React.ComponentType<any>> = {
  rideshare: Car,
  delivery: Package,
  taxi: Navigation,
  trucking: Truck,
  shipping: Ship,
};

const BIZ_LABEL: Record<string, string> = {
  rideshare: 'Rideshare',
  delivery: 'Delivery',
  taxi: 'Taxi / Cab',
  trucking: 'Trucking',
  shipping: 'Shipping',
};

const BIZ_COLOR: Record<string, string> = {
  rideshare: 'bg-blue-500/15 text-blue-400',
  delivery: 'bg-amber-500/15 text-amber-400',
  taxi: 'bg-emerald-500/15 text-emerald-400',
  trucking: 'bg-purple-500/15 text-purple-400',
  shipping: 'bg-cyan-500/15 text-cyan-400',
};

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function formatDate(iso: string | null): string {
  if (!iso) return '—';
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
export function CustomerAccounts() {
  const { session, role } = useAuth();
  const queryClient = useQueryClient();

  // Phase 11: Determine platform role capabilities
  const resolved = resolveRole(role || (session?.user as any)?.user_metadata?.role);
  const isPlatformOwner = resolved === 'platform_owner';
  const isPlatformSupport = resolved === 'platform_support';
  const canSuspend = isPlatformOwner || isPlatformSupport;    // owner + support can suspend
  const canEdit = isPlatformOwner;                             // only owner can edit details
  const canResetPassword = isPlatformOwner || isPlatformSupport;
  // platform_analyst gets read-only (no actions at all)

  const [search, setSearch] = useState('');
  const [bizFilter, setBizFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Edit modal state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editBizType, setEditBizType] = useState('');

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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Create customer modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createBizType, setCreateBizType] = useState('rideshare');
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ password: string; email: string } | null>(null);
  const [createCopied, setCreateCopied] = useState(false);

  // Phase 6: Organization detail drill-down
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Phase 7: Set Password modal
  const [setPasswordTarget, setSetPasswordTarget] = useState<Customer | null>(null);

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

  // Phase 6: React Query for admin customers caching
  const { data: customers = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['adminCustomers'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.customers || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes (fresher than other data since admin actions are frequent)
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as Error).message : null;

  // Derived: all business types (always show every type in filter)
  const bizTypes = useMemo(() => {
    return Object.keys(BIZ_LABEL).sort();
  }, []);

  // Filtered + sorted list
  const displayed = useMemo(() => {
    let list = [...customers];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      );
    }

    // Business type filter
    if (bizFilter !== 'all') {
      list = list.filter(c => c.businessType === bizFilter);
    }

    // Status filter
    if (statusFilter === 'suspended') {
      list = list.filter(c => c.isSuspended);
    } else if (statusFilter !== 'all') {
      list = list.filter(c => !c.isSuspended && c.status === statusFilter);
    }

    // Sort
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
  }, [customers, search, bizFilter, statusFilter, sortKey, sortDir]);

  // Reset to page 1 when filters/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, bizFilter, statusFilter, sortKey, sortDir]);

  // Paginated slice
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

  // Edit modal helpers
  const openEditModal = (customer: Customer) => {
    setOpenDropdown(null);
    setEditingCustomer(customer);
    setEditName(customer.name || '');
    setEditBizType(customer.businessType || 'rideshare');
  };

  const handleEditSave = async () => {
    if (!editingCustomer) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/update-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: editingCustomer.id,
          name: editName.trim(),
          businessType: editBizType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success('Customer updated successfully');
      setEditingCustomer(null);
      refetch();
    } catch (err: any) {
      console.error('Edit customer error:', err);
      toast.error(err.message || 'Failed to update customer');
    }
  };

  // Dropdown action handlers
  const handleResetPassword = (customer: Customer) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Reset Password',
      message: `Send a password reset for ${customer.name || 'this user'} (${customer.email})?`,
      variant: 'warning',
      confirmLabel: 'Reset Password',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ email: customer.email }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`Password reset initiated for ${customer.email}`);
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

  const handleForceLogout = (customer: Customer) => {
    setOpenDropdown(null);
    setConfirmModal({
      isOpen: true,
      title: 'Force Logout',
      message: `Force logout ${customer.name || 'this user'}? They will be removed from all active sessions.`,
      variant: 'danger',
      confirmLabel: 'Force Logout',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/force-logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: customer.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`All sessions terminated for ${customer.name || customer.email}`);
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

  const handleToggleSuspend = (customer: Customer) => {
    setOpenDropdown(null);
    const isSuspending = !customer.isSuspended;
    setConfirmModal({
      isOpen: true,
      title: isSuspending ? 'Suspend Account' : 'Reactivate Account',
      message: isSuspending
        ? `Suspend ${customer.name || 'this user'}'s account? They will be unable to log in until reactivated.`
        : `Reactivate ${customer.name || 'this user'}'s account? They will be able to log in again.`,
      variant: isSuspending ? 'danger' : 'default',
      confirmLabel: isSuspending ? 'Suspend Account' : 'Reactivate',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/toggle-suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: customer.id, suspend: isSuspending }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          toast.success(`${customer.name || customer.email} has been ${isSuspending ? 'suspended' : 'reactivated'}`);
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

  // CSV Export
  const handleExport = () => {
    const DQ = String.fromCharCode(34); // double-quote character
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes(DQ) || val.includes('\n')) {
        return DQ + val.replace(new RegExp(DQ, 'g'), DQ + DQ) + DQ;
      }
      return val;
    };

    const headers = ['Name', 'Email', 'Business Type', 'Signed Up', 'Last Active', 'Status'];
    const rows = displayed.map(c => [
      escapeCSV(c.name || '(No name)'),
      escapeCSV(c.email),
      escapeCSV(BIZ_LABEL[c.businessType] || c.businessType),
      escapeCSV(formatDate(c.createdAt)),
      escapeCSV(c.lastSignIn ? formatDate(c.lastSignIn) : 'Never'),
      escapeCSV(c.isSuspended ? 'Suspended' : c.status === 'active' ? 'Active' : 'Inactive'),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roam-fleet-customers-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Create customer
  const handleCreateCustomer = async () => {
    setCreateLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/create-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: createName.trim(),
          email: createEmail.trim(),
          businessType: createBizType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCreateResult({ password: data.temporaryPassword, email: createEmail.trim() });
      queryClient.invalidateQueries({ queryKey: ['adminCustomers'] });
    } catch (err: any) {
      console.error('Create customer error:', err);
      toast.error(err.message || 'Failed to create customer');
    } finally {
      setCreateLoading(false);
    }
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateName('');
    setCreateEmail('');
    setCreateBizType('rideshare');
    setCreateResult(null);
    setCreateCopied(false);
  };

  const handleCopyCreatePassword = () => {
    if (!createResult) return;
    navigator.clipboard.writeText(createResult.password);
    setCreateCopied(true);
    toast.success('Password copied to clipboard');
    setTimeout(() => setCreateCopied(false), 2000);
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  // Phase 6: If an org is selected, show the detail view
  if (selectedOrgId) {
    return <OrganizationDetail orgId={selectedOrgId} onBack={() => setSelectedOrgId(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Customer Accounts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {displayed.length} result{displayed.length !== 1 ? 's' : ''}
            {displayed.length !== customers.length ? ` (filtered from ${customers.length})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPlatformOwner && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Create Customer
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={displayed.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
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

        {/* Business type filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <select
            value={bizFilter}
            onChange={e => setBizFilter(e.target.value)}
            className="appearance-none pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
          >
            <option value="all">All Types</option>
            {bizTypes.map(bt => (
              <option key={bt} value={bt}>{BIZ_LABEL[bt] || bt}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
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
            <Users className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {search || bizFilter !== 'all' || statusFilter !== 'all' ? 'No matching accounts' : 'No customer accounts yet'}
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            {search || bizFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Fleet managers will appear here after they sign up.'}
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
                  <SortableHeader label="Business Type" col="businessType" />
                  <SortableHeader label="Signed Up" col="createdAt" />
                  <SortableHeader label="Last Active" col="lastSignIn" />
                  <SortableHeader label="Status" col="status" />
                  <th className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedList.map(c => {
                  const Icon = BIZ_ICON[c.businessType] || Car;
                  const colorCls = BIZ_COLOR[c.businessType] || BIZ_COLOR.rideshare;
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/50 cursor-pointer transition-colors" onClick={() => setSelectedOrgId(c.id)}>
                      {/* Name */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                            {(c.name || c.email)[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="font-medium text-white truncate max-w-[200px]">
                            {c.name || '(No name)'}
                          </span>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap truncate max-w-[220px]">
                        {c.email}
                      </td>
                      {/* Business Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorCls}`}>
                          <Icon className="w-3 h-3" />
                          {BIZ_LABEL[c.businessType] || c.businessType}
                        </span>
                      </td>
                      {/* Signed Up */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {formatDate(c.createdAt)}
                      </td>
                      {/* Last Active */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {formatRelative(c.lastSignIn)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Suspended
                          </span>
                        ) : c.status === 'active' ? (
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
                      <td className="px-4 py-3 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(c)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                              title="Edit customer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <div className="relative" ref={openDropdown === c.id ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => {
                                if (openDropdown === c.id) {
                                  setOpenDropdown(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setDropdownPos({ top: rect.bottom + 4, left: rect.right - 192 });
                                  setOpenDropdown(c.id);
                                }
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                              title="More actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openDropdown === c.id && (
                              <div
                                ref={dropdownRef}
                                className="fixed w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1"
                                style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                              >
                                {canResetPassword && (
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                    onClick={() => handleResetPassword(c)}
                                  >
                                    <Mail className="w-4 h-4" /> Reset Password
                                  </button>
                                )}
                                {isPlatformOwner && (
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                    onClick={() => { setOpenDropdown(null); setSetPasswordTarget(c); }}
                                  >
                                    <KeyRound className="w-4 h-4" /> Set New Password
                                  </button>
                                )}
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleForceLogout(c)}
                                >
                                  <LogOut className="w-4 h-4" /> Force Logout
                                </button>
                                <div className="border-t border-slate-700 my-1" />
                                {canSuspend && (
                                  <>
                                    {c.isSuspended ? (
                                      <button
                                        className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2"
                                        onClick={() => handleToggleSuspend(c)}
                                      >
                                        <ShieldCheck className="w-4 h-4" /> Reactivate Account
                                      </button>
                                    ) : (
                                      <button
                                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                                        onClick={() => handleToggleSuspend(c)}
                                      >
                                        <ShieldBan className="w-4 h-4" /> Suspend Account
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination controls */}
      {!loading && !error && displayed.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 gap-3">
          {/* Left: rows per page */}
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
          {/* Center: showing X–Y of Z */}
          <span className="text-sm text-slate-400">
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, displayed.length)}{'-'}{Math.min(currentPage * rowsPerPage, displayed.length)} of {displayed.length}
          </span>
          {/* Right: prev/next buttons */}
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

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Edit Customer</h2>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                placeholder="Customer name"
              />
            </div>

            {/* Business Type */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Business Type</label>
              <select
                value={editBizType}
                onChange={e => setEditBizType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
              >
                {Object.entries(BIZ_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {!createResult ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Create Customer Account</h2>
                  <button onClick={closeCreateModal} className="p-1 text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="e.g. Marcus Williams"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={e => setCreateEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="marcus@fleet.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Business Type</label>
                  <select
                    value={createBizType}
                    onChange={e => setCreateBizType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
                  >
                    {Object.entries(BIZ_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={closeCreateModal}
                    className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCustomer}
                    disabled={!createName.trim() || !createEmail.trim() || createLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {createLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create Account
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Account Created Successfully</h2>
                  <button onClick={closeCreateModal} className="p-1 text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  <p className="text-sm text-emerald-300">
                    Customer account created for <strong>{createResult.email}</strong>. Share the temporary password below securely.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Temporary Password</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createResult.password}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none"
                    />
                    <button
                      onClick={handleCopyCreatePassword}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
                    >
                      {createCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {createCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs text-amber-300">
                    This password will not be shown again. Make sure to copy it and share it securely with the customer.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={closeCreateModal}
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