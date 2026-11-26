/**
 * The car's build as plain words ("11.2016 – 08.2020"), shared by the upload, the Add route and the auto-sort core.
 *
 * It lives on its own so the core does not import the saved-page route (the route imports the core through the
 * sort run, and a runtime import back would be a cycle).
 */

export type BuildCar = {
  production_start_year?: number | null;
  production_start_month?: number | null;
  production_end_year?: number | null;
  production_end_month?: number | null;
};

export function buildText(car: BuildCar): string {
  const p2 = (n: number | null | undefined) => (n == null ? "" : String(n).padStart(2, "0"));
  if (!car.production_start_year) return "";
  const start = `${car.production_start_month ? `${p2(car.production_start_month)}.` : ""}${car.production_start_year}`;
  const end = car.production_end_year
    ? `${car.production_end_month ? `${p2(car.production_end_month)}.` : ""}${car.production_end_year}`
    : "now";
  return `${start} – ${end}`;
}

/** The car row (a Record) as plain words, for the evidence the core writes. */
export function savedPageBuildText(car: Record<string, unknown>): string {
  return buildText(car as BuildCar);
}
