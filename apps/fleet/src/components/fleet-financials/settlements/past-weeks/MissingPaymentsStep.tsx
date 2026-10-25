import { useState } from 'react';
import { round2 } from '@roam/finance-core';
import { Button } from '../../../ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../ui/collapsible';
import { formatMoney } from '../../../business-finance/money';
import { payoutSummary, weekLabel } from '../../../../utils/pastWeeksCleanupCopy';

type Pay = { week: string; amount: number };

export function MissingPaymentsStep({
  payouts,
  june15,
  driverName,
  ready,
  alreadyPosted,
  stillOffWeek,
  busy,
  postsEnabled,
  onPost,
}: {
  payouts: Pay[];
  june15: Pay | null;
  driverName: string;
  ready: boolean;
  alreadyPosted: boolean;
  stillOffWeek: string | null;
  busy: boolean;
  postsEnabled: boolean;
  onPost: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = [...payouts, ...(june15 ? [june15] : [])];
  const total = round2(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));

  if (alreadyPosted) {
    return <p className="text-sm text-slate-600">These payments are already in the payment history.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">{payoutSummary(rows.length, total, driverName)}</p>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger type="button" className="h-11 text-sm font-medium text-[#3525cd]">
          {open ? 'Hide payments' : 'See payments'}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          {rows.map((row) => (
            <div key={`${row.week}-${row.amount}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-900">Week of {weekLabel(row.week)}</span>
              <span className="text-slate-800">Paid {driverName} {formatMoney(row.amount)}</span>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
      {!ready ? (
        <p className="text-sm text-amber-900">
          {stillOffWeek
            ? `The week of ${weekLabel(stillOffWeek)} would still not match, so these payments cannot be recorded.`
            : 'A week would still not match what was paid, so these payments cannot be recorded.'}
        </p>
      ) : null}
      <Button type="button" className="h-11" disabled={busy || !ready || !postsEnabled} onClick={onPost}>
        Record payments
      </Button>
    </div>
  );
}
