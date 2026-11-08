/** Normalized part listing position/side (matches SQL part_norm_position + part_side_covers). */

export type NormPosition = "front" | "rear" | null;
export type NormSide = "left" | "right" | "both" | null;

export function normalizePartPositionSide(
  position: string | null | undefined,
  side?: string | null | undefined,
): { position: NormPosition; side: NormSide } {
  const posRaw = String(position ?? "").trim();
  const sideIn = String(side ?? "").trim().toLowerCase();
  let normSide: NormSide =
    sideIn === "left" || sideIn === "right" || sideIn === "both" ? sideIn : null;

  const upper = posRaw.toUpperCase();
  if (!upper) return { position: null, side: normSide };

  if (["FRONT", "F"].includes(upper)) return { position: "front", side: normSide };
  if (["REAR", "R"].includes(upper)) return { position: "rear", side: normSide };
  if (["FL", "FRONT LEFT", "FRONTLEFT"].includes(upper)) {
    return { position: "front", side: normSide ?? "left" };
  }
  if (["FR", "FRONT RIGHT", "FRONTRIGHT"].includes(upper)) {
    return { position: "front", side: normSide ?? "right" };
  }
  if (["RL", "REAR LEFT", "REARLEFT"].includes(upper)) {
    return { position: "rear", side: normSide ?? "left" };
  }
  if (["RR", "REAR RIGHT", "REARRIGHT"].includes(upper)) {
    return { position: "rear", side: normSide ?? "right" };
  }
  if (upper === "FRONT BOTH" || (upper.includes("FRONT") && upper.includes("BOTH"))) {
    return { position: "front", side: normSide ?? "both" };
  }
  if (upper === "BOTH") {
    return { position: null, side: null };
  }
  return { position: null, side: null };
}

/** Data row covers query filter (AM-14 / AM-11). */
export function partSideCovers(
  dataPosition: NormPosition,
  dataSide: NormSide,
  queryPosition: NormPosition,
  querySide: NormSide,
): boolean {
  const posOk = dataPosition == null || dataPosition === queryPosition;
  const sideOk =
    dataSide == null ||
    dataSide === querySide ||
    (dataSide === "both" && (querySide === "left" || querySide === "right"));
  return posOk && sideOk;
}

export function formatPartPositionSideLabel(
  position: string | null | undefined,
  side?: string | null | undefined,
  catalogueNumber?: number | null | undefined,
): string {
  const { position: p, side: s } = normalizePartPositionSide(position, side);
  const cat =
    catalogueNumber != null && Number.isFinite(Number(catalogueNumber))
      ? Math.trunc(Number(catalogueNumber))
      : null;
  if (!p && cat == null) return "Any position";
  const axle = p === "front" ? "Front" : p === "rear" ? "Rear" : null;
  let label = axle ?? "";
  if (s && s !== "both") {
    const sideLabel = s === "left" ? "left" : "right";
    label = label ? `${label} ${sideLabel}` : sideLabel;
  } else if (s === "both" && label) {
    label = `${label} both sides`;
  }
  if (cat != null && cat >= 1) {
    label = label ? `${label} · No.${cat}` : `No.${cat}`;
  }
  return label || "Any position";
}

export function formatAxleTag(position: string | null | undefined): string {
  const p = normalizePartPositionSide(position).position;
  if (p === "front") return "Front axle";
  if (p === "rear") return "Rear axle";
  return "Both axles";
}
