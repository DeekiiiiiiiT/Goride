/**
 * F-26: one upsert path for fuel_flag_disposition (step 5 + Fuel Integrity).
 */
import { getServiceClient } from "./service_client.ts";

const MIN_NOTE_LEN = 10;

export const FUEL_FLAG_CODES_WITH_NOTE = new Set([
  "possible_fill_not_scanned",
  "awaiting_card_statement",
  "economy_drift",
]);

export type FuelFlagDispositionInput = {
  orgId: string;
  entryId: string;
  flagCode: string;
  action: "accepted" | "corrected" | "escalated";
  note?: string | null;
  periodId?: string | null;
  actorId: string;
  severity?: string;
};

export function validateFuelFlagDispositionInput(input: FuelFlagDispositionInput):
  | { ok: true }
  | { ok: false; error: string; status: number } {
  if (!input.entryId || !input.flagCode) {
    return { ok: false, error: "entryId and flagCode required", status: 400 };
  }
  if (input.action !== "accepted" && input.action !== "corrected" && input.action !== "escalated") {
    return { ok: false, error: "invalid action", status: 400 };
  }
  const note = String(input.note || "").trim();
  // New F-08/F-09/F-13 flags need a 10-character note (Part E). Every other critical
  // flag keeps today's 8-character rule, so the existing screens keep working.
  if (
    input.action === "accepted"
    && FUEL_FLAG_CODES_WITH_NOTE.has(input.flagCode)
    && note.length < MIN_NOTE_LEN
  ) {
    return { ok: false, error: "note_required", status: 422 };
  }
  if (input.action === "accepted" && input.severity === "critical" && note.length < 8) {
    return { ok: false, error: "note_required", status: 422 };
  }
  return { ok: true };
}

export async function upsertFuelFlagDisposition(input: FuelFlagDispositionInput) {
  const check = validateFuelFlagDispositionInput(input);
  if (!check.ok) return { ok: false as const, error: check.error, status: check.status };

  const note = String(input.note || "").trim();
  const now = new Date().toISOString();
  const sb = getServiceClient();
  const row = {
    org_id: input.orgId,
    entry_id: input.entryId,
    flag_code: input.flagCode,
    action: input.action,
    note: note || null,
    period_id: input.periodId || null,
    actor_id: input.actorId,
    at: now,
  };
  const { data, error } = await sb
    .from("fuel_flag_disposition")
    .upsert(row, { onConflict: "org_id,entry_id,flag_code" })
    .select("*")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message, status: 500 };
  return {
    ok: true as const,
    disposition: {
      entryId: input.entryId,
      flagCode: input.flagCode,
      action: input.action,
      note: note || null,
      actorId: input.actorId,
      at: now,
      periodId: input.periodId || null,
      id: data?.id,
    },
  };
}