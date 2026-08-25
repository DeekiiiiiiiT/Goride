import { Download, TrendingUp } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { downloadCSV } from '../../../utils/export';
import type { WeeklyFuelReport } from '../../../types/fuel';

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export type FuelQualityRow = {
  id: string;
  plate: string;
  driverName: string;
  healthStatus?: 'Emerald' | 'Amber' | 'Red';
  pendingCount: number;
  totalSpend: number;
  companyShare: number;
  driverShare: number;
  cashFromEarnings: number;
  netPay: number;
  misc: number;
  subtitle?: string;
};

function healthChipClass(status?: string) {
  if (status === 'Red') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'Amber') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'Emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return '';
}

/**
 * Stitch Data Quality step body — flagged cards first; dense spreadsheet is opt-in.
 * Screen: Fuel Week Wizard - Data Quality (Redesign) — de37d1ddddbb450f8698e1e23ef27697
 */
export function FuelDataQualityStep({
  rows,
  breakdownRows,
  periodLocked,
  weekLabel,
  showBreakdown,
  onToggleBreakdown,
  onAddAdjustment,
}: {
  rows: FuelQualityRow[];
  breakdownRows: FuelQualityRow[];
  periodLocked?: boolean;
  weekLabel: string;
  showBreakdown: boolean;
  onToggleBreakdown: () => void;
  onAddAdjustment: () => void;
}) {
  const handleExport = async () => {
    if (!breakdownRows.length) return;
    const data = breakdownRows.map((r) => ({
      Vehicle: r.plate,
      Driver: r.driverName,
      Health: r.healthStatus || '',
      PendingLogs: r.pendingCount,
      TotalFuelBought: Number(r.totalSpend.toFixed(2)),
      CompanyKeeps: Number(r.companyShare.toFixed(2)),
      DriversFuelShare: Number(r.driverShare.toFixed(2)),
      CashFromEarnings: Number(r.cashFromEarnings.toFixed(2)),
      NetThisWeek: Number(r.netPay.toFixed(2)),
      UnexplainedFuel: Number(r.misc.toFixed(2)),
    }));
    await downloadCSV(data, `fuel-data-quality-${weekLabel}`, { checksum: true });
  };

  return (
    <div className="space-y-4">
      <p className="rounded border border-slate-200 bg-[#f5f2ff] px-4 py-3 text-[13px] leading-[18px] text-slate-600">
        Estimates use trip km + odometer; unexplained = total − estimated categories.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void handleExport()}>
          <Download className="mr-2 h-4 w-4" />
          Export week
        </Button>
        {!periodLocked && (
          <Button type="button" variant="outline" className="min-h-11" onClick={onAddAdjustment}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Add Adjustment
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-10 text-center text-sm text-emerald-800">
          All vehicles look healthy — continue.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900">{r.plate}</div>
                <div className="text-sm text-slate-600">{r.driverName}</div>
                {r.subtitle && <div className="text-xs text-slate-500">{r.subtitle}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {r.healthStatus && r.healthStatus !== 'Emerald' && (
                  <Badge variant="outline" className={`text-[10px] ${healthChipClass(r.healthStatus)}`}>
                    {r.healthStatus}
                  </Badge>
                )}
                {r.pendingCount > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {r.pendingCount} pending
                  </Badge>
                )}
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(r.totalSpend)}
                  </div>
                  <div className="text-[11px] text-slate-500">Total fuel bought</div>
                </div>
                {r.misc > FUEL_SPEND_EPS && (
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-[#684000]">
                      {formatMoney(r.misc)}
                    </div>
                    <div className="text-[11px] text-slate-500">Unexplained</div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="min-h-11" onClick={onToggleBreakdown}>
        {showBreakdown ? 'Hide' : 'Show'} full cost breakdown
      </Button>

      {showBreakdown && (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-[#f5f2ff] text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Driver / Vehicle</th>
                <th className="px-3 py-3 font-medium">Health</th>
                <th className="px-3 py-3 font-medium text-right">Total fuel bought</th>
                <th className="px-3 py-3 font-medium text-right">Company keeps</th>
                <th className="px-3 py-3 font-medium text-right">Driver’s fuel share</th>
                <th className="px-3 py-3 font-medium text-right">Cash from earnings</th>
                <th className="px-3 py-3 font-medium text-right">Net</th>
                <th className="px-3 py-3 font-medium text-right">Unexplained</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{r.driverName}</div>
                    <div className="text-xs text-slate-500">{r.plate}</div>
                  </td>
                  <td className="px-3 py-3">
                    {r.healthStatus ? (
                      <Badge variant="outline" className={`text-[10px] ${healthChipClass(r.healthStatus)}`}>
                        {r.healthStatus}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.totalSpend)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.companyShare)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700">
                    {formatMoney(r.driverShare)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.cashFromEarnings)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{formatMoney(r.netPay)}</td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${
                      r.misc > FUEL_SPEND_EPS ? 'text-[#684000] font-semibold' : ''
                    }`}
                  >
                    {formatMoney(r.misc)}
                  </td>
                </tr>
              ))}
              {breakdownRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    No spend this week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Build export/breakdown rows from live weekly reports (real fields only). */
export function buildQualityBreakdownFromReports(
  reports: WeeklyFuelReport[],
  resolve: (r: WeeklyFuelReport) => FuelQualityRow,
): FuelQualityRow[] {
  return reports
    .filter((r) => (r.totalGasCardCost || 0) > FUEL_SPEND_EPS)
    .map(resolve);
}
