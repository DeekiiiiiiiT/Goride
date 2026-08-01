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
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { recoveryRedirectForSurface, type AuthRecoverySurface } from '@roam/auth-client';
import { toast } from 'sonner';
import { ConfirmationModal } from './ConfirmationModal';
import { SetPasswordModal } from './SetPasswordModal';
import type { CustomerAccountsProps } from './types';
import { deriveAccountCapabilities } from './capabilities';
import { buildCustomerApiPaths, productLineHeaders } from './apiPaths';
import {
  BIZ_ICON,
  BIZ_LABEL,
  BIZ_COLOR,
  businessTypeKeysForProductLine,
  defaultBusinessTypeForProductLine,
} from './businessTypeUi';
import { formatDate, formatRelative } from './formatters';

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

function recoverySurfaceForCustomers(
  apiNamespace: CustomerAccountsProps['apiNamespace'],
  productLine: 'enterprise' | 'fleet',
): AuthRecoverySurface {
  if (apiNamespace === '/enterprise-admin') return 'enterprise';
  return productLine === 'enterprise' ? 'enterprise' : 'fleet';
}

export function CustomerAccounts({
  productLine,
  apiBaseUrl,
  accessToken,
  callerRole,
  apiNamespace,
  pageTitle,
  subtitle,
  renderOrganizationDetail,
}: CustomerAccountsProps) {
  const resolvedTitle =
    pageTitle ??
    (productLine === 'fleet' ? 'Fleet customer accounts' : 'Enterprise customer accounts');
  const resolvedSubtitle =
    subtitle ??
    (productLine === 'fleet'
      ? 'Rideshare fleet organizations (customers on the Fleet product line).'
      : 'Enterprise organizations onboarded outside core rideshare fleets.');

  const queryClient = useQueryClient();
  const api = buildCustomerApiPaths(apiBaseUrl, apiNamespace);
  const caps = deriveAccountCapabilities(callerRole, apiNamespace);
  const { canSuspend, canEditUser, canCreate, canResetPassword, canFullDelete, canEdit } = caps;
  const recoverySurface = recoverySurfaceForCustomers(apiNamespace, productLine);
  const defaultBizType = defaultBusinessTypeForProductLine(productLine);

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
  const [createBizType, setCreateBizType] = useState(defaultBizType);
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ password: string; email: string } | null>(null);
  const [createCopied, setCreateCopied] = useState(false);

  // Phase 6: Organization detail drill-down
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Phase 7: Set Password modal
  const [setPasswordTarget, setSetPasswordTarget] = useState<Customer | null>(null);

  // Phase 8: Full delete modal (superadmin only)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: customers = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['adminCustomers', productLine, apiNamespace],
    queryFn: async () => {
      const qs = new URLSearchParams({ productLine });
      const res = await fetch(`${api.listCustomers}?${qs.toString()}`, {
        headers: productLineHeaders(accessToken, productLine),
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
  const bizTypes = useMemo(() => businessTypeKeysForProductLine(productLine), [productLine]);

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
    if (!editingCustomer || !api.updateUser) return;
    try {
      const res = await fetch(api.updateUser, {
        method: 'POST',
        headers: productLineHeaders(accessToken, productLine, true),
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
          const res = await fetch(api.resetPassword, {
            method: 'POST',
            headers: productLineHeaders(accessToken, productLine, true),
            body: JSON.stringify({
              email: customer.email,
              redirectTo: recoveryRedirectForSurface(recoverySurface),
            }),
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
          const res = await fetch(api.forceLogout, {
            method: 'POST',
            headers: productLineHeaders(accessToken, productLine, true),
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
          const res = await fetch(api.toggleSuspend, {
            method: 'POST',
            headers: productLineHeaders(accessToken, productLine, true),
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

  // Phase 8: Full platform delete (superadmin only)
  const handleOpenDeleteModal = (customer: Customer) => {
    setOpenDropdown(null);
    setDeleteTarget(customer);
    setDeleteConfirmEmail('');
  };

  const handleFullDelete = async () => {
    if (!deleteTarget || deleteConfirmEmail.toLowerCase() !== deleteTarget.email.toLowerCase()) return;
    const deleteUrl = api.fullDelete(deleteTarget.id);
    if (!deleteUrl) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: productLineHeaders(accessToken, productLine),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`${deleteTarget.email} has been permanently deleted from all Roam products`);
      setDeleteTarget(null);
      setDeleteConfirmEmail('');
      refetch();
    } catch (err: any) {
      console.error('Full delete error:', err);
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setDeleteLoading(false);
    }
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
      const res = await fetch(api.createCustomer, {
        method: 'POST',
        headers: productLineHeaders(accessToken, productLine, true),
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
    setCreateBizType(defaultBizType);
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
  if (selectedOrgId && renderOrganizationDetail) {
    return renderOrganizationDetail({
      orgId: selectedOrgId,
      accessToken,
      onBack: () => setSelectedOrgId(null),
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{resolvedTitle}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-xl">{resolvedSubtitle}</p>
          <p className="text-xs text-slate-500 mt-2">
            {displayed.length} result{displayed.length !== 1 ? 's' : ''}
            {displayed.length !== customers.length ? ` (filtered from ${customers.length})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
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
            className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => { void refetch(); }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
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
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
          />
        </div>

        {/* Business type filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <select
            value={bizFilter}
            onChange={e => setBizFilter(e.target.value)}
            className="appearance-none pl-9 pr-8 py-2 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
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
            className="appearance-none pl-3 pr-8 py-2 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
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
          <div className="bg-slate-100 p-4 rounded-2xl mb-4 dark:bg-slate-800">
            <Users className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            {search || bizFilter !== 'all' || statusFilter !== 'all' ? 'No matching accounts' : 'No customer accounts yet'}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs">
            {search || bizFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Fleet managers will appear here after they sign up.'}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && displayed.length > 0 && (
        <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl">
          <div className="overflow-x-auto" style={{ overflow: 'visible' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left">
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
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {paginatedList.map(c => {
                  const Icon = BIZ_ICON[c.businessType] || Car;
                  const colorCls = BIZ_COLOR[c.businessType] || BIZ_COLOR.rideshare;
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/50${renderOrganizationDetail ? ' cursor-pointer' : ''}`}
                      onClick={() => renderOrganizationDetail && setSelectedOrgId(c.id)}
                    >
                      {/* Name */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex dark:bg-slate-800 items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                            {(c.name || c.email)[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
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
                          {canEditUser && (
                            <button
                              onClick={() => openEditModal(c)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-slate-900 transition-colors dark:hover:text-white"
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
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-slate-900 transition-colors dark:hover:text-white"
                              title="More actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openDropdown === c.id && (
                              <div
                                ref={dropdownRef}
                                className="fixed w-48 bg-white border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700 shadow-xl py-1"
                                style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                              >
                                {canResetPassword && (
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                    onClick={() => handleResetPassword(c)}
                                  >
                                    <Mail className="w-4 h-4" /> Reset Password
                                  </button>
                                )}
                                {canEdit && (
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                    onClick={() => { setOpenDropdown(null); setSetPasswordTarget(c); }}
                                  >
                                    <KeyRound className="w-4 h-4" /> Set New Password
                                  </button>
                                )}
                                <button
                                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                  onClick={() => handleForceLogout(c)}
                                >
                                  <LogOut className="w-4 h-4" /> Force Logout
                                </button>
                                <div className="border-t border-slate-200 my-1 dark:border-slate-700" />
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
                                {canFullDelete && (
                                  <>
                                    <div className="border-t border-slate-200 my-1 dark:border-slate-700" />
                                    <button
                                      className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-slate-700 flex items-center gap-2"
                                      onClick={() => handleOpenDeleteModal(c)}
                                    >
                                      <Trash2 className="w-4 h-4" /> Delete Platform Account
                                    </button>
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
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl px-4 py-3 gap-3">
          {/* Left: rows per page */}
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          {/* Center: showing X–Y of Z */}
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, displayed.length)}{'-'}{Math.min(currentPage * rowsPerPage, displayed.length)} of {displayed.length}
          </span>
          {/* Right: prev/next buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 dark:hover:bg-slate-800 dark:text-slate-400 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300 px-2">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 dark:hover:bg-slate-800 dark:text-slate-400 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit Customer</h2>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                placeholder="Customer name"
              />
            </div>

            {/* Business Type */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Business Type</label>
              <select
                value={editBizType}
                onChange={e => setEditBizType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
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
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border border-slate-300 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors"
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
          <div className="bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {!createResult ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Customer Account</h2>
                  <button onClick={closeCreateModal} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="e.g. Marcus Williams"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={e => setCreateEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="marcus@fleet.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Business Type</label>
                  <select
                    value={createBizType}
                    onChange={e => setCreateBizType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
                  >
                    {Object.entries(BIZ_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={closeCreateModal}
                    className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border border-slate-300 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors"
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
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Account Created Successfully</h2>
                  <button onClick={closeCreateModal} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white">
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
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono focus:outline-none"
                    />
                    <button
                      onClick={handleCopyCreatePassword}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors"
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
          accessToken={accessToken}
          productLine={productLine}
          setPasswordUrl={api.setPassword}
          onClose={() => setSetPasswordTarget(null)}
        />
      )}

      {/* Full Delete Modal (superadmin only) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="bg-red-500/20 p-2 rounded-full">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Delete Platform Account</h2>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300">
                <strong>Warning:</strong> This action is <strong>permanent and irreversible</strong>.
              </p>
            </div>

            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p>
                Deleting <strong>{deleteTarget.name || deleteTarget.email}</strong> will:
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 pl-2">
                <li>Remove their Driver profile (if any)</li>
                <li>Remove their Rider profile (if any)</li>
                <li>Remove their Fleet membership (if any)</li>
                <li>Sign them out of all devices</li>
                <li>Permanently delete their auth account</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Type <span className="text-amber-400 font-mono">{deleteTarget.email}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmEmail}
                onChange={e => setDeleteConfirmEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                placeholder={deleteTarget.email}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmEmail(''); }}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border border-slate-300 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFullDelete}
                disabled={deleteLoading || deleteConfirmEmail.toLowerCase() !== deleteTarget.email.toLowerCase()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Inner component for sortable table headers
  function SortableHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <th className="px-4 py-3 whitespace-nowrap">
        <button
          onClick={() => toggleSort(col)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-900 transition-colors dark:hover:text-white"
        >
          {label}
          <SortIcon col={col} />
        </button>
      </th>
    );
  }
}