/**
 * Optimistic-concurrency persist for driver_financial_periods (A-6).
 */
import { getServiceClientWithSchema } from "./service_client.ts";
import { appendPeriodRevisionIfNeeded } from "./period_revision.ts";

function sb() {
  return getServiceClientWithSchema("ledger");
}

export type PersistPeriodResult = {
  id: string;
  projectionVersion: number;
};

/** Update with projection_version guard; insert when row missing. Retries on conflict. */
export async function persistPeriodRowWithVersion(
  driverId: string,
  periodAnchor: string,
  body: Record<string, unknown>,
  maxRetries = 3,
): Promise<PersistPeriodResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: existing, error: loadErr } = await sb()
      .from("driver_financial_periods")
      .select("id, projection_version, settlement_paid, settlement_amount, payout_net")
      .eq("driver_id", driverId)
      .eq("period_anchor", periodAnchor)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);

    if (existing?.id) {
      const expected = Number(existing.projection_version) || 0;
      const nextVersion = expected + 1;
      const { data: updated, error: updErr } = await sb()
        .from("driver_financial_periods")
        .update({ ...body, projection_version: nextVersion })
        .eq("id", existing.id)
        .eq("projection_version", expected)
        .select("id")
        .maybeSingle();
      if (updErr) throw new Error(updErr.message);
      if (updated?.id) {
        await appendPeriodRevisionIfNeeded(driverId, periodAnchor, nextVersion, body, existing);
        return { id: String(updated.id), projectionVersion: nextVersion };
      }
      continue;
    }

    const { data: inserted, error: insErr } = await sb()
      .from("driver_financial_periods")
      .insert({ ...body, driver_id: driverId, period_anchor: periodAnchor, projection_version: 1 })
      .select("id")
      .single();
    if (!insErr && inserted?.id) {
      return { id: String(inserted.id), projectionVersion: 1 };
    }
    if (insErr?.code === "23505") continue;
    if (insErr) throw new Error(insErr.message);
  }
  throw new Error(`projection_version conflict for ${driverId} ${periodAnchor}`);
}

/** Cash-sync partial update with version guard. */
export async function updatePeriodCashWithVersion(
  driverId: string,
  periodAnchor: string,
  body: Record<string, unknown>,
  maxRetries = 3,
): Promise<PersistPeriodResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: existing, error: loadErr } = await sb()
      .from("driver_financial_periods")
      .select("id, projection_version, settlement_paid, settlement_amount, payout_net")
      .eq("driver_id", driverId)
      .eq("period_anchor", periodAnchor)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!existing?.id) throw new Error("period row missing for cash sync");

    const expected = Number(existing.projection_version) || 0;
    const nextVersion = expected + 1;
    const { data: updated, error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({ ...body, projection_version: nextVersion })
      .eq("id", existing.id)
      .eq("projection_version", expected)
      .select("id")
      .maybeSingle();
    if (updErr) throw new Error(updErr.message);
    if (updated?.id) {
      await appendPeriodRevisionIfNeeded(driverId, periodAnchor, nextVersion, body, existing);
      return { id: String(updated.id), projectionVersion: nextVersion };
    }
  }
  throw new Error(`cash sync version conflict for ${driverId} ${periodAnchor}`);
}
