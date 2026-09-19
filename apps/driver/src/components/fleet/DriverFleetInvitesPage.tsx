import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button, cn } from '@roam/ui';
import type { WorkforceInviteMineDto } from '@roam/types';
import {
  acceptFleetInviteById,
  declineFleetInviteById,
  loadMyFleetInvites,
} from '../../lib/driverRoamTagService';
import { useDriver } from '../../contexts/DriverContext';

type Props = {
  onBack: () => void;
};

export function DriverFleetInvitesPage({ onBack }: Props) {
  const { refreshProfile, isFleetDriver } = useDriver();
  const [invites, setInvites] = useState<WorkforceInviteMineDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await loadMyFleetInvites();
    setInvites(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAccept = async (id: string) => {
    setActingId(id);
    const result = await acceptFleetInviteById(id);
    setActingId(null);
    if (result.ok) {
      toast.success('Joined fleet');
      await refreshProfile();
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const onDecline = async (id: string) => {
    setActingId(id);
    const result = await declineFleetInviteById(id);
    setActingId(null);
    if (result.ok) {
      toast.success('Invite declined');
      void refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
        </button>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Fleet invites</h1>
      </div>

      {isFleetDriver ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/40">
              <Building2 className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">You’re in a fleet</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Fleet membership is active on this account.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : invites.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Mail className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-base font-medium text-slate-900 dark:text-white">No pending invites</p>
          <p className="max-w-xs text-sm text-slate-500">
            When a fleet invites you by Roam Tag, it will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((inv) => (
            <div
              key={inv.id}
              className={cn(
                'rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm',
                'dark:border-slate-800 dark:bg-slate-900',
              )}
            >
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {inv.organization_name || 'A fleet'}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">Invited you to join as a driver</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={actingId === inv.id}
                  onClick={() => void onDecline(inv.id)}
                >
                  Decline
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-[#004ac6] hover:bg-[#003da3]"
                  disabled={actingId === inv.id}
                  onClick={() => void onAccept(inv.id)}
                >
                  {actingId === inv.id ? 'Working…' : 'Accept'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
