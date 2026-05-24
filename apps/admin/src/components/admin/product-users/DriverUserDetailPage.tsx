import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { resolveRole } from '../../../utils/permissions';
import {
  deactivateDriver,
  deleteDriver,
  getDriver,
  reactivateDriver,
  signOutDriver,
  suspendDriver,
  unsuspendDriver,
} from '../../../services/platform/driverPlatformService';
import { API_ENDPOINTS } from '../../../services/apiConfig';

interface FleetOwnerSummary {
  id: string;
  email: string;
  name: string;
  businessType: string;
}

interface DriverUserDetailPageProps {
  userId: string;
  onBack: () => void;
}

export function DriverUserDetailPage({ userId, onBack }: DriverUserDetailPageProps) {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const resolved = resolveRole(role || (session?.user as { user_metadata?: { role?: string } })?.user_metadata?.role);
  const canWriteProduct = resolved === 'platform_owner' || resolved === 'platform_support';
  const canLinkFleet = resolved === 'platform_owner';

  const qc = useQueryClient();
  const [reason, setReason] = useState('Platform review');

  const detailQuery = useQuery({
    queryKey: ['platformDriverDetail', token, userId],
    queryFn: () => getDriver(token!, userId),
    enabled: !!token && !!userId,
  });

  const fleetOrgsQuery = useQuery({
    queryKey: ['adminCustomers', 'fleet', token],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers?productLine=fleet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.customers || []) as FleetOwnerSummary[];
    },
    enabled: !!token && canLinkFleet && !!detailQuery.data?.driver && !detailQuery.data.driver.fleet_id,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['platformDriverDetail', token, userId] });

  const suspendMut = useMutation({
    mutationFn: () => suspendDriver(token!, userId, reason),
    onSuccess: () => {
      toast.success('Driver suspended');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unsuspendMut = useMutation({
    mutationFn: () => unsuspendDriver(token!, userId),
    onSuccess: () => {
      toast.success('Driver unsuspended');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: () => deactivateDriver(token!, userId, reason),
    onSuccess: () => {
      toast.success('Driver deactivated');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: () => reactivateDriver(token!, userId),
    onSuccess: () => {
      toast.success('Driver reactivated');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signOutMut = useMutation({
    mutationFn: () => signOutDriver(token!, userId),
    onSuccess: () => {
      toast.success('Signed out on all driver devices');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteDriver(token!, userId),
    onSuccess: (out) => {
      toast.success(out.message || 'Driver profile removed');
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const linkMut = useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/drivers/${encodeURIComponent(userId)}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organizationId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    },
    onSuccess: (_b) => {
      toast.success('Driver linked to organization');
      setSelectedOrgId('');
      qc.invalidateQueries({ queryKey: ['adminCustomers'] });
      qc.invalidateQueries({ queryKey: ['adminDrivers'] });
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/drivers/${encodeURIComponent(userId)}/unlink`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success('Fleet link removed from auth metadata');
      qc.invalidateQueries({ queryKey: ['adminDrivers'] });
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!token) return null;

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  const { driver, permissions } = detailQuery.data;

  const busy =
    suspendMut.isPending ||
    unsuspendMut.isPending ||
    deactivateMut.isPending ||
    reactivateMut.isPending ||
    signOutMut.isPending ||
    deleteMut.isPending ||
    linkMut.isPending ||
    unlinkMut.isPending;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to directory
      </button>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-2">
        <h1 className="text-lg font-semibold text-white">{driver.display_name || 'Driver'}</h1>
        <p className="text-sm text-slate-400">{driver.email}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 capitalize">{driver.status}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">{driver.mode}</span>
          {driver.fleet_id && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">Fleet ID: {driver.fleet_id}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] uppercase tracking-wide text-slate-500">
          Moderation note (suspend / deactivate)
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
        />
      </div>

      {canLinkFleet && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">Fleet org link</h3>
          <p className="text-xs text-slate-500">
            Links the driver&apos;s fleet manager record (auth metadata). Unlink before reassigning.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => unlinkMut.mutate()}
              className="px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Unlink fleet
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
            >
              <option value="">Select rideshare fleet org…</option>
              {(fleetOrgsQuery.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || o.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedOrgId || busy}
              onClick={() => linkMut.mutate(selectedOrgId)}
              className="px-4 py-2 text-xs rounded-lg bg-amber-500 text-black font-medium disabled:opacity-40"
            >
              Link
            </button>
          </div>
        </div>
      )}

      {canWriteProduct && permissions.can_write && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => suspendMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-amber-200"
          >
            Suspend
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => unsuspendMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
          >
            Unsuspend
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => deactivateMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-red-500/10 border border-red-500/35 text-red-300"
          >
            Deactivate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reactivateMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-emerald-500/10 border border-emerald-600/35 text-emerald-300"
          >
            Reactivate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => signOutMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
          >
            Sign out all
          </button>
        </div>
      )}

      {permissions.can_delete && resolved === 'platform_owner' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete driver profile for ${driver.email}?`)) deleteMut.mutate();
          }}
          className="px-3 py-2 text-xs rounded-lg bg-red-600 hover:bg-red-500 text-white"
        >
          Delete driver profile (product-scope)
        </button>
      )}

      {!permissions.can_write && (
        <p className="text-xs text-slate-500">
          Token role cannot modify drivers on this deployment. Elevate privileges or redeploy RBAC-aware driver admin.
        </p>
      )}

      {detailQuery.error && (
        <p className="text-sm text-red-400">{(detailQuery.error as Error).message}</p>
      )}
    </div>
  );
}
