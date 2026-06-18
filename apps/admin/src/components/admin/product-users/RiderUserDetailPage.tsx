import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { resolveRole } from '../../../utils/permissions';
import {
  banRider,
  deleteRider,
  getRider,
  reactivateRider,
  signOutRider,
  suspendRider,
} from '../../../services/platform/ridesPlatformService';
import { formatMoneyMinor } from '@roam/types';

interface RiderUserDetailPageProps {
  userId: string;
  onBack: () => void;
}

export function RiderUserDetailPage({ userId, onBack }: RiderUserDetailPageProps) {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const resolved = resolveRole(role || (session?.user as { user_metadata?: { role?: string } })?.user_metadata?.role);
  const qc = useQueryClient();
  const [reason, setReason] = useState('Platform review');

  const detailQuery = useQuery({
    queryKey: ['platformRiderDetail', token, userId],
    queryFn: () => getRider(token!, userId),
    enabled: !!token && !!userId,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['platformRiderDetail', token, userId] });

  const suspendMut = useMutation({
    mutationFn: () => suspendRider(token!, userId, reason),
    onSuccess: () => {
      toast.success('Rider suspended');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: () => reactivateRider(token!, userId),
    onSuccess: () => {
      toast.success('Suspension lifted');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const banMut = useMutation({
    mutationFn: () => banRider(token!, userId, reason),
    onSuccess: () => {
      toast.success('Rider banned');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signOutMut = useMutation({
    mutationFn: () => signOutRider(token!, userId),
    onSuccess: () => {
      toast.success('Rider sessions cleared');
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteRider(token!, userId),
    onSuccess: (out) => {
      toast.success(out.message || 'Rider deleted');
      onBack();
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

  const { rider, permissions } = detailQuery.data;

  const busy =
    suspendMut.isPending ||
    reactivateMut.isPending ||
    banMut.isPending ||
    signOutMut.isPending ||
    deleteMut.isPending;

  const canModerate =
    resolved === 'platform_owner' || resolved === 'platform_support';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to directory
      </button>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 p-5 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{rider.display_name || 'Rider'}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{rider.email}</p>
          <span
            className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-xs capitalize ${
              rider.account_status === 'active'
                ? 'bg-emerald-500/15 text-emerald-300'
                : rider.account_status === 'banned'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-amber-500/15 text-amber-200'
            }`}
          >
            {rider.account_status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
          <div>
            <p className="text-slate-500">Lifetime spend</p>
            <p className="text-slate-900 dark:text-slate-900 dark:text-slate-900 dark:text-white font-medium">{formatMoneyMinor(rider.stats.lifetime_spend_minor)}</p>
          </div>
          <div>
            <p className="text-slate-500">Trips completed</p>
            <p className="text-slate-900 dark:text-slate-900 dark:text-slate-900 dark:text-white font-medium">{rider.stats.completed_trips}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] uppercase tracking-wide text-slate-500">Moderation note</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 dark:bg-slate-950 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
        />
      </div>

      {canModerate && permissions.can_write && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => suspendMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-amber-700 dark:bg-slate-800 dark:border-slate-700 dark:text-amber-200"
          >
            Suspend
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reactivateMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-emerald-500/12 border border-emerald-700/35 text-emerald-300"
          >
            Lift suspension (reactivate)
          </button>
          {permissions.can_ban && (
            <button
              type="button"
              disabled={busy}
              onClick={() => banMut.mutate()}
              className="px-3 py-2 text-xs rounded-lg bg-red-500/15 border border-red-500/40 text-red-300"
            >
              Ban
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => signOutMut.mutate()}
            className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          >
            Sign out all devices
          </button>
        </div>
      )}

      {permissions.can_delete && resolved === 'platform_owner' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete rider profile for ${rider.email}?`)) deleteMut.mutate();
          }}
          className="px-3 py-2 text-xs rounded-lg bg-red-600 hover:bg-red-500 text-white"
        >
          Delete rider profile (product-scope)
        </button>
      )}

      {!permissions.can_write && (
        <p className="text-xs text-slate-500">You do not hold rides admin write scopes for this user.</p>
      )}

      {detailQuery.error && (
        <p className="text-sm text-red-400">{(detailQuery.error as Error).message}</p>
      )}
    </div>
  );
}
