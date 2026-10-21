import { Button } from '../../ui/button';
import { FuelWeekMoneyStrip } from './FuelWeekMoneyStrip';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';

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
        <p className="mt-1 text-sm text-slate-600">
          Locked {period.lockedAt ? new Date(period.lockedAt).toLocaleString() : 'on the server'}
          {period.version ? ` · version ${period.version}` : ''}
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
        {period.closeReceipt?.statementIds?.length ? (
          <p className="mt-3 text-sm text-slate-700">
            Statement {period.closeReceipt.statementIds.join(', ')}
          </p>
        ) : null}
        {period.closeReceipt?.ledgerEventIds?.length ? (
          <p className="mt-1 text-sm text-slate-700">
            Posted lines {period.closeReceipt.ledgerEventIds.join(', ')}
          </p>
        ) : null}
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
