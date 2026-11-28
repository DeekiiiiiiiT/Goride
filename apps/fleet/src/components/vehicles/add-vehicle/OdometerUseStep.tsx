/**
 * Add a car — "Odometer reading" step (maintenance rebuild steps 8 + 12: MER-26, MER-25), ported from
 * docs/stitch/maintenance-rebuild-fleet/add_a_car_odometer_and_use with the Round 2 drops (no depot, VIN,
 * "baseline telemetry", cadence chips or auto-saving line).
 *
 * The odometer is required: it is saved as the car's first reading (source "manual"), so every due date has a
 * starting point. Hard use is not chosen here any more (step 16, 28 Nov 2026): Roam decides it each night from
 * how far the car drives, and the fleet can change it from the car's due items.
 */
import React from "react";
import { Check, History } from "lucide-react";

export type OdometerUseValue = {
  km: string;
  date: string;
  historyAfterSave: boolean;
};

/** "143,220" → 143220; empty → null; anything else → NaN. */
export function parseOdometerKm(text: string): number | null {
  const t = text.replace(/[,\s]/g, "").trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return Number.NaN;
  return Number(t);
}

/** What still stops Continue, in plain words; null when the step can be saved. */
export function odometerProblem(value: Pick<OdometerUseValue, "km" | "date">, today: string): string | null {
  const km = parseOdometerKm(value.km);
  if (km == null) return "Type the odometer reading.";
  if (Number.isNaN(km)) return "Type the reading as a whole number of km.";
  if (km <= 0) return "The reading must be more than 0 km.";
  if (km > 2_000_000) return "That reading is too high. Check the number.";
  if (!value.date) return "Pick the date of the reading.";
  if (value.date > today) return "The date can't be in the future.";
  return null;
}

export function OdometerUseStep({
  value,
  onChange,
  today,
  disabled,
}: {
  value: OdometerUseValue;
  onChange: (patch: Partial<OdometerUseValue>) => void;
  today: string;
  disabled?: boolean;
}) {
  const problem = odometerProblem(value, today);
  const showProblem = value.km.trim() !== "" && problem;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[20px] border border-black/[0.06] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-[#3a3a3d]">
        <div className="flex items-center gap-2">
          <h2 className="text-[19px] font-semibold text-[#0a0a0a] dark:text-[#fafafa]">Odometer now</h2>
          <span className="rounded-full bg-[#fff1f2] px-2.5 py-0.5 text-[12px] font-semibold text-[#d4183d]">Required</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#47464c] dark:text-[#a1a1aa]">Current reading (km)</span>
            <span className="flex h-14 items-center gap-2 rounded-xl bg-[#eff4ff] px-4 dark:bg-[#1c1c1e]">
              <input
                type="text"
                inputMode="numeric"
                className="w-full min-w-0 bg-transparent text-[20px] font-medium tabular-nums text-[#0a0a0a] outline-none placeholder:text-[#94a3b8] dark:text-[#fafafa]"
                placeholder="143,220"
                value={value.km}
                disabled={disabled}
                onChange={(e) => onChange({ km: e.target.value })}
                data-testid="odo-km"
                aria-label="Current odometer reading in km"
              />
              <span className="text-[13px] font-semibold text-[#47464c]">KM</span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#47464c] dark:text-[#a1a1aa]">Reading date</span>
            <input
              type="date"
              className="h-14 rounded-xl bg-[#eff4ff] px-4 text-[17px] text-[#0a0a0a] outline-none dark:bg-[#1c1c1e] dark:text-[#fafafa]"
              max={today}
              value={value.date}
              disabled={disabled}
              onChange={(e) => onChange({ date: e.target.value })}
              data-testid="odo-date"
            />
          </label>
        </div>
        <p className="mt-3 text-[14px] text-[#64748b] dark:text-[#a1a1aa]">Every due date starts from this.</p>
        {showProblem ? (
          <p className="mt-2 text-[14px] text-[#d4183d]" role="status" data-testid="odo-problem">
            {problem}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] border border-black/[0.06] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:flex-row sm:items-center sm:justify-between dark:border-[#3a3a3d]">
        <div>
          <h2 className="flex items-center gap-2 text-[19px] font-semibold text-[#0a0a0a] dark:text-[#fafafa]">
            <History className="h-5 w-5" aria-hidden />
            Service history (optional)
          </h2>
          <p className="mt-1 text-[15px] text-[#47464c] dark:text-[#a1a1aa]">Know when the oil or other parts were last done?</p>
          <p className="text-[13px] text-[#64748b] dark:text-[#a1a1aa]">You can do this later from Maintenance.</p>
        </div>
        <button
          type="button"
          aria-pressed={value.historyAfterSave}
          onClick={() => onChange({ historyAfterSave: !value.historyAfterSave })}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#cbd5e1] bg-white px-4 text-[15px] font-medium text-[#0a0a0a] hover:bg-[#f8fafc] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]"
          data-testid="history-after-save"
        >
          {value.historyAfterSave ? <Check className="h-4 w-4" aria-hidden /> : null}
          {value.historyAfterSave ? "Opens after saving" : "Fill in history now"}
        </button>
      </section>
    </div>
  );
}
