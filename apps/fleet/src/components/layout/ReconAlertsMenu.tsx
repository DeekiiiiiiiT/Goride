/**
 * Week Reconciliation bell (WRA-31, WRA-38). Separate from the maintenance bell.
 *  - Requests waiting for you to approve (Approve / Open week)
 *  - Your own requests: waiting, or out of date (Open week)
 *  - Open week alerts from the calculator (Acknowledge)
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  acknowledgeReconAlert,
  approveRequest,
  fetchReconAlerts,
  type ReconApprovalItem,
} from '../../services/reconApi';
import { approvalErrorMessage, useReconApprovals } from '../fleet-financials/recon/useReconApprovals';
import { formatWeekRange } from '../fleet-financials/recon/weekListFormat';
import { Button } from '../ui/button';
import { usePermissions } from '../../hooks/usePermissions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';

export const RECON_ALERTS_KEY = ['recon-alerts'] as const;

function openWeekUrl(line: string, weekKey: string) {
  const qs = new URLSearchParams({ line, week: weekKey, step: 'close' });
  window.history.pushState({ page: 'week-reconciliation', line, week: weekKey }, '', `/week-reconciliation?${qs.toString()}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Which bell group a request belongs to, for this viewer. Exported for tests. */
export function bellGroup(
  item: ReconApprovalItem,
  me: string | null,
  canApprove: boolean,
): 'to_approve' | 'mine_waiting' | 'mine_stale' | null {
  const mine = !!me && item.preparedBy === me;
  if (mine) return item.status === 'stale' ? 'mine_stale' : 'mine_waiting';
  if (canApprove && item.status === 'pending_approval') return 'to_approve';
  return null;
}

/** Shown only to people who can see Week Reconciliation. */
export function ReconAlertsMenu({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { permissions } = usePermissions();
  const allowed = permissions.some((p) => String(p) === 'recon.view' || String(p) === 'recon.approve' || String(p) === 'recon.prepare');
  return allowed ? <ReconAlertsMenuInner onNavigate={onNavigate} /> : null;
}

function ReconAlertsMenuInner({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const openWeek = (line: string, weekKey: string) => {
    openWeekUrl(line, weekKey);
    onNavigate?.('week-reconciliation');
  };
  const approvals = useReconApprovals();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const alertsQuery = useQuery({
    queryKey: RECON_ALERTS_KEY,
    queryFn: fetchReconAlerts,
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: false,
  });
  const alerts = (alertsQuery.data ?? []).filter((a) => !a.acknowledgedAt);
  const grouped = approvals.items
    .map((i) => ({ item: i, group: bellGroup(i, approvals.me, approvals.canApprove) }))
    .filter((g) => g.group !== null);
  const count = grouped.filter((g) => g.group !== 'mine_waiting').length + alerts.length;

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(approvalErrorMessage(e));
    } finally {
      setBusy(null);
      approvals.refresh();
      void qc.invalidateQueries({ queryKey: RECON_ALERTS_KEY });
    }
  };

  const wordsFor = (group: string, i: ReconApprovalItem) =>
    group === 'to_approve'
      ? `${i.label} — waiting for your approval`
      : group === 'mine_stale'
        ? `Your ${i.label.toLowerCase()} request is out of date — prepare it again`
        : `Your ${i.label.toLowerCase()} request is waiting for approval`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Week reconciliation alerts" data-testid="recon-bell">
          <ClipboardCheck className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ba1a1a] px-1 text-[10px] font-bold text-white">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[420px] w-96 overflow-y-auto p-2" data-testid="recon-bell-menu">
        <DropdownMenuLabel>Week reconciliation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {approvals.loading || alertsQuery.isLoading ? (
          <p className="flex items-center gap-2 px-2 py-2 text-sm text-[#47464c]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
        ) : grouped.length === 0 && alerts.length === 0 ? (
          <p className="px-2 py-2 text-sm text-[#47464c]">Nothing needs you right now.</p>
        ) : null}
        <ul className="space-y-2">
          {grouped.map(({ item, group }) => (
            <li key={String(item.requestId)} className="rounded-xl bg-[#f8f9ff] p-3 text-sm" data-testid={`recon-bell-${group}`}>
              <p className="font-semibold text-[#0b1c30]">{wordsFor(group!, item)}</p>
              <p className="text-[12px] text-[#47464c]">
                Week of {formatWeekRange(item.weekKey)}{item.reason ? ` · “${item.reason}”` : ''}
              </p>
              <div className="mt-2 flex gap-2">
                {group === 'to_approve' ? (
                  <button
                    type="button"
                    disabled={busy === String(item.requestId)}
                    onClick={() => void act(String(item.requestId), () => approveRequest(item.requestId), `${item.label} approved`)}
                    className="h-8 rounded-lg bg-[#030213] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    Approve
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openWeek(item.line, item.weekKey)}
                  className="h-8 rounded-lg bg-[#e5eeff] px-3 text-[13px] font-semibold text-[#0b1c30]"
                >
                  Open week
                </button>
              </div>
            </li>
          ))}
          {alerts.map((a) => (
            <li key={a.id} className="rounded-xl bg-[#fff8f0] p-3 text-sm" data-testid="recon-bell-alert">
              <p className="font-semibold text-[#0b1c30]">{a.title}</p>
              <p className="text-[12px] text-[#47464c]">Raised {new Date(a.raisedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => void act(a.id, () => acknowledgeReconAlert(a.id), 'Alert acknowledged')}
                  className="h-8 rounded-lg bg-[#e5eeff] px-3 text-[13px] font-semibold text-[#0b1c30] disabled:opacity-60"
                >
                  Acknowledge
                </button>
              </div>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
