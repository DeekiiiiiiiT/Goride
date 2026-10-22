import React from 'react';
import type { FuelRule } from '../../types/fuel';
import { getCoverageMatrixRows } from '../../utils/fuelCoverageSplit';

interface FuelCoverageMatrixProps {
  rule: FuelRule | undefined;
  compact?: boolean;
}

export function FuelCoverageMatrix({ rule, compact }: FuelCoverageMatrixProps) {
  const rows = getCoverageMatrixRows(rule);
  const isFixed = rule?.coverageType === 'Fixed_Amount';

  return (
    <div className="w-full overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'}`}>Category</th>
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'} text-right`}>Company covers</th>
            <th className={`px-3 ${compact ? 'py-1.5' : 'py-2'} text-right`}>Driver pays</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const allowanceBased = row.companyPct < 0;
            return (
              <tr key={row.key} className="border-b border-slate-100 last:border-0">
                <td className={`px-3 ${compact ? 'py-1.5' : 'py-2'} font-medium text-slate-800`}>{row.label}</td>
                <td className={`px-3 ${compact ? 'py-1.5' : 'py-2'} text-right tabular-nums text-indigo-700`}>
                  {allowanceBased
                    ? (isFixed ? `≤ $${rule?.coverageValue ?? 0} pool` : '—')
                    : `${row.companyPct}%`}
                </td>
                <td className={`px-3 ${compact ? 'py-1.5' : 'py-2'} text-right tabular-nums text-rose-600`}>
                  {allowanceBased ? 'Remainder' : `${row.driverPct}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        Leftover fuel (variance, unexplained kilometres, fills with no odometer) is paid by the company
        {rule?.leftoverSplit?.mode === 'percentage'
          ? `, except ${rule.leftoverSplit.driverPercent ?? 0}% billed to the driver`
          : rule?.leftoverSplit?.mode === 'fixed'
            ? `, except ${rule.leftoverSplit.driverFixedAmount ?? 0} JMD billed to the driver`
            : ''}
        .
      </p>
      {isFixed && (
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
          Fixed allowance applies to ride share. Company ops, repositioning, and commute are fully company; personal is fully driver. Leftover fuel is company unless a leftover split is set.
        </p>
      )}
    </div>
  );
}
