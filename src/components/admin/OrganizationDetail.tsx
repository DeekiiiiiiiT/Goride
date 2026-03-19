import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Users,
  Car,
  Truck,
  Fuel,
  MapPin,
  Navigation,
  Mail,
  LogOut,
  ShieldBan,
  ShieldCheck,
  Pencil,
  X,
  Package,
  Ship,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { resolveRole } from '../../utils/permissions';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from 'sonner@2.0.3';
import { ConfirmationModal } from './ConfirmationModal';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface OrgOwner {
  id: string;
  name: string;
  email: string;
  businessType: string;
  createdAt: string | null;
  lastSignIn: string | null;
  status: 'active' | 'inactive';
  isSuspended: boolean;
}

interface OrgStats {
  teamMembers: number;
  drivers: number;
  vehicles: number;
  trips: number;
  fuelEntries: number;
  tollEntries: number;
}

interface OrgTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  lastSignIn: string | null;
  status: string;
  isSuspended: boolean;
}

interface OrgDriver {
  id: string;
  name: string;
  email: string;
  lastSignIn: string | null;
  status: string;
  isSuspended: boolean;
  isLinked: boolean;
}

interface OrgSummary {
  owner: OrgOwner;
  stats: OrgStats;
  teamMembers: OrgTeamMember[];
  drivers: OrgDriver[];
}

interface Props {
  orgId: string;
  onBack: () => void;
}

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
    case 'fleet_manager': return 'Manager';
    case 'fleet_accountant': return 'Accountant';
    case 'fleet_viewer': return 'Viewer';
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

const BIZ_LABELS: Record<string, string> = {
  rideshare: 'Rideshare', delivery: 'Delivery', logistics: 'Logistics', trucking: 'Trucking', maritime: 'Maritime',
};
const BIZ_COLORS: Record<string, string> = {
  rideshare: 'bg-blue-500/15 text-blue-400', delivery: 'bg-amber-500/15 text-amber-400',
  logistics: 'bg-purple-500/15 text-purple-400', trucking: 'bg-emerald-500/15 text-emerald-400',
  maritime: 'bg-cyan-500/15 text-cyan-400',
};
const BIZ_ICONS: Record<string, any> = {
  rideshare: Car, delivery: Package, logistics: Navigation, trucking: Truck, maritime: Ship,
};

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function OrganizationDetail({ orgId, onBack }: Props) {
  const { session, role } = useAuth();
  const queryClient = useQueryClient();
  const resolved = resolveRole(role || (session?.user as any)?.user_metadata?.role);
  const isPlatformOwner = resolved === 'platform_owner';
  const accessToken = session?.access_token;

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'default'; confirmLabel: string; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', onConfirm: () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBizType, setEditBizType] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const { data, isLoading, error: queryError } = useQuery<OrgSummary>({
    queryKey: ['adminOrgDetail', orgId],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/organizations/${orgId}/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as Error).message : null;
  const owner = data?.owner;
  const stats = data?.stats;
  const teamMembers = data?.teamMembers || [];
  const drivers = data?.drivers || [];

  // Actions
  const openEdit = () => {
    if (!owner) return;
    setEditName(owner.name);
    setEditBizType(owner.businessType);
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!owner) return;
    setEditLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers/${owner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: editName, businessType: editBizType }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      toast.success('Customer updated');
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['adminOrgDetail', orgId] });
      queryClient.invalidateQueries({ queryKey: ['adminCustomers'] });
    } catch (err: any) {
      console.error('Edit customer error:', err);
      toast.error(err.message || 'Failed to update');
    } finally {
      setEditLoading(false);
    }
  };

  const handleResetPassword = () => {
    if (!owner) return;
    setConfirmModal({
      isOpen: true, title: 'Reset Password', variant: 'warning', confirmLabel: 'Reset Password',
      message: `Send a password reset for ${owner.name || 'this owner'} (${owner.email})?`,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/reset-password`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ email: owner.email }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
          toast.success(`Password reset initiated for ${owner.email}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) { toast.error(err.message); } finally { setConfirmLoading(false); }
      },
    });
  };

  const handleForceLogout = () => {
    if (!owner) return;
    setConfirmModal({
      isOpen: true, title: 'Force Logout', variant: 'danger', confirmLabel: 'Force Logout',
      message: `Force logout ${owner.name}? All active sessions will be terminated.`,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/force-logout`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: owner.id }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
          toast.success('All sessions terminated');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminOrgDetail', orgId] });
        } catch (err: any) { toast.error(err.message); } finally { setConfirmLoading(false); }
      },
    });
  };

  const handleToggleSuspend = () => {
    if (!owner) return;
    const sus = !owner.isSuspended;
    setConfirmModal({
      isOpen: true, title: sus ? 'Suspend Account' : 'Reactivate Account', variant: sus ? 'danger' : 'default',
      confirmLabel: sus ? 'Suspend Account' : 'Reactivate',
      message: sus
        ? `Suspend ${owner.name}'s fleet? The owner and all team members will lose access.`
        : `Reactivate ${owner.name}'s fleet?`,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/toggle-suspend`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ userId: owner.id, suspend: sus }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
          toast.success(`${owner.name} has been ${sus ? 'suspended' : 'reactivated'}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          queryClient.invalidateQueries({ queryKey: ['adminOrgDetail', orgId] });
          queryClient.invalidateQueries({ queryKey: ['adminCustomers'] });
        } catch (err: any) { toast.error(err.message); } finally { setConfirmLoading(false); }
      },
    });
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Customer Accounts
        </button>
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      </div>
    );
  }

  if (!owner) return null;

  const BizIcon = BIZ_ICONS[owner.businessType] || Car;
  const bizColor = BIZ_COLORS[owner.businessType] || BIZ_COLORS.rideshare;
  const bizLabel = BIZ_LABELS[owner.businessType] || owner.businessType;

  const statCards = [
    { label: 'Team Members', value: stats?.teamMembers ?? 0, icon: Users, color: 'text-blue-400' },
    { label: 'Drivers', value: stats?.drivers ?? 0, icon: Car, color: 'text-amber-400' },
    { label: 'Vehicles', value: stats?.vehicles ?? 0, icon: Truck, color: 'text-emerald-400' },
    { label: 'Trips', value: stats?.trips ?? 0, icon: Navigation, color: 'text-purple-400' },
    { label: 'Fuel Entries', value: stats?.fuelEntries ?? 0, icon: Fuel, color: 'text-orange-400' },
    { label: 'Toll Entries', value: stats?.tollEntries ?? 0, icon: MapPin, color: 'text-cyan-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Customer Accounts
      </button>

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
              <BizIcon className="w-6 h-6 text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{owner.name || '(No name)'}</h1>
              <p className="text-sm text-slate-400 mt-0.5">{owner.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bizColor}`}>
                  {bizLabel}
                </span>
                {owner.isSuspended ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Suspended
                  </span>
                ) : owner.status === 'active' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Inactive
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span>Signed up {formatDate(owner.createdAt)}</span>
                <span>Last active {formatRelative(owner.lastSignIn)}</span>
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {isPlatformOwner && (
              <button onClick={openEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button onClick={handleResetPassword}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors">
              <Mail className="w-3.5 h-3.5" /> Reset Password
            </button>
            <button onClick={handleForceLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Force Logout
            </button>
            {isPlatformOwner && (
              owner.isSuspended ? (
                <button onClick={handleToggleSuspend}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg transition-colors">
                  <ShieldCheck className="w-3.5 h-3.5" /> Reactivate
                </button>
              ) : (
                <button onClick={handleToggleSuspend}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg transition-colors">
                  <ShieldBan className="w-3.5 h-3.5" /> Suspend
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Two-column tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Members */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" /> Team Members
              <span className="text-xs text-slate-500 font-normal">({teamMembers.length})</span>
            </h3>
          </div>
          {teamMembers.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-500">No team members invited yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {teamMembers.map(m => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-white text-sm truncate max-w-[180px]">{m.name || '(No name)'}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[180px]">{m.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClasses(m.role)}`}>
                          {roleLabel(m.role)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {m.isSuspended ? (
                          <span className="text-xs text-red-400">Suspended</span>
                        ) : m.status === 'active' ? (
                          <span className="text-xs text-emerald-400">Active</span>
                        ) : (
                          <span className="text-xs text-slate-500">Inactive</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Drivers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Car className="w-4 h-4 text-amber-400" /> Drivers
              <span className="text-xs text-slate-500 font-normal">({drivers.length})</span>
            </h3>
          </div>
          {drivers.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-500">No drivers linked to this fleet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {drivers.map(d => (
                    <tr key={d.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-white text-sm truncate max-w-[180px]">{d.name || '(No name)'}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[180px]">{d.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {d.isSuspended ? (
                          <span className="text-xs text-red-400">Suspended</span>
                        ) : d.status === 'active' ? (
                          <span className="text-xs text-emerald-400">Active</span>
                        ) : (
                          <span className="text-xs text-slate-500">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{formatRelative(d.lastSignIn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edit Customer</h2>
              <button onClick={() => setEditOpen(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Business Type</label>
              <select value={editBizType} onChange={e => setEditBizType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                <option value="rideshare">Rideshare</option>
                <option value="delivery">Delivery</option>
                <option value="logistics">Logistics</option>
                <option value="trucking">Trucking</option>
                <option value="maritime">Maritime</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOpen(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleEditSubmit} disabled={editLoading || !editName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50">
                {editLoading && <Loader2 className="w-4 h-4 animate-spin" />}
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
    </div>
  );
}
