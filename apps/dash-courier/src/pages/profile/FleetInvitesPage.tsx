import React, { useCallback, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import {
  acceptFleetInviteById,
  declineFleetInviteById,
  loadMyFleetInvites,
} from '@/lib/courierRoamTagService';
import { leaveFleet, loadWorkforceMe } from '@/lib/courierWorkforceService';
import { toast } from '@/lib/toast';
import type { CourierWorkforceMeDto, WorkforceInviteMineDto } from '@roam/types';

type Props = {
  onBack: () => void;
  /** Open join-by-code flow from Settings / My Fleet CTA */
  onJoinFleet?: () => void;
};

type TabId = 'invites' | 'my-fleet';

export function FleetInfoPage({ onBack, onJoinFleet }: Props) {
  const [tab, setTab] = useState<TabId>('my-fleet');
  const [invites, setInvites] = useState<WorkforceInviteMineDto[]>([]);
  const [workforce, setWorkforce] = useState<CourierWorkforceMeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [rows, me] = await Promise.all([loadMyFleetInvites(), loadWorkforceMe()]);
    setInvites(rows);
    setWorkforce(me);
    setLoading(false);
    return { rows, me };
  }, []);

  useEffect(() => {
    void refresh().then(({ rows }) => {
      if (rows.length > 0) setTab('invites');
      else setTab('my-fleet');
    });
  }, [refresh]);

  const onAccept = async (id: string) => {
    setActingId(id);
    const result = await acceptFleetInviteById(id);
    setActingId(null);
    if (result.ok) {
      toast.success('Joined fleet');
      const next = await refresh();
      if (next.me?.mode === 'fleet') setTab('my-fleet');
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

  const onLeave = async () => {
    setLeaving(true);
    const result = await leaveFleet();
    setLeaving(false);
    setConfirmLeave(false);
    if (result.ok) {
      toast.success('You left the fleet');
      void refresh();
    } else {
      toast.error(result.error);
    }
  };

  const isFleet = workforce?.mode === 'fleet';

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <SubPageHeader title="Fleet Info" onBack={onBack} />

      <div className="px-[var(--spacing-edge)] pt-2">
        <div className="flex gap-1 rounded-xl bg-surface-container p-1">
          <button
            type="button"
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              tab === 'invites'
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-muted'
            }`}
            onClick={() => setTab('invites')}
          >
            Invites
            {invites.length > 0 ? (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] text-on-primary">
                {invites.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              tab === 'my-fleet'
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-muted'
            }`}
            onClick={() => setTab('my-fleet')}
          >
            My Fleet
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-safe space-y-4">
        {loading && <p className="text-sm text-muted">Loading…</p>}

        {!loading && tab === 'invites' && (
          <>
            {invites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center">
                  <MaterialIcon name="mail" className="text-2xl text-muted" />
                </div>
                <p className="text-base font-medium text-on-surface">No pending invites</p>
                <p className="text-sm text-muted max-w-xs">
                  When a delivery company invites you by Roam Tag, it will show up here.
                </p>
              </div>
            ) : (
              invites.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-surface rounded-xl shadow-soft border border-outline-variant/40 p-4 space-y-3"
                >
                  <div>
                    <p className="text-base font-semibold text-on-surface">
                      {inv.organization_name || 'A delivery company'}
                    </p>
                    <p className="text-sm text-muted mt-0.5">Invited you to join as a courier</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={actingId === inv.id}
                      onClick={() => void onDecline(inv.id)}
                      className="flex-1 h-11 rounded-lg border border-outline-variant text-sm font-semibold text-on-surface disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={actingId === inv.id}
                      onClick={() => void onAccept(inv.id)}
                      className="flex-1 h-11 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-50"
                    >
                      {actingId === inv.id ? 'Working…' : 'Accept'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {!loading && tab === 'my-fleet' && (
          <>
            {isFleet ? (
              <div className="bg-surface rounded-xl shadow-soft border border-outline-variant/40 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MaterialIcon name="apartment" className="text-2xl text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Fleet courier
                    </p>
                    <p className="text-lg font-semibold text-on-surface mt-0.5">
                      {workforce?.fleetName || 'Your fleet'}
                    </p>
                    {workforce?.joinedAt ? (
                      <p className="text-sm text-muted mt-1">
                        Joined{' '}
                        {new Date(workforce.joinedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted">
                  Your fleet assigns vehicles in Roam Fleet. You can leave anytime to work as an
                  independent courier again.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmLeave(true)}
                  className="w-full h-12 rounded-lg border border-error/40 text-error text-sm font-semibold"
                >
                  Leave fleet
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center">
                  <MaterialIcon name="person" className="text-2xl text-muted" />
                </div>
                <div className="space-y-2">
                  <p className="text-base font-medium text-on-surface">You’re an independent courier</p>
                  <p className="text-sm text-muted max-w-xs mx-auto">
                    Not tied to a delivery company. Join a fleet with an invite, Fleet Tag, or invite
                    code.
                  </p>
                </div>
                {onJoinFleet ? (
                  <button
                    type="button"
                    onClick={onJoinFleet}
                    className="h-12 px-6 rounded-lg bg-primary text-on-primary text-sm font-semibold"
                  >
                    Join a delivery company
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}
      </main>

      {confirmLeave && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end">
          <div className="w-full bg-surface rounded-t-[24px] p-6 pb-safe safe-x space-y-4">
            <h3 className="text-xl font-semibold text-on-surface">Leave this fleet?</h3>
            <p className="text-sm text-muted">
              You’ll become an independent courier again and can add your own vehicle. Your fleet
              assignment will be cleared.
            </p>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void onLeave()}
              className="w-full h-12 rounded-lg bg-error text-white text-sm font-semibold disabled:opacity-50"
            >
              {leaving ? 'Leaving…' : 'Yes, leave fleet'}
            </button>
            <button
              type="button"
              disabled={leaving}
              onClick={() => setConfirmLeave(false)}
              className="w-full py-3 text-sm text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use FleetInfoPage */
export const FleetInvitesPage = FleetInfoPage;
