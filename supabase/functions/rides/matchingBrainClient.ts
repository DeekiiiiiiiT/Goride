/**
 * Matching Brain Client — Delegation Shim
 *
 * When RIDES_USE_MATCHING_BRAIN=1, delegates matching operations to
 * the dedicated matching Edge function instead of running locally.
 *
 * This enables zero-breakage rollout: rides can switch between legacy
 * and brain path with a single flag flip.
 */

export interface StartMatchingRequest {
  product_key: "rides";
  surface_key?: string;
  ride_request_id: string;
  request_id?: string;
  ride_snapshot: {
    pickup_lat: number;
    pickup_lng: number;
    vehicle_option: string;
    rider_user_id: string;
    driver_offer_timeout_seconds?: number;
  };
}

export interface ReconcileRequest {
  product_key: "rides";
  surface_key?: string;
  ride_request_id: string;
  request_id?: string;
}

export interface DeclineOfferRequest {
  product_key: "rides";
  offer_id: string;
  driver_user_id: string;
  request_id?: string;
}

export interface MatchingBrainResponse {
  ok: boolean;
  ride_request_id?: string;
  offer_id?: string;
  wave?: number;
  offers_created?: number;
  pending_offers?: number;
  status?: string;
  action_taken?: string;
  error?: string;
  message?: string;
}

function getMatchingBrainUrl(): string {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  return `${url}/functions/v1/matching`;
}

function getInternalSecret(): string {
  return Deno.env.get("MATCHING_INTERNAL_SECRET") ?? "";
}

function getServiceRoleKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

export function isMatchingBrainEnabled(): boolean {
  return Deno.env.get("RIDES_USE_MATCHING_BRAIN") === "1";
}

async function callMatchingBrain(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<MatchingBrainResponse> {
  const url = `${getMatchingBrainUrl()}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServiceRoleKey()}`,
        "X-Matching-Internal-Secret": getInternalSecret(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();

    if (!res.ok) {
      console.log(JSON.stringify({
        svc: "rides",
        ts: new Date().toISOString(),
        event: "matching_brain_error",
        path,
        status: res.status,
        data,
      }));
      return { ok: false, error: data.error ?? "brain_error", message: data.message };
    }

    return data as MatchingBrainResponse;
  } catch (e) {
    console.log(JSON.stringify({
      svc: "rides",
      ts: new Date().toISOString(),
      event: "matching_brain_call_failed",
      path,
      error: e instanceof Error ? e.message : String(e),
    }));
    return { ok: false, error: "brain_unavailable", message: String(e) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Delegate start-matching to the matching brain.
 */
export async function delegateStartMatching(
  req: StartMatchingRequest,
): Promise<MatchingBrainResponse> {
  return callMatchingBrain("/v1/internal/start-matching", req);
}

/**
 * Delegate reconcile to the matching brain.
 */
export async function delegateReconcile(
  req: ReconcileRequest,
): Promise<MatchingBrainResponse> {
  return callMatchingBrain("/v1/internal/reconcile", req);
}

/**
 * Delegate decline-offer to the matching brain.
 */
export async function delegateDeclineOffer(
  req: DeclineOfferRequest,
): Promise<MatchingBrainResponse> {
  return callMatchingBrain("/v1/internal/decline-offer", req);
}
