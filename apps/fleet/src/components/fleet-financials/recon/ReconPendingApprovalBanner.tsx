/**
 * WRA-38 banners on the week: "Waiting for approval" (Approve / Reject / Withdraw)
 * and "This request is out of date". In-app overlay for the reject reason.
 */
import React, { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  approveRequest,
  rejectRequest,
  withdrawRequest,
  type ReconApprovalItem,
} from '../../../services/reconApi';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { approvalErrorMessage } from './useReconApprovals';

function sentWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ReconPendingApprovalBanner({
  items,
  me,
  canApprove,
  onChanged,
}: {
  items: ReconApprovalItem[];
  me: string | null;
  canApprove: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReconApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (items.length === 0) return null;

  const run = async (id: string | number, fn: () => Promise<unknown>, done: string) => {
    setBusyId(String(id));
    try {
      await fn();
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(approvalErrorMessage(e));
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="recon-pending-approvals">
      {items.map((item) => {
        const mine = !!me && item.preparedBy === me;
        const stale = item.status === 'stale';
        const busy = busyId === String(item.requestId);
        return (
          <div
            key={String(item.requestId)}
            className={
              stale
                ? 'flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#eff4ff] px-4 py-3'
                : 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3'
            }
            data-testid={stale ? 'recon-approval-stale' : 'recon-approval-waiting'}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#92400e]" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[#0b1c30]">
                  {stale ? 'This request is out of date' : 'Waiting for approval'}: {item.label}
                </p>
                <p className="text-[#47464c]">
                  {mine ? 'You sent it' : 'Sent'} {sentWhen(item.sentAt)}
                  {item.reason ? ` · “${item.reason}”` : ''}
                  {stale ? (mine ? ' · The week changed since. Withdraw it and prepare it again.' : ' · Ask the sender to prepare it again.') : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {busy ? <Loader2 className="h-5 w-5 animate-spin text-[#47464c]" aria-hidden /> : null}
              {!stale && canApprove && !mine ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRejecting(item)}
                    className="h-9 rounded-xl bg-[#fff1f2] px-4 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(item.requestId, () => approveRequest(item.requestId), `${item.label} approved`)}
                    data-testid="recon-approval-approve"
                    className="h-9 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white hover:bg-[#213145]"
                  >
                    Approve
                  </button>
                </>
              ) : null}
              {mine ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(item.requestId, () => withdrawRequest(item.requestId), 'Request withdrawn')}
                  className="h-9 rounded-xl bg-[#fff1f2] px-4 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]"
                >
                  Withdraw
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) { setRejecting(null); setRejectReason(''); } }}>
        <DialogContent className="max-w-[480px] rounded-[24px] p-8">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-[#0b1c30]">Reject: {rejecting?.label}?</DialogTitle>
            <DialogDescription>The sender sees your reason.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Why are you rejecting it?"
          />
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => { setRejecting(null); setRejectReason(''); }}
              className="h-11 rounded-xl bg-[#e5eeff] px-5 text-sm font-semibold text-[#0b1c30]"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={!rejectReason.trim()}
              onClick={() => {
                const target = rejecting;
                const reason = rejectReason.trim();
                setRejecting(null);
                setRejectReason('');
                if (target) void run(target.requestId, () => rejectRequest(target.requestId, reason), 'Request rejected');
              }}
              className="h-11 rounded-xl bg-[#ba1a1a] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
