import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  canEnableRolloutFlag,
  effectiveFlagLabel,
  type RushRolloutFlagKey,
  type RushRolloutFlagStatus,
  type RushRolloutResponse,
} from './rushRolloutCatalog';
import {
  disableFlagForOrg,
  enableFlagForOrg,
  type FleetRushRolloutApiConfig,
} from './fleetRushRolloutService';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';

export type FleetRushRolloutPanelProps = {
  orgId: string;
  rollout: RushRolloutResponse;
  canEdit?: boolean;
  apiConfig: FleetRushRolloutApiConfig;
  onUpdated?: () => void;
};

export function FleetRushRolloutPanel({
  orgId,
  rollout,
  canEdit = false,
  apiConfig,
  onUpdated,
}: FleetRushRolloutPanelProps) {
  const confirm = useAdminConfirm();
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  const toggleFlag = async (flag: RushRolloutFlagStatus, nextOn: boolean) => {
    if (!canEdit || busyFlag) return;

    if (nextOn) {
      const guard = canEnableRolloutFlag(flag.flag, rollout.serviceLines, rollout.flags);
      if (!guard.ok) {
        toast.error(guard.reason || 'Cannot enable this flag yet');
        return;
      }
      if (flag.flag === 'rush_settlement') {
        const ok = await confirm({
          title: 'Enable delivery settlement?',
          description:
            'This includes Rush delivery revenue in weekly settlement runs. Confirm payout routing is approved for this org.',
          confirmLabel: 'Enable settlement',
          variant: 'default',
        });
        if (!ok) return;
      }
    }

    setBusyFlag(flag.flag);
    try {
      if (nextOn) {
        await enableFlagForOrg(apiConfig, flag.flag, orgId);
        toast.success(`${flag.label} enabled for org`);
      } else {
        await disableFlagForOrg(apiConfig, flag.flag, orgId);
        toast.success(`${flag.label} disabled for org`);
      }
      onUpdated?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Flag update failed');
    } finally {
      setBusyFlag(null);
    }
  };

  const sorted = [...rollout.flags].sort((a, b) => a.step - b.step);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Delivery rollout</h3>
      <p className="mt-1 text-xs text-slate-500">
        Pilot flags for RoamFleet × Rush. Enable in order. Platform support can view only.
      </p>
      {!rollout.serviceLines.includes('rush_delivery') && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Deliveries service line is off — most rollout flags will have no effect until it is enabled.
        </div>
      )}
      <ol className="mt-4 space-y-2">
        {sorted.map((flag) => {
          const enableGuard = canEnableRolloutFlag(
            flag.flag as RushRolloutFlagKey,
            rollout.serviceLines,
            rollout.flags,
          );
          const canTurnOn = canEdit && (flag.effectiveForOrg || enableGuard.ok);
          const disabled = !canEdit || busyFlag !== null;

          return (
            <li
              key={flag.flag}
              className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800">
                {flag.step}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{flag.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                      flag.effectiveForOrg
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                    }`}
                  >
                    {effectiveFlagLabel(flag)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{flag.description}</p>
                {!flag.effectiveForOrg && !enableGuard.ok && canEdit && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{enableGuard.reason}</p>
                )}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  disabled={disabled || (!flag.effectiveForOrg && !canTurnOn)}
                  onClick={() => void toggleFlag(flag, !flag.effectiveForOrg)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    flag.effectiveForOrg
                      ? 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'
                      : 'bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40'
                  }`}
                >
                  {busyFlag === flag.flag ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : flag.effectiveForOrg ? (
                    'Disable'
                  ) : (
                    'Enable'
                  )}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
