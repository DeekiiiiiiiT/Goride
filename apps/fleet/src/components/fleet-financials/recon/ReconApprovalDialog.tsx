/**
 * WRA-32 / WRA-38 approval dialog (Stitch screen 12), used by Close, Reopen,
 * Accept statement cash and Sign correction:
 *  - Send for approval (shown first; hidden when nobody else can approve)
 *  - Approve it myself (logged as self-approved; a reason is required)
 * Users without approve rights only see Send for approval.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Lock, Send, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { cn } from '../../ui/utils';

export type ApprovalChoice = 'send' | 'self';

/** Self-approval needs a real reason (same 8-character rule as the server's Close / Reopen). */
export const SELF_APPROVE_MIN_REASON = 8;

export function approvalSubmitError(choice: ApprovalChoice, reason: string): string | null {
  const r = reason.trim();
  if (choice === 'self' && r.length < SELF_APPROVE_MIN_REASON) {
    return `Say why you are approving your own change (at least ${SELF_APPROVE_MIN_REASON} characters).`;
  }
  if (choice === 'send' && r.length === 0) return 'Add a short note for the approver.';
  return null;
}

export function ReconApprovalDialog({
  open,
  onOpenChange,
  title,
  summary,
  detail,
  confirmLabel,
  canApprove,
  otherApprovers,
  busy,
  onSend,
  onSelfApprove,
  extra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Close the week of 2–8 Nov 2026?" */
  title: string;
  /** Bold first line of the summary box, e.g. "3 drivers · Fleet owes J$17,183.53". */
  summary: string;
  /** Second line, what the action does, in plain words. */
  detail: string;
  /** Self-approve button text, e.g. "Approve & lock week". */
  confirmLabel: string;
  /** The user holds recon.approve. */
  canApprove: boolean;
  /** Other people who could approve; 0 hides Send for approval. */
  otherApprovers: number;
  busy: boolean;
  onSend: (reason: string) => void | Promise<void>;
  onSelfApprove: (reason: string) => void | Promise<void>;
  /** Extra confirmation shown above the reason box (e.g. the reopen money warning). */
  extra?: React.ReactNode;
}) {
  const canSend = otherApprovers > 0;
  const [choice, setChoice] = useState<ApprovalChoice>(canSend ? 'send' : 'self');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice(canSend ? 'send' : 'self');
    setReason('');
    setTouched(false);
  }, [open, canSend]);

  const error = approvalSubmitError(choice, reason);
  const nobodyCanApprove = !canApprove && !canSend;

  const submit = () => {
    setTouched(true);
    if (error || busy) return;
    if (choice === 'send') void onSend(reason.trim());
    else void onSelfApprove(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-[560px] rounded-[24px] p-8" data-testid="recon-approval-dialog">
        <DialogHeader>
          <DialogTitle className="text-[26px] font-semibold tracking-tight text-[#0b1c30]">{title}</DialogTitle>
          <DialogDescription className="sr-only">{detail}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-2xl bg-[#eff4ff] p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
            <ShieldCheck className="h-5 w-5 text-[#0051d5]" aria-hidden />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-[#0b1c30]">{summary}</p>
            <p className="text-[#47464c]">{detail}</p>
          </div>
        </div>

        {nobodyCanApprove ? (
          <p className="rounded-xl bg-[#fff1f2] px-4 py-3 text-sm text-[#93000a]">
            You can&apos;t approve this, and nobody else in your company can either. Ask the owner to give someone an
            approver role in User Management.
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-[#0b1c30]">Choose how to approve this:</p>
            <div className="space-y-3" role="radiogroup" aria-label="How to approve">
              {canSend ? (
                <label
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-2xl p-4',
                    choice === 'send' ? 'bg-[#eff4ff] ring-2 ring-[#0051d5]' : 'bg-[#f8f9ff]',
                  )}
                >
                  <input
                    type="radio"
                    name="approval-choice"
                    className="mt-1 h-4 w-4 accent-[#0051d5]"
                    checked={choice === 'send'}
                    onChange={() => setChoice('send')}
                    data-testid="recon-approval-send"
                  />
                  <span>
                    <span className="block text-base font-semibold text-[#0b1c30]">Send for approval</span>
                    <span className="block text-sm text-[#47464c]">
                      Another approver checks it and approves it. Nothing changes until they do.
                    </span>
                  </span>
                </label>
              ) : null}
              {canApprove ? (
                <label
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-2xl p-4',
                    choice === 'self' ? 'bg-[#eff4ff] ring-2 ring-[#0051d5]' : 'bg-[#f8f9ff]',
                  )}
                >
                  <input
                    type="radio"
                    name="approval-choice"
                    className="mt-1 h-4 w-4 accent-[#0051d5]"
                    checked={choice === 'self'}
                    onChange={() => setChoice('self')}
                    data-testid="recon-approval-self"
                  />
                  <span>
                    <span className="block text-base font-semibold text-[#0b1c30]">Approve it myself</span>
                    <span className="block text-sm text-[#47464c]">
                      You prepared this. Approving it yourself is logged as self-approved.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>

            {extra}

            <div className="space-y-1.5">
              <label htmlFor="recon-approval-reason" className="text-sm font-semibold text-[#0b1c30]">
                {choice === 'self' ? 'Why are you approving your own change?' : 'Note for the approver'}
                <span className="text-[#ba1a1a]"> *</span>
              </label>
              <Textarea
                id="recon-approval-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                rows={3}
                data-testid="recon-approval-reason"
              />
              {touched && error ? <p className="text-[13px] text-[#ba1a1a]">{error}</p> : null}
            </div>
          </>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 rounded-xl bg-[#fff1f2] px-5 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]"
          >
            Cancel
          </button>
          {nobodyCanApprove ? null : (
            <button
              type="button"
              onClick={submit}
              disabled={busy || (touched && !!error)}
              data-testid="recon-approval-submit"
              className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : choice === 'send' ? (
                <Send className="h-4 w-4" aria-hidden />
              ) : (
                <Lock className="h-4 w-4" aria-hidden />
              )}
              {choice === 'send' ? 'Send for approval' : confirmLabel}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
