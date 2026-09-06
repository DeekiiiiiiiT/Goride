import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function weekLabel(anchor: string, end: string) {
  try {
    return `${format(parseISO(`${anchor}T12:00:00`), 'MMM d')} – ${format(parseISO(`${end}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${anchor} – ${end}`;
  }
}

function ymdKey(value: unknown): string {
  return String(value || '').slice(0, 10);
}

/** Unified Done-tab movement row (pay + collect). */
export type SettlementMovementRow = {
  id: string;
  kind: 'collect' | 'pay' | 'write_off' | 'reverse' | 'verify' | string;
  driverId?: string;
  driverName?: string;
  amount: number;
  method?: string;
  status?: string;
  date?: string;
  periodAnchor?: string;
  periodEnd?: string;
  reference?: string;
  description?: string;
  approvalState?: string;
  /** Legacy dual-write / pre-migration transaction id when reversing via bridge. */
  sourceTransactionId?: string;
};

export type MovementHistoryTableProps = {
  rows: SettlementMovementRow[];
  mode?: 'collect' | 'pay' | 'all';
  onOpenDriver?: (driverId: string) => void;
  onVerify?: (row: SettlementMovementRow) => void;
  /** Called after operator confirms undo with a required reason. */
  onUndo: (row: SettlementMovementRow, reason: string) => void;
  /** Optional external reason dialog — when provided, parent owns the dialog. */
  onRequestUndo?: (row: SettlementMovementRow) => void;
};

function groupByPeriod(rows: SettlementMovementRow[]) {
  const map = new Map<
    string,
    { key: string; label: string; total: number; rows: SettlementMovementRow[] }
  >();
  for (const row of rows) {
    const start = ymdKey(row.periodAnchor);
    const end = ymdKey(row.periodEnd || start);
    const key = start || '_none';
    const label = start ? weekLabel(start, end || start) : 'Untagged week';
    let g = map.get(key);
    if (!g) {
      g = { key, label, total: 0, rows: [] };
      map.set(key, g);
    }
    g.rows.push(row);
    g.total += Math.abs(Number(row.amount) || 0);
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Unified Done table for pay + collect (replaces DonePay/DoneCollect duplicates).
 */
export function MovementHistoryTable({
  rows,
  mode = 'all',
  onOpenDriver,
  onVerify,
  onUndo,
  onRequestUndo,
}: MovementHistoryTableProps) {
  const groups = useMemo(() => groupByPeriod(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [undoTarget, setUndoTarget] = useState<SettlementMovementRow | null>(null);
  const [undoReason, setUndoReason] = useState('');

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const requestUndo = (row: SettlementMovementRow) => {
    if (onRequestUndo) {
      onRequestUndo(row);
      return;
    }
    setUndoTarget(row);
    setUndoReason('');
  };

  const confirmUndo = () => {
    if (!undoTarget) return;
    const reason = undoReason.trim();
    if (!reason) return;
    onUndo(undoTarget, reason);
    setUndoTarget(null);
    setUndoReason('');
  };

  const amountTone =
    mode === 'pay' ? 'text-emerald-800' : mode === 'collect' ? 'text-emerald-700' : 'text-slate-900';

  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10" />
              <TableHead>Week</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                  No cleared movements in this range.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => {
                const open = expanded.has(g.key);
                return (
                  <React.Fragment key={g.key}>
                    <TableRow
                      className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggle(g.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(g.key);
                        }
                      }}
                    >
                      <TableCell className="w-10 pr-0">
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{g.label}</TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {g.rows.length} movement{g.rows.length !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${amountTone}`}>
                        {MONEY(g.total)}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                    {open
                      ? g.rows.map((row) => (
                          <TableRow key={row.id} className="bg-white">
                            <TableCell />
                            <TableCell className="text-sm text-slate-500">
                              {ymdKey(row.date) || '—'}
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                className="text-left font-medium text-slate-900 hover:text-indigo-600"
                                onClick={() => row.driverId && onOpenDriver?.(row.driverId)}
                              >
                                {row.driverName || row.driverId || '—'}
                              </button>
                            </TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${amountTone}`}>
                              {MONEY(row.amount)}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">
                              {row.method || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-normal">
                                {row.status || 'Cleared'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {onVerify &&
                                String(row.status || '').toLowerCase() !== 'verified' &&
                                String(row.status || '').toLowerCase() !== 'cleared' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => onVerify(row)}
                                  >
                                    Verify
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                  title="Undo — requires reason"
                                  onClick={() => requestUndo(row)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Undo
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      : null}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!onRequestUndo ? (
        <Dialog open={!!undoTarget} onOpenChange={(o) => !o && setUndoTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Undo movement</DialogTitle>
              <DialogDescription>
                Posts a reversal — the original record stays. A reason is required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="undo-reason">Reason</Label>
              <Textarea
                id="undo-reason"
                value={undoReason}
                onChange={(e) => setUndoReason(e.target.value)}
                placeholder="Why is this being reversed?"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUndoTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!undoReason.trim()}
                onClick={confirmUndo}
              >
                Confirm undo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
