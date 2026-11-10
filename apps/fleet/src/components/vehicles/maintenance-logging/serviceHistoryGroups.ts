/** One row per job comes from the server; the screen shows one group per date + car. */
export type ServiceHistoryRow = Record<string, unknown>;

export type ServiceHistoryGroup = {
  key: string;
  date: string;
  vehicleId: string;
  rows: ServiceHistoryRow[];
  jobNames: string[];
  total: number;
  currency: string;
  providers: string[];
  minKm: number | null;
  maxKm: number | null;
  invoiceCount: number;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Group job rows by service date + car, keeping the server's newest-first order. */
export function groupServiceHistoryRows(rows: ServiceHistoryRow[]): ServiceHistoryGroup[] {
  const groups: ServiceHistoryGroup[] = [];
  const byKey = new Map<string, ServiceHistoryGroup>();
  for (const row of rows) {
    const date = str(row.performed_at_date ?? row.performedAtDate).slice(0, 10);
    const vehicleId = str(row.vehicle_id ?? row.vehicleId);
    const key = `${date}|${vehicleId}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        date,
        vehicleId,
        rows: [],
        jobNames: [],
        total: 0,
        currency: str(row.currency) || "JMD",
        providers: [],
        minKm: null,
        maxKm: null,
        invoiceCount: 0,
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(row);
    const name = str(row.category_name ?? row.categoryName);
    if (name) g.jobNames.push(name);
    const amount = Number(row.line_total ?? row.lineTotal);
    if (Number.isFinite(amount)) g.total += amount;
    const provider = str(row.provider);
    if (provider && !g.providers.includes(provider)) g.providers.push(provider);
    const km = row.performed_at_miles != null ? Number(row.performed_at_miles) : NaN;
    if (Number.isFinite(km)) {
      g.minKm = g.minKm == null ? km : Math.min(g.minKm, km);
      g.maxKm = g.maxKm == null ? km : Math.max(g.maxKm, km);
    }
    if (str(row.invoice_url ?? row.invoiceUrl)) g.invoiceCount += 1;
  }
  for (const g of groups) g.total = Math.round(g.total * 100) / 100;
  return groups;
}

/** "Tire Change, Wheel Alignment + 1 more" */
export function groupJobsPreview(names: string[], max = 2): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} + ${names.length - max} more`;
}
