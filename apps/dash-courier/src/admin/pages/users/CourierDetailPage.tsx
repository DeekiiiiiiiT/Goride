import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ArrowLeft, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CourierDetailDto, CourierLiveStatus, CourierAdminPermissions } from '@roam/types/courier';
import {
  getCourierDetail,
  listCourierDeliveries,
  suspendCourier,
  unsuspendCourier,
  deactivateCourier,
  reactivateCourier,
  signOutCourier,
  resetCourierPassword,
  deleteCourier,
} from '../../services/courierAdminService';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { BlockerChips } from '../../components/ComplianceChecklist';
import { formatBlockersList } from '../../utils/complianceLabels';

interface OutletContext {
  session: Session;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function LiveBadge({ status }: { status: CourierLiveStatus }) {
  const styles =
    status === 'online'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'on_delivery'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  const label = status === 'on_delivery' ? 'On delivery' : status === 'online' ? 'Online' : 'Offline';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

export function CourierDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<OutletContext>();
  const { confirm, prompt } = useAdminConfirm();
  const navigate = useNavigate();
  const token = session.access_token;

  const [loading, setLoading] = useState(true);
  const [courier, setCourier] = useState<CourierDetailDto | null>(null);
  const [permissions, setPermissions] = useState<CourierAdminPermissions | null>(null);
  const [deliveries, setDeliveries] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const res = await getCourierDetail(token, userId);
      setCourier(res.courier);
      setPermissions(res.permissions);
      const d = await listCourierDeliveries(token, userId, { limit: 20 });
      setDeliveries(d.deliveries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load courier');
      setCourier(null);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!courier) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>Courier not found.</p>
        <Link to="/users" className="text-emerald-400 text-sm mt-2 inline-block">
          Back to directory
        </Link>
      </div>
    );
  }

  const canWrite = permissions?.can_write;

  const runSuspend = async () => {
    if (!userId || !canWrite) return;
    const values = await prompt({
      title: 'Suspend courier',
      description: 'The courier will be blocked until unsuspended.',
      confirmLabel: 'Suspend',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Suspension reason', required: true, multiline: true }],
    });
    if (!values) return;
    await suspendCourier(token, userId, values.reason);
    toast.success('Suspended');
    void load();
  };

  const runDeactivate = async () => {
    if (!userId || !canWrite) return;
    const values = await prompt({
      title: 'Deactivate courier',
      description: 'The courier profile will be deactivated.',
      confirmLabel: 'Deactivate',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Deactivation reason', required: true, multiline: true }],
    });
    if (!values) return;
    await deactivateCourier(token, userId, values.reason);
    toast.success('Deactivated');
    void load();
  };

  const runDelete = async () => {
    if (!userId || !permissions?.can_delete) return;
    const displayName = courier.display_name || courier.email || userId;
    const values = await prompt({
      title: 'Remove from Roam Courier?',
      description: (
        <>
          Permanently removes this courier profile from Roam Dash Courier. Roam login and profiles
          in Driver, Dash, or other apps are untouched.
        </>
      ),
      confirmLabel: 'Remove courier',
      variant: 'danger',
      fields: [
        { key: 'reason', label: 'Reason', required: true, multiline: true },
        {
          key: 'confirm_name',
          label: `Type "${displayName}" to confirm`,
          placeholder: displayName,
          required: true,
          matchValue: displayName,
        },
      ],
    });
    if (!values) return;
    await deleteCourier(token, userId);
    toast.success('Courier removed');
    navigate('/users');
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/users')} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-white truncate">
              {courier.display_name || courier.email || 'Courier'}
            </h2>
            <LiveBadge status={courier.live_status} />
            <span className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-300 capitalize">
              {courier.status}
            </span>
          </div>
          <p className="text-sm text-slate-400">{courier.email}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(courier.user_id);
            toast.success('User ID copied');
          }}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
        >
          <Copy className="w-3.5 h-3.5" />
          ID
        </button>
      </div>

      {courier.compliance && courier.compliance.blockers.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-200 mb-2">{formatBlockersList(courier.compliance.blockers)}</p>
          <BlockerChips blockers={courier.compliance.blockers} />
          <Link to={`/compliance?review=${courier.user_id}`} className="text-xs text-emerald-400 mt-2 inline-block">
            Open in compliance →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 p-4 space-y-2 text-sm">
          <h3 className="font-medium text-white">Profile</h3>
          <p>Phone: {courier.phone ?? '—'}</p>
          <p>Onboarding: {courier.onboarding_complete ? 'Complete' : 'Incomplete'}</p>
          <p>Background check: {courier.background_check_status ?? '—'}</p>
          <p>Total deliveries: {courier.total_deliveries}</p>
          <p>Last sign-in: {formatWhen(courier.last_sign_in_at)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 p-4 space-y-2 text-sm">
          <h3 className="font-medium text-white">Vehicles & documents</h3>
          <p>Vehicles: {courier.vehicles.length}</p>
          <p>Documents: {courier.documents.length}</p>
          {courier.location && (
            <p>
              GPS: {courier.location.lat != null ? `${courier.location.lat}, ${courier.location.lng}` : '—'}
            </p>
          )}
        </div>
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {courier.status === 'active' && (
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-amber-500/40 text-amber-200 text-sm"
              onClick={() => void runSuspend()}
            >
              Suspend
            </button>
          )}
          {courier.status === 'suspended' && (
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-emerald-500/40 text-emerald-200 text-sm"
              onClick={() => void unsuspendCourier(token, userId!).then(() => { toast.success('Unsuspended'); void load(); })}
            >
              Unsuspend
            </button>
          )}
          {(courier.status === 'active' || courier.status === 'suspended') && (
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-red-500/40 text-red-200 text-sm"
              onClick={() => void runDeactivate()}
            >
              Deactivate
            </button>
          )}
          {courier.status === 'deactivated' && (
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-emerald-500/40 text-emerald-200 text-sm"
              onClick={() => void reactivateCourier(token, userId!).then(() => { toast.success('Reactivated'); void load(); })}
            >
              Reactivate
            </button>
          )}
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm"
            onClick={async () => {
              const ok = await confirm({ title: 'Sign out courier?', description: 'Ends all sessions.', confirmLabel: 'Sign out', variant: 'danger' });
              if (!ok || !userId) return;
              await signOutCourier(token, userId);
              toast.success('Signed out');
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm"
            onClick={() => void resetCourierPassword(token, userId!).then((r) => toast.success(r.message))}
          >
            Reset password
          </button>
          {permissions?.can_delete && (
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-red-600 text-red-300 text-sm"
              onClick={() => void runDelete()}
            >
              Delete profile
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <h3 className="font-medium text-white">Recent deliveries</h3>
        </div>
        <ul className="divide-y divide-slate-800 text-sm">
          {deliveries.length === 0 ? (
            <li className="px-4 py-6 text-slate-500 text-center">No deliveries yet.</li>
          ) : (
            deliveries.map((d) => (
              <li key={String(d.id)} className="px-4 py-3 flex justify-between gap-4">
                <span className="text-white">{String(d.order_number ?? d.id)}</span>
                <span className="text-slate-400 capitalize">{String(d.status)}</span>
                <span className="text-slate-500">{formatWhen(d.placed_at as string)}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
