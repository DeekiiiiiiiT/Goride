import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../../../services/api';
import {
  commandSavedDespiteFailure,
  isPaidWeekRefusal,
  isTollCommandTransportFailure,
  TollV2CommandError,
  tollV2UserMessage,
} from '../../../../services/tollV2CommandError';
import type { TollV2CommandIntent } from './types';

/** A command the server refused with NEEDS_APPROVAL while this person is the only manager (B14): the screen asks
 *  for a reason (8+ characters) and sends the same command again with `self_approval_reason`. */
export type TollV2ApprovalAsk = {
  intent: TollV2CommandIntent;
  amountMinor: number | null;
  resolve: (reason: string | null) => void;
};

export function isNeedsApproval(err: unknown): err is TollV2CommandError {
  return err instanceof TollV2CommandError && err.code === 'NEEDS_APPROVAL';
}

type ClickState = {
  commandId: string;
  intent: TollV2CommandIntent;
  body: Record<string, unknown>;
};

export function useTollV2Commands(weekKey: string) {
  const queryClient = useQueryClient();
  const pendingClick = useRef<ClickState | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approvalAsk, setApprovalAsk] = useState<TollV2ApprovalAsk | null>(null);

  const refetchDesk = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['toll-v2-desk', weekKey] });
  }, [queryClient, weekKey]);

  const runCommand = useCallback(
    async (
      intent: TollV2CommandIntent,
      body: Record<string, unknown>,
      opts?: { reuseClick?: boolean; /** refusal codes the caller shows itself (no toast) */ quiet?: string[] },
    ): Promise<unknown> => {
      let commandId: string;
      if (opts?.reuseClick && pendingClick.current?.intent === intent) {
        commandId = pendingClick.current.commandId;
      } else {
        commandId = crypto.randomUUID();
        pendingClick.current = { commandId, intent, body };
      }
      setBusy(true);
      try {
        const payload = { ...body, command_id: commandId };
        const res = await api.tollV2Command(intent, payload);
        pendingClick.current = null;
        await refetchDesk();
        return res;
      } catch (err) {
        if (err instanceof TollV2CommandError && err.code === 'VERSION_CHANGED') {
          setVersionConflict(true);
          await refetchDesk();
          pendingClick.current = null;
          return null;
        }
        if (isPaidWeekRefusal(err)) {
          throw err;
        }
        if (isNeedsApproval(err) && body.self_approval_reason == null) {
          pendingClick.current = null;
          const sole = err.currentState?.sole_manager;
          if (sole === false) {
            toast.error('A second manager has to approve this one.');
            throw err;
          }
          setBusy(false);
          const amt = err.currentState?.amount_minor;
          const reason = await new Promise<string | null>((resolve) =>
            setApprovalAsk({ intent, amountMinor: typeof amt === 'number' ? amt : null, resolve }),
          );
          setApprovalAsk(null);
          if (!reason) return null;
          return runCommandRef.current!(intent, { ...body, self_approval_reason: reason });
        }
        if (
          (intent === 'seal_week' || intent === 'reopen_week') &&
          isTollCommandTransportFailure(err)
        ) {
          try {
            const { fetchTollV2Desk } = await import('./useTollV2Desk');
            const desk = await fetchTollV2Desk(weekKey);
            if (commandSavedDespiteFailure(intent, desk)) {
              pendingClick.current = null;
              await refetchDesk();
              return {};
            }
          } catch {
            /* fall through */
          }
        }
        if (!(err instanceof TollV2CommandError && opts?.quiet?.includes(err.code))) {
          toast.error(tollV2UserMessage(err, 'That toll command could not be completed.'));
        }
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refetchDesk, weekKey],
  );
  const runCommandRef = useRef<typeof runCommand | null>(null);
  runCommandRef.current = runCommand;

  const clearVersionConflict = useCallback(() => {
    setVersionConflict(false);
  }, []);

  return { runCommand, busy, versionConflict, clearVersionConflict, refetchDesk, approvalAsk };
}

export type ConfirmAllSureCounts = { matched: number; changed: number; failed: number };

export function formatConfirmAllSureToast(counts: ConfirmAllSureCounts): string {
  const parts = [`${counts.matched} matched`];
  if (counts.changed > 0) parts.push(`${counts.changed} changed`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  return `${parts.join(' · ')} — list refreshed`;
}

export async function runConfirmAllSure(
  runCommand: (intent: TollV2CommandIntent, body: Record<string, unknown>, opts?: { reuseClick?: boolean }) => Promise<unknown>,
  rows: Array<{ chargeId: string; chargeVersion: number; suggestionId: string; paybackVersion: number }>,
): Promise<ConfirmAllSureCounts> {
  let matched = 0;
  let changed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const res = await runCommand('apply_suggestion', {
        suggestion_id: row.suggestionId,
        expected_charge_version: row.chargeVersion,
        expected_payback_version: row.paybackVersion,
      });
      if (res === null) changed += 1;
      else matched += 1;
    } catch {
      failed += 1;
    }
  }
  return { matched, changed, failed };
}
