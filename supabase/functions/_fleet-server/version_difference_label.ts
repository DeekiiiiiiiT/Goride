/** Keep in sync with packages/vehicle-catalog-core/src/versionDifferenceLabel.ts */

export type VersionDifferenceInput = {
  drivetrain?: string | null;
  engine_code?: string | null;
  engine_type?: string | null;
  engine_displacement_l?: number | null;
  fuel_type?: string | null;
  fuel_category?: string | null;
  trim_series?: string | null;
  version_name?: string | null;
};

function formatDispLiters(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded.toFixed(1);
}

export function versionDifferenceLabel(v: VersionDifferenceInput): string {
  const bits: string[] = [];
  const d = (v.drivetrain ?? "").toLowerCase().replace(/_/g, " ");
  if (d.includes("4wd") || d.includes("awd")) bits.push("4WD");
  else if (d.includes("2wd") || d.includes("fwd")) bits.push("2WD");
  else if (d.trim()) bits.push(v.drivetrain!.replace(/_/g, " "));

  const ec = (v.engine_code ?? "").toUpperCase();
  const disp =
    v.engine_displacement_l != null && v.engine_displacement_l > 0
      ? formatDispLiters(v.engine_displacement_l)
      : null;
  const ft = (v.fuel_type ?? v.fuel_category ?? "").toLowerCase();
  const turbo =
    ec.includes("VET") ||
    ec.includes("TURBO") ||
    (v.engine_type ?? "").toLowerCase().includes("turbo");

  if (turbo) {
    bits.push(disp ? `${disp} turbo petrol` : "turbo petrol");
  } else if (disp && (ft.includes("petrol") || ft.includes("gas") || !ft)) {
    bits.push(`${disp} petrol`);
  } else if (disp && ft.includes("diesel")) {
    bits.push(`${disp} diesel`);
  } else if (disp) {
    bits.push(disp);
  } else if (ec.startsWith("1KR")) {
    bits.push("1.0 petrol");
  } else if (ec.startsWith("2NR")) {
    bits.push("1.5 petrol");
  } else if (ec) {
    bits.push(ec);
  } else if (v.trim_series?.trim()) {
    bits.push(v.trim_series.trim());
  } else if (v.version_name?.trim()) {
    bits.push(v.version_name.trim());
  }

  return bits.join(" · ");
}
