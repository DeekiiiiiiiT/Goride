/**
 * Driver Settlements → the driver's week → "Fuel" card (fuel audit Part J screens 13, 14).
 * Replaces the single "Fuel deduction" row: one line per car × kind of driving, never edited;
 * a reopen keeps the old line, struck through, above the new one.
 */
import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Fuel, History, Info, XCircle } from 'lucide-react';
import { api } from '../../services/api';
import { formatFuelMoney } from '../../utils/formatFuelMoney';
import {
  matchLine,
  purposeLabel,
  reopenedLine,
  reversedChip,
  type DriverWeekFuelResponse,
} from '../../utils/driverFuelLinesModel';

const money = (n: number) => formatFuelMoney(n, 2);
const kmText = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;
const pctText = (n: number) => `${Math.round(n * 100) / 100}%`;

export function DriverWeekFuelCard({
  driverId,
  weekStart,
  fallbackDeduction,
  onViewWeek,
  load = api.getDriverWeekFuelLines.bind(api),
}: {
  driverId: string;
  weekStart: string;
  /** The period's saved fuel deduction — shown for an old-way week with no statement. */
  fallbackDeduction?: number;
  onViewWeek?: (weekStart: string) => void;
  load?: (driverId: string, weekStart: string) => Promise<DriverWeekFuelResponse>;
}) {
  const [data, setData] = useState<DriverWeekFuelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    load(driverId, weekStart)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load the fuel lines'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, weekStart]);

  const hasReversed = Boolean(data?.lines.some((l) => l.status === 'reversed'));
  const match = data ? matchLine(data) : null;
  const reopened = data ? reopenedLine(data) : null;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="driver-week-fuel">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Fuel className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-[16px] font-semibold text-slate-900">Fuel</h3>
      </div>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800" role="alert">
          The fuel lines didn&apos;t load: {error}
        </p>
      ) : !data ? (
        <p className="text-[13px] text-slate-500">Loading fuel lines…</p>
      ) : data.state === 'old_way' ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3" data-testid="driver-week-fuel-old-way">
          <div>
            <p className="text-[14px] font-medium text-slate-800">Fuel deduction</p>
            <p className="text-[12px] text-slate-500">Locked before fuel lines existed</p>
          </div>
          <span className="text-[15px] font-semibold tabular-nums text-slate-900">
            {money(data.oldWayDeduction ?? fallbackDeduction ?? 0)}
          </span>
        </div>
      ) : (
        <>
          {data.state === 'open' ? (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-[14px] text-slate-700" data-testid="driver-week-fuel-open">
              <Info className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> Fuel charge appears when the week locks
            </p>
          ) : null}
          {data.lines.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <div className="hidden bg-slate-100 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[64px_minmax(0,1fr)_68px_76px_56px_88px] sm:items-center sm:gap-2">
                <span>Car</span>
                <span>Kind of driving</span>
                <span className="text-right">Km</span>
                <span className="text-right">Cost per km</span>
                <span className="text-right">Driver %</span>
                <span className="text-right">Driver pays</span>
              </div>
              {data.lines.map((l) => {
                const rev = l.status === 'reversed';
                const cell = rev ? 'text-slate-400 line-through' : 'text-slate-800';
                const plate = data.plates[l.vehicleId] || l.vehicleId;
                const chip = hasReversed ? (
                  rev ? (
                    <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 no-underline">
                      {reversedChip(l.reversedAt)}
                    </span>
                  ) : (
                    <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Current</span>
                  )
                ) : null;
                return (
                  <div
                    key={l.id}
                    className={`flex items-start justify-between gap-3 border-t border-slate-100 px-3 py-2.5 text-[13px] first:border-t-0 sm:first:border-t sm:grid sm:grid-cols-[64px_minmax(0,1fr)_68px_76px_56px_88px] sm:items-center sm:gap-2 ${rev ? 'bg-slate-50/60' : ''}`}
                    data-testid={`driver-week-fuel-line-${l.status}`}
                  >
                    <span className={`hidden whitespace-nowrap font-mono text-[12px] font-semibold sm:inline ${cell}`}>{plate}</span>
                    <span className="min-w-0">
                      <span className={`block ${cell}`}>
                        <span className="font-mono text-[12px] font-semibold sm:hidden">{plate} · </span>
                        {purposeLabel(l.purpose)}
                      </span>
                      <span className={`block text-[12px] text-slate-500 sm:hidden ${rev ? 'line-through' : ''}`}>
                        {l.km > 0 ? kmText(l.km) : '—'}
                        {l.costPerKm != null ? ` × ${money(l.costPerKm)}` : ''} · Driver {pctText(l.driverPct)}
                      </span>
                      <span className="sm:hidden">{chip}</span>
                    </span>
                    <span className={`hidden whitespace-nowrap text-right tabular-nums sm:block ${cell}`}>{l.km > 0 ? kmText(l.km) : '—'}</span>
                    <span className={`hidden whitespace-nowrap text-right tabular-nums sm:block ${cell}`}>
                      {l.costPerKm != null ? money(l.costPerKm) : '—'}
                    </span>
                    <span className={`hidden whitespace-nowrap text-right tabular-nums sm:block ${cell}`}>{pctText(l.driverPct)}</span>
                    <span className={`whitespace-nowrap text-right font-semibold tabular-nums ${rev ? cell : 'text-rose-700'}`}>
                      {money(l.driverPays)}
                    </span>
                    {chip ? <span className="hidden sm:col-span-5 sm:col-start-2 sm:block">{chip}</span> : null}
                  </div>
                );
              })}
              {data.state === 'lines' ? (
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-3">
                  <span className="text-[14px] font-bold text-slate-900">Fuel</span>
                  <span className="text-[14px] font-bold tabular-nums text-rose-700" data-testid="driver-week-fuel-total">
                    {money(data.currentTotal)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          {match ? (
            <p
              className={`flex items-start gap-2 text-[13px] ${match.ok ? 'text-emerald-700' : 'text-rose-700'}`}
              data-testid="driver-week-fuel-match"
            >
              {match.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              {match.text}
            </p>
          ) : null}
          {hasReversed ? (
            <p className="flex items-center gap-2 text-[12px] text-slate-500">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> Reopened lines are kept, never edited.
            </p>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {reopened ? (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600" data-testid="driver-week-fuel-reopened">
            <History className="h-3.5 w-3.5" aria-hidden /> {reopened}
          </p>
        ) : (
          <span />
        )}
        {onViewWeek ? (
          <button
            type="button"
            onClick={() => onViewWeek(weekStart)}
            className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
          >
            <CalendarDays className="h-4 w-4" aria-hidden /> View week
          </button>
        ) : null}
      </div>
    </section>
  );
}
