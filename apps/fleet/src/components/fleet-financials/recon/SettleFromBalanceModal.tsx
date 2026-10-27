/**
 * Net a driver-owes week against a fleet-owes week. No cash changes hands.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MONEY_EPS } from '@roam/finance-core';
import { settlementCommandsApi } from '../../../services/settlementCommandsApi';
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

const MONEY = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export type SettleFromBalanceModalProps = {
  open: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
  owingWeekStart: string;
  owingAmount: number;
  onConfirm: (input: {
    creditWeekStart: string;
    amount: number;
  }) => Promise<void>;
};

export function SettleFromBalanceModal({
  open,
  onClose,
  driverId,
  driverName,
  owingWeekStart,
  owingAmount,
  onConfirm,
}: SettleFromBalanceModalProps) {
  const creditQuery = useQuery({
    queryKey: ['settle-from-balance-credits', driverId, owingWeekStart],
    enabled: open && Boolean(driverId),
    queryFn: async () => {
      const res = await settlementCommandsApi.getQueue({
        view: 'pay',
        weekFrom: '2026-01-01',
        weekTo: '2026-12-31',
        minAmount: 0,
        pageSize: 200,
        groupBy: 'week',
        search: driverName || driverId,
      });
      return (res.rows || []).filter(
        (r) =>
          r.driverId === driverId &&
          r.periodAnchor !== owingWeekStart &&
          !r.periodFrozen &&
          (Number(r.amountOwed) || Number(r.settlementAmount) || 0) > MONEY_EPS,
      );
    },
  });

  const creditWeeks = creditQuery.data || [];
  const [creditWeek, setCreditWeek] = useState('');
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => creditWeeks.find((r) => r.periodAnchor === creditWeek) || null,
    [creditWeeks, creditWeek],
  );
  const creditResidual = selected
    ? Math.max(0, Number(selected.amountOwed) || Number(selected.settlementAmount) || 0)
    : 0;
  const maxAmount = Math.min(owingAmount, creditResidual || owingAmount);
  const amount = Number(amountText) || 0;

  useEffect(() => {
    if (!open) return;
    const preferred =
      creditWeeks.find((r) => r.periodAnchor === '2026-10-19') || creditWeeks[0] || null;
    const week = preferred?.periodAnchor || '';
    setCreditWeek(week);
    const cap = preferred
      ? Math.min(
          owingAmount,
          Math.max(0, Number(preferred.amountOwed) || Number(preferred.settlementAmount) || 0),
        )
      : owingAmount;
    setAmountText(cap > 0 ? cap.toFixed(2) : '');
  }, [open, creditWeeks, owingAmount]);

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settle from balance</DialogTitle>
          <DialogDescription>
            Moves money off {driverName}&apos;s week of {owingWeekStart} onto another week the
            fleet already owes. No cash changes hands.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-slate-700">
            This week owes <span className="font-semibold tabular-nums">{MONEY(owingAmount)}</span>
          </p>

          <div className="space-y-1">
            <Label htmlFor="credit-week">Apply against</Label>
            <select
              id="credit-week"
              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={creditWeek}
              disabled={creditQuery.isLoading || creditWeeks.length === 0}
              onChange={(e) => {
                const week = e.target.value;
                setCreditWeek(week);
                const row = creditWeeks.find((r) => r.periodAnchor === week);
                const cap = row
                  ? Math.min(
                      owingAmount,
                      Math.max(0, Number(row.amountOwed) || Number(row.settlementAmount) || 0),
                    )
                  : owingAmount;
                setAmountText(cap > 0 ? cap.toFixed(2) : '');
              }}
            >
              {creditWeeks.length === 0 ? (
                <option value="">No open week the fleet owes</option>
              ) : (
                creditWeeks.map((r) => {
                  const owed = Math.max(
                    0,
                    Number(r.amountOwed) || Number(r.settlementAmount) || 0,
                  );
                  return (
                    <option key={r.periodAnchor} value={r.periodAnchor}>
                      Week of {r.periodAnchor} · fleet owes {MONEY(owed)}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="settle-amount">Amount</Label>
            <Input
              id="settle-amount"
              type="number"
              min={0}
              step="0.01"
              className="min-h-11 tabular-nums"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Max {MONEY(maxAmount)}. Moves {MONEY(amount > 0 ? amount : 0)} off this week onto{' '}
              {creditWeek || '—'}.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={
              busy ||
              !creditWeek ||
              !(amount > MONEY_EPS) ||
              amount > maxAmount + MONEY_EPS ||
              creditWeeks.length === 0
            }
            onClick={() => {
              setBusy(true);
              void onConfirm({ creditWeekStart: creditWeek, amount })
                .then(() => onClose())
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Saving…' : 'Settle from balance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
