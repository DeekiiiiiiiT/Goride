/**
 * Enrichment for GET /parts/vehicle-context (trim, hub, org chip, notes).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { variantCodeLine, type VariantLabelRow } from "../../../packages/types/src/vehicleVariantLabel.ts";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";

const VARIANT_COLUMNS =
  "id, make, model, production_start_year, production_end_year, chassis_code, engine_code, engine_displacement_l, fuel_type, fuel_category, engine_type, drivetrain, transmission, body_type, trim_series, front_brake_type, rear_brake_type, brake_size_mm, bolt_pattern";

/** Columns loaded from part_repeat_alert when ledger notes are empty. */
export const PART_REPEAT_ALERT_NOTE_COLUMNS = "detail, created_at";

export type VehiclePartsCatalogRow = VariantLabelRow & {
  id?: string;
  make?: string | null;
  model?: string | null;
  production_start_year?: number | null;
};

function pickStr(v: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const x = v[k];
    if (typeof x === "string" && x.trim()) return x.trim();
  }
  return "";
}

export function vehicleLabelFromKv(vehicle: Record<string, unknown>): string {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

export function vehiclePlateFromKv(vehicle: Record<string, unknown>): string {
  return pickStr(vehicle, ["licensePlate", "license_plate", "plate"]);
}

/** Step-2 done line: Pre-Facelift · 1KR-FE · 2WD */
export function formatTrimStepLabel(row: VariantLabelRow | null | undefined): string {
  if (!row) return "";
  const parts = [
    row.trim_series != null ? String(row.trim_series).trim() : "",
    row.engine_code != null ? String(row.engine_code).trim() : "",
    row.drivetrain != null ? String(row.drivetrain).trim() : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/** FP6 filter engine line: 1NZ-FXE 1.5L */
export function formatEngineFilterLine(row: VariantLabelRow | null | undefined): string {
  if (!row) return "";
  const code = row.engine_code != null ? String(row.engine_code).trim() : "";
  const raw = row.engine_displacement_l;
  const size =
    raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0
      ? `${Number(raw).toFixed(1)}L`
      : "";
  return [code, size].filter(Boolean).join(" ");
}

function siblingSummary(row: VehiclePartsCatalogRow, siblings: VehiclePartsCatalogRow[]): string {
  const label = variantCodeLine(row);
  const chassis = row.chassis_code != null ? String(row.chassis_code).trim() : "";
  const engine = formatEngineFilterLine(row);
  const core = [engine, chassis ? `(${chassis})` : ""].filter(Boolean).join(" ");
  if (core) return core;
  return label || chassis || "—";
}

export function formatAlternateTrimsLine(
  linkedId: string,
  siblings: VehiclePartsCatalogRow[],
): string {
  const others = siblings.filter((row) => String(row.id ?? "") !== linkedId);
  if (!others.length) return "";
  const parts = others.map((row) => siblingSummary(row, siblings));
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function hubLabelFromVehicle(vehicle: Record<string, unknown>, orgName: string | null): string {
  const fromVehicle = pickStr(vehicle, [
    "depot",
    "depotName",
    "hub",
    "hubName",
    "location",
    "baseDepot",
    "assignedDepot",
    "fleetDepot",
  ]);
  if (fromVehicle) return fromVehicle;
  if (orgName?.trim()) return orgName.trim();
  return "Fleet hub";
}

export function formatLatestNoteLine(text: string, at: string | null): string {
  const body = text.trim();
  if (!body) return "";
  if (!at) return body;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return body;
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${body} (Logged ${datePart})`;
}

export async function loadVehiclePartsContextExtras(
  supabase: SupabaseClient,
  orgId: string,
  vehicleId: string,
  vehicle: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const label = vehicleLabelFromKv(vehicle);
  const plate = vehiclePlateFromKv(vehicle);
  const catalogId = (await resolveCatalogIdForKvVehicle(supabase, vehicle)) || "";

  let catalogRow: VehiclePartsCatalogRow | null = null;
  let siblings: VehiclePartsCatalogRow[] = [];
  if (catalogId) {
    const { data: row, error } = await supabase
      .from("vehicle_catalog")
      .select(VARIANT_COLUMNS)
      .eq("id", catalogId)
      .maybeSingle();
    if (error) throw error;
    catalogRow = (row as VehiclePartsCatalogRow) ?? null;
    const make = String(catalogRow?.make ?? vehicle.make ?? "").trim();
    const model = String(catalogRow?.model ?? vehicle.model ?? "").trim();
    const year = Number(vehicle.year ?? catalogRow?.production_start_year ?? 0);
    if (make && model && Number.isFinite(year) && year > 0) {
      const { data: sibRows, error: sibErr } = await supabase
        .from("vehicle_catalog")
        .select(VARIANT_COLUMNS)
        .ilike("make", make)
        .ilike("model", model)
        .lte("production_start_year", year)
        .or(`production_end_year.is.null,production_end_year.gte.${year}`)
        .limit(40);
      if (sibErr) throw sibErr;
      siblings = (sibRows as VehiclePartsCatalogRow[]) || [];
    }
  }

  const trim = formatTrimStepLabel(catalogRow);
  const chassis_code = catalogRow?.chassis_code != null ? String(catalogRow.chassis_code) : null;
  const frontBrake = catalogRow && "front_brake_type" in catalogRow
    ? String((catalogRow as { front_brake_type?: string | null }).front_brake_type ?? "").trim()
    : "";
  const rearBrake = catalogRow && "rear_brake_type" in catalogRow
    ? String((catalogRow as { rear_brake_type?: string | null }).rear_brake_type ?? "").trim()
    : "";
  const brakeSize = catalogRow && "brake_size_mm" in catalogRow
    ? (catalogRow as { brake_size_mm?: number | null }).brake_size_mm
    : null;
  const boltPattern = catalogRow && "bolt_pattern" in catalogRow
    ? String((catalogRow as { bolt_pattern?: string | null }).bolt_pattern ?? "").trim()
    : "";

  let orgShortCode: string | null = null;
  let orgName: string | null = null;
  if (orgId) {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("name, fleet_tag")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) throw orgErr;
    orgName = (org as { name?: string } | null)?.name ?? null;
    const tag = (org as { fleet_tag?: string } | null)?.fleet_tag;
    orgShortCode = tag?.trim() ? String(tag).trim().toUpperCase() : null;
  }

  const hub_label = hubLabelFromVehicle(vehicle, orgName);

  let latestNote: { text: string; at: string | null } | null = null;

  const { data: ledgerNotes, error: ledgerErr } = await supabase
    .from("maintenance_service_ledger")
    .select("notes, performed_at_date, created_at")
    .eq("organization_id", orgId)
    .eq("vehicle_id", vehicleId)
    .is("voided_at", null)
    .not("notes", "is", null)
    .order("performed_at_date", { ascending: false })
    .limit(3);
  if (ledgerErr) throw ledgerErr;
  for (const row of ledgerNotes || []) {
    const notes = String((row as { notes?: string }).notes ?? "").trim();
    if (notes) {
      latestNote = {
        text: notes,
        at: (row as { performed_at_date?: string }).performed_at_date
          ?? (row as { created_at?: string }).created_at
          ?? null,
      };
      break;
    }
  }

  if (!latestNote) {
    const { data: alert, error: alertErr } = await supabase
      .from("part_repeat_alert")
      .select(PART_REPEAT_ALERT_NOTE_COLUMNS)
      .eq("organization_id", orgId)
      .eq("vehicle_id", vehicleId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (alertErr) throw alertErr;
    if (alert) {
      const detail = String((alert as { detail?: string }).detail ?? "").trim();
      if (detail) {
        latestNote = {
          text: detail,
          at: (alert as { created_at?: string }).created_at ?? null,
        };
      }
    }
  }

  const alternateTrimsLine = catalogId ? formatAlternateTrimsLine(catalogId, siblings) : "";

  return {
    label,
    plate,
    trim,
    variant: trim,
    variant_count: siblings.length || (catalogRow ? 1 : 0),
    chassis_code,
    trim_series: catalogRow?.trim_series ?? null,
    engine_code: catalogRow?.engine_code ?? null,
    drivetrain: catalogRow?.drivetrain ?? null,
    engine_displacement_l: catalogRow?.engine_displacement_l ?? null,
    engineFilterLine: formatEngineFilterLine(catalogRow),
    hub_label,
    orgShortCode,
    latestNote,
    alternateTrimsLine,
    brake_front_type: frontBrake || null,
    brake_rear_type: rearBrake || null,
    brake_front_rotor_mm: brakeSize != null && Number.isFinite(Number(brakeSize)) ? String(brakeSize) : null,
    brake_rear_drum_mm: rearBrake && /drum/i.test(rearBrake) && brakeSize != null && Number.isFinite(Number(brakeSize))
      ? String(brakeSize)
      : null,
    hub_bolt_pattern: boltPattern || null,
  };
}
