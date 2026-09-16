/**
 * Y-1 / Z-1: Default pricing save moves seeded remittance pause thresholds.
 * Never touches threshold_source = 'override'. Layer A′ vocabulary only.
 */

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; from: (t: string) => any };

function deliveryDb(sb: Sb) {
  return typeof sb.schema === "function" ? sb.schema("delivery") : sb;
}

/** Convert Default COD pause JMD → minor units, or null if the save should not reseed. */
export function pauseThresholdMinorFromDefaultJmd(jmd: unknown): number | null {
  const n = Number(jmd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function reseedSeededPauseThresholds(
  sb: Sb,
  pauseThresholdJmd: unknown,
): Promise<{ updated: boolean; thresholdMinor: number | null }> {
  const thresholdMinor = pauseThresholdMinorFromDefaultJmd(pauseThresholdJmd);
  if (thresholdMinor == null) return { updated: false, thresholdMinor: null };
  const db = deliveryDb(sb);
  const { error } = await db
    .from("courier_remittance_accounts")
    .update({
      pause_threshold_minor: thresholdMinor,
      updated_at: new Date().toISOString(),
    })
    .eq("threshold_source", "seeded");
  if (error) throw new Error(error.message || "reseed seeded thresholds failed");
  return { updated: true, thresholdMinor };
}
