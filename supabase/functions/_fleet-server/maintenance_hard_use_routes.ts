/**
 * Build step 16c (revised design, 28 Nov 2026): hard use is decided each night by the database
 * (public.mm_decide_hard_use: distance against the average-use baseline, plus the short-trip line).
 * The fleet no longer switches it on or off. It can only:
 *   - keep normal schedules for 90 days (with a reason),
 *   - keep shorter schedules for 90 days (with a reason),
 *   - hand the car back to the numbers ("auto").
 * Dominion holds the limits (public.mm_hard_use_policy); every change to them is logged by a trigger.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type HardUseMode = "auto" | "keep_normal" | "keep_hard";

export const HARD_USE_REASON_MIN = 10;

/** The words that stop a fleet override, or null. Both keeps need a reason of at least 10 characters. */
export function hardUseOverrideRefusal(mode: HardUseMode, reason: unknown): string | null {
  if (mode === "auto") return null;
  return String(reason ?? "").trim().length >= HARD_USE_REASON_MIN
    ? null
    : `Say why (at least ${HARD_USE_REASON_MIN} characters).`;
}

/**
 * Reads the PATCH body. The new body is `{ mode, reason }`. The Fleet build still live before step 16d sends
 * `{ severe_duty, reason }`: off becomes "keep normal" (it always needed a reason), on becomes "keep shorter".
 */
export function parseHardUseBody(body: unknown): { mode: HardUseMode; reason: string } | { error: string } {
  const b = (body ?? {}) as { mode?: unknown; severe_duty?: unknown; reason?: unknown };
  const reason = String(b.reason ?? "").trim();
  if (b.mode === "auto" || b.mode === "keep_normal" || b.mode === "keep_hard") {
    return { mode: b.mode, reason };
  }
  if (typeof b.severe_duty === "boolean") {
    return b.severe_duty
      ? { mode: "keep_hard", reason: reason || "Shorter schedules chosen in Fleet" }
      : { mode: "keep_normal", reason };
  }
  return { error: "mode must be auto, keep_normal or keep_hard" };
}

export type HardUsePolicy = {
  baseline_km_per_year: number;
  high_use_multiple: number;
  window_days: number;
  min_span_days: number;
  short_trip_km: number;
  short_trip_share: number;
  min_trips: number;
  clear_days: number;
  kept_normal_days: number;
  kept_hard_days: number;
};

function jamaicaDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { timeZone: "America/Jamaica", day: "numeric", month: "short", year: "numeric" });
}

/** The columns a fleet keep writes onto the car. */
export function hardUseKeepColumns(
  mode: "keep_normal" | "keep_hard",
  policy: Pick<HardUsePolicy, "kept_normal_days" | "kept_hard_days">,
  now: Date,
): Record<string, unknown> {
  const days = mode === "keep_normal" ? policy.kept_normal_days : policy.kept_hard_days;
  const until = new Date(now.getTime() + days * 86_400_000);
  const normal = mode === "keep_normal";
  return {
    severe_duty: !normal,
    severe_duty_source: normal ? "fleet_kept_normal" : "fleet_kept_hard",
    severe_duty_kept_normal_until: normal ? until.toISOString() : null,
    severe_duty_kept_hard_until: normal ? null : until.toISOString(),
    severe_duty_clear_since: null,
    severe_duty_why: `Kept on ${normal ? "normal" : "shorter"} schedules by the fleet until ${jamaicaDate(until)}.`,
  };
}

/** Limits Dominion may change, with their allowed range (the same checks as the table). */
const POLICY_FIELDS: Record<keyof HardUsePolicy, { min: number; max: number; int?: boolean; label: string }> = {
  baseline_km_per_year: { min: 1000, max: 200000, label: "Normal use (km a year)" },
  high_use_multiple: { min: 1, max: 10, label: "Hard use starts at (× normal)" },
  window_days: { min: 7, max: 120, int: true, label: "Measured over (days)" },
  min_span_days: { min: 1, max: 120, int: true, label: "Days of readings needed" },
  short_trip_km: { min: 1, max: 50, label: "Short trip (km)" },
  short_trip_share: { min: 0.05, max: 1, label: "Share of short trips" },
  min_trips: { min: 1, max: 1000, int: true, label: "Trips needed" },
  clear_days: { min: 1, max: 365, int: true, label: "Back to normal after (days)" },
  kept_normal_days: { min: 1, max: 365, int: true, label: "Fleet keeps normal for (days)" },
  kept_hard_days: { min: 1, max: 365, int: true, label: "Fleet keeps shorter for (days)" },
};

export function validateHardUsePolicyPatch(body: unknown): { patch: Partial<HardUsePolicy> } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Partial<HardUsePolicy> = {};
  for (const [key, rule] of Object.entries(POLICY_FIELDS) as [keyof HardUsePolicy, (typeof POLICY_FIELDS)[keyof HardUsePolicy]][]) {
    if (!(key in b) || b[key] === undefined || b[key] === null || b[key] === "") continue;
    const n = Number(b[key]);
    if (!Number.isFinite(n) || n < rule.min || n > rule.max || (rule.int && !Number.isInteger(n))) {
      return { error: `${rule.label}: enter ${rule.int ? "a whole number " : "a number "}from ${rule.min} to ${rule.max}.` };
    }
    patch[key] = n;
  }
  if (patch.min_span_days != null && patch.window_days != null && patch.min_span_days > patch.window_days) {
    return { error: "Days of readings needed can't be more than the days it is measured over." };
  }
  if (!Object.keys(patch).length) return { error: "Nothing to change." };
  return { patch };
}

const VEHICLE_HARD_USE_COLUMNS =
  "id, severe_duty, severe_duty_source, severe_duty_why, severe_duty_signs, severe_duty_checked_at, severe_duty_kept_normal_until, severe_duty_kept_hard_until";

export function hardUseView(row: Record<string, unknown> | null, policy: Partial<HardUsePolicy> | null) {
  return {
    hardUse: row?.severe_duty === true,
    source: String(row?.severe_duty_source ?? "auto"),
    why: (row?.severe_duty_why as string | null) ?? null,
    signs: (row?.severe_duty_signs as Record<string, unknown> | null) ?? null,
    checkedAt: (row?.severe_duty_checked_at as string | null) ?? null,
    keptNormalUntil: (row?.severe_duty_kept_normal_until as string | null) ?? null,
    keptHardUntil: (row?.severe_duty_kept_hard_until as string | null) ?? null,
    policy: policy
      ? {
        baselineKmPerYear: Number(policy.baseline_km_per_year),
        highUseMultiple: Number(policy.high_use_multiple),
        windowDays: Number(policy.window_days),
        keptNormalDays: Number(policy.kept_normal_days),
        keptHardDays: Number(policy.kept_hard_days),
      }
      : null,
  };
}

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

type Deps = {
  supabase: AnyClient;
  // repos/baseRepo.ts builds its client from a different supabase-js import, so its type can't be named here.
  // deno-lint-ignore no-explicit-any
  fleetDb: () => any;
  getOrgId: (c: Context) => string | null | undefined;
  governanceOn: () => Promise<boolean>;
  actorId: (c: Context) => string | null;
  insertAudit: (row: {
    organizationId: string;
    entityType: string;
    entityId: string;
    actorId?: string | null;
    reason?: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }) => Promise<void>;
};

async function loadPolicy(supabase: AnyClient): Promise<HardUsePolicy | null> {
  const { data, error } = await supabase.from("mm_hard_use_policy").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return (data as HardUsePolicy | null) ?? null;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** GET /vehicles/:vehicleId/maintenance/hard-use */
export async function handleGetVehicleHardUse(c: Context, d: Deps): Promise<Response> {
  const orgId = d.getOrgId(c);
  if (!orgId) return c.json({ error: "Organization required" }, 400);
  try {
    const { data, error } = await d.fleetDb()
      .from("fleet_vehicles")
      .select(VEHICLE_HARD_USE_COLUMNS)
      .eq("organization_id", orgId)
      .eq("id", c.req.param("vehicleId"))
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "Vehicle not found" }, 404);
    return c.json(hardUseView(data as Record<string, unknown>, await loadPolicy(d.supabase)));
  } catch (e: unknown) {
    return c.json({ error: errMsg(e) }, 500);
  }
}

/** PATCH /vehicles/:vehicleId/maintenance/severe-duty — the fleet's override (or back to the numbers). */
export async function handlePatchVehicleHardUse(c: Context, d: Deps): Promise<Response> {
  const orgId = d.getOrgId(c);
  if (!orgId) return c.json({ error: "Organization required" }, 400);
  const vehicleId = c.req.param("vehicleId");
  const parsed = parseHardUseBody(await c.req.json().catch(() => ({})));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const refusal = hardUseOverrideRefusal(parsed.mode, parsed.reason);
  if (refusal) return c.json({ error: refusal, code: "REASON_REQUIRED" }, 400);
  try {
    const { data: before, error: bErr } = await d.fleetDb()
      .from("fleet_vehicles")
      .select(VEHICLE_HARD_USE_COLUMNS)
      .eq("organization_id", orgId)
      .eq("id", vehicleId)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!before) return c.json({ error: "Vehicle not found" }, 404);
    const policy = await loadPolicy(d.supabase);
    if (!policy) throw new Error("Hard use rule is not set up");

    if (parsed.mode === "auto") {
      const { error } = await d.fleetDb()
        .from("fleet_vehicles")
        .update({
          severe_duty_source: "auto",
          severe_duty_kept_normal_until: null,
          severe_duty_kept_hard_until: null,
        })
        .eq("organization_id", orgId)
        .eq("id", vehicleId);
      if (error) throw error;
      // The numbers decide again straight away (this company only); it recomputes any car that changed.
      const { error: rpcErr } = await d.supabase.rpc("mm_decide_hard_use", { p_org: orgId });
      if (rpcErr) throw rpcErr;
    } else {
      const { error } = await d.fleetDb()
        .from("fleet_vehicles")
        .update(hardUseKeepColumns(parsed.mode, policy, new Date()))
        .eq("organization_id", orgId)
        .eq("id", vehicleId);
      if (error) throw error;
      if ((before as { severe_duty?: boolean }).severe_duty !== (parsed.mode === "keep_hard") && (await d.governanceOn())) {
        const { error: rpcErr } = await d.supabase.rpc("recompute_component_schedules_for_car", {
          p_org: orgId,
          p_vehicle_id: vehicleId,
        });
        if (rpcErr) throw rpcErr;
      }
    }

    const { data: after, error: aErr } = await d.fleetDb()
      .from("fleet_vehicles")
      .select(VEHICLE_HARD_USE_COLUMNS)
      .eq("organization_id", orgId)
      .eq("id", vehicleId)
      .maybeSingle();
    if (aErr) throw aErr;

    // Who, when and why, every time.
    await d.insertAudit({
      organizationId: orgId,
      entityType: "fleet.vehicles.severe_duty",
      entityId: vehicleId,
      actorId: d.actorId(c),
      reason: parsed.reason || (parsed.mode === "auto" ? "Back to the numbers" : null),
      before: {
        severe_duty: (before as { severe_duty?: boolean }).severe_duty === true,
        source: (before as { severe_duty_source?: string }).severe_duty_source ?? "auto",
      },
      after: {
        severe_duty: (after as { severe_duty?: boolean } | null)?.severe_duty === true,
        source: (after as { severe_duty_source?: string } | null)?.severe_duty_source ?? "auto",
        mode: parsed.mode,
      },
    });
    return c.json(hardUseView(after as Record<string, unknown> | null, policy));
  } catch (e: unknown) {
    return c.json({ error: errMsg(e) }, 500);
  }
}

/** GET /admin/maintenance/hard-use-policy — the limits, plus the last 10 changes. */
export async function handleGetHardUsePolicy(c: Context, d: Deps): Promise<Response> {
  try {
    const policy = await loadPolicy(d.supabase);
    const { data: log, error } = await d.supabase
      .from("mm_hard_use_policy_log")
      .select("changed_at, changed_by, before_json, after_json")
      .order("changed_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    // Who changed it, by name (same lookup as the History tab).
    const ids = [...new Set((log ?? []).map((l) => (l as { changed_by?: string | null }).changed_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await d.supabase.auth.admin.listUsers({ perPage: 200 });
      for (const u of users?.users ?? []) {
        if (!ids.includes(u.id)) continue;
        const meta = u.user_metadata as Record<string, unknown> | undefined;
        names.set(u.id, String(meta?.full_name ?? meta?.name ?? u.email ?? u.id));
      }
    }
    const rows = (log ?? []).map((l) => {
      const by = (l as { changed_by?: string | null }).changed_by ?? null;
      return { ...l, changed_by_label: by ? names.get(by) ?? "Staff" : "Roam setup" };
    });
    return c.json({ policy, log: rows });
  } catch (e: unknown) {
    return c.json({ error: errMsg(e) }, 500);
  }
}

/** PUT /admin/maintenance/hard-use-policy — owner only (catalog.govern). */
export async function handlePutHardUsePolicy(c: Context, d: Deps): Promise<Response> {
  const v = validateHardUsePolicyPatch(await c.req.json().catch(() => ({})));
  if ("error" in v) return c.json({ error: v.error }, 400);
  try {
    const current = await loadPolicy(d.supabase);
    if (!current) throw new Error("Hard use rule is not set up");
    const windowDays = v.patch.window_days ?? current.window_days;
    const spanDays = v.patch.min_span_days ?? current.min_span_days;
    if (spanDays > windowDays) {
      return c.json({ error: "Days of readings needed can't be more than the days it is measured over." }, 400);
    }
    const { data, error } = await d.supabase
      .from("mm_hard_use_policy")
      .update({ ...v.patch, updated_by: d.actorId(c) })
      .eq("id", true)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return c.json({ policy: data });
  } catch (e: unknown) {
    return c.json({ error: errMsg(e) }, 500);
  }
}

/** Health card rows (Dominion). Small table; counts are on screen. */
export async function hardUseHealthRows(supabase: AnyClient) {
  const base = () => supabase.schema("fleet").from("vehicles").select("*", { count: "exact", head: true });
  const [{ count: auto }, { count: keptNormal }, { count: keptHard }, { count: noData }] = await Promise.all([
    base().eq("severe_duty", true).eq("severe_duty_source", "auto"),
    base().eq("severe_duty_source", "fleet_kept_normal"),
    base().eq("severe_duty_source", "fleet_kept_hard"),
    base().or("severe_duty_checked_at.is.null,severe_duty_signs->>measured.eq.false"),
  ]);
  return [
    { key: "hard_use_auto", label: "Cars on hard use (automatic)", count: auto ?? 0, page: "maintenance-templates" },
    {
      key: "hard_use_kept",
      label: "Cars the fleet kept on normal or shorter schedules",
      count: (keptNormal ?? 0) + (keptHard ?? 0),
      detail: `Normal ${keptNormal ?? 0} · Shorter ${keptHard ?? 0}`,
      page: "maintenance-templates",
    },
    { key: "hard_use_no_data", label: "Cars with not enough distance data", count: noData ?? 0, page: "maintenance-templates" },
  ];
}
