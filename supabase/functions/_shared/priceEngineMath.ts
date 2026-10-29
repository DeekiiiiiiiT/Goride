export type EngineGrade = "e10_87" | "e10_90" | "diesel" | "ulsd" | "unknown";
export type FleetGradeSource = "vehicle" | "fill" | "statement" | "unknown";
export type PlugGradeSource = "vehicle_locked" | "user_changed" | "unknown";

export function mapFuelGrade(raw: string | null | undefined): EngineGrade | null {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return null;
  if (text.includes("ulsd")) return "ulsd";
  if (text.includes("diesel") || text.includes("ado")) return "diesel";
  if (/(^|[^0-9])9[013]([^0-9]|$)|e10.?90/.test(text)) return "e10_90";
  if (/87|e10/.test(text)) return "e10_87";
  return "unknown";
}

export function resolveFleetGrade(input: {
  catalog?: string | null;
  fill?: string | null;
  statement?: string | null;
}): { grade: EngineGrade; source: FleetGradeSource } {
  const catalog = mapFuelGrade(input.catalog);
  if (catalog && catalog !== "unknown") return { grade: catalog, source: "vehicle" };
  const fill = mapFuelGrade(input.fill);
  if (fill && fill !== "unknown") return { grade: fill, source: "fill" };
  const statement = mapFuelGrade(input.statement);
  if (statement && statement !== "unknown") return { grade: statement, source: "statement" };
  return { grade: "unknown", source: "unknown" };
}

export function resolvePlugGrade(locked: string | null | undefined, body: string | null | undefined): {
  grade: EngineGrade;
  source: PlugGradeSource;
} {
  const fromVehicle = mapFuelGrade(locked);
  const fromBody = mapFuelGrade(body);
  if (fromVehicle && fromVehicle !== "unknown") {
    if (fromBody && fromBody !== "unknown" && fromBody !== fromVehicle) {
      return { grade: fromBody, source: "user_changed" };
    }
    return { grade: fromVehicle, source: "vehicle_locked" };
  }
  if (fromBody && fromBody !== "unknown") return { grade: fromBody, source: "unknown" };
  return { grade: "unknown", source: "unknown" };
}

export function weightedMedian(rows: { price: number; weight: number }[]): number | null {
  const usable = rows.filter((row) => row.weight > 0 && Number.isFinite(row.price)).sort((a, b) => a.price - b.price);
  const total = usable.reduce((sum, row) => sum + row.weight, 0);
  if (!(total > 0)) return null;
  let cum = 0;
  for (const row of usable) {
    cum += row.weight;
    if (cum >= total / 2) return row.price;
  }
  return usable[usable.length - 1]?.price ?? null;
}

export function confidenceFor(input: { reports: number; fleetReports: number; spread: number | null }): "high" | "medium" | "low" {
  if (input.reports >= 3 && input.spread != null && input.spread <= 0.02) return "high";
  if (input.reports >= 2 || input.fleetReports >= 1) return "medium";
  return "low";
}

export function priceStatusFor(status: string | null | undefined): "checking" | "published" | "review" {
  if (status === "accepted" || status === "approved") return "published";
  if (status === "review" || status === "waiting_place" || status === "rejected") return "review";
  return "checking";
}
