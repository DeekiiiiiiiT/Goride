import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

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
}: {
  gasCard: number;
  cashFromEarnings: number;
  totalSpend: number;
  company: number;
  driver: number;
  leakage: number;
}) {
  const sourcesTie = Math.abs(gasCard + cashFromEarnings - totalSpend) <= FUEL_SPEND_EPS;
  const splitTie = Math.abs(company + driver + leakage - totalSpend) <= FUEL_SPEND_EPS;

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
        <p
          className={`text-xs font-medium ${sourcesTie ? 'text-emerald-700' : 'text-rose-700'}`}
          role="status"
        >
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MoneyStatCard label="Company keeps" value={company} />
          <MoneyStatCard label="Driver’s fuel share (charge)" value={driver} />
          <MoneyStatCard
            label="Unexplained fuel"
            value={leakage}
            warn={Math.abs(leakage) > FUEL_SPEND_EPS}
          />
        </div>
        <p
          className={`text-xs font-medium ${splitTie ? 'text-emerald-700' : 'text-rose-700'}`}
          role="status"
        >
          Company + Driver + Unexplained {splitTie ? '=' : '≠'} Total{' '}
          {splitTie ? '✓' : '— shared-car or calc mismatch'}
        </p>
      </section>
    </div>
  );
}
