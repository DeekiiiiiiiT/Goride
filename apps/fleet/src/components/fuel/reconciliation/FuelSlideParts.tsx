/**
 * Content for two fuel parts in the Stitch "Fuel step redesign" look:
 *  - Part 2 when no dispute is open (screen 2): calm empty state + Add adjustment.
 *  - Part 3 Fuel policy (screen 3): per car, "Company pays N% (Driver pays M%)" with a bar.
 */
import React from 'react';
import { BadgeCheck, Car, Info, Plus } from 'lucide-react';
import type { FuelRule } from '../../../types/fuel';
import { getCoverageMatrixRows } from '../../../utils/fuelCoverageSplit';
import type { FuelPolicyRow } from './FuelPolicyCheckStep';

/** Plain names for the policy rows (the matrix keeps its short table labels). */
const POLICY_LABEL: Record<string, string> = {
  rideShare: 'Rideshare trips',
  deadhead: 'Driving to the next pickup',
  companyUsage: 'Company errands',
  personal: 'Personal driving',
  commute: 'Driving to and from home',
};

export function FuelDisputesEmpty({
  periodLocked,
  onAddAdjustment,
}: {
  periodLocked: boolean;
  onAddAdjustment?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-[#f8f9ff] px-6 py-10 text-center" data-testid="recon-fuel-disputes-empty">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <BadgeCheck className="h-7 w-7 text-[#069669]" aria-hidden />
      </span>
      <p className="text-lg font-semibold text-[#0b1c30]">No driver disputes this week.</p>
      <p className="max-w-md text-[15px] text-[#47464c]">
        If a driver drove for personal use or a company errand, add it here so the fuel is split fairly.
      </p>
      {!periodLocked && onAddAdjustment ? (
        <button
          type="button"
          onClick={onAddAdjustment}
          className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add adjustment
        </button>
      ) : null}
    </div>
  );
}

type DistanceReport = {
  totalTripDistance?: number;
  deadheadDistance?: number;
  personalDistance?: number;
  companyMiscDistance?: number;
  metadata?: unknown;
};

/** Part 4 top (Stitch screen 4): km by kind of driving + who pays the fuel. Real report numbers only. */
export function FuelDistanceSummary({
  reports,
  totalSpend,
  company,
  driver,
}: {
  reports: DistanceReport[];
  totalSpend: number;
  company: number;
  driver: number;
}) {
  const sum = (pick: (r: DistanceReport) => number | undefined) =>
    reports.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
  const rideshare = sum((r) => r.totalTripDistance);
  const pickups = sum((r) => r.deadheadDistance);
  const personal = sum((r) => r.personalDistance);
  const errands = sum((r) => r.companyMiscDistance);
  const span = sum((r) => (r.metadata as { spanKm?: number } | undefined)?.spanKm);
  const explained = rideshare + pickups + personal + errands;
  const notExplained = span > 0 ? Math.max(0, span - explained) : 0;
  const total = span > 0 ? Math.max(span, explained) : explained;
  const tiles = [
    { key: 'rideshare', label: 'Rideshare trips', km: rideshare, dot: 'bg-[#0051d5]', tone: 'bg-[#eff4ff]' },
    { key: 'pickups', label: 'To pickups', km: pickups, dot: 'bg-[#b4c5ff]', tone: 'bg-[#eff4ff]' },
    ...(errands > 0 ? [{ key: 'errands', label: 'Company errands', km: errands, dot: 'bg-[#069669]', tone: 'bg-[#eff4ff]' }] : []),
    { key: 'personal', label: 'Personal', km: personal, dot: 'bg-[#c9c5cd]', tone: 'bg-[#eff4ff]' },
    { key: 'unexplained', label: 'Not explained', km: notExplained, dot: 'bg-[#f59e0b]', tone: notExplained > 0 ? 'bg-[#fffbeb]' : 'bg-[#eff4ff]' },
  ];
  const km = (n: number) => Math.round(n).toLocaleString('en-US');
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—');
  const money = (n: number) =>
    `J$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const share = (n: number) => (totalSpend > 0 ? `${((n / totalSpend) * 100).toFixed(1)}%` : '—');
  const balanced = Math.abs(company + driver - totalSpend) < 0.01;
  return (
    <div className="space-y-5" data-testid="recon-fuel-distance-summary">
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Kilometres this week</p>
          <p className="text-[15px] text-[#0b1c30]">Total: {km(total)} km</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.key} className={`rounded-2xl p-4 ${t.tone}`}>
              <p className="flex items-center gap-2 text-[13px] text-[#47464c]">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
                {t.label}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1c30]">
                {km(t.km)} <span className="text-sm font-normal text-[#47464c]">km</span>
              </p>
              <p className="text-[12px] text-[#47464c]">{pct(t.km)}</p>
            </div>
          ))}
        </div>
        {total > 0 ? (
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-[#e5eeff]" aria-hidden>
            {tiles.map((t) => (
              <div key={t.key} className={`h-full ${t.dot}`} style={{ width: `${(t.km / total) * 100}%` }} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl bg-[#eff4ff] p-4">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Who pays the fuel</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#47464c]">Company keeps</p>
              <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-[12px] font-semibold text-[#0b1c30]">{share(company)}</span>
            </div>
            <p className="mt-1 text-[28px] font-semibold tabular-nums text-[#0b1c30]">{money(company)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#47464c]">Driver pays</p>
              <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-[12px] font-semibold text-[#0051d5]">{share(driver)}</span>
            </div>
            <p className="mt-1 text-[28px] font-semibold tabular-nums text-[#0051d5]">{money(driver)}</p>
          </div>
        </div>
        <p className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-[15px] text-[#0b1c30]">
          <span>Total fuel bought: <span className="font-semibold">{money(totalSpend)}</span></span>
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${balanced ? 'bg-[#ecfdf5] text-[#069669]' : 'bg-[#fffbeb] text-[#b45309]'}`}>
            {balanced ? 'Adds up' : 'Check the leftover below'}
          </span>
        </p>
      </div>
    </div>
  );
}

function formatFrom(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FuelPolicyBars({ policyRows }: { policyRows: FuelPolicyRow[] }) {
  if (policyRows.length === 0) {
    return <p className="rounded-2xl bg-[#f8f9ff] px-4 py-6 text-center text-sm text-[#47464c]">No cars had fuel this week.</p>;
  }
  return (
    <div className="space-y-4" data-testid="recon-fuel-policy-bars">
      {policyRows.map(({ vehicle, scenario, fuelRule, effectiveFrom }) => {
        const rule = fuelRule as FuelRule | undefined;
        const rows = getCoverageMatrixRows(rule);
        const leftoverDriverPct =
          rule?.leftoverSplit?.mode === 'percentage' ? Number(rule.leftoverSplit.driverPercent) || 0 : null;
        const name = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
        return (
          <div key={vehicle.id} className="rounded-2xl bg-[#eff4ff] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-base font-semibold text-[#0b1c30]">
                <Car className="h-5 w-5" aria-hidden />
                {name ? `${name} · ` : ''}
                {vehicle.licensePlate || vehicle.id}
              </p>
              <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#0051d5]">
                {scenario?.name || 'No fuel policy'}
              </span>
            </div>
            <ul className="space-y-4 rounded-2xl bg-white p-5">
              {rows.map((r) => {
                const allowance = r.companyPct < 0;
                return (
                  <li key={r.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[15px]">
                      <span className="text-[#0b1c30]">{POLICY_LABEL[r.key] ?? r.label}</span>
                      <span>
                        <span className="font-semibold text-[#0b1c30]">
                          {allowance ? 'Weekly allowance' : `Company pays ${r.companyPct}%`}
                        </span>
                        {allowance ? null : <span className="ml-3 text-[#47464c]">(Driver pays {r.driverPct}%)</span>}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#dce9ff]" aria-hidden>
                      <div className="h-full rounded-full bg-[#030213]" style={{ width: `${allowance ? 0 : r.companyPct}%` }} />
                    </div>
                  </li>
                );
              })}
              <li>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[15px]">
                  <span className="text-[#0b1c30]">Leftover fuel</span>
                  <span>
                    <span className="font-semibold text-[#0b1c30]">
                      {leftoverDriverPct != null ? `Company pays ${100 - leftoverDriverPct}%` : 'Company pays 100%'}
                    </span>
                    <span className="ml-3 text-[#47464c]">(Driver pays {leftoverDriverPct ?? 0}%)</span>
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#dce9ff]" aria-hidden>
                  <div className="h-full rounded-full bg-[#030213]" style={{ width: `${leftoverDriverPct != null ? 100 - leftoverDriverPct : 100}%` }} />
                </div>
              </li>
            </ul>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-[#47464c]">
              <Info className="h-4 w-4 shrink-0 text-[#0051d5]" aria-hidden />
              This is set in Fuel policy.
              {effectiveFrom && effectiveFrom > '2000-01-03' ? ` It applies to every week from ${formatFrom(effectiveFrom)}.` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
