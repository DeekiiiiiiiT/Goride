/** Brakes system row in maintenance_service_categories (Phase 2). */
export const BRAKES_SYSTEM_AREA_ID = "b1000000-0000-4000-8000-000000000004";

export function isBrakesAreaId(areaId: string, areaName?: string): boolean {
  if (areaId === BRAKES_SYSTEM_AREA_ID) return true;
  if (/^brakes$/i.test(areaId)) return true;
  if (areaName && /^brakes$/i.test(areaName.trim())) return true;
  return false;
}

export function defaultAxleForBrakeSection(section: "front" | "rear" | "whole"): "front" | "rear" | "both" {
  if (section === "front") return "front";
  if (section === "rear") return "rear";
  return "both";
}

export function isBrakeOpCode(opCode?: string | null): boolean {
  return /^BRK-/i.test(String(opCode || "").trim());
}

type BrowseShape = {
  areas?: Array<{ id?: string; name?: string; parts?: Array<{ id: string; opCode?: string | null }> }>;
  systems?: Array<{ components?: Array<{ id: string; opCode?: string | null }> }>;
  common?: Array<{ id: string; opCode?: string | null }>;
};

/** True when the part is under Brakes or uses a BRK-* op code. */
export function isBrakeComponent(
  browse: BrowseShape | null | undefined,
  componentId: string,
  overlayAreaId?: string | null,
  overlayAreaName?: string,
): boolean {
  if (overlayAreaId && isBrakesAreaId(overlayAreaId, overlayAreaName)) return true;
  if (!browse || !componentId) return false;
  for (const area of browse.areas || []) {
    const hit = area.parts?.find((p) => p.id === componentId);
    if (hit && isBrakeOpCode(hit.opCode)) return true;
  }
  for (const system of browse.systems || []) {
    const hit = system.components?.find((c) => c.id === componentId);
    if (hit && isBrakeOpCode(hit.opCode)) return true;
  }
  const common = browse.common?.find((c) => c.id === componentId);
  return Boolean(common && isBrakeOpCode(common.opCode));
}
