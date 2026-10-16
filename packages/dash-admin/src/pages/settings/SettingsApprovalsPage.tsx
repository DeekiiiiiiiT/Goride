import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  approvePendingSetting,
  listAdminSettings,
  rejectPendingSetting,
  type PendingChangeRow,
} from '@roam/dash-admin-client';
import { getJwtRoles } from '@roam/auth-client';
import { canEditSetting, defForKey, formatSettingValue, labelForKey, relativeTime } from './settingsFormat';
import type { SettingsOutletContext } from './SettingsLayout';

export function SettingsApprovalsPage() {
  const { session, setPendingCount } = useOutletContext<SettingsOutletContext>();
  const roles = getJwtRoles(session.user);
  const myId = session.user.id;
  // Platform Owner / superadmin may approve their own high-risk requests.
  const canSelfApprove = roles.includes('platform_owner') || roles.includes('superadmin');

  const [rows, setRows] = useState<PendingChangeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const list = await listAdminSettings(session.access_token);
    setRows(list.pending);
    setPendingCount(list.pending.length);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load approvals.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token, setPendingCount]);

  async function approve(id: string, requestedBy: string) {
    if (requestedBy === myId && !canSelfApprove) {
      toast.error('You cannot approve your own request.');
      return;
    }
    setBusyId(id);
    try {
      await approvePendingSetting(session.access_token, id);
      await reload();
      toast.success('Approved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await rejectPendingSetting(session.access_token, id);
      await reload();
      toast.success('Rejected.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Approvals</h2>
        <p className="text-sm text-slate-400">
          {canSelfApprove
            ? 'High-risk changes from other admins wait here. As Platform Owner you can approve your own.'
            : 'High-risk changes need a second person. You cannot approve your own request.'}
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <ul className="space-y-3">
        {rows.length === 0 ? (
          <li className="text-sm text-slate-500">Nothing waiting for approval.</li>
        ) : (
          rows.map((row) => {
            const def = defForKey(row.key);
            const mine = row.requested_by === myId;
            return (
              <li key={row.id} className="rounded-xl border border-slate-800 px-4 py-3">
                <p className="text-sm font-medium text-slate-100">{labelForKey(row.key)}</p>
                <p className="mt-1 text-sm text-slate-300">
                  New value: {formatSettingValue(row.new_value, def)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Reason: &ldquo;{row.reason}&rdquo; · {relativeTime(row.created_at)}
                </p>
                {mine && !canSelfApprove ? (
                  <p className="mt-2 text-xs text-amber-300">Waiting for someone else to approve.</p>
                ) : null}
                {canEditSetting(roles, row.key) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id || (mine && !canSelfApprove)}
                      className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300 disabled:opacity-40"
                      onClick={() => void approve(row.id, row.requested_by)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="rounded-lg bg-red-500/15 px-3 py-1.5 text-sm text-red-300 disabled:opacity-40"
                      onClick={() => void reject(row.id)}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
