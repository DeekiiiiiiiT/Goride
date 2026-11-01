/** GET /parts/vehicle-context response shape (fleet-core). */

export type PartsVehicleContextSpecs = {
  trim_series?: string | null;
  engine_code?: string | null;
  engine_displacement_l?: number | null;
  drivetrain?: string | null;
  chassis_code?: string | null;
  engineFilterLine?: string | null;
  alternateTrimsLine?: string | null;
  brake_front_type?: string | null;
  brake_rear_type?: string | null;
  brake_front_rotor_mm?: string | number | null;
  brake_front_piston?: string | null;
  brake_rear_drum_mm?: string | number | null;
  brake_rear_cylinder_mm?: string | number | null;
  abs_channels?: string | null;
  handbrake_type?: string | null;
  hub_bolt_pattern?: string | null;
};

export type PartsVehicleContextResponse = {
  label?: string;
  plate?: string;
  version?: string | null;
  variantId?: string | null;
  specs?: PartsVehicleContextSpecs | null;
  orgShortCode?: string;
  hub_label?: string;
};

export function readPartsVehicleSpecs(ctx: Record<string, unknown> | null | undefined): PartsVehicleContextSpecs {
  const nested = ctx?.specs;
  if (nested && typeof nested === "object") return nested as PartsVehicleContextSpecs;
  return ctx as PartsVehicleContextSpecs;
}

/** Header chip: Pre-Facelift · 1KR-FE · 2WD */
export function formatPartsVersionTag(ctx: Record<string, unknown> | null | undefined): string {
  if (!ctx) return "None yet";
  const direct = String(ctx.version ?? ctx.versionTag ?? "").trim();
  if (direct) return direct;
  const specs = readPartsVehicleSpecs(ctx);
  const parts = [
    String(specs.trim_series ?? ctx.trim ?? ctx.variant ?? "").trim(),
    String(specs.engine_code ?? "").trim(),
    String(specs.drivetrain ?? "").trim(),
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  const legacy = String(ctx.trim ?? ctx.variant ?? ctx.subtitle ?? "").trim();
  return legacy || "None yet";
}
