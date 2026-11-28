/**
 * What still stops "Make active" in the schedule drawer, in plain words (rebuild step 4, MER-01 / MER-05 / MER-07).
 * Empty string = ready. Kept pure so it is tested without a screen.
 */
export type BlockerInput = {
  componentId: string;
  scope: "global" | "platform" | "engine_family" | "variant";
  carVersionId: string;
  platformId: string;
  engineFamilyId: string;
  /** The car lookup ran and the car has no model family / no engine on file. */
  carHasNoModel: boolean;
  carHasNoEngine: boolean;
  intervalKm: string;
  intervalMonths: string;
  sourceType: "maker_manual" | "part_maker" | "roam_policy";
  familyForManual: string;
  manualCount: number;
  manualId: string;
  evidencePage: string;
  oneFigure: boolean;
  severeKm: string;
  severeMonths: string;
  evidenceUrl: string;
};

export const SEVERE_MISSING = "Fill in the harder-driving numbers, or tick 'The manual gives one figure'.";

export function scheduleBlocker(i: BlockerInput): string {
  if (!i.componentId) return "Pick a part.";
  if (i.scope === "variant" && !i.carVersionId) return "Pick the car version.";
  if (i.scope === "platform" && !i.platformId) {
    return i.carVersionId && i.carHasNoModel
      ? "This car has no model family yet, so pick One car version instead."
      : "Pick the model.";
  }
  if (i.scope === "engine_family" && !i.engineFamilyId) {
    return i.carVersionId && i.carHasNoEngine
      ? "Roam doesn't know this car's engine yet, so pick One model instead."
      : "Pick a car with this engine.";
  }
  if (i.intervalKm === "" && i.intervalMonths === "") return "Fill in the km or the months.";
  if (i.sourceType === "maker_manual") {
    if (i.scope === "global") return "A car maker number is for one model. Pick One model.";
    if (!i.familyForManual) return "Pick the model first.";
    if (!i.manualCount) return "Needs a manual and a page.";
    if (!i.manualId) return "Pick the manual this number is in.";
    if (!i.evidencePage) return "Needs a manual and a page.";
    if (!i.oneFigure && i.severeKm === "" && i.severeMonths === "") return SEVERE_MISSING;
  }
  if (i.sourceType === "part_maker" && !i.evidenceUrl.trim()) return "Add the link to the page you used.";
  return "";
}
