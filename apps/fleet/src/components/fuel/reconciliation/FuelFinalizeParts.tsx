/**
 * Step 5 → "Finalize fuel" (fuel audit Part J screens 10, 11).
 * Look = the Stitch export (roam_fleet_finalize_fuel_blocked_by_checks / _refused_nothing_locked);
 * content = fuelFinalizeModel.
 */
import React from 'react';
import { AlertTriangle, ArrowRight, CircleAlert, RotateCcw, ShieldAlert } from 'lucide-react';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { PART_TITLE, type FinalizePartId, type StillOpenRow } from '../../../utils/fuelFinalizeModel';

export function FuelFinalizeStillOpen({
  rows,
  onGo,
}: {
  rows: StillOpenRow[];
  onGo: (part: FinalizePartId) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="space-y-3" data-testid="recon-fuel-still-open">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[17px] font-semibold text-[#191c1e]">Still open</h3>
          <p className="text-[13px] text-[#47464c]">Fix or review these before this week&apos;s fuel can lock.</p>
        </div>
        <span className="rounded-full bg-[#ffdad6]/60 px-3 py-1 text-[12px] font-semibold text-[#ba1a1a]">
          {rows.length} to fix
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex flex-col justify-between gap-4 rounded-2xl bg-[#f2f4f6] p-5 sm:flex-row sm:items-center"
            data-testid="recon-fuel-still-open-row"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  r.tone === 'red' ? 'bg-[#ffdad6] text-[#ba1a1a]' : 'bg-[#fff4d6] text-[#8a5300]'
                }`}
              >
                {r.tone === 'red' ? <CircleAlert className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-[15px] font-semibold leading-5 text-[#191c1e]">{r.title}</p>
                {r.plate || r.detail ? (
                  <p className="flex flex-wrap items-center gap-2 text-[13px] text-[#47464c]">
                    {r.plate ? (
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[12px] font-semibold tracking-wider text-[#191c1e]">
                        {r.plate}
                      </span>
                    ) : null}
                    {r.detail ? <span>{r.detail}</span> : null}
                  </p>
                ) : null}
              </div>
            </div>
            {r.part ? (
              <button
                type="button"
                onClick={() => onGo(r.part as FinalizePartId)}
                className="flex h-10 shrink-0 items-center gap-2 self-start rounded-xl bg-white px-4 text-[14px] font-semibold text-[#191c1e] shadow-sm hover:bg-[#f7f9fb] sm:self-auto"
              >
                Go to {PART_TITLE[r.part]} <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FuelSealRefusedBox({
  title,
  driverLines,
  totals,
  canRetry,
  retrying,
  onTryAgain,
}: {
  title: string;
  /** One line per driver whose statement couldn't be written (F-05). */
  driverLines: string[];
  totals: { fuelBought: number; driverPays: number; companyKeeps: number };
  canRetry: boolean;
  retrying: boolean;
  onTryAgain: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="recon-fuel-refused">
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#fff1f0] p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#ba1a1a] shadow-sm">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[18px] font-semibold leading-6 text-[#ba1a1a]">{title}</p>
            <p className="text-[15px] leading-6 text-[#47464c]">
              Nothing was locked and nothing was charged. The week is still open, so you can try again.
            </p>
            {driverLines.length ? (
              <ul className="space-y-0.5 pt-1 text-[14px] text-[#191c1e]" data-testid="recon-fuel-refused-drivers">
                {driverLines.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          disabled={!canRetry || retrying}
          onClick={onTryAgain}
          className="flex h-11 shrink-0 items-center gap-2 self-start rounded-xl bg-[#030213] px-5 text-[14px] font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Try again
        </button>
      </div>
      <p className="flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-[#f2f4f6] px-5 py-4 text-[14px] text-[#47464c]">
        <span>
          Fuel bought <strong className="tabular-nums text-[#191c1e]">{formatFuelMoney(totals.fuelBought)}</strong>
        </span>
        <span>
          Driver pays <strong className="tabular-nums text-[#0051d5]">{formatFuelMoney(totals.driverPays)}</strong>
        </span>
        <span>
          Company keeps <strong className="tabular-nums text-[#079669]">{formatFuelMoney(totals.companyKeeps)}</strong>
        </span>
      </p>
    </div>
  );
}
