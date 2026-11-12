/**
 * Approvals and the week change rules on the screen (WRA-27, 32, 38).
 * One shared list for the week banner, the bell and the dialogs.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchApprovals,
  fetchRun,
  ReconActionError,
  type ReconApprovalItem,
} from '../../../services/reconApi';
import { usePermissions } from '../../../hooks/usePermissions';

export const RECON_APPROVALS_KEY = ['recon-approvals'] as const;

export function useReconApprovals() {
  const { can } = usePermissions();
  const query = useQuery({
    queryKey: RECON_APPROVALS_KEY,
    queryFn: fetchApprovals,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: RECON_APPROVALS_KEY }), [qc]);
  return {
    items: query.data?.items ?? [],
    me: query.data?.me ?? null,
    /** If the list did not load, assume someone else can approve rather than hide the choice. */
    otherApprovers: query.data?.otherApprovers ?? 1,
    canApprove: can('recon.approve' as never),
    /** recon.prepare: may send a change for approval. Without it and without approve, no change buttons. */
    canPrepare: can('recon.prepare' as never),
    loading: query.isLoading,
    refresh,
  };
}

export function approvalsForWeek(items: ReconApprovalItem[], line: string, weekKey: string): ReconApprovalItem[] {
  return items.filter((i) => i.line === line && i.weekKey === weekKey);
}

/** WRA-27 final check before Close / Sign / Reopen: the week must still be the one on screen. */
export async function assertWeekUnchanged(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  versionOnScreen: number,
): Promise<void> {
  const latest = await fetchRun(line, weekKey);
  if (Number(latest.run.version) !== Number(versionOnScreen)) {
    throw new ReconActionError('This week changed while you were working. Reload the week.', 409, 'WEEK_CHANGED');
  }
}

/** Plain words for the approval error codes. */
export function approvalErrorMessage(err: unknown): string {
  if (err instanceof ReconActionError) {
    switch (err.code) {
      case 'WEEK_CHANGED':
        return 'This week changed while you were working. Reload the week.';
      case 'APPROVAL_GONE':
        return err.message || 'Someone already dealt with this request.';
      case 'APPROVAL_STALE':
        return 'This request is out of date. Ask the sender to prepare it again.';
      case 'NOT_YOUR_REQUEST':
        return 'Only the person who sent it can withdraw it.';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
