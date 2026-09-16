import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { unexplainedLabel } from '../../../utils/fuelReconGlossary';

function MoneyStatCard({
  label,
  value,
  emphasize,
  warn,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded border p-4 shadow-sm ${
        warn
          ? 'border-[#684000]/20 bg-[#ffddb8]'
          : emphasize
            ? 'border-[#3525cd]/20 bg-[#e2dfff]'
            : 'border-slate-200 bg-white'
      }`}
    >
      <p
        className={`mb-1 text-[11px] font-medium uppercase tracking-tight ${
          warn ? 'text-[#684000]' : emphasize ? 'text-[#3525cd]' : 'text-slate-500'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-xl font-semibold tabular-nums leading-7 ${
          warn ? 'text-[#684000]' : emphasize ? 'text-[#3525cd]' : 'text-slate-900'
        }`}
      >
        {formatFuelMoney(value)}
      </p>
    </div>
  );
}

/** Stitch money-clarity strip — binds real week totals only. */
export function FuelWeekMoneyStrip({
  gasCard,
  cashFromEarnings,
  totalSpend,
  company,
  driver,
  leakage,
  windowTiming = 0,
  priorMedian,
}: {
  gasCard: number;
  cashFromEarnings: number;
  totalSpend: number;
  company: number;
  driver: number;
  leakage: number;
  /** F-1: tank-window timing (first fill / no-odo) — not a third payer. */
  windowTiming?: number;
  priorMedian?: { totalSpend: number; unexplained: number };
}) {
  const sourcesTie = Math.abs(gasCard + cashFromEarnings - totalSpend) <= FUEL_SPEND_EPS;
  // F-7: Company + Driver is the payer identity; unexplained is subordinate.
  // Over-explained still conserves with leakage in the equation under the hood.
  const overExplainedResidual = leakage < -FUEL_SPEND_EPS;
  const splitTie = overExplainedResidual
    ? Math.abs(company + driver + leakage - totalSpend) <= FUEL_SPEND_EPS
    : Math.abs(company + driver - totalSpend) <= FUEL_SPEND_EPS;
  const spendDelta =
    priorMedian != null ? totalSpend - priorMedian.totalSpend : null;
  const unexplainedDelta =
    priorMedian != null ? leakage - priorMedian.unexplained : null;
  const hasTiming = Math.abs(windowTiming) > FUEL_SPEND_EPS;
  const hasLeakage = Math.abs(leakage) > FUEL_SPEND_EPS;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Where the money came from
          </h3>
          <p className="text-[13px] leading-[18px] text-slate-500">
            Total fuel expenditure grouped by payment method.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MoneyStatCard label="Gas card (company paid)" value={gasCard} />
          <MoneyStatCard label="Cash from earnings (credit)" value={cashFromEarnings} />
          <MoneyStatCard label="Total fuel bought" value={totalSpend} emphasize />
        </div>
        {spendDelta != null && (
          <p className="text-xs text-slate-500">
            vs 4-week median: {spendDelta >= 0 ? '+' : ''}
            {formatFuelMoney(spendDelta)}
          </p>
        )}
        <p
          className={`text-xs font-medium ${sourcesTie ? 'text-emerald-700' : 'text-rose-700'}`}
          role="status"
        >
          <span className="sr-only">
            Gas card {formatFuelMoney(gasCard)}, cash {formatFuelMoney(cashFromEarnings)}, total{' '}
            {formatFuelMoney(totalSpend)}.
          </span>
          Gas card + Cash {sourcesTie ? '=' : '≠'} Total {sourcesTie ? '✓' : '— check attribution'}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Who ends up paying
          </h3>
          <p className="text-[13px] leading-[18px] text-slate-500">
            Usage split determined by activity type and policy rules.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MoneyStatCard label="Company keeps" value={company} />
          <MoneyStatCard label="Driver’s fuel share (charge)" value={driver} />
        </div>
        {(hasTiming || hasLeakage) && (
          <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-tight text-slate-500">
              Spend breakdown
            </p>
            {hasTiming && (
              <p title="Fuel bought outside the odometer burn window (first fill / fills without odometer). Timing difference — not theft.">
                Of which tank window / timing:{' '}
                <span className="font-semibold tabular-nums">{formatFuelMoney(windowTiming)}</span>
              </p>
            )}
            {hasLeakage && (
              <p
                className={leakage > 0 ? 'text-[#684000]' : undefined}
                title="Spend not explained by categorized burn after timing is carved out."
              >
                Of which {unexplainedLabel(leakage).toLowerCase()}:{' '}
                <span className="font-semibold tabular-nums">{formatFuelMoney(leakage)}</span>
              </p>
            )}
            <p className="text-slate-500">
              Of which charged to driver from unexplained:{' '}
              <span className="font-semibold tabular-nums text-slate-800">
                {formatFuelMoney(0)}
              </span>
            </p>
          </div>
        )}
        {unexplainedDelta != null && (
          <p className="text-xs text-slate-500">
            Unexplained vs median: {unexplainedDelta >= 0 ? '+' : ''}
            {formatFuelMoney(unexplainedDelta)}
          </p>
        )}
        <p
          className={`text-xs font-medium ${splitTie ? 'text-emerald-700' : 'text-rose-700'}`}
          role="status"
        >
          <span className="sr-only">
            Company {formatFuelMoney(company)}, driver {formatFuelMoney(driver)}, unexplained{' '}
            {formatFuelMoney(leakage)}, total {formatFuelMoney(totalSpend)}.
          </span>
          Company + Driver {splitTie ? '=' : '≠'} Total{' '}
          {splitTie ? '✓' : '— shared-car or calc mismatch'}
        </p>
        {overExplainedResidual && (
          <p className="text-xs text-slate-500" role="status">
            Incl. over-explained residual {formatFuelMoney(leakage)} (modelled burn exceeded purchases).
          </p>
        )}
      </section>
    </div>
  );
}
