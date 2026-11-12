/**
 * WRA-31: the calculator's alert pass. Raises and resolves recon.alerts per org from
 * recon.health and a few counts, then escalates unacknowledged alerts by SMS:
 * fleet managers at 24 h, the owner as well at 48 h.
 * Worker-only (scripts/recon-worker.ts via runReconWorkerTick).
 */
import { getServiceClient } from "./service_client.ts";
import { nextEscalation, openAlerts, type AlertCandidate } from "./recon_alert_rules.ts";
import { sendPlainSms } from "../_shared/smsCarrierSend.ts";
import { loadStaffAlertPhones } from "./team_staff_service.ts";

function sb() {
  return getServiceClient();
}
function recon() {
  return sb().schema("recon");
}

function ms(value: unknown): number | null {
  if (value == null) return null;
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : null;
}

async function orgIdsWithWeeks(): Promise<string[]> {
  const { data, error } = await recon().from("week_runs").select("organization_id").limit(20000);
  if (error) throw new Error(`orgs read failed: ${error.message}`);
  return [...new Set((data ?? []).map((r) => String((r as { organization_id: string }).organization_id)))].filter(Boolean);
}

async function shadowMismatchOpen(): Promise<boolean> {
  const { data } = await recon().from("worker_alerts")
    .select("kind").in("kind", ["shadow_ok", "shadow_mismatch"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { kind?: string } | null)?.kind === "shadow_mismatch";
}

/** Raise, refresh and resolve one org's alerts. Returns the open candidates. */
export async function syncOrgAlerts(orgId: string, nowMs = Date.now(), shadowMismatch = false): Promise<AlertCandidate[]> {
  const { data: health, error: hErr } = await recon().from("health")
    .select("calculator_paused, calculator_paused_since, pending_units, oldest_pending_age_seconds, open_runs_over_14_days, pending_approvals_over_24h")
    .eq("organization_id", orgId).maybeSingle();
  if (hErr) throw new Error(`health read failed: ${hErr.message}`);
  const h = (health ?? {}) as Record<string, unknown>;

  const { count: failedUnits, error: fErr } = await recon().from("projection_state")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "failed");
  if (fErr) throw new Error(`failed units read failed: ${fErr.message}`);

  const since = new Date(nowMs - 24 * 3_600_000).toISOString();
  const { data: failedCloses, error: cErr } = await recon().from("close_workflows")
    .select("week_key").eq("organization_id", orgId).eq("kind", "close").eq("state", "failed").gte("updated_at", since);
  if (cErr) throw new Error(`close workflows read failed: ${cErr.message}`);

  const { data: corrections } = await recon().from("unsigned_corrections")
    .select("drafts_over_24h").eq("organization_id", orgId).maybeSingle();

  const candidates = openAlerts({
    nowMs,
    calculatorPaused: Boolean(h.calculator_paused),
    pausedSinceMs: ms(h.calculator_paused_since),
    oldestPendingAgeSeconds: h.oldest_pending_age_seconds == null ? null : Number(h.oldest_pending_age_seconds),
    pendingUnits: Number(h.pending_units ?? 0),
    failedUnits: failedUnits ?? 0,
    enqueueFailedSinceMs: null,
    openRunsOver14Days: Number(h.open_runs_over_14_days ?? 0),
    closeFailedWeeks: [...new Set((failedCloses ?? []).map((r) => String((r as { week_key: string }).week_key).slice(0, 10)))],
    pendingApprovalsOver24h: Number(h.pending_approvals_over_24h ?? 0),
    unsignedCorrectionsOver24h: Number((corrections as { drafts_over_24h?: number } | null)?.drafts_over_24h ?? 0),
    unexplainedShadowMismatch: shadowMismatch,
  });

  const { data: openRows, error: oErr } = await recon().from("alerts")
    .select("id, dedupe_key").eq("organization_id", orgId).is("resolved_at", null);
  if (oErr) throw new Error(`alerts read failed: ${oErr.message}`);
  const openByKey = new Map((openRows ?? []).map((r) => [String(r.dedupe_key), String(r.id)]));
  const now = new Date(nowMs).toISOString();

  for (const alert of candidates) {
    const existing = openByKey.get(alert.dedupeKey);
    if (existing) {
      const { error } = await recon().from("alerts")
        .update({ title: alert.title, detail: alert.detail, last_seen_at: now }).eq("id", existing);
      if (error) throw new Error(`alert refresh failed: ${error.message}`);
      openByKey.delete(alert.dedupeKey);
    } else {
      const { error } = await recon().from("alerts").insert({
        organization_id: orgId,
        kind: alert.kind,
        dedupe_key: alert.dedupeKey,
        title: alert.title,
        detail: alert.detail,
        raised_at: now,
        last_seen_at: now,
      });
      if (error) throw new Error(`alert raise failed: ${error.message}`);
    }
  }
  // Anything still open but no longer true is resolved.
  for (const id of openByKey.values()) {
    const { error } = await recon().from("alerts").update({ resolved_at: now }).eq("id", id);
    if (error) throw new Error(`alert resolve failed: ${error.message}`);
  }
  return candidates;
}

async function phonesFor(orgId: string, userIds: string[]): Promise<string[]> {
  // sb() and team_staff_service import different supabase-js versions; same client at runtime.
  const map = await loadStaffAlertPhones(sb() as unknown as Parameters<typeof loadStaffAlertPhones>[0], orgId, userIds);
  return userIds.map((id) => map.get(id)).filter((p): p is string => Boolean(p));
}

async function managerIds(orgId: string): Promise<string[]> {
  const platform = sb().schema("platform");
  const { data: roles } = await platform.from("roles").select("id").eq("name", "fleet_manager");
  const roleIds = (roles ?? []).map((r) => String((r as { id: string }).id));
  if (!roleIds.length) return [];
  const { data } = await platform.from("user_roles")
    .select("user_id, status").eq("scope_type", "organization").eq("scope_id", orgId).in("role_id", roleIds);
  return (data ?? [])
    .filter((r) => String((r as { status?: string }).status || "active") === "active")
    .map((r) => String((r as { user_id: string }).user_id));
}

async function ownerId(orgId: string): Promise<string[]> {
  const { data } = await sb().from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
  const id = String((data as { owner_id?: string } | null)?.owner_id || "");
  return id ? [id] : [];
}

/** SMS step for one org's open, unacknowledged alerts. */
export async function escalateOrgAlerts(orgId: string, nowMs = Date.now()): Promise<number> {
  const { data: rows, error } = await recon().from("alerts")
    .select("id, title, raised_at, acknowledged_at, sms_manager_at, sms_owner_at")
    .eq("organization_id", orgId).is("resolved_at", null).is("acknowledged_at", null);
  if (error) throw new Error(`alerts read failed: ${error.message}`);
  let steps = 0;
  for (const row of rows ?? []) {
    const step = nextEscalation({
      nowMs,
      raisedAtMs: ms(row.raised_at) ?? nowMs,
      acknowledged: Boolean(row.acknowledged_at),
      smsManagerSent: Boolean(row.sms_manager_at),
      smsOwnerSent: Boolean(row.sms_owner_at),
    });
    if (!step) continue;
    const people = step === "manager" ? await managerIds(orgId) : await ownerId(orgId);
    const phones = await phonesFor(orgId, people);
    let sent = 0;
    const reasons = new Set<string>();
    for (const phone of phones) {
      const result = await sendPlainSms(phone, `Roam Fleet — Week Reconciliation: ${row.title}. Open the app to acknowledge.`);
      if (result.sent) sent += 1;
      else reasons.add(result.reason);
    }
    const status = phones.length === 0
      ? `${step}: no mobile number on file`
      : sent > 0
      ? `${step}: sent to ${sent}`
      : `${step}: not sent (${[...reasons].join(", ")})`;
    const patch = step === "manager"
      ? { sms_manager_at: new Date(nowMs).toISOString(), sms_status: status }
      : { sms_owner_at: new Date(nowMs).toISOString(), sms_status: status };
    const { error: upErr } = await recon().from("alerts").update(patch).eq("id", row.id);
    if (upErr) throw new Error(`alert escalation save failed: ${upErr.message}`);
    steps += 1;
  }
  return steps;
}

const ALERT_PASS_EVERY_MS = 10 * 60 * 1000;
let lastAlertPassAt = 0;

/** Throttled pass for every org: raise/resolve, then escalate. */
export async function runAlertPass(nowMs = Date.now()): Promise<{ orgs: number; open: number; escalations: number }> {
  if (nowMs - lastAlertPassAt < ALERT_PASS_EVERY_MS) return { orgs: 0, open: 0, escalations: 0 };
  lastAlertPassAt = nowMs;
  const shadow = await shadowMismatchOpen();
  let open = 0;
  let escalations = 0;
  const orgs = await orgIdsWithWeeks();
  for (const orgId of orgs) {
    try {
      open += (await syncOrgAlerts(orgId, nowMs, shadow)).length;
      escalations += await escalateOrgAlerts(orgId, nowMs);
    } catch (e) {
      console.warn("[recon] alert pass failed", orgId, e instanceof Error ? e.message : e);
    }
  }
  return { orgs: orgs.length, open, escalations };
}
