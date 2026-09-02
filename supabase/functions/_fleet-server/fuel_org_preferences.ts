/**
 * Org-scoped general preferences with legacy preferences:general fallback.
 */
import type { Context } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { getOrgId, stampOrg } from "./org_scope.ts";

export const PREFS_GENERAL_KEY = "preferences:general";

export function orgPreferencesKey(orgId: string): string {
  return `preferences:org:${orgId}`;
}

/** Stable system actors for auto-close / UI service approval (must differ). */
export function fuelAutoCloseApproverId(): string {
  return (
    Deno.env.get("FUEL_AUTO_CLOSE_APPROVER_ID") ||
    "11111111-1111-4111-8111-111111111111"
  );
}

export function fuelAutoCloseFinalizerId(): string {
  return (
    Deno.env.get("FUEL_AUTO_CLOSE_FINALIZER_ID") ||
    "22222222-2222-4222-8222-222222222222"
  );
}

export type FuelAutoCloseDualApprovalMode = "skip" | "service_approve";
export type FuelDualApprovalUiMode = "human" | "service_only";

export function resolveAutoCloseDualApprovalMode(
  raw: unknown,
): FuelAutoCloseDualApprovalMode {
  return String(raw || "").toLowerCase() === "service_approve"
    ? "service_approve"
    : "skip";
}

export function resolveDualApprovalUiMode(raw: unknown): FuelDualApprovalUiMode {
  return String(raw || "").toLowerCase() === "service_only" ? "service_only" : "human";
}

export async function loadOrgPreferences(orgId: string | null | undefined): Promise<Record<string, unknown>> {
  if (orgId) {
    const orgPrefs = ((await kv.get(orgPreferencesKey(orgId))) || null) as Record<
      string,
      unknown
    > | null;
    if (orgPrefs && typeof orgPrefs === "object") {
      return { ...orgPrefs };
    }
  }
  const general = ((await kv.get(PREFS_GENERAL_KEY)) || {}) as Record<string, unknown>;
  return { ...general };
}

export async function loadPreferencesForRequest(c: Context): Promise<Record<string, unknown>> {
  return loadOrgPreferences(getOrgId(c));
}

export async function savePreferencesForRequest(
  c: Context,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const currency = "jmd";
  const timezone = "America/Jamaica";
  const preferences = {
    ...body,
    currency,
    timezone,
  };
  const orgId = getOrgId(c);
  if (orgId) {
    const stamped = stampOrg({ ...preferences, organizationId: orgId }, c);
    await kv.set(orgPreferencesKey(orgId), stamped);
    return stamped;
  }
  // Platform / no-org: keep writing legacy global key
  await kv.set(PREFS_GENERAL_KEY, preferences);
  return preferences;
}

/** Default matches client FUEL_SECOND_APPROVER_THRESHOLD (50k). Explicit 0 disables. */
export const DEFAULT_SECOND_APPROVER_THRESHOLD = 50_000;

export function secondApproverThresholdFromPrefs(prefs: Record<string, unknown>): number {
  if (!Object.prototype.hasOwnProperty.call(prefs, "fuelSecondApproverThreshold")) {
    return DEFAULT_SECOND_APPROVER_THRESHOLD;
  }
  const n = Number(prefs.fuelSecondApproverThreshold);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SECOND_APPROVER_THRESHOLD;
}
