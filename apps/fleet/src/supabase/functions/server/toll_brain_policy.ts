/**
 * Toll Brain policy loader for fleet make-server (Deno).
 * Dominion (toll.brain_policies) is source of truth for match dials.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

export interface TollBrainPolicyRow {
  id: string;
  personalUseDetectionEnabled: boolean;
  orphanProximityMinutes: number;
  cashAmountDeltaMax: number;
  cashReceiptProximityMinutes: number;
  approachMinutes: number;
  postTripMinutes: number;
  varianceThreshold: number;
  ambiguityMinScore: number;
  ambiguityMaxGap: number;
  maxSuggestions: number;
  sameDayPadDays: number;
}

const DEFAULTS: TollBrainPolicyRow = {
  id: "default",
  personalUseDetectionEnabled: true,
  orphanProximityMinutes: 180,
  cashAmountDeltaMax: 15,
  cashReceiptProximityMinutes: 90,
  approachMinutes: 45,
  postTripMinutes: 15,
  varianceThreshold: 0.05,
  ambiguityMinScore: 50,
  ambiguityMaxGap: 15,
  maxSuggestions: 5,
  sameDayPadDays: 1,
};

let cache: { policy: TollBrainPolicyRow; at: number } | null = null;
const TTL_MS = 60_000;

export function fleetUsesTollBrain(): boolean {
  return Deno.env.get("FLEET_USE_TOLL_BRAIN") !== "0";
}

export function tollBrainShadowCompare(): boolean {
  return Deno.env.get("TOLL_BRAIN_SHADOW_COMPARE") === "1" && !fleetUsesTollBrain();
}

export function peekTollBrainPolicyCache(): TollBrainPolicyRow | null {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.policy;
  return cache?.policy ?? null;
}

export function getTollBrainDialsOrDefaults(): TollBrainPolicyRow {
  return peekTollBrainPolicyCache() ?? { ...DEFAULTS };
}

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function loadTollBrainPolicy(): Promise<TollBrainPolicyRow> {
  if (!fleetUsesTollBrain() && !tollBrainShadowCompare()) return { ...DEFAULTS };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.policy;
  try {
    const db = svc();
    const { data, error } = await db
      .from("toll_brain_policies")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();
    if (error || !data) {
      console.warn("[TollBrain] policy load failed — defaults", error?.message);
      return { ...DEFAULTS };
    }
    const policy: TollBrainPolicyRow = {
      id: String(data.id),
      personalUseDetectionEnabled: data.personal_use_detection_enabled !== false,
      orphanProximityMinutes: Number(data.orphan_proximity_minutes ?? 180),
      cashAmountDeltaMax: Number(data.cash_amount_delta_max ?? 15),
      cashReceiptProximityMinutes: Number(data.cash_receipt_proximity_minutes ?? 90),
      approachMinutes: Number(data.approach_minutes ?? 45),
      postTripMinutes: Number(data.post_trip_minutes ?? 15),
      varianceThreshold: Number(data.variance_threshold ?? 0.05),
      ambiguityMinScore: Number(data.ambiguity_min_score ?? 50),
      ambiguityMaxGap: Number(data.ambiguity_max_gap ?? 15),
      maxSuggestions: Number(data.max_suggestions ?? 5),
      sameDayPadDays: Number(data.same_day_pad_days ?? 1),
    };
    cache = { policy, at: Date.now() };
    return policy;
  } catch (e) {
    console.warn("[TollBrain] policy exception", e);
    return { ...DEFAULTS };
  }
}

export function invalidateTollBrainPolicyCache() {
  cache = null;
}
