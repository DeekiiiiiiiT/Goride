import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ArrowLeft, Copy, Loader2, MoreHorizontal, LogOut, Trash2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverDetailDto, DriverLiveStatus, DriverAdminPermissions } from '@roam/types/driver';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  getDriverDetail,
  listDriverTrips,
  suspendDriver,
  unsuspendDriver,
  deactivateDriver,
  reactivateDriver,
  signOutDriver,
  resetDriverPassword,
  deleteDriver,
} from '../../services/driverAdminService';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { ComplianceChecklist, BlockerChips } from '../../components/ComplianceChecklist';
import { formatBlockersList } from '../../utils/complianceLabels';

type Tab = 'overview' | 'trips' | 'compliance';
type ModalType = 'suspend' | 'deactivate' | null;

interface OutletContext {
  session: Session;
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function LiveBadge({ status }: { status: DriverLiveStatus }) {
  const styles =
    status === 'online'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'on_trip'
        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  const label = status === 'on_trip' ? 'On trip' : status === 'online' ? 'Online' : 'Offline';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

export function DriverDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<OutletContext>();
  const { confirm, prompt } = useAdminConfirm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = session.access_token;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [driver, setDriver] = useState<DriverDetailDto | null>(null);
  const [permissions, setPermissions] = useState<DriverAdminPermissions | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [trips, setTrips] = useState<RideRequestRow[]>([]);

  // Actions UI state
  const [actionsOpen, setActionsOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getDriverDetail(token, userId);
      setDriver(res.driver);
      setPermissions(res.permissions);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load driver';
      setLoadError(message);
      setDriver(null);
      setPermissions(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'compliance' || tabParam === 'trips' || tabParam === 'overview') {
      setTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token || !userId || tab !== 'trips') return;
    void listDriverTrips(token, userId, { limit: 50 }).then((r) => setTrips(r.trips));
  }, [token, userId, tab]);

  const copyId = () => {
    if (!userId) return;
    void navigator.clipboard.writeText(userId);
    toast.success('User ID copied');
  };

  // ---------------------------------------------------------------------------
  // Lifecycle Actions
  // ---------------------------------------------------------------------------

  const doSuspend = async () => {
    if (!token || !userId || !reason.trim()) return;
    setActionLoading(true);
    try {
      await suspendDriver(token, userId, reason.trim());
      toast.success('Driver suspended');
      setModal(null);
      setReason('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to suspend');
    } finally {
      setActionLoading(false);
    }
  };

  const doUnsuspend = async () => {
    if (!token || !userId) return;
    setActionLoading(true);
    try {
      await unsuspendDriver(token, userId);
      toast.success('Driver unsuspended');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to unsuspend');
    } finally {
      setActionLoading(false);
    }
  };

  const doDeactivate = async () => {
    if (!token || !userId || !reason.trim()) return;
    setActionLoading(true);
    try {
      await deactivateDriver(token, userId, reason.trim());
      toast.success('Driver deactivated');
      setModal(null);
      setReason('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const doReactivate = async () => {
    if (!token || !userId) return;
    setActionLoading(true);
    try {
      await reactivateDriver(token, userId);
      toast.success('Driver reactivated');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const doSignOut = async () => {
    if (!token || !userId) return;
    const ok = await confirm({
      title: 'Sign out driver?',
      description:
        'Sign out this driver from all devices. They will need to sign in again on the driver app.',
      confirmLabel: 'Sign out',
      variant: 'danger',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await signOutDriver(token, userId);
      toast.success('Driver signed out from all devices');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sign out');
    } finally {
      setActionLoading(false);
    }
  };

  const doResetPassword = async () => {
    if (!token || !userId) return;
    setActionLoading(true);
    try {
      const res = await resetDriverPassword(token, userId);
      if (res.recovery_link) {
        await navigator.clipboard.writeText(res.recovery_link);
        toast.success('Recovery link copied to clipboard');
      } else {
        toast.success(`Password reset email sent to ${res.email}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const doDelete = async () => {
    if (!token || !userId || !driver) return;
    const displayName = driver.email || driver.display_name || userId;
    const values = await prompt({
      title: 'Remove from Roam Driver?',
      description: (
        <>
          Permanently removes this driver profile from Roam Driver. The Roam login and profiles in
          Rider, Courier, Dash, or other apps are untouched.
        </>
      ),
      confirmLabel: 'Remove driver',
      variant: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Reason',
          placeholder: 'e.g. Test account cleanup',
          required: true,
          multiline: true,
        },
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
    setActionLoading(true);
    try {
      await deleteDriver(token, userId);
      toast.success('Driver removed from Roam Driver');
      navigate('/users');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (loadError || !driver) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-red-300 max-w-lg mx-auto">{loadError ?? 'Driver not found'}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/users" className="text-sm text-slate-400 hover:text-white">
            Back to drivers
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-violet-400 hover:text-violet-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stats = driver.stats;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trips', label: 'Trips' },
    { id: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="space-y-6 text-slate-200">
      <Link
        to="/users"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to drivers
      </Link>

      {/* Status Banner */}
      {driver.status === 'pending' && driver.compliance && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Account is <strong>pending</strong> — not yet activated.
          {driver.compliance.blockers.length > 0 && (
            <span className="block mt-1 text-amber-200/90">
              Missing: {formatBlockersList(driver.compliance.blockers)}
            </span>
          )}
          <Link
            to={`/compliance?review=${driver.user_id}`}
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-violet-300 hover:text-violet-200"
          >
            <ExternalLink className="w-3 h-3" />
            Review in Compliance Manager
          </Link>
        </div>
      )}
      {driver.status !== 'active' && driver.status !== 'pending' && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            driver.status === 'deactivated'
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}
        >
          Account is <strong>{driver.status}</strong>
          {driver.suspended_reason ? ` — ${driver.suspended_reason}` : ''}
          {driver.deactivated_reason ? ` — ${driver.deactivated_reason}` : ''}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-white">
              {driver.display_name || driver.email || 'Driver'}
            </h2>
            <LiveBadge status={driver.live_status} />
            <span className="text-xs px-2 py-0.5 rounded border border-slate-700 text-slate-400">
              {driver.status}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">{driver.email}</p>
          <button
            type="button"
            onClick={copyId}
            className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 font-mono"
          >
            <Copy className="w-3 h-3" />
            {driver.user_id}
          </button>
        </div>

        {/* Actions Dropdown */}
        {permissions?.can_write && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Actions'}
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {actionsOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-20 py-1 text-sm">
                {/* Suspend / Unsuspend */}
                {driver.status === 'active' && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-800"
                    onClick={() => {
                      setActionsOpen(false);
                      setModal('suspend');
                    }}
                  >
                    Suspend account
                  </button>
                )}
                {driver.status === 'suspended' && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-800"
                    onClick={() => {
                      setActionsOpen(false);
                      void doUnsuspend();
                    }}
                  >
                    Unsuspend account
                  </button>
                )}

                {/* Deactivate / Reactivate */}
                {(driver.status === 'active' || driver.status === 'suspended') && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-amber-300"
                    onClick={() => {
                      setActionsOpen(false);
                      setModal('deactivate');
                    }}
                  >
                    Deactivate account
                  </button>
                )}
                {driver.status === 'deactivated' && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-800"
                    onClick={() => {
                      setActionsOpen(false);
                      void doReactivate();
                    }}
                  >
                    Reactivate account
                  </button>
                )}

                <hr className="my-1 border-slate-800" />

                {/* Password Reset */}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-slate-800"
                  onClick={() => {
                    setActionsOpen(false);
                    void doResetPassword();
                  }}
                >
                  Send password reset
                </button>

                {/* Sign Out */}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2"
                  onClick={() => {
                    setActionsOpen(false);
                    void doSignOut();
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out all devices
                </button>

                {/* Delete (platform only) */}
                {permissions?.can_delete && (
                  <>
                    <hr className="my-1 border-slate-800" />
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-400 flex items-center gap-2"
                      onClick={() => {
                        setActionsOpen(false);
                        void doDelete();
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove from Roam Driver
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'suspend' && (
        <Modal
          title="Suspend Driver"
          onClose={() => { setModal(null); setReason(''); }}
        >
          <p className="text-sm text-slate-400 mb-4">
            Suspending will temporarily block this driver from using the app. They can be unsuspended later.
          </p>
          <label className="block text-xs text-slate-500 mb-1">Reason (required)</label>
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
              onClick={() => { setModal(null); setReason(''); }}
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
        </Modal>
      )}

      {modal === 'deactivate' && (
        <Modal
          title="Deactivate Driver"
          onClose={() => { setModal(null); setReason(''); }}
        >
          <p className="text-sm text-slate-400 mb-4">
            Deactivating is a stronger action than suspension. The driver will be blocked from the app until manually reactivated.
          </p>
          <label className="block text-xs text-slate-500 mb-1">Reason (required)</label>
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
              onClick={() => { setModal(null); setReason(''); }}
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
        </Modal>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total trips" value={String(stats.total_trips ?? 0)} />
        <KpiCard label="Completed" value={String(stats.completed_trips ?? 0)} />
        <KpiCard
          label="Acceptance"
          value={stats.acceptance_rate_pct != null ? `${stats.acceptance_rate_pct}%` : '—'}
        />
        <KpiCard
          label="Completion"
          value={stats.completion_rate_pct != null ? `${stats.completion_rate_pct}%` : '—'}
        />
        <KpiCard
          label="Earnings"
          value={formatMoneyMinor(stats.lifetime_earnings_minor, 'JMD')}
        />
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-white">Profile</h3>
            <Row label="Mode" value={driver.mode} />
            <Row label="Onboarding" value={driver.onboarding_complete ? 'Complete' : 'Incomplete'} />
            <Row label="Phone" value={driver.phone ?? '—'} />
            <Row label="Last sign-in" value={formatWhen(driver.last_sign_in_at)} />
            <Row label="Last ride" value={formatWhen(stats.last_ride_at)} />
            <Row label="Last online" value={formatWhen(stats.last_online_at)} />
          </section>
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-white">Offers</h3>
            <Row label="Sent" value={String(stats.offers_sent ?? 0)} />
            <Row label="Accepted" value={String(stats.offers_accepted ?? 0)} />
            <Row label="Declined" value={String(stats.offers_declined ?? 0)} />
          </section>
        </div>
      )}

      {tab === 'trips' && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {trips.length === 0 ? (
            <p className="text-center py-12 text-slate-500 text-sm">No trips yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pickup</th>
                  <th className="px-4 py-3">Fare</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800/80">
                    <td className="px-4 py-3 text-slate-300">{t.status}</td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]">
                      {t.pickup_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoneyMinor(t.fare_final_minor ?? t.fare_estimate_minor, t.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {formatWhen(t.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4 max-w-lg">
          <h3 className="text-sm font-medium text-white">Verification checklist</h3>
          {driver.compliance && (
            <>
              <BlockerChips blockers={driver.compliance.blockers} />
              <ComplianceChecklist
                blockers={driver.compliance.blockers}
                mode={driver.mode}
              />
            </>
          )}
          <div className="border-t border-slate-800 pt-3 space-y-2">
            <Row label="Background check" value={driver.background_check_status ?? '—'} />
            <Row label="Insurance expiry" value={driver.insurance_expiry ?? '—'} />
            <Row label="Vehicles" value={String(driver.vehicles.length)} />
          </div>
          <p className="text-xs text-slate-500 pt-2">
            Compliance actions (approve, decline, verify documents) are handled in the Compliance workspace.
          </p>
          <Link
            to={`/compliance?review=${driver.user_id}`}
            className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 pt-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Compliance Manager
          </Link>
          {driver.mode === 'fleet' && (
            <p className="text-xs text-slate-500">
              Fleet drivers may not receive Roam passenger dispatch when independent-only matching is enabled.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-white mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 text-right">{value}</span>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
