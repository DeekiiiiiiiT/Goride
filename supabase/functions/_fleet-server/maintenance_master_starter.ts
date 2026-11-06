/** Sixteen global Roam policy part schedules (audit §2 screens). */
export type RoamPolicyStarterRow = {
  task_code: string;
  task_name: string;
  interval_km: number;
  interval_months: number;
  /** Matched against maintenance_service_categories.name (case-insensitive contains). */
  category_hint: string;
};

export const ROAM_POLICY_STARTER_SET: RoamPolicyStarterRow[] = [
  { task_code: "roam-engine-oil", task_name: "Engine oil", interval_km: 5000, interval_months: 3, category_hint: "engine oil" },
  { task_code: "roam-lights-check", task_name: "Lights check", interval_km: 5000, interval_months: 3, category_hint: "light" },
  { task_code: "roam-air-filter", task_name: "Air filter", interval_km: 10000, interval_months: 6, category_hint: "air filter" },
  { task_code: "roam-cabin-filter", task_name: "Cabin A/C filter", interval_km: 10000, interval_months: 6, category_hint: "cabin" },
  { task_code: "roam-fluids-top-up", task_name: "Fluids (washer/coolant top-up)", interval_km: 10000, interval_months: 6, category_hint: "fluid" },
  { task_code: "roam-rotate-tyres", task_name: "Rotate tyres", interval_km: 10000, interval_months: 6, category_hint: "rotate" },
  { task_code: "roam-tyre-pressure", task_name: "Tyre pressure check", interval_km: 10000, interval_months: 6, category_hint: "pressure" },
  { task_code: "roam-brakes-check", task_name: "Brakes check", interval_km: 10000, interval_months: 6, category_hint: "brake" },
  { task_code: "roam-wipers", task_name: "Wipers", interval_km: 10000, interval_months: 6, category_hint: "wiper" },
  { task_code: "roam-brake-fluid", task_name: "Brake fluid", interval_km: 40000, interval_months: 24, category_hint: "brake fluid" },
  { task_code: "roam-tyre-change", task_name: "Tyre change", interval_km: 40000, interval_months: 36, category_hint: "tyre change" },
  { task_code: "roam-drive-belt", task_name: "Drive belt", interval_km: 40000, interval_months: 24, category_hint: "belt" },
  { task_code: "roam-suspension-check", task_name: "Suspension check", interval_km: 40000, interval_months: 24, category_hint: "suspension" },
  { task_code: "roam-transmission-service", task_name: "Transmission service", interval_km: 40000, interval_months: 24, category_hint: "transmission" },
  { task_code: "roam-spark-plugs", task_name: "Spark plugs", interval_km: 100000, interval_months: 60, category_hint: "spark" },
  { task_code: "roam-coolant-flush", task_name: "Coolant flush", interval_km: 100000, interval_months: 60, category_hint: "coolant flush" },
];

export function matchCategoryId(
  categories: Array<{ id: string; name: string; code: string }>,
  hint: string,
): string | null {
  const h = hint.trim().toLowerCase();
  const exact = categories.find((c) => c.name.toLowerCase() === h || c.code.toLowerCase() === h.replace(/\s+/g, "-"));
  if (exact) return exact.id;
  const contains = categories.filter((c) => c.name.toLowerCase().includes(h));
  if (contains.length === 1) return contains[0].id;
  if (h.includes("brake fluid")) {
    const bf = categories.find((c) => c.name.toLowerCase().includes("brake") && c.name.toLowerCase().includes("fluid"));
    if (bf) return bf.id;
  }
  return contains[0]?.id ?? null;
}
