import { Button } from '../../ui/button';
import { FuelWeekMoneyStrip } from './FuelWeekMoneyStrip';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';

/** "15 Nov 2026, 9:41 AM" in the fleet's Jamaica clock — never "11/15/2026, 9:41:29 AM". */
export function formatLockedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'on the server';
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Jamaica' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Jamaica' });
  return `${day}, ${time}`;
}

/** Read-only receipt once the week in the database is locked. No week engine. */
export function FuelWeekLockedReceipt({
  period,
  onBack,
  onReopen,
}: {
  period: FuelReconciliationPeriod;
  onBack: () => void;
  onReopen?: () => void;
}) {
  const gasCard = Number(period.gasCardSpend) || 0;
  const cash = Number(period.cashFromEarnings) || 0;
  const total = Number(period.totalSpend) || gasCard + cash;
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Periods
      </button>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Locked</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{period.label}</h2>
        <p className="mt-1 text-sm text-slate-600" data-testid="fuel-locked-at">
          Locked {period.lockedAt ? formatLockedAt(period.lockedAt) : 'on the server'}
        </p>
        <div className="mt-4">
          <FuelWeekMoneyStrip
            gasCard={gasCard || total}
            cashFromEarnings={cash}
            totalSpend={total}
            company={period.companyShare}
            driver={period.driverShare}
            leakage={period.netLeakage}
            variant="collapsed"
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Reopening this week reverses the posted fuel lines and asks for a reason.
        </p>
        {period.fuelSealError ? (
          <p className="mt-3 text-sm text-amber-800">
            The statement did not finish posting. {period.fuelSealError}
          </p>
        ) : null}
        {onReopen ? (
          <Button type="button" variant="outline" className="mt-3" onClick={onReopen}>
            Reopen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
