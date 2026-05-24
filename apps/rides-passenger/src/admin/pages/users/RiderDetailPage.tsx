import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  Copy,
  Loader2,
  LogOut,
  MoreHorizontal,
  ShieldBan,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RiderAdminPermissions, RiderDetailDto } from '@roam/types/rides';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  addRiderNote,
  banRider,
  deleteRider,
  getRiderDetail,
  listRiderNotes,
  listRiderTrips,
  patchRiderProfile,
  resetRiderPassword,
  signOutRiderAllDevices,
  suspendRider,
  unsuspendRider,
} from '../../services/ridesAdminService';

type Tab = 'overview' | 'trips' | 'notes' | 'activity';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function RiderDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const token = session.access_token;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rider, setRider] = useState<RiderDetailDto | null>(null);
  const [permissions, setPermissions] = useState<RiderAdminPermissions | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [trips, setTrips] = useState<RideRequestRow[]>([]);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listRiderNotes>>['notes']>([]);
  const [noteText, setNoteText] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [modal, setModal] = useState<'suspend' | 'ban' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getRiderDetail(token, userId);
      setRider(res.rider);
      setPermissions(res.permissions);
      setDisplayName(res.rider.display_name ?? '');
      setPhone(res.rider.phone ?? '');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load rider';
      setLoadError(message);
      setRider(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !userId || tab !== 'trips') return;
    void listRiderTrips(token, userId, { limit: 50 }).then((r) => setTrips(r.trips));
  }, [token, userId, tab]);

  useEffect(() => {
    if (!token || !userId || tab !== 'notes') return;
    void listRiderNotes(token, userId).then((r) => setNotes(r.notes));
  }, [token, userId, tab]);

  const copyId = () => {
    if (!userId) return;
    void navigator.clipboard.writeText(userId);
    toast.success('User ID copied');
  };

  const saveProfile = async () => {
    if (!token || !userId || !permissions?.can_write) return;
    try {
      await patchRiderProfile(token, userId, {
        display_name: displayName,
        phone,
      });
      toast.success('Profile updated');
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const submitNote = async () => {
    if (!token || !userId || !noteText.trim()) return;
    try {
      await addRiderNote(token, userId, noteText.trim());
      setNoteText('');
      toast.success('Note added');
      const r = await listRiderNotes(token, userId);
      setNotes(r.notes);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add note');
    }
  };

  const doSuspend = async () => {
    if (!token || !userId || !reason.trim()) return;
    try {
      await suspendRider(token, userId, reason.trim());
      toast.success('Rider suspended');
      setModal(null);
      setReason('');
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Suspend failed');
    }
  };

  const doUnsuspend = async () => {
    if (!token || !userId) return;
    try {
      await unsuspendRider(token, userId);
      toast.success('Rider reinstated');
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Unsuspend failed');
    }
  };

  const doBan = async () => {
    if (!token || !userId) return;
    try {
      await banRider(token, userId, reason.trim() || 'Banned by admin');
      toast.success('Rider banned');
      setModal(null);
      setReason('');
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ban failed');
    }
  };

  const doResetPassword = async () => {
    if (!token || !userId) return;
    try {
      const res = await resetRiderPassword(token, userId);
      toast.success(res.message || 'Password reset email sent');
      if (res.recovery_link && permissions?.can_see_reset_link) {
        await navigator.clipboard.writeText(res.recovery_link);
        toast.info('Recovery link copied to clipboard');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reset failed');
    }
  };

  const doSignOut = async () => {
    if (!token || !userId) return;
    if (!window.confirm('Sign this rider out on all devices?')) return;
    try {
      await signOutRiderAllDevices(token, userId);
      toast.success('All sessions ended');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sign-out failed');
    }
  };

  const doDelete = async () => {
    if (!token || !userId) return;
    setActionLoading(true);
    try {
      await deleteRider(token, userId);
      toast.success('Rider removed from Roam Rides');
      setModal(null);
      navigate('/admin/users');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
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

  if (loadError || !rider) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-red-300 max-w-lg mx-auto">{loadError ?? 'Rider not found'}</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/admin/users"
            className="text-sm text-slate-400 hover:text-white"
          >
            Back to riders
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trips', label: 'Trips' },
    { id: 'notes', label: 'Notes' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="space-y-6 text-slate-200">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to riders
      </Link>

      {rider.account_status !== 'active' && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            rider.account_status === 'banned'
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}
        >
          Account is <strong>{rider.account_status}</strong>
          {rider.suspended_reason ? ` — ${rider.suspended_reason}` : ''}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {rider.display_name || rider.email || 'Rider'}
          </h2>
          <p className="text-sm text-slate-400 mt-1">{rider.email}</p>
          <button
            type="button"
            onClick={copyId}
            className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 font-mono"
          >
            <Copy className="w-3 h-3" />
            {rider.user_id}
          </button>
        </div>

        {permissions?.can_write && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm hover:bg-slate-800"
            >
              Actions
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {actionsOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-20 py-1 text-sm">
                {rider.account_status === 'active' ? (
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
                ) : rider.account_status === 'suspended' ? (
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
                ) : null}
                {permissions.can_ban && rider.account_status !== 'banned' && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-300"
                    onClick={() => {
                      setActionsOpen(false);
                      setModal('ban');
                    }}
                  >
                    Ban permanently
                  </button>
                )}
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
                {permissions?.can_delete && (
                  <>
                    <hr className="my-1 border-slate-800" />
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-400 flex items-center gap-2"
                      onClick={() => {
                        setActionsOpen(false);
                        setModal('delete');
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove from Roam Rides
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {modal === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Remove from Roam Rides</h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              This will permanently delete this rider's profile. They will be signed out and can sign up again as a new rider.
            </p>
            <p className="text-sm text-amber-300 mb-4">
              This does <strong>not</strong> delete their account from other Roam products (Driver, Fleet, etc.).
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-3 py-2 rounded-lg border border-slate-700 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={actionLoading}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? 'Removing...' : 'Remove Rider'}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-slate-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total trips" value={String(rider.stats.total_trips)} />
            <Stat label="Completed" value={String(rider.stats.completed_trips)} />
            <Stat label="Cancelled" value={String(rider.stats.cancelled_trips)} />
            <Stat
              label="Lifetime spend"
              value={formatMoneyMinor(rider.stats.lifetime_spend_minor, 'JMD')}
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <h3 className="text-sm font-medium text-white">Profile</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-xs text-slate-500">
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!permissions?.can_write}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white disabled:opacity-60"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Phone
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!permissions?.can_write}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white disabled:opacity-60"
                />
              </label>
            </div>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Last sign-in</dt>
                <dd>{formatWhen(rider.last_sign_in_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Joined</dt>
                <dd>{formatWhen(rider.created_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last ride</dt>
                <dd>{formatWhen(rider.stats.last_ride_at)}</dd>
              </div>
            </dl>
            {permissions?.can_write && (
              <button
                type="button"
                onClick={() => void saveProfile()}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500"
              >
                Save profile
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'trips' && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-left">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pickup</th>
                <th className="px-4 py-3">Drop-off</th>
                <th className="px-4 py-3">Fare</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {trips.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No trips yet
                  </td>
                </tr>
              ) : (
                trips.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800/80">
                    <td className="px-4 py-3 capitalize">{t.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">
                      {t.pickup_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">
                      {t.dropoff_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoneyMinor(t.fare_estimate_minor, t.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {formatWhen(t.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-4">
          {permissions?.can_write && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Internal support note (not visible to rider)…"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white resize-none"
              />
              <button
                type="button"
                onClick={() => void submitNote()}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
              >
                Add note
              </button>
            </div>
          )}
          <ul className="space-y-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3 text-sm"
              >
                <p className="text-slate-200 whitespace-pre-wrap">{n.body}</p>
                <p className="text-xs text-slate-500 mt-2">{formatWhen(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'activity' && (
        <ul className="space-y-2">
          {rider.recent_activity.length === 0 ? (
            <li className="text-slate-500 text-sm">No admin activity recorded.</li>
          ) : (
            rider.recent_activity.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3 text-sm"
              >
                <p className="font-medium text-slate-200">{a.event_type}</p>
                <p className="text-xs text-slate-500 mt-1">{formatWhen(a.created_at)}</p>
              </li>
            ))
          )}
        </ul>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              {modal === 'ban' ? (
                <ShieldBan className="w-5 h-5 text-red-400" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              )}
              {modal === 'ban' ? 'Ban rider' : 'Suspend rider'}
            </h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason (required for suspend)…"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setReason('');
                }}
                className="px-3 py-2 rounded-lg border border-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void (modal === 'ban' ? doBan() : doSuspend())}
                className={`px-3 py-2 rounded-lg text-white text-sm font-medium ${
                  modal === 'ban' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-white mt-1 tabular-nums">{value}</p>
    </div>
  );
}
