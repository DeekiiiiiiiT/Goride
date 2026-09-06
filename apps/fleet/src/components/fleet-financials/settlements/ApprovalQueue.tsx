import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import type { SettlementMovementRow } from './MovementHistoryTable';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

export type ApprovalQueueProps = {
  movements: SettlementMovementRow[];
  loading?: boolean;
  onApprove: (movementId: string, note: string) => void | Promise<void>;
  onReject: (movementId: string, note: string) => void | Promise<void>;
  onOpenDriver?: (driverId: string) => void;
};

/**
 * Maker–checker queue — movements with approval_state=pending.
 */
export function ApprovalQueue({
  movements,
  loading,
  onApprove,
  onReject,
  onOpenDriver,
}: ApprovalQueueProps) {
  const pending = movements.filter(
    (m) => String(m.approvalState || '').toLowerCase() === 'pending',
  );

  const [target, setTarget] = useState<{
    row: SettlementMovementRow;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (target.decision === 'approve') {
        await onApprove(target.row.id, note.trim());
      } else {
        await onReject(target.row.id, note.trim());
      }
      setTarget(null);
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Approval queue</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Movements awaiting approve / reject.
            </p>
          </div>
          <Badge variant="secondary" className="font-normal">
            {pending.length} pending
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Driver</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading…
                </TableCell>
              </TableRow>
            ) : pending.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  No movements awaiting approval.
                </TableCell>
              </TableRow>
            ) : (
              pending.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-slate-900 hover:text-indigo-600"
                      onClick={() => m.driverId && onOpenDriver?.(m.driverId)}
                    >
                      {m.driverName || m.driverId || '—'}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {m.periodAnchor || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal capitalize">
                      {m.kind || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {MONEY(m.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{m.method || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-emerald-700 hover:bg-emerald-800"
                        onClick={() => {
                          setTarget({ row: m, decision: 'approve' });
                          setNote('');
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-red-600 border-red-200"
                        onClick={() => {
                          setTarget({ row: m, decision: 'reject' });
                          setNote('');
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.decision === 'approve' ? 'Approve movement' : 'Reject movement'}
            </DialogTitle>
            <DialogDescription>
              Optional note is stored with the approval decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approval-note">Note</Label>
            <Textarea
              id="approval-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={target?.decision === 'reject' ? 'destructive' : 'default'}
              className={
                target?.decision === 'approve' ? 'bg-emerald-700 hover:bg-emerald-800' : undefined
              }
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
