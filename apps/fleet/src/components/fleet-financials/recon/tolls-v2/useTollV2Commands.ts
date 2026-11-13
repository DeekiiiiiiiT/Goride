import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../../../services/api';
import { isPaidWeekRefusal, TollV2CommandError, tollV2UserMessage } from '../../../../services/tollV2CommandError';
import type { TollV2CommandIntent } from './types';

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

  const refetchDesk = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['toll-v2-desk', weekKey] });
  }, [queryClient, weekKey]);

  const runCommand = useCallback(
    async (intent: TollV2CommandIntent, body: Record<string, unknown>, opts?: { reuseClick?: boolean }) => {
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
        toast.error(tollV2UserMessage(err, 'That toll command could not be completed.'));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refetchDesk],
  );

  const clearVersionConflict = useCallback(() => {
    setVersionConflict(false);
  }, []);

  return { runCommand, busy, versionConflict, clearVersionConflict, refetchDesk };
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
