/**
 * Business Finance → Workbench landing (Stitch Precision Operations).
 * Ops queues + quick links — does not invent payout math.
 */
import React from 'react';
import { CheckSquare, FileDown, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';

export type WorkbenchPanel = 'home' | 'approvals' | 'settlement' | 'export';

type Props = {
  pendingApprovals: number;
  settlementReadyCount: number;
  onOpenPanel: (p: WorkbenchPanel) => void;
  onNavigatePage?: (page: string) => void;
};

export function WorkbenchHome({
  pendingApprovals,
  settlementReadyCount,
  onOpenPanel,
  onNavigatePage,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Workbench runs ops for the period. Reporting stays on Overview / P&amp;L / Cash &amp; Bank.
        Settlement pay math stays on Drivers — this desk never invents a second payroll formula.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 dark:border-slate-800 rounded-md">
          <CardHeader className="py-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-indigo-600" />
              Approvals
            </CardTitle>
            {pendingApprovals > 0 && (
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-none">
                {pendingApprovals}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            <p className="text-xs text-slate-500">Pending expense reviews</p>
            <Button
              type="button"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-600"
              onClick={() => onOpenPanel('approvals')}
            >
              Open queue
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 rounded-md">
          <CardHeader className="py-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              Driver settlement
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums" title="Weeks with activity">
              {settlementReadyCount}
            </Badge>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            <p className="text-xs text-slate-500">Weeks with activity this period — not a ready-to-pay queue</p>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenPanel('settlement')}>
              Open driver list
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 rounded-md">
          <CardHeader className="py-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileDown className="h-4 w-4 text-indigo-600" />
              Export packs
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            <p className="text-xs text-slate-500">P&amp;L and balance packs from real books</p>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenPanel('export')}>
              Open exports
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-600 dark:text-slate-400">Quick links</span>
        {[
          { page: 'fleet-financials', label: 'Bank Deposits' },
          { page: 'cash-retag', label: 'Cash Retag' },
          { page: 'indrive-wallet', label: 'InDrive Wallet' },
          { page: 'transaction-list', label: 'Transaction List' },
        ].map((d, i) => (
          <React.Fragment key={d.page}>
            {i > 0 && <span className="text-slate-300">·</span>}
            <button
              type="button"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={() => onNavigatePage?.(d.page)}
            >
              {d.label}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
