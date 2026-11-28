/**
 * Step 16d: the words Fleet shows for a car's hard use. Roam decides it each night from distance against
 * the average-use baseline (and short trips); the fleet can only keep an answer for a while, with a reason.
 */
import type { HardUseMode, VehicleHardUse } from "../../../types/hardUse";

export const HARD_USE_REASON_MIN = 10;

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { timeZone: "America/Jamaica", day: "numeric", month: "short" });
}

/** "Hard use: on" / "Hard use: off" plus who decided. */
export function hardUseTitle(v: VehicleHardUse | null): string {
  if (!v) return "Hard use";
  if (v.source === "fleet_kept_normal") return "Normal schedules (kept by the fleet)";
  if (v.source === "fleet_kept_hard") return "Shorter schedules (kept by the fleet)";
  if (!v.checkedAt) return "Hard use: not checked yet";
  return v.hardUse ? "Hard use: on" : "Hard use: off";
}

/** The sentence under the title: Roam's reason, then when it was checked. */
export function hardUseLine(v: VehicleHardUse | null): string {
  if (!v) return "";
  if (!v.checkedAt) return "Roam checks every night from the car's odometer readings.";
  const checked = shortDate(v.checkedAt);
  const why = (v.why ?? "").trim();
  return [why, checked ? `Checked ${checked}` : null].filter(Boolean).join(" · ");
}

/** What still stops Save in the dialog, or null. */
export function hardUseSaveProblem(mode: HardUseMode | null, reason: string): string | null {
  if (!mode) return "Pick one.";
  if (mode === "auto") return null;
  return reason.trim().length >= HARD_USE_REASON_MIN ? null : `At least ${HARD_USE_REASON_MIN} characters`;
}

/** The choices the dialog offers for this car (never the one it already has). */
export function hardUseChoices(v: VehicleHardUse | null): HardUseMode[] {
  const source = v?.source ?? "auto";
  const out: HardUseMode[] = [];
  if (source !== "auto") out.push("auto");
  if (source !== "fleet_kept_normal") out.push("keep_normal");
  if (source !== "fleet_kept_hard") out.push("keep_hard");
  return out;
}
