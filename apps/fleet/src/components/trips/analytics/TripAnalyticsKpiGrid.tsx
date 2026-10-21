import { Sparkline } from '../../vehicles/analytics/AnalyticsKpiGrid';
import { formatJMD } from '../../../utils/formatJMD';
import { kpiDelta } from './tripAnalyticsModel';

type Block = Record<string, number | number[] | null | undefined>;

function Delta({ value, bad, neutral }: { value: number | null; bad?: boolean; neutral?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-slate-400">No prior period</span>;
  const up = value >= 0;
  const tone = neutral ? 'text-slate-500' : (bad ? !up : up) ? 'text-emerald-700' : 'text-rose-700';
  return (
    <span className={`text-xs font-semibold ${tone}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}% vs previous
    </span>
  );
}

function Card({
  label,
  value,
  hint,
  delta,
  bad,
  neutral,
  spark,
  tooltip,
}: {
  label: string;
  value: string;
  hint?: string;
  delta: number | null;
  bad?: boolean;
  neutral?: boolean;
  spark?: number[];
  tooltip: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" title={tooltip}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Delta value={delta} bad={bad} neutral={neutral} />
        {spark && spark.length ? <span className="hidden md:block"><Sparkline values={spark} stroke="#4f46e5" /></span> : null}
      </div>
    </div>
  );
}

function num(block: Block | undefined, key: string): number | null {
  const value = block?.[key];
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

export function TripAnalyticsKpiGrid({ current, prior }: { current?: Block; prior?: Block }) {
  const spark = Array.isArray(current?.sparkline) ? current.sparkline as number[] : [];
  const completed = num(current, 'completed');
  const rate = num(current, 'cancellationRate');
  const gross = num(current, 'grossFares');
  const avg = num(current, 'avgFare');
  const median = num(current, 'medianFare');
  const perKm = num(current, 'farePerKm');
  const distanceN = num(current, 'distanceTrips');
  const durationN = num(current, 'durationTrips');
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card label="Trips completed" value={completed == null ? '—' : completed.toLocaleString()} delta={kpiDelta(completed, num(prior, 'completed'))} spark={spark} tooltip="Completed trips in this period. In-progress trips are counted in the total but not in this card." />
      <Card label="Cancellation rate" value={rate == null ? '—' : `${(rate * 100).toFixed(1)}%`} hint="Rider, driver, and unknown are in the chart below. Delivery jobs are not in this rate." delta={kpiDelta(rate, num(prior, 'cancellationRate'))} bad tooltip="Cancelled ÷ (completed + cancelled), rideshare only. A higher rate is worse." />
      <Card label="Gross fares" value={gross == null ? '—' : formatJMD(gross, 0)} hint="Platform-reported" delta={kpiDelta(gross, num(prior, 'grossFares'))} spark={spark} tooltip="Sum of completed trip amounts reported by the platform. This is not profit." />
      <Card label="Avg fare" value={avg == null ? '—' : formatJMD(avg, 2)} hint={median == null ? undefined : `Median ${formatJMD(median, 2)}`} delta={kpiDelta(avg, num(prior, 'avgFare'))} tooltip="Gross fares ÷ completed trips. The median is shown because a few large fares pull the average up." />
      <Card label="Fare per km" value={perKm == null ? '—' : formatJMD(perKm, 2)} hint={distanceN == null ? undefined : `${distanceN.toLocaleString()} trips with distance`} delta={kpiDelta(perKm, num(prior, 'farePerKm'))} tooltip="Completed amount ÷ kilometres, only where distance is above zero." />
      <Card label="Avg distance" value={num(current, 'avgDistance') == null ? '—' : `${Number(num(current, 'avgDistance')).toFixed(1)} km`} hint={distanceN == null ? undefined : `${distanceN.toLocaleString()} trips`} delta={kpiDelta(num(current, 'avgDistance'), num(prior, 'avgDistance'))} neutral tooltip="Average kilometres on completed trips that have a distance. Zeros are left out." />
      <Card label="Avg duration" value={num(current, 'avgDuration') == null ? '—' : `${Math.round(Number(num(current, 'avgDuration')))} min`} hint={durationN == null ? undefined : `${durationN.toLocaleString()} trips`} delta={kpiDelta(num(current, 'avgDuration'), num(prior, 'avgDuration'))} neutral tooltip="Average minutes on completed trips that have a duration. Zeros are left out." />
      <Card label="Cash share" value={num(current, 'cashShare') == null ? '—' : `${(Number(num(current, 'cashShare')) * 100).toFixed(0)}%`} hint={num(current, 'cashCollected') == null ? undefined : `${formatJMD(Number(num(current, 'cashCollected')), 0)} collected`} delta={kpiDelta(num(current, 'cashShare'), num(prior, 'cashShare'))} tooltip="Completed trips paid in cash ÷ completed trips. Cash uses the payment method, not the sign stored on the import." />
    </div>
  );
}
