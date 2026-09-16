/**
 * N-18: fill-level usage category for Phase 4 server_entries authority.
 * Values align with fuel_week_category_loader.bucketForUsage.
 */
export type FuelUsageCategory = 'ride' | 'company' | 'deadhead' | 'personal';

const KNOWN: FuelUsageCategory[] = ['ride', 'company', 'deadhead', 'personal'];

/** Normalize raw / heuristic into a loader-compatible tag. */
export function normalizeFuelUsageCategory(
  raw: string | null | undefined,
): FuelUsageCategory | undefined {
  const u = String(raw || '').trim().toLowerCase();
  if (!u) return undefined;
  if (u.includes('company')) return 'company';
  if (u.includes('deadhead')) return 'deadhead';
  if (u.includes('personal')) return 'personal';
  if (u.includes('ride') || u === 'rideshare') return 'ride';
  if ((KNOWN as string[]).includes(u)) return u as FuelUsageCategory;
  return undefined;
}

/**
 * Prefer explicit tag; else infer from payment source so capture paths
 * (manual / JAA / driver) write something the server loader can read.
 */
export function resolveFuelUsageCategory(entry: {
  usageCategory?: string | null;
  paymentSource?: string | null;
}): FuelUsageCategory | undefined {
  const explicit = normalizeFuelUsageCategory(entry.usageCategory);
  if (explicit) return explicit;
  const pay = String(entry.paymentSource || '');
  if (pay === 'Personal') return 'personal';
  if (pay === 'Petty_Cash') return 'company';
  if (pay === 'Gas_Card' || pay === 'RideShare_Cash') return 'ride';
  return undefined;
}
