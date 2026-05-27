import React from 'react';
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';
import type { OrganizationMetrics, Trip } from '../../types/data';
import {
  reconcilePaymentLinesToOrgStatement,
  reconcileTripRollupsToPaymentLines,
} from '../../utils/reconcilePaymentLinesToOrgStatement';

interface ImportReconciliationSummaryProps {
  organizationMetrics?: OrganizationMetrics | null;
  paymentLines: PaymentLedgerLine[];
  trips: Trip[];
}

function Row({ label, statement, lines, delta, ok }: {
  label: string;
  statement: number;
  lines: number;
  delta: number;
  ok: boolean;
}) {
  return (
    <tr className="text-xs border-b border-slate-100">
      <td className="py-2 pr-4 text-slate-600">{label}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{statement.toFixed(2)}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{lines.toFixed(2)}</td>
      <td className={`py-2 text-right tabular-nums ${ok ? 'text-emerald-600' : 'text-amber-700'}`}>
        {delta.toFixed(2)}
      </td>
    </tr>
  );
}

export function ImportReconciliationSummary({
  organizationMetrics,
  paymentLines,
  trips,
}: ImportReconciliationSummaryProps) {
  if (!organizationMetrics || paymentLines.length === 0) return null;

  const orgRec = reconcilePaymentLinesToOrgStatement({ organizationMetrics, paymentLines });
  const tripMismatches = reconcileTripRollupsToPaymentLines(trips, paymentLines).filter(
    (r) => !r.withinTolerance,
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-slate-800">Statement reconciliation</h4>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            orgRec.withinTolerance
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {orgRec.withinTolerance ? 'Within tolerance' : 'Review deltas'}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {orgRec.paymentLineCount} payment line(s) vs org statement
      </p>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left">
            <th className="pb-1">Metric</th>
            <th className="pb-1 text-right">Statement</th>
            <th className="pb-1 text-right">Lines sum</th>
            <th className="pb-1 text-right">Delta</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label="Net fare"
            statement={orgRec.netFareStatement}
            lines={orgRec.netFareFromLines}
            delta={orgRec.netFareDelta}
            ok={Math.abs(orgRec.netFareDelta) <= 0.05}
          />
          <Row
            label="Tips"
            statement={orgRec.tipsStatement}
            lines={orgRec.tipsFromLines}
            delta={orgRec.tipsDelta}
            ok={Math.abs(orgRec.tipsDelta) <= 0.05}
          />
          <Row
            label="Cash collected"
            statement={orgRec.cashStatement}
            lines={orgRec.cashFromLines}
            delta={orgRec.cashDelta}
            ok={Math.abs(orgRec.cashDelta) <= 0.05}
          />
          <Row
            label="Bank payout"
            statement={orgRec.bankStatement}
            lines={Math.abs(orgRec.bankFromLines)}
            delta={orgRec.bankDelta}
            ok={Math.abs(orgRec.bankDelta) <= 0.05}
          />
        </tbody>
      </table>
      {tripMismatches.length > 0 && (
        <p className="text-xs text-amber-700">
          {tripMismatches.length} trip(s) where rollup ≠ sum(payment lines)
        </p>
      )}
    </div>
  );
}
