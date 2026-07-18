/**
 * Export packs — CSV from Business Finance / canonical aggregations.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import type { BusinessFinanceBundle } from '../types';
import { formatPeriodLabel } from '../periodRange';

function downloadCsv(filename: string, lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WorkbenchExport({
  bundle,
  onBack,
}: {
  bundle: BusinessFinanceBundle;
  onBack: () => void;
}) {
  const label = formatPeriodLabel(bundle.period).replace(/[^a-zA-Z0-9]+/g, '-');

  const exportPnL = () => {
    downloadCsv(`pnl-${label}.csv`, [
      'Line,Amount',
      ...bundle.pnl.lines.map((l) =>
        l.tracked === false || l.amount == null
          ? `"${l.label}",not_tracked`
          : `"${l.label}",${l.amount}`,
      ),
      `Operating ratio %,${bundle.pnl.operatingRatio ?? ''}`,
    ]);
  };

  const exportBalances = () => {
    downloadCsv(`driver-balances-${label}.csv`, [
      'Driver,DriverId,CashStillHeld,CompanyOwes,BankSettled,Week,Status',
      ...bundle.driverBalances.rows.map(
        (r) =>
          `"${r.name}",${r.driverId},${r.cashStillHeld},${r.companyOwes},${r.bankSettled},${r.weekLabel},${r.status}`,
      ),
    ]);
  };

  const exportBank = () => {
    const b = bundle.cashBank.platformBank;
    downloadCsv(`bank-summary-${label}.csv`, [
      'Metric,Amount',
      `Expected,${b.expected}`,
      `Received,${b.received}`,
      `Variance,${b.variance}`,
      `NeedsStatementWeeks,${b.needsStatementWeeks}`,
      `DriverCashStillHeld,${bundle.cashBank.driverCash.totalStillHeld}`,
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Export packs</h2>
          <p className="text-xs text-slate-500">
            Downloads from Business Finance books for {formatPeriodLabel(bundle.period)} — not trip mashups.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          Back to Workbench
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-200 dark:border-slate-800 rounded-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold">Profit &amp; Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <Button type="button" size="sm" variant="outline" onClick={exportPnL}>
              Download P&amp;L CSV
            </Button>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 rounded-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold">Driver balances</CardTitle>
          </CardHeader>
          <CardContent>
            <Button type="button" size="sm" variant="outline" onClick={exportBalances}>
              Download balances CSV
            </Button>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 rounded-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold">Bank summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Button type="button" size="sm" variant="outline" onClick={exportBank}>
              Download bank CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
