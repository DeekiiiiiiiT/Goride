/**
 * Fuel checks part (fuel enterprise audit Part J screens 4, 5, 7): the week's card fills
 * waiting for their statement and the "possible fill not scanned" stretches, with the
 * close notes (who, when). Read only; the closes are written by POST /fuel/flags/disposition.
 */
import { getServiceClient } from "./service_client.ts";
import { loadFillsForStretchLookback } from "./fuel_week_closable_gate.ts";
import {
  buildFuelWeekChecks,
  type FuelWeekChecks,
  type WeekChecksDisposition,
} from "../../../packages/fuel-core/src/fuelWeekChecks.ts";

export type FuelWeekChecksBody = FuelWeekChecks & {
  /** actorId → display name for the closed rows ("Closed by {name}"). */
  actorNames: Record<string, string>;
};

function jamaicaTodayYmd(now = new Date()): string {
  // Fleet time is America/Jamaica (UTC−5, no daylight saving).
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** A person's name for a closed row: profile name, else the e-mail's first part. */
export function displayNameFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  if (!user) return null;
  const meta = user.user_metadata || {};
  for (const k of ["full_name", "name", "display_name"]) {
    const v = String(meta[k] || "").trim();
    if (v) return v;
  }
  const email = String(user.email || "").trim();
  return email ? email.split("@")[0] : null;
}

async function loadActorNames(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const sb = getServiceClient();
  await Promise.all(
    [...new Set(ids.filter(Boolean))].map(async (id) => {
      try {
        const { data } = await sb.auth.admin.getUserById(id);
        const name = displayNameFromAuthUser(data?.user as never);
        if (name) out[id] = name;
      } catch {
        /* name stays unknown; the screen says "Closed" without a name */
      }
    }),
  );
  return out;
}

export async function loadFuelWeekChecks(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<FuelWeekChecksBody> {
  const fills = await loadFillsForStretchLookback(orgId, weekStart, weekEnd);
  // The stretch ids are deterministic; read every possible_fill_not_scanned close for the org's
  // stretches that touch the window (period_id can be null on old rows — never filter by it).
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("fuel_flag_disposition")
    .select("entry_id, flag_code, note, actor_id, at")
    .eq("org_id", orgId)
    .eq("flag_code", "possible_fill_not_scanned")
    .like("entry_id", "stretch:%")
    .limit(2000);
  if (error) throw new Error(error.message);
  const dispositions: WeekChecksDisposition[] = (data || []).map((r: Record<string, unknown>) => ({
    entryId: String(r.entry_id || ""),
    flagCode: String(r.flag_code || ""),
    note: r.note == null ? null : String(r.note),
    actorId: r.actor_id == null ? null : String(r.actor_id),
    at: r.at == null ? null : String(r.at),
  }));
  const checks = buildFuelWeekChecks({
    fills,
    weekStart,
    weekEnd,
    todayYmd: jamaicaTodayYmd(),
    dispositions,
  });
  const actorIds = checks.possibleFills
    .map((p) => p.closed?.actorId || "")
    .filter(Boolean);
  return { ...checks, actorNames: await loadActorNames(actorIds) };
}
