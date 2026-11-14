/**
 * RF-05 (docs/roam-fuel-card-statement-audit.md): which fuel-card statement a fleet owes Week
 * Reconciliation, worked out one way for the wizard and the close check.
 *
 *   roam — the fleet holds a card on a Roam-managed JAA program: Roam uploads that statement.
 *   own  — the fleet holds a card on its own (self-serve) program, or a card with no Roam program:
 *          the fleet uploads its own statement.
 */
import { getServiceClient } from "./service_client.ts";
import * as kv from "./kv_store.tsx";

export type JaaProgramLike = { companyCode?: string | null; mode?: string | null; organizationId?: string | null };
export type FuelCardLike = { jaaCompanyCode?: string | null; status?: string | null };

function code(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Pure: the fleet's cards + all programs → which statements it owes. */
export function classifyFuelCardPrograms(
  orgId: string,
  cards: FuelCardLike[],
  programs: JaaProgramLike[],
): { roam: boolean; own: boolean } {
  const modeByCode = new Map<string, string>();
  for (const p of programs) {
    const c = code(p.companyCode);
    if (c) modeByCode.set(c, String(p.mode ?? ""));
  }
  let roam = false;
  let own = false;
  for (const card of cards) {
    if (String(card.status ?? "").toLowerCase() === "retired") continue;
    const mode = modeByCode.get(code(card.jaaCompanyCode));
    if (mode === "roam_managed") roam = true;
    else own = true;
  }
  // A self-serve program registered to this fleet means it uploads its own statement.
  if (programs.some((p) => p.mode === "self_serve" && String(p.organizationId ?? "") === orgId)) own = true;
  return { roam, own };
}

export async function fuelCardProgramsForOrg(orgId: string): Promise<{ roam: boolean; own: boolean }> {
  const { data: rows, error } = await getServiceClient()
    .from("fleet_fuel_cards")
    .select("payload_json")
    .eq("organization_id", orgId)
    .limit(5000);
  if (error) throw new Error(`fuel cards read failed: ${error.message}`);
  const cards = (rows ?? []).map((r) => ((r as { payload_json?: FuelCardLike }).payload_json ?? {}) as FuelCardLike);
  let programs: JaaProgramLike[] = [];
  try {
    programs = ((await kv.getByPrefix("jaa_program:")) || []) as JaaProgramLike[];
  } catch {
    programs = [];
  }
  return classifyFuelCardPrograms(orgId, cards, programs);
}

/** Every fleet that holds a card on a Roam-managed program (for registering Roam's statement). */
export async function fleetsWithRoamCards(): Promise<string[]> {
  let programs: JaaProgramLike[] = [];
  programs = ((await kv.getByPrefix("jaa_program:")) || []) as JaaProgramLike[];
  const roamCodes = new Set(programs.filter((p) => p.mode === "roam_managed").map((p) => code(p.companyCode)).filter(Boolean));
  if (roamCodes.size === 0) return [];
  const { data: rows, error } = await getServiceClient()
    .from("fleet_fuel_cards")
    .select("organization_id, payload_json")
    .limit(20000);
  if (error) throw new Error(`fuel cards read failed: ${error.message}`);
  const orgs = new Set<string>();
  for (const r of rows ?? []) {
    const row = r as { organization_id?: string | null; payload_json?: FuelCardLike };
    const card = row.payload_json ?? {};
    if (String(card.status ?? "").toLowerCase() === "retired") continue;
    if (row.organization_id && roamCodes.has(code(card.jaaCompanyCode))) orgs.add(String(row.organization_id));
  }
  return [...orgs].sort();
}
