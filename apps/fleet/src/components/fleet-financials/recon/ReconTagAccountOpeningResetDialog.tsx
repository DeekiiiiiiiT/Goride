import React, { useMemo, useState } from 'react';
import {
  buildTagAccountOpeningResetPayload,
  fromMoneyMinor,
  type MoneyMinor,
} from '@roam/finance-core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Loader2 } from 'lucide-react';

export const TAG_OPENING_RESET_DEFAULT_REASON =
  'Old toll records were off; starting the new system from the statement';

function fmtMajor(minor: number): string {
  return fromMoneyMinor(minor as MoneyMinor).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type TagOpeningResetView = {
  statementClosingMinor: number;
  openingMinor: number;
  previousOpeningMinor: number;
  differenceMinor: number;
  reason: string;
  actor?: string;
  at?: string;
};

export function ReconTagAccountOpeningResetDialog({
  open,
  onOpenChange,
  mode,
  topUpsMinor,
  tagUsageMinor,
  previousOpeningMinor,
  reset,
  savedStatementClosingMinor,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit' | 'read';
  topUpsMinor: number;
  tagUsageMinor: number;
  previousOpeningMinor: number;
  reset?: TagOpeningResetView | null;
  /** The statement closing already saved on step 4; the box starts with it (the opening was typed in by mistake 23 Nov). */
  savedStatementClosingMinor?: number | null;
  busy?: boolean;
  onConfirm?: (statementClosingMinor: number, reason: string) => void;
}) {
  const [statementInput, setStatementInput] = useState('');
  const [reason, setReason] = useState(TAG_OPENING_RESET_DEFAULT_REASON);

  React.useEffect(() => {
    if (!open || mode !== 'edit') return;
    const start = reset?.statementClosingMinor ?? savedStatementClosingMinor ?? null;
    setStatementInput(start != null ? String(fromMoneyMinor(start as MoneyMinor)) : '');
    setReason(TAG_OPENING_RESET_DEFAULT_REASON);
  }, [open, mode, reset?.statementClosingMinor, savedStatementClosingMinor]);

  const statementMinor = useMemo(() => {
    if (mode === 'read' && reset) return reset.statementClosingMinor;
    const raw = statementInput.trim().replace(/,/g, '');
    if (!raw) return null;
    const major = Number(raw);
    if (!Number.isFinite(major)) return null;
    return Math.round(major * 100);
  }, [mode, reset, statementInput]);

  const preview = useMemo(() => {
    if (statementMinor == null) return null;
    return buildTagAccountOpeningResetPayload({
      statementClosingMinor: statementMinor,
      previousOpeningMinor,
      topUpsMinor,
      tagUsageMinor,
      reason,
    });
  }, [statementMinor, previousOpeningMinor, topUpsMinor, tagUsageMinor, reason]);

  const read = mode === 'read' && reset;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="tag-opening-reset-dialog">
        <DialogHeader>
          <DialogTitle>{read ? 'Starting balance from statement' : 'Set starting balance from statement'}</DialogTitle>
          <DialogDescription>
            {read
              ? 'One-time correction recorded on this week only. Earlier weeks are unchanged.'
              : 'The new toll system will open from your provider balance. Old-record carry is not used after this.'}
          </DialogDescription>
        </DialogHeader>

        {read ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Statement closing</dt>
              <dd className="font-semibold tabular-nums">J${fmtMajor(reset.statementClosingMinor)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Opening (corrected)</dt>
              <dd className="font-semibold tabular-nums">J${fmtMajor(reset.openingMinor)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Was (old records)</dt>
              <dd className="font-semibold tabular-nums">J${fmtMajor(reset.previousOpeningMinor)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Old-records correction</dt>
              <dd className="font-semibold tabular-nums">J${fmtMajor(reset.differenceMinor)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Reason</dt>
              <dd>{reset.reason}</dd>
            </div>
            {reset.actor ? (
              <div>
                <dt className="text-slate-500">By</dt>
                <dd>{reset.actor}</dd>
              </div>
            ) : null}
            {reset.at ? (
              <div>
                <dt className="text-slate-500">When</dt>
                <dd>{new Date(reset.at).toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-reset-statement">Statement closing balance</Label>
              <Input
                id="tag-reset-statement"
                type="text"
                inputMode="decimal"
                placeholder="From provider statement"
                value={statementInput}
                onChange={(e) => setStatementInput(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-reset-reason">Reason</Label>
              <Input
                id="tag-reset-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {preview ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800" data-testid="tag-reset-preview">
                Opening becomes <strong className="tabular-nums">J${fmtMajor(preview.openingMinor)}</strong> (was{' '}
                <strong className="tabular-nums">J${fmtMajor(preview.previousOpeningMinor)}</strong> from old records).
                Difference <strong className="tabular-nums">J${fmtMajor(preview.differenceMinor)}</strong> is recorded as an
                old-records correction.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {read ? (
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || statementMinor == null || !reason.trim()}
                onClick={() => statementMinor != null && onConfirm?.(statementMinor, reason.trim())}
                data-testid="tag-reset-confirm"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Save starting balance
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}