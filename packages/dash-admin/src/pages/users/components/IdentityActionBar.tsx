import React from 'react';
import { toast } from 'sonner';
import {
  banIdentity,
  unbanIdentity,
  restrictIdentity,
  unrestrictIdentity,
  revokeAllSessions,
  exportIdentityData,
  suspendCustomer,
  unsuspendCustomer,
  suspendCourier,
  unsuspendCourier,
  signOutCourier,
  resetCourierPassword,
  approveCourier,
  type IdentityDetail,
  type CourierCrossPersonaWarning,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { useDashAdminAccess } from '../../hooks/useDashAdminAccess';

type Props = {
  userId: string;
  detail: IdentityDetail;
  accessToken: string;
  onReload: () => void;
};

export function IdentityActionBar({ userId, detail, accessToken, onReload }: Props) {
  const { prompt, confirm } = useAdminConfirm();
  const { hasPermission } = useDashAdminAccess();
  const perms = detail.permissions;
  const globalStatus = String(detail.identity.global_status || 'active');
  const customerId = detail.customer?.id as string | undefined;
  const courierStatus = detail.courier?.status as string | undefined;

  const runWithReason = async (
    title: string,
    description: string,
    action: (reason: string) => Promise<void>,
  ) => {
    const values = await prompt({
      title,
      description,
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
    });
    if (!values?.reason) return;
    try {
      await action(values.reason);
      toast.success('Done');
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const handleSuspendCustomer = () => {
    if (!customerId) return;
    void runWithReason('Suspend customer', 'Suspend this customer persona.', async (reason) => {
      await suspendCustomer(accessToken, customerId, reason);
    });
  };

  const handleSuspendCourier = async () => {
    const values = await prompt({
      title: 'Suspend courier',
      description: 'Suspend courier work — sessions revoked, cannot accept deliveries.',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
    });
    if (!values?.reason) return;
    try {
      await suspendCourier(accessToken, userId, values.reason);
      toast.success('Courier suspended');
      onReload();
    } catch (e) {
      const err = e as Error & { crossPersona?: CourierCrossPersonaWarning };
      if (err.crossPersona) {
        const ok = await confirm({
          title: 'Also a customer',
          description: err.message,
          confirmLabel: 'Suspend anyway',
          variant: 'danger',
        });
        if (!ok) return;
        await suspendCourier(accessToken, userId, values.reason, { confirmCrossPersona: true });
        toast.success('Courier suspended');
        onReload();
        return;
      }
      toast.error(err.message);
    }
  };

  const canBan = perms?.can_ban ?? (hasPermission('identity.status.ban') || hasPermission('users.ban'));
  const canRevoke = perms?.can_revoke_sessions ?? hasPermission('sessions.revoke');
  const canRestrict = perms?.can_restrict ?? hasPermission('identity.status.restrict');

  return (
    <div className="flex flex-wrap gap-2">
      {canRevoke && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700"
          onClick={() => void runWithReason(
            'Sign out everywhere',
            'Revoke all sessions for this person.',
            async (reason) => { await revokeAllSessions(accessToken, userId, reason); },
          )}
        >
          Sign out everywhere
        </button>
      )}
      {detail.courier && courierStatus === 'active' && hasPermission('courier.users.write') && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-orange-600/80 text-white hover:bg-orange-600"
          onClick={() => void handleSuspendCourier()}
        >
          Suspend courier
        </button>
      )}
      {detail.courier && courierStatus === 'suspended' && hasPermission('courier.users.write') && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600/80 text-white"
          onClick={() => void unsuspendCourier(accessToken, userId).then(() => { toast.success('Unsuspended'); onReload(); })}
        >
          Unsuspend courier
        </button>
      )}
      {detail.customer && String(detail.customer.account_status) !== 'suspended' && hasPermission('dash.users.write') && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-orange-600/80 text-white"
          onClick={() => void handleSuspendCustomer()}
        >
          Suspend customer
        </button>
      )}
      {detail.customer && String(detail.customer.account_status) === 'suspended' && hasPermission('dash.users.write') && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600/80 text-white"
          onClick={() => void unsuspendCustomer(accessToken, String(detail.customer!.id)).then(() => {
            toast.success('Customer unsuspended');
            onReload();
          })}
        >
          Unsuspend customer
        </button>
      )}
      {canRestrict && globalStatus === 'active' && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-amber-600/80 text-white"
          onClick={() => void runWithReason('Restrict identity', 'Apply global restricted status.', async (reason) => {
            await restrictIdentity(accessToken, userId, reason);
          })}
        >
          Restrict
        </button>
      )}
      {canRestrict && globalStatus !== 'active' && globalStatus !== 'banned' && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600/80 text-white"
          onClick={() => void runWithReason('Clear restriction', 'Restore active global status.', async (reason) => {
            await unrestrictIdentity(accessToken, userId, reason);
          })}
        >
          Clear restriction
        </button>
      )}
      {canBan && globalStatus !== 'banned' && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500"
          onClick={() => void runWithReason(
            'Ban identity (all apps)',
            `Also active as: ${(detail.personas ?? []).map((p) => p.persona).join(', ')}. Banning locks every app.`,
            async (reason) => { await banIdentity(accessToken, userId, reason); },
          )}
        >
          Ban identity
        </button>
      )}
      {canBan && globalStatus === 'banned' && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white"
          onClick={() => void runWithReason('Unban identity', 'Restore access across all apps.', async (reason) => {
            await unbanIdentity(accessToken, userId, reason);
          })}
        >
          Unban
        </button>
      )}
      {(perms?.can_export ?? hasPermission('identity.export')) && (
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300"
          onClick={() => void runWithReason('Export data', 'GDPR/DPA export for this person.', async (reason) => {
            const data = await exportIdentityData(accessToken, userId, reason);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `identity-${userId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          })}
        >
          Export
        </button>
      )}
      {detail.courier && hasPermission('courier.users.write') && (
        <>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300"
            onClick={() => void signOutCourier(accessToken, userId).then(() => toast.success('Signed out'))}
          >
            Courier sign-out
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300"
            onClick={() => void resetCourierPassword(accessToken, userId).then(() => toast.success('Password reset sent'))}
          >
            Reset courier password
          </button>
          {courierStatus === 'pending' && (
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600/80 text-white"
              onClick={() => void approveCourier(accessToken, userId).then(() => { toast.success('Approved'); onReload(); })}
            >
              Approve courier
            </button>
          )}
        </>
      )}
    </div>
  );
}
