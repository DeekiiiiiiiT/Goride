/**
 * Settlement preview / finalize table shared by wizard steps.
 */
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

export type FuelSettlementRow = {
  id: string;
  plate: string;
  cashFromEarnings: number;
  driverShare: number;
  netPay: number;
  pending?: number;
  status?: string;
};

export function FuelSettlementTable({
  rows,
  showStatus,
}: {
  rows: FuelSettlementRow[];
  showStatus?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Vehicle</th>
            <th className="px-3 py-2 text-right">Cash from earnings</th>
            <th className="px-3 py-2 text-right">Driver share</th>
            <th className="px-3 py-2 text-right">Net</th>
            {showStatus && <th className="px-3 py-2">Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-3 py-3 font-medium text-slate-900">{r.plate}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatFuelMoney(r.cashFromEarnings)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-amber-700">
                {formatFuelMoney(r.driverShare)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold">
                {formatFuelMoney(r.netPay)}
              </td>
              {showStatus && (
                <td className="px-3 py-3 text-slate-600">{r.status || '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
