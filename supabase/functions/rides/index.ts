/**
 * Roam Rides — passenger booking + Uber-style dispatch (waves / timeouts).
 *
 * Enterprise roadmap:
 * - Surge v2: swap coarse grid cell for **H3** indexing + periodic recomputation.
 * - Fairness: decline-aware cooldowns + starvation avoidance beyond rotate-by-wave.
 * See docs/passenger-rides/RIDES_SPEC.md
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deniesPassengerSurface, jsonEdgeForbidden, ridesUserSurfaceRole, allowsPassengerSurface, allowsHaulerOrDriverSurface } from "../_shared/authEdge.ts";
import { buildFareQuote, gridCellKey } from "./fare/buildQuote.ts";
import { FareRuleNotFoundError } from "./fare/rules.ts";
import { rankDriversByDriveTime } from "./fare/distanceMatrix.ts";
import { haversineKm } from "./fare/routing.ts";
import { quoteTokenHash, verifyQuoteToken } from "./fare/quoteToken.ts";
import { registerAdminRoutes } from "./admin.ts";
import { assertRiderCanBook } from "./fare/riderAccount.ts";
import { getRidesAdminDb, resolveFareRulesDbForQuote } from "../_shared/ridesAdminDb.ts";
import { loadVehicleTypesFromDb } from "./fare/vehicleTypesDb.ts";
import {
  allowedBodySlugsForWave,
  loadServiceBodyTypeTiers,
} from "./fare/serviceMatching.ts";
import { isActiveBodyTypeSlug, resolveDriverBodyTypeSlug } from "./fare/driverBodyType.ts";
import {
  DEFAULT_DISPATCH_SETTINGS,
  driverLocationMaxAgeMs,
  getWaveRadiusKm,
  loadDispatchSettings,
  type DispatchSettings,
} from "./fare/dispatchSettings.ts";
import { isMatchingTimedOut } from "./fare/matchingHygiene.ts";
import {
  buildWaitTimeInfo,
  getWaitTimeGraceAnchor,
  shouldExposePickupWaitTime,
  shouldExposeRiderPin,
} from "./fare/waitTime.ts";
import {
  generatePin,
  verifyRidePin,
  isValidPinFormat,
  normalizeVerificationPin,
} from "./fare/pinVerification.ts";
import {
  getEligibleDriverUserIds,
  isDriverEligibleForDispatch,
} from "../_shared/driverModeFilter.ts";
import {
  aggregateDriverEarnings,
  getDriverActiveRideRequest,
  listDriverRideRequests,
  type DriverEarningsPeriod,
} from "../_shared/driverRideQueries.ts";
import {
  finalizeRideLedgerFields,
  persistRideLedgerLinesForTerminalState,
} from "../_shared/rideLedgerLines.ts";
import { syncRideToFleetKv } from "../_shared/rideToFleetTrip.ts";
import {
  applyRideTransition,
  driverTransitionsFor,
  maybeAutoEnRouteOnAccept,
  type ApplyTransitionDeps,
} from "./rideLifecycle.ts";
import { registerCashSettlementRoutes } from "./cashSettlement/registerCashSettlementRoutes.ts";
import { isCashSettlementEnabled, isCashSettlementV2Enabled, driverDebtDispatchThresholdMinor, isDriverDebtDispatchGuardEnabled } from "./cashSettlement/flags.ts";
import { getOpenDebtMinor } from "./cashSettlement/debtRepayment.ts";
import { isRiderArrearsBlocked } from "./cashSettlement/arrearsCheck.ts";
import { evaluateGeofenceTransitions, cleanupRideLiveState } from "./rideGeofence.ts";
import { getTotalTollsForRide } from "./fare/tollGeofence.ts";
import { loadAppPermissionPolicy, policyDto } from "../_shared/appPermissionPolicy.ts";
import type { AppPermissionSurface } from "../_shared/appPermissionCatalog.ts";
import { registerRideChatRoutes } from "./rideChat.ts";
import { autocompletePlaces, fetchPlaceDetails, isPlacesConfigured, reverseGeocodeCoordinates } from "./fare/places.ts";
import { registerContactsRoutes } from "./contacts.ts";
import { registerSavedPlacesRoutes } from "./savedPlaces.ts";
import { getRidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { registerPassengerInviteRoutes } from "./passengerInvites.ts";
import { registerPassengerAuthorizationRoutes, consumePassengerAuthorization } from "./passengerAuthorizations.ts";
import { registerPickupLocationRequestRoutes } from "./pickupLocationRequests.ts";
import { registerRoamConnectionRoutes } from "./roamConnectionRequests.ts";
import {
  registerBookingRequestRoutes,
  linkBookingRequestToRide,
  markBookingRequestConsumed,
  releaseBookingRequestAfterRideCancelled,
  syncBookingRequestAfterSystemRideCancel,
  isDigitalRidePayment,
} from "./bookingRequests.ts";
import { registerRoamPassengerTagRoutes } from "./roamPassengerTag.ts";
import { registerTripIntentRoutes } from "./tripIntents.ts";
import { registerBookForOthersActivityRoutes } from "./bookForOthersActivity.ts";
import { registerPassengerActivityHistoryRoutes } from "./passengerActivityHistory.ts";
import { registerPassengerActivityUpcomingRoutes } from "./passengerActivityUpcoming.ts";
import { loadHubActiveRideForUser } from "./rideHubQueries.ts";
import { enrichRideRoamModeFromBooking } from "./roamModeResolve.ts";
import { createRideFromTripIntent } from "./tripIntentFulfill.ts";
import {
  bookerVisibilityForRide,
  canShadowBookerAccessLive,
  sanitizeRideForShadowBooker,
} from "./tripIntentAccess.ts";
import { registerPassengerProfileRoutes } from "./passengerProfile.ts";
import { registerTripShareRoutes, maybeAutoShareWithTrustedContacts } from "./tripShare.ts";
import {
  canAccessRide,
  canCancelRide,
  canChatOnRide,
  getRideParticipantRole,
  ACTIVE_RIDE_STATUSES,
  isDelegatedBooking,
  isBookForOthersPersistedRide,
  PASSENGER_APP_ORIGIN,
  shouldExposePinToUser,
} from "./rideAccess.ts";
import { loadAssignedDriverSummary } from "./assignedDriverSummary.ts";
import {
  notifyPassengerOfRideEvent,
  notifyShadowBookerOfTripCompleted,
} from "./rideNotifications.ts";
import { registerScheduledRidesRoutes } from "./scheduledRides/scheduledRidesRoutes.ts";
import { registerHaulageRoutes } from "./haulage/haulageRoutes.ts";
import { attachHaulageManifestIfNeeded } from "./haulage/manifestJoin.ts";
import { filterDriversForHaulageJob } from "./haulage/dispatchConstraints.ts";
import {
  isMatchingBrainEnabled,
  delegateStartMatching,
  delegateReconcile,
  delegateDeclineOffer,
} from "./matchingBrainClient.ts";
import { latLngToH3 } from "../_shared/h3/geoIndex.ts";

// ---------------------------------------------------------------------------
// Wave 5: Env boot validation — fail-fast if critical secrets missing
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ROAM_RIDES_QUOTE_SECRET = Deno.env.get("ROAM_RIDES_QUOTE_SECRET");

{
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ROAM_RIDES_QUOTE_SECRET) missing.push("ROAM_RIDES_QUOTE_SECRET");
  if (missing.length > 0) {
    const msg = `[Rides] FATAL: Missing required env: ${missing.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}

/** Match Supabase path prefix: .../functions/v1/rides/<route> → /rides/<route> */
const app = new Hono().basePath("/rides");

const AVG_SPEED_KMH = 25;

type RideStatus =
  | "scheduled"
  | "matching"
  | "driver_assigned"
  | "driver_en_route_pickup"
  | "driver_arrived_pickup"
  | "on_trip"
  | "awaiting_cash_settlement"
  | "completed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Wave 5: CORS Allowlist (env-driven)
// ---------------------------------------------------------------------------
function buildCorsOriginFn(): (origin: string) => string | null {
  const rawEnv = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  const envMode = (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "").toLowerCase();
  const isDev = envMode === "development" || envMode === "local" || envMode === "";

  const allowed = rawEnv
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  // Dev fallback: allow all if no explicit list
  if (allowed.length === 0 && isDev) {
    return () => "*";
  }

  // Add known frontend URLs
  const viteUrl = Deno.env.get("VITE_APP_URL") ?? "";
  if (viteUrl) allowed.push(viteUrl.toLowerCase());
  if (SUPABASE_URL) allowed.push(SUPABASE_URL.toLowerCase());

  const allowSet = new Set(allowed);

  return (origin: string): string | null => {
    if (!origin) return null;
    const lower = origin.toLowerCase();
    if (allowSet.has(lower)) return origin;
    for (const a of allowSet) {
      if (lower.endsWith(`.${a.replace(/^https?:\/\//, "")}`)) return origin;
      if (lower === a) return origin;
    }
    return null;
  };
}

const corsOriginFn = buildCorsOriginFn();

app.use(
  "*",
  cors({
    origin: corsOriginFn,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "apikey",
      "x-client-info",
      "x-request-id",
    ],
  }),
);

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const DRIVER_LOCATIONS_SELECT_FULL = "user_id, lat, lng, updated_at, body_type_slug, dispatch_mode";
const DRIVER_LOCATIONS_SELECT_BASE = "user_id, lat, lng, updated_at";

async function queryFreshDriverLocations(
  db: ReturnType<typeof svc>,
  table: string,
  select: string,
  freshSince: string,
): Promise<{ rows: Record<string, unknown>[] | null; error: string | null }> {
  const { data, error } = await db.from(table).select(select)
    .gte("updated_at", freshSince)
    .eq("available_for_rides", true);
  if (error) return { rows: null, error: error.message };
  return { rows: (data ?? []) as Record<string, unknown>[], error: null };
}

/** Fresh online drivers for matching. Retries without body_type_slug when API schema cache lags migrations. */
async function loadAvailableDriverLocations(freshSince: string): Promise<Record<string, unknown>[]> {
  const selects = [DRIVER_LOCATIONS_SELECT_FULL, DRIVER_LOCATIONS_SELECT_BASE];
  const sources: Array<{ db: ReturnType<typeof svc>; table: string }> = [
    { db: svc(), table: "driver_locations" },
    { db: pubSvc(), table: "rides_driver_locations" },
  ];
  let lastError: string | null = null;

  for (const select of selects) {
    for (const { db, table } of sources) {
      const { rows, error } = await queryFreshDriverLocations(db, table, select, freshSince);
      if (error) {
        lastError = error;
        continue;
      }
      if (rows && rows.length > 0) return rows;
      if (rows && rows.length === 0 && select === DRIVER_LOCATIONS_SELECT_BASE) {
        return rows;
      }
    }
  }

  if (lastError) {
    logLine({ event: "load_driver_locs_failed", error: lastError, fresh_since: freshSince });
  }
  return [];
}

/** Reads ride_requests via rides schema, falling back to public.rides_ride_requests on hosted. */
async function loadRideRequestById(id: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("*").eq(
    "id",
    id,
  ).maybeSingle();
  let ride: Record<string, unknown> | null = (!nativeErr && native)
    ? (native as Record<string, unknown>)
    : null;

  if (!ride) {
    const { data: pub } = await pubSvc().from("rides_ride_requests").select("*").eq("id", id)
      .maybeSingle();
    ride = (pub as Record<string, unknown> | null) ?? null;
  }

  if (!ride) return null;

  if (!normalizeVerificationPin(ride.verification_pin)) {
    const { data: pinRow } = await svc().from("ride_requests").select(
      "verification_pin, pin_verified_at",
    ).eq("id", id).maybeSingle();
    if (pinRow) {
      ride = { ...ride, ...pinRow };
    }
  }

  ride = await enrichRideRoamModeFromBooking(ride, getRidesContactsDb, svc());

  ride = await attachHaulageManifestIfNeeded(pubSvc(), ride);

  return ride;
}

/** Hide verification PIN from driver clients; expose pending flag instead. */
function sanitizeRideForDriver(
  ride: Record<string, unknown> | null,
  pinRequiredForStart = false,
): Record<string, unknown> | null {
  if (!ride) return null;
  const pinPending = Boolean(
    ride.verification_pin && !ride.pin_verified_at && pinRequiredForStart,
  );
  const { verification_pin: _pin, ...rest } = ride;
  return { ...rest, pin_verification_pending: pinPending };
}

/** Never send raw verification_pin to rider; use rider_pin when geofence allows. */
function sanitizeRideForRider(ride: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!ride) return null;
  const { verification_pin: _pin, ...rest } = ride;
  return rest;
}

function isPinFeatureEnabled(settings: DispatchSettings): boolean {
  return settings.pin_verification_enabled || settings.pin_verification_required_for_start;
}

async function ensureRideVerificationPin(
  rideId: string,
  ride: Record<string, unknown>,
  settings: DispatchSettings,
): Promise<Record<string, unknown>> {
  if (!isPinFeatureEnabled(settings)) return ride;
  const terminal = ["completed", "cancelled"];
  if (terminal.includes(String(ride.status))) return ride;

  const existingPin = normalizeVerificationPin(ride.verification_pin);
  if (existingPin) return { ...ride, verification_pin: existingPin };

  const fresh = await loadRideRequestById(rideId);
  const freshPin = normalizeVerificationPin(fresh?.verification_pin);
  if (freshPin) {
    return { ...ride, verification_pin: freshPin };
  }

  const pin = generatePin();
  const patched = await patchRideRequest(rideId, {
    verification_pin: pin,
    updated_at: new Date().toISOString(),
  });
  if (!patched) {
    logLine({ event: "ensure_pin_patch_failed", ride_id: rideId });
    // Still return PIN to rider so they can share it with the driver.
    return { ...ride, verification_pin: pin };
  }

  const after = await loadRideRequestById(rideId);
  const savedPin = normalizeVerificationPin(after?.verification_pin) ?? pin;
  return { ...ride, verification_pin: savedPin };
}

async function loadRideRequestByIdempotencyKey(key: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("*").eq(
    "idempotency_key",
    key,
  ).maybeSingle();
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("*").eq(
    "idempotency_key",
    key,
  ).maybeSingle();
  return pub ?? null;
}

async function loadRideRequestsByIds(
  ids: string[],
  columns = "*",
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select(columns).in(
    "id",
    ids,
  );
  if (!nativeErr && native && native.length > 0) return native;

  const { data: pub } = await pubSvc().from("rides_ride_requests").select(columns).in("id", ids);
  return pub ?? [];
}

async function loadMatchingRideIds(): Promise<string[]> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("id").eq(
    "status",
    "matching",
  );
  if (!nativeErr && native) return native.map((row) => row.id as string);

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("id").eq("status", "matching");
  return (pub ?? []).map((row) => row.id as string);
}

/** Reads driver_offers via rides schema, falling back to public.rides_driver_offers on hosted. */
async function loadDriverOffersForRide(
  rideId: string,
  orderDesc = true,
): Promise<Record<string, unknown>[]> {
  let query = svc().from("driver_offers").select("*").eq("ride_request_id", rideId);
  if (orderDesc) query = query.order("created_at", { ascending: false });
  const { data: native, error: nativeErr } = await query;
  if (!nativeErr && native) return native;

  let pubQuery = pubSvc().from("rides_driver_offers").select("*").eq("ride_request_id", rideId);
  if (orderDesc) pubQuery = pubQuery.order("created_at", { ascending: false });
  const { data: pub } = await pubQuery;
  return pub ?? [];
}

async function loadDriverOfferById(offerId: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc().from("driver_offers").select("*").eq(
    "id",
    offerId,
  ).maybeSingle();
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_driver_offers").select("*").eq("id", offerId)
    .maybeSingle();
  return pub ?? null;
}

async function loadPendingDriverOffersForDriver(
  driverUserId: string,
  nowIso: string,
): Promise<Record<string, unknown>[]> {
  const { data: native, error: nativeErr } = await svc().from("driver_offers").select("*").eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending").gt("expires_at", nowIso);
  if (!nativeErr && native && native.length > 0) return native;

  const { data: pub } = await pubSvc().from("rides_driver_offers").select("*").eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending").gt("expires_at", nowIso);
  return pub ?? [];
}

function isMissingDbRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("function") && msg.includes("does not exist")
  );
}

/**
 * Patch a ride request. When `expectedFrom` is supplied the write is a
 * compare-and-swap: it only lands if the row is STILL at that status, closing
 * the check-then-act race that let two concurrent transitions both "win". A
 * CAS miss (0 rows) returns false so callers can surface a 409 conflict.
 */
async function patchRideRequest(
  id: string,
  patch: Record<string, unknown>,
  expectedFrom?: string,
): Promise<boolean> {
  const rpcArgs: Record<string, unknown> = { p_id: id, p_patch: patch };
  if (expectedFrom) rpcArgs.p_expected_status = expectedFrom;

  const { data: rpcData, error: rpcError } = await pubSvc().rpc("rides_patch_ride_request", rpcArgs);
  if (!rpcError && rpcData != null) return true;
  // RPC ran cleanly but matched no row while a CAS guard was in force ⇒ the
  // status already moved. This is a conflict, NOT a reason to fall back to an
  // unconditional direct UPDATE (which would clobber the concurrent winner).
  if (!rpcError && rpcData == null && expectedFrom) {
    logLine({ event: "patch_ride_cas_conflict", ride_id: id, expected_from: expectedFrom });
    return false;
  }

  let direct = svc().from("ride_requests").update(patch).eq("id", id);
  if (expectedFrom) direct = direct.eq("status", expectedFrom);
  const { data: directRow, error: directError } = await direct.select("id").maybeSingle();
  if (!directError && directRow) {
    if (rpcError) {
      logLine({
        event: "patch_ride_rpc_fallback",
        ride_id: id,
        rpc_error: rpcError.message,
      });
    }
    return true;
  }
  // With a CAS guard, a clean 0-row direct update is a conflict, not a failure.
  if (!directError && !directRow && expectedFrom) {
    logLine({ event: "patch_ride_cas_conflict", ride_id: id, expected_from: expectedFrom });
    return false;
  }

  logLine({
    event: "patch_ride_failed",
    ride_id: id,
    error: directError?.message,
    rpc_error: rpcError?.message,
    rpc_missing: isMissingDbRpc(rpcError),
  });
  return false;
}

async function cancelRideRequestRow(
  id: string,
  cancelledBy: "rider" | "driver" | "system",
  reason: string | null,
  extraPatch?: Record<string, unknown>,
): Promise<boolean> {
  const { data: cancelData, error: cancelError } = await pubSvc().rpc("rides_cancel_ride_request", {
    p_id: id,
    p_cancelled_by: cancelledBy,
    p_cancel_reason: reason,
  });
  if (!cancelError && cancelData != null) {
    if (extraPatch && Object.keys(extraPatch).length > 0) {
      await patchRideRequest(id, { ...extraPatch, updated_at: new Date().toISOString() });
    }
    return true;
  }

  if (cancelError && !isMissingDbRpc(cancelError)) {
    logLine({
      event: "cancel_ride_rpc_error",
      ride_id: id,
      error: cancelError.message,
      code: cancelError.code,
    });
  }

  return patchRideRequest(id, {
    status: "cancelled",
    cancelled_by: cancelledBy,
    cancel_reason: reason,
    updated_at: new Date().toISOString(),
    ...extraPatch,
  });
}

/**
 * @deprecated Phase 8 cleanup: Remove legacy path after matching brain stable in production.
 * Legacy matching logic is retained for fallback during rollout.
 * After stable operation, this should only delegate to matching brain.
 * 
 * Wave 6 note: Deprecation warning added. Removal deferred pending production metrics.
 */
let _legacyMatchingWarnedOnce = false;
async function startMatchingForRide(
  rideId: string,
  ride: Record<string, unknown>,
  reqId?: string,
): Promise<void> {
  if (isMatchingBrainEnabled()) {
    const result = await delegateStartMatching({
      product_key: "rides",
      ride_request_id: rideId,
      request_id: reqId,
      ride_snapshot: {
        pickup_lat: Number(ride.pickup_lat),
        pickup_lng: Number(ride.pickup_lng),
        vehicle_option: String(ride.vehicle_option ?? ""),
        rider_user_id: String(ride.rider_user_id),
        driver_offer_timeout_seconds: ride.driver_offer_timeout_seconds != null
          ? Number(ride.driver_offer_timeout_seconds)
          : undefined,
      },
    });
    if (!result.ok) {
      logLine({
        event: "brain_start_matching_failed_fallback",
        ride_id: rideId,
        error: result.error,
        request_id: reqId ?? null,
      });
      // Wave 6: Warn once when legacy fallback is still being used
      if (!_legacyMatchingWarnedOnce) {
        console.warn("[rides] DEPRECATION: Legacy matching fallback used. Phase 8 removal deferred pending metrics. ride_id:", rideId);
        _legacyMatchingWarnedOnce = true;
      }
      // Fallback to legacy path
      await runMatchingWave(rideId, ride, 1, reqId);
      await reconcileMatching(rideId, reqId);
    }
    return;
  }
  // Legacy path — warn once per isolate when brain is disabled
  if (!_legacyMatchingWarnedOnce) {
    console.warn("[rides] DEPRECATION: Legacy matching path active (brain disabled). Phase 8 removal deferred pending metrics. ride_id:", rideId);
    _legacyMatchingWarnedOnce = true;
  }
  await runMatchingWave(rideId, ride, 1, reqId);
  await reconcileMatching(rideId, reqId);
}

async function syncBookingRequestForTerminalRide(
  fresh: Record<string, unknown>,
  status: "completed" | "cancelled",
): Promise<void> {
  const bookingRequestId = typeof fresh.booking_request_id === "string"
    ? fresh.booking_request_id
    : null;
  if (!bookingRequestId) return;

  const rideId = String(fresh.id);

  try {
    if (status === "completed") {
      const { db: contactsDb, tables: ct } = await getRidesContactsDb();
      const { data: br } = await contactsDb.from(ct.booking_requests)
        .select("status")
        .eq("id", bookingRequestId)
        .maybeSingle();
      const intentStatus = br ? String(br.status) : "";
      if (intentStatus === "booked" || isDigitalRidePayment(fresh.payment_method)) {
        await markBookingRequestConsumed(getRidesContactsDb, bookingRequestId, rideId);
      }
      return;
    }

    const cancelledBy = String(fresh.cancelled_by ?? "");
    if (cancelledBy === "system") {
      await syncBookingRequestAfterSystemRideCancel(getRidesContactsDb, bookingRequestId);
    } else {
      await releaseBookingRequestAfterRideCancelled(getRidesContactsDb, bookingRequestId);
    }
  } catch (e) {
    console.error("[rides] booking request sync failed:", e);
  }
}

async function handleTerminalRideLedgerAndSync(rideId: string): Promise<void> {
  const fresh = await loadRideRequestById(rideId);
  if (!fresh) return;
  const status = String(fresh.status ?? "");
  if (status !== "completed" && status !== "cancelled") return;

  try {
    await persistRideLedgerLinesForTerminalState(svc(), fresh);
    if (status === "completed") {
      await finalizeRideLedgerFields(svc(), rideId, fresh);
      try {
        const { processCardTripSettlement } = await import(
          "./cashSettlement/processCardTripSettlement.ts"
        );
        await processCardTripSettlement(svc(), fresh);
      } catch (e) {
        console.error("[rides] card trip settlement failed:", e);
      }
      if (fresh.roam_mode === "shadow_roam") {
        void notifyShadowBookerOfTripCompleted(pubSvc(), fresh).catch((e) =>
          logLine({ event: "shadow_booker_notify_failed", error: String(e) })
        );
      }
    }
  } catch (e) {
    console.error("[rides] ledger line persist failed:", e);
  }

  await syncBookingRequestForTerminalRide(
    fresh,
    status as "completed" | "cancelled",
  );

  try {
    await syncRideToFleetKv(fresh);
  } catch (e) {
    console.error("[rides] fleet KV sync failed:", e);
  }
}

function transitionDeps(): ApplyTransitionDeps {
  return {
    loadRideRequestById,
    patchRideRequest,
    handleTerminalRideLedgerAndSync,
    bumpSurgeDemand,
    audit,
    cleanupLiveState: async (rideId: string) => cleanupRideLiveState(svc(), rideId),
  };
}

async function loadDispatchSettingsForRides(): Promise<typeof DEFAULT_DISPATCH_SETTINGS> {
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    return await loadDispatchSettings(adminDb, tables);
  } catch {
    return DEFAULT_DISPATCH_SETTINGS;
  }
}

async function loadActiveRideIds(): Promise<string[]> {
  const active = [
    "driver_assigned",
    "driver_en_route_pickup",
    "driver_arrived_pickup",
    "on_trip",
  ];
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("id").in(
    "status",
    active,
  );
  if (!nativeErr && native) return native.map((row) => row.id as string);

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("id").in("status", active);
  return (pub ?? []).map((row) => row.id as string);
}

async function loadMatchingRideIdsForRider(riderUserId: string): Promise<string[]> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("id").eq(
    "rider_user_id",
    riderUserId,
  ).eq("status", "matching");
  if (!nativeErr && native) return native.map((row) => row.id as string);

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("id").eq(
    "rider_user_id",
    riderUserId,
  ).eq("status", "matching");
  return (pub ?? []).map((row) => row.id as string);
}

/** Ends stale matching requests when a rider books again without cancelling the prior search. */
async function cancelPriorMatchingRidesForRider(
  riderUserId: string,
  reason: string,
): Promise<void> {
  const ids = await loadMatchingRideIdsForRider(riderUserId);
  const now = new Date().toISOString();
  for (const rideId of ids) {
    const ok = await cancelRideRequestRow(rideId, "rider", reason);
    if (!ok) {
      logLine({ event: "cancel_prior_matching_failed", ride_id: rideId, rider_user_id: riderUserId });
      continue;
    }
    await supersedePendingOffersForRide(rideId);
    const ride = await loadRideRequestById(rideId);
    if (ride) {
      const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
      await bumpSurgeDemand(cellKey, -1);
    }
    await audit(rideId, riderUserId, "ride_cancelled_rider", { auto: true, reason });
    await handleTerminalRideLedgerAndSync(rideId);
  }
}

async function insertDriverOfferRow(
  row: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { error: rpcError } = await pubSvc().rpc("rides_insert_driver_offer", { p_row: row });
  if (!rpcError) return { ok: true };

  const { error } = await svc().from("driver_offers").insert(row);
  if (!error) {
    logLine({
      event: "insert_offer_via_fallback",
      ride_request_id: row.ride_request_id,
      rpc_error: rpcError.message,
    });
    return { ok: true };
  }
  const msg = [rpcError.message, error.message].filter(Boolean).join(" | ");
  logLine({
    event: "insert_offer_failed",
    ride_request_id: row.ride_request_id,
    error: error.message,
    rpc_error: rpcError.message,
  });
  return { ok: false, error: msg };
}

async function patchDriverOfferRow(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error: rpcError } = await pubSvc().rpc("rides_patch_driver_offer", {
    p_id: id,
    p_patch: patch,
  });
  if (!rpcError) return true;

  const { error } = await svc().from("driver_offers").update(patch).eq("id", id);
  return !error;
}

async function expirePendingOffersForRide(rideId: string, nowIso: string): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_expire_pending_offers", {
    p_ride_id: rideId,
    p_now: nowIso,
  });
  if (!rpcError) return;

  await svc().from("driver_offers").update({ status: "expired" }).eq("ride_request_id", rideId).eq(
    "status",
    "pending",
  ).lte("expires_at", nowIso);
}

async function supersedeAllPendingOffersForDriver(driverUserId: string): Promise<void> {
  await svc().from("driver_offers").update({ status: "superseded" }).eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending");
}

async function supersedePendingOffersForRide(
  rideId: string,
  exceptOfferId?: string,
): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_supersede_pending_offers", {
    p_ride_id: rideId,
    p_except_offer_id: exceptOfferId ?? null,
  });
  if (!rpcError) return;

  let query = svc().from("driver_offers").update({ status: "superseded" }).eq(
    "ride_request_id",
    rideId,
  ).eq("status", "pending");
  if (exceptOfferId) query = query.neq("id", exceptOfferId);
  await query;
}

async function expireDriverPendingOffers(driverUserId: string, nowIso: string): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_expire_driver_pending_offers", {
    p_driver_user_id: driverUserId,
    p_now: nowIso,
  });
  if (!rpcError) return;

  await svc().from("driver_offers").update({ status: "expired" }).eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending").lte("expires_at", nowIso);
}

const LEGACY_BODY_TYPE_SLUGS: Record<string, string> = {
  standard: "sedan",
};

function normalizePresenceBodyTypeSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  const normalized = slug.trim().toLowerCase();
  return LEGACY_BODY_TYPE_SLUGS[normalized] ?? normalized;
}

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "rides", ts: new Date().toISOString(), ...payload }));
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    "unknown";
}

/** Sliding-window rate limit (best-effort per isolate). */
const rlBuckets = new Map<string, number[]>();
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = rlBuckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    rlBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rlBuckets.set(key, fresh);
  return true;
}

async function requireUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 as const };
  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 as const };
  return { user };
}

function isH3SurgeEnabled(): boolean {
  return Deno.env.get("MATCHING_H3_SURGE") === "1";
}

async function bumpSurgeDemand(cellKey: string, delta: number, h3CellKey?: string) {
  // Use RPC if available (supports H3 dual-write)
  const { data: rpcResult, error: rpcError } = await pubSvc().rpc("rides_upsert_surge_cell", {
    p_cell_key: cellKey,
    p_h3_cell_key: isH3SurgeEnabled() ? h3CellKey : null,
    p_delta: delta,
  });

  if (!rpcError && rpcResult) {
    return;
  }

  // Fallback to direct writes
  const db = svc();
  const { data: row } = await db.from("surge_cells").select("*").eq("cell_key", cellKey).maybeSingle();

  if (!row) {
    if (delta <= 0) return;
    const insertRow: Record<string, unknown> = {
      cell_key: cellKey,
      open_requests: Math.max(0, delta),
      surge_multiplier: 1,
    };
    if (isH3SurgeEnabled() && h3CellKey) {
      insertRow.h3_cell_key = h3CellKey;
    }
    await db.from("surge_cells").insert(insertRow);
    return;
  }

  const next = Math.max(0, (row.open_requests ?? 0) + delta);
  let mult = Number(row.surge_multiplier ?? 1);
  if (next >= 8) mult = Math.min(2.5, mult + 0.05);
  else if (next <= 2) mult = Math.max(1, mult - 0.02);

  const updateRow: Record<string, unknown> = {
    open_requests: next,
    surge_multiplier: mult,
    updated_at: new Date().toISOString(),
  };
  if (isH3SurgeEnabled() && h3CellKey && !row.h3_cell_key) {
    updateRow.h3_cell_key = h3CellKey;
  }

  await db.from("surge_cells").update(updateRow).eq("cell_key", cellKey);
}

async function readSurgeMultiplier(cellKey: string, h3CellKey?: string): Promise<number> {
  // Use RPC if available (supports H3 lookup with fallback)
  const { data: rpcResult, error: rpcError } = await pubSvc().rpc("rides_read_surge_multiplier", {
    p_cell_key: cellKey,
    p_h3_cell_key: isH3SurgeEnabled() ? h3CellKey : null,
  });

  if (!rpcError && typeof rpcResult === "number") {
    return rpcResult;
  }

  // Fallback to direct query
  const db = svc();

  // Try H3 first if enabled
  if (isH3SurgeEnabled() && h3CellKey) {
    const { data: h3Data } = await db
      .from("surge_cells")
      .select("surge_multiplier")
      .eq("h3_cell_key", h3CellKey)
      .maybeSingle();
    if (h3Data?.surge_multiplier != null) {
      return Number(h3Data.surge_multiplier);
    }
  }

  // Fallback to legacy key
  const { data } = await db.from("surge_cells").select("surge_multiplier").eq("cell_key", cellKey).maybeSingle();
  return data?.surge_multiplier != null ? Number(data.surge_multiplier) : 1;
}

async function audit(
  rideId: string | null,
  actor: string | undefined,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await svc().from("audit_events").insert({
    ride_request_id: rideId,
    actor_user_id: actor ?? null,
    event_type: eventType,
    payload,
  });
}

async function expirePendingOffers(rideId: string) {
  const nowIso = new Date().toISOString();
  await expirePendingOffersForRide(rideId, nowIso);
}

/** Max reconcile loop iterations (empty-wave fast-forward safety cap). */
const RECONCILE_WAVE_LOOP_CAP = 8;

async function loadDispatchSettingsForMatching(): Promise<DispatchSettings> {
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    return await loadDispatchSettings(adminDb, tables);
  } catch {
    return DEFAULT_DISPATCH_SETTINGS;
  }
}

async function cancelMatchingRideSystem(
  rideId: string,
  ride: Record<string, unknown>,
  cancelReason: "no_drivers_available" | "matching_timeout",
  extraAudit: Record<string, unknown>,
  requestId?: string,
): Promise<void> {
  if (isBookForOthersPersistedRide(ride)) {
    logLine({
      event: "matching_cancel_skipped_book_for_others",
      ride_id: rideId,
      cancel_reason: cancelReason,
      request_id: requestId ?? null,
    });
    return;
  }
  const wave = Number(ride.matching_wave ?? 0);
  const patched = await patchRideRequest(rideId, {
    status: "cancelled",
    cancelled_by: "system",
    cancel_reason: cancelReason,
    updated_at: new Date().toISOString(),
  });
  if (!patched) {
    logLine({ event: "cancel_matching_patch_failed", ride_id: rideId, cancel_reason: cancelReason });
    return;
  }
  const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
  await bumpSurgeDemand(cellKey, -1);
  const eventType = cancelReason === "matching_timeout"
    ? "ride_auto_cancelled_matching_timeout"
    : "ride_auto_cancelled_no_drivers";
  await audit(rideId, undefined, eventType, { wave, ...extraAudit });
  logLine({
    event: cancelReason === "matching_timeout" ? "ride_matching_timeout" : "ride_auto_cancelled",
    ride_id: rideId,
    request_id: requestId ?? null,
    wave,
  });
  await handleTerminalRideLedgerAndSync(rideId);
}

/**
 * @deprecated Phase 8 cleanup: Remove legacy path after matching brain stable in production.
 * Legacy reconcile logic is retained for fallback during rollout.
 * After stable operation, this should only delegate to matching brain.
 * 
 * Wave 6 note: Deprecation warning added. Removal deferred pending production metrics.
 */
/**
 * Per-ride single-flight guard. Reconcile can be triggered concurrently (cron
 * batch + an offer accept/decline + a rider poll all firing at once). Two
 * overlapping runs each read the same "no pending offers" state and each fire a
 * matching wave, double-inserting driver offers. Coalescing concurrent calls
 * per rideId onto ONE in-flight promise means the second trigger waits for /
 * reuses the first instead of racing it. In-memory (per edge instance) — the
 * common redelivery/burst case is same-instance; cross-instance overlap remains
 * bounded by the wave-cap and offer expiry.
 */
const inFlightReconciles = new Map<string, Promise<void>>();
let _legacyReconcileWarnedOnce = false;

function reconcileMatching(rideId: string, requestId?: string): Promise<void> {
  const existing = inFlightReconciles.get(rideId);
  if (existing) {
    logLine({ event: "reconcile_matching_coalesced", ride_id: rideId, request_id: requestId ?? null });
    return existing;
  }
  const run = reconcileMatchingInner(rideId, requestId).finally(() => {
    inFlightReconciles.delete(rideId);
  });
  inFlightReconciles.set(rideId, run);
  return run;
}

async function reconcileMatchingInner(rideId: string, requestId?: string) {
  if (isMatchingBrainEnabled()) {
    const result = await delegateReconcile({
      product_key: "rides",
      ride_request_id: rideId,
      request_id: requestId,
    });
    if (!result.ok) {
      logLine({
        event: "brain_reconcile_failed_fallback",
        ride_id: rideId,
        error: result.error,
        request_id: requestId ?? null,
      });
      // Wave 6: Warn once when legacy reconcile fallback is still being used
      if (!_legacyReconcileWarnedOnce) {
        console.warn("[rides] DEPRECATION: Legacy reconcile fallback used. Phase 8 removal deferred pending metrics. ride_id:", rideId);
        _legacyReconcileWarnedOnce = true;
      }
      // Fallback to legacy path below
    } else {
      return;
    }
  }

  await expirePendingOffers(rideId);

  const dispatchSettings = await loadDispatchSettingsForMatching();

  for (let iter = 0; iter < RECONCILE_WAVE_LOOP_CAP; iter++) {
    const ride = await loadRideRequestById(rideId);
    if (!ride || ride.status !== "matching") return;

    if (isMatchingTimedOut(ride, dispatchSettings)) {
      if (isBookForOthersPersistedRide(ride)) {
        logLine({
          event: "matching_timeout_skipped_book_for_others",
          ride_id: rideId,
          request_id: requestId ?? null,
        });
        return;
      }
      await cancelMatchingRideSystem(rideId, ride, "matching_timeout", {}, requestId);
      return;
    }

    const offerRows = await loadDriverOffersForRide(rideId, false);
    if (offerRows.some((row) => row.status === "pending")) return;

    const wave = Number(ride.matching_wave ?? 0);
    if (wave >= dispatchSettings.max_match_waves) {
      if (isBookForOthersPersistedRide(ride)) {
        await patchRideRequest(rideId, {
          matching_wave: 0,
          updated_at: new Date().toISOString(),
        });
        logLine({
          event: "matching_wave_reset_book_for_others",
          ride_id: rideId,
          wave,
          request_id: requestId ?? null,
        });
        return;
      }
      await cancelMatchingRideSystem(rideId, ride, "no_drivers_available", {}, requestId);
      return;
    }

    await runMatchingWave(rideId, ride, wave + 1, requestId);

    const afterOffers = await loadDriverOffersForRide(rideId, false);
    if (afterOffers.some((row) => row.status === "pending")) return;
  }

  logLine({
    event: "reconcile_matching_loop_cap",
    ride_id: rideId,
    request_id: requestId ?? null,
  });
}

/**
 * @deprecated Phase 8 cleanup: Remove after matching brain stable in production.
 * Legacy wave runner is retained for fallback during rollout.
 * All wave logic should be handled by matching brain after cutover.
 * 
 * Wave 6 note: Removal deferred pending production metrics confirmation.
 */
async function runMatchingWave(
  rideId: string,
  ride: Record<string, unknown>,
  wave: number,
  requestId?: string,
) {
  const db = svc();
  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const radiusKm = getWaveRadiusKm(dispatchSettings, wave);
  const pickupLat = Number(ride.pickup_lat);
  const pickupLng = Number(ride.pickup_lng);
  const timeoutSec = Number(
    ride.driver_offer_timeout_seconds ?? dispatchSettings.default_driver_offer_timeout_seconds,
  );

  const freshSince = new Date(Date.now() - driverLocationMaxAgeMs(dispatchSettings)).toISOString();
  const locs = await loadAvailableDriverLocations(freshSince);

  const serviceSlug = typeof ride.vehicle_option === "string"
    ? ride.vehicle_option.trim().toLowerCase()
    : "";
  let allowedBodySlugs = new Set<string>();
  let tiersCount = 0;
  if (serviceSlug && dispatchSettings.body_type_filtering_enabled) {
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      const tiers = await loadServiceBodyTypeTiers(adminDb, tables, serviceSlug);
      tiersCount = tiers.length;
      if (tiersCount > 0) {
        allowedBodySlugs = allowedBodySlugsForWave(
          tiers,
          wave,
          dispatchSettings.body_type_tier_mode,
        );
      }
    } catch {
      allowedBodySlugs = new Set();
    }
  }

  const declinedRows = (await loadDriverOffersForRide(rideId, false)).filter((row) =>
    ["declined", "expired", "superseded"].includes(String(row.status)),
  );

  const excluded = new Set(
    declinedRows.map((r) => r.driver_user_id as string),
  );
  if (ride.assigned_driver_user_id) {
    excluded.add(String(ride.assigned_driver_user_id));
  }

  const eligibleIds = await getEligibleDriverUserIds(
    (locs ?? []).map((row) => row.user_id as string),
    dispatchSettings,
  );

  type Cand = { user_id: string; lat: number; lng: number; d: number; body_type_slug: string | null };
  const candidates: Cand[] = [];
  let filteredOutBodyType = 0;
  let filteredOutDispatchMode = 0;
  const isHaulageJob = serviceSlug === "haulage";
  for (const row of locs ?? []) {
    const uid = row.user_id as string;
    if (excluded.has(uid)) continue;
    if (!eligibleIds.has(uid)) continue;
    const rowDispatchMode = (row as { dispatch_mode?: string | null }).dispatch_mode ?? null;
    if (isHaulageJob) {
      if (rowDispatchMode !== "haulage") {
        filteredOutDispatchMode++;
        continue;
      }
    } else if (rowDispatchMode === "haulage") {
      filteredOutDispatchMode++;
      continue;
    }
    const rawBodySlug = (row as { body_type_slug?: string | null }).body_type_slug ?? null;
    // GPS rows written before slug support (or cleared by validation) are null — assume sedan so
    // require_body_type_for_offers does not zero out the candidate pool during beta.
    const bodySlug = rawBodySlug ??
      (tiersCount > 0 ? (normalizePresenceBodyTypeSlug("standard") ?? "sedan") : null);
    if (tiersCount > 0) {
      if (!bodySlug) {
        if (dispatchSettings.require_body_type_for_offers) {
          filteredOutBodyType++;
          continue;
        }
      } else if (!allowedBodySlugs.has(bodySlug)) {
        filteredOutBodyType++;
        continue;
      }
    }
    const d = haversineKm(pickupLat, pickupLng, Number(row.lat), Number(row.lng));
    if (d <= radiusKm) {
      candidates.push({
        user_id: uid,
        lat: Number(row.lat),
        lng: Number(row.lng),
        d,
        body_type_slug: bodySlug,
      });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.user_id.localeCompare(b.user_id));

  const haulageFiltered = await filterDriversForHaulageJob(
    pubSvc(),
    rideId,
    serviceSlug,
    candidates.map((c) => ({ driver_user_id: c.user_id, body_type_slug: c.body_type_slug })),
  );
  const haulageAllowed = new Set(haulageFiltered.map((c) => c.driver_user_id));
  const finalCandidates = candidates.filter((c) => haulageAllowed.has(c.user_id));

  const locCount = (locs ?? []).length;
  logLine({
    event: "match_wave_diag",
    ride_id: rideId,
    wave,
    radius_km: radiusKm,
    loc_rows: locCount,
    eligible_drivers: eligibleIds.size,
    candidates: finalCandidates.length,
    filtered_body_type: filteredOutBodyType,
    service_slug: serviceSlug,
    tiers_count: tiersCount,
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    request_id: requestId ?? null,
    fresh_since: freshSince,
    ...(locCount === 0
      ? {
        hint:
          "No fresh driver_locations with available_for_rides=true; confirm driver is Online and PostgREST schema cache includes driver_locations",
      }
      : {}),
  });

  const { ranked, source: matchingRouteSource } = await rankDriversByDriveTime(
    { lat: pickupLat, lng: pickupLng },
    finalCandidates.map((c) => ({
      user_id: c.user_id,
      lat: c.lat,
      lng: c.lng,
      haversineKm: c.d,
    })),
  );

  const rankedCandidates: Cand[] = ranked.map((r) => ({
    user_id: r.user_id,
    lat: r.lat,
    lng: r.lng,
    d: r.haversineKm,
  }));

  const rotate = wave % Math.max(rankedCandidates.length, 1);
  const rotated = [...rankedCandidates.slice(rotate), ...rankedCandidates.slice(0, rotate)];
  const picked = rotated.slice(0, dispatchSettings.max_offers_per_wave);

  const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

  const patchOk = await patchRideRequest(rideId, {
    matching_wave: wave,
    updated_at: new Date().toISOString(),
  });
  if (!patchOk) {
    logLine({
      event: "match_wave_aborted_patch_failed",
      ride_id: rideId,
      wave,
      picked: picked.length,
      request_id: requestId ?? null,
    });
    return;
  }

  let offersInserted = 0;
  let lastOfferErr: string | undefined;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const ins = await insertDriverOfferRow({
      ride_request_id: rideId,
      driver_user_id: c.user_id,
      wave,
      rank_score: i + 1,
      distance_km: c.d,
      status: "pending",
      expires_at: expiresAt,
    });
    if (ins.ok) offersInserted += 1;
    else lastOfferErr = ins.error;
  }

  if (picked.length > 0 && offersInserted === 0) {
    logLine({
      event: "match_wave_zero_offers_inserted",
      ride_id: rideId,
      wave,
      attempted: picked.length,
      last_error: lastOfferErr ?? "unknown",
      request_id: requestId ?? null,
    });
  }

  try {
    await audit(rideId, ride.rider_user_id as string | undefined, "matching_wave", {
      wave,
      radius_km: radiusKm,
      offers: picked.length,
      offers_inserted: offersInserted,
      matching_route_source: matchingRouteSource,
      service_slug: serviceSlug,
      allowed_body_types: [...allowedBodySlugs],
      filtered_out_body_type: filteredOutBodyType,
    });
  } catch (e: unknown) {
    logLine({
      event: "audit_matching_wave_failed",
      ride_id: rideId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  logLine({
    event: "matching_wave",
    ride_id: rideId,
    wave,
    offers: picked.length,
    offers_inserted: offersInserted,
    request_id: requestId ?? null,
  });
}

app.get("/health", (c) => c.json({ service: "rides", status: "ok" }));

function parsePermissionSurface(raw: string | undefined): AppPermissionSurface | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "rider" || s === "driver") return s;
  return null;
}

app.get("/v1/app-permission-policy", async (c) => {
  const surface = parsePermissionSurface(c.req.query("surface"));
  if (!surface) return c.json({ error: "invalid_surface" }, 400);

  if (surface === "driver") {
    const auth = await requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsHaulerOrDriverSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
  }

  try {
    const { db, tables } = await getRidesAdminDb();
    const permissions = await loadAppPermissionPolicy(db, tables.app_permission_policy, surface);
    return c.json(policyDto(permissions));
  } catch {
    const permissions = await loadAppPermissionPolicy(svc(), "app_permission_policy", surface);
    return c.json(policyDto(permissions));
  }
});

app.get("/v1/vehicle-types", async (c) => {
  try {
    const { db, tables } = await getRidesAdminDb();
    const all = await loadVehicleTypesFromDb(db, tables.vehicle_types, { activeOnly: true });
    const services = all.filter((t) => t.solution_kind === "service");
    return c.json({ services, vehicle_types: services });
  } catch {
    const all = await loadVehicleTypesFromDb(svc(), "vehicle_types", { activeOnly: true });
    const services = all.filter((t) => t.solution_kind === "service");
    return c.json({ services, vehicle_types: services });
  }
});

/** Address autocomplete for Capacitor (browser Maps key is referrer-locked to roam-s.co). */
app.get("/v1/places/autocomplete", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:places-autocomplete`, 90, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 3) return c.json({ suggestions: [] });

  if (!isPlacesConfigured()) {
    console.error("[rides] places autocomplete: GOOGLE_MAPS_SERVER_KEY_RIDES not set");
    return c.json({ error: "places_not_configured", suggestions: [] }, 503);
  }

  try {
    const suggestions = await autocompletePlaces(q);
    return c.json({ suggestions });
  } catch (e) {
    console.error("[rides] places autocomplete:", e);
    return c.json({ error: "places_unavailable" }, 502);
  }
});

app.get("/v1/places/reverse", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:places-reverse`, 90, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const lat = Number.parseFloat(c.req.query("lat") ?? "");
  const lng = Number.parseFloat(c.req.query("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "invalid_coordinates" }, 400);
  }

  if (!isPlacesConfigured()) {
    return c.json({ error: "places_not_configured" }, 503);
  }

  try {
    const address = await reverseGeocodeCoordinates(lat, lng);
    if (!address) return c.json({ error: "address_not_found" }, 404);
    return c.json({ address, lat, lng });
  } catch (e) {
    console.error("[rides] places reverse:", e);
    return c.json({ error: "places_unavailable" }, 502);
  }
});

app.get("/v1/places/:placeId/details", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:places-details`, 120, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const placeId = decodeURIComponent(c.req.param("placeId") ?? "").trim();
  if (!placeId) return c.json({ error: "missing_place_id" }, 400);

  try {
    const details = await fetchPlaceDetails(placeId);
    if (!details) return c.json({ error: "place_not_found" }, 404);
    return c.json(details);
  } catch (e) {
    console.error("[rides] places details:", e);
    return c.json({ error: "places_unavailable" }, 502);
  }
});

// --- Rider ---
app.post("/v1/quote", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:quote`, 60, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);

  const bookingCheck = await assertRiderCanBook(svc(), auth.user.id);
  if (!bookingCheck.ok) {
    return c.json({ error: "rider_account_restricted", status: bookingCheck.status }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const pickup_lat = Number(body.pickup_lat);
  const pickup_lng = Number(body.pickup_lng);
  const dropoff_lat = Number(body.dropoff_lat);
  const dropoff_lng = Number(body.dropoff_lng);
  if ([pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((x) => Number.isNaN(x))) {
    return c.json({ error: "invalid_coordinates" }, 400);
  }
  const vehicleType = typeof body.vehicle_option === "string" ? body.vehicle_option : "uberx";
  const db = svc();

  const fareRulesAccess = await resolveFareRulesDbForQuote();

  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  let allowedBodyTypeSlugs: Set<string> | undefined;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
    if (dispatchSettings.body_type_filtering_enabled) {
      const tiers = await loadServiceBodyTypeTiers(adminDb, tables, vehicleType);
      if (tiers.length) {
        allowedBodyTypeSlugs = allowedBodySlugsForWave(
          tiers,
          1,
          dispatchSettings.body_type_tier_mode,
        );
      }
    }
  } catch {
    allowedBodyTypeSlugs = undefined;
  }

  let quote: Awaited<ReturnType<typeof buildFareQuote>>;
  try {
    quote = await buildFareQuote(db, {
      pickupLat: pickup_lat,
      pickupLng: pickup_lng,
      dropoffLat: dropoff_lat,
      dropoffLng: dropoff_lng,
      vehicleType,
      readSurge: readSurgeMultiplier,
      allowedBodyTypeSlugs,
      dispatchSettings,
      fareRulesDb: fareRulesAccess.db,
      fareRulesTable: fareRulesAccess.fareRulesTable,
      vehicleTypesTable: fareRulesAccess.vehicleTypesTable,
    });
  } catch (e) {
    if (e instanceof FareRuleNotFoundError) {
      return c.json(e.toResponseBody(), 404);
    }
    throw e;
  }

  await audit(null, auth.user.id, "fare_quoted", {
    distance_km: quote.distanceKm,
    surge: quote.surgeMultiplier,
    route_source: quote.routeSource,
    breakdown: quote.breakdown,
  });

  logLine({
    event: "quote",
    user_id: auth.user.id,
    distanceKm: quote.distanceKm,
    surge: quote.surgeMultiplier,
    route_source: quote.routeSource,
  });

  return c.json({
    distance_estimate_km: quote.distanceKm,
    duration_estimate_minutes: quote.durationMinutes,
    eta_trip_minutes_estimate: quote.etaTripMinutes,
    eta_pickup_seconds_estimate: quote.etaPickupSeconds,
    surge_multiplier: quote.surgeMultiplier,
    fare_estimate_minor: quote.fareEstimateMinor.toString(),
    currency: quote.currency,
    grid_cell_key: quote.gridCellKey,
    vehicle_option: quote.vehicleType,
    route_source: quote.routeSource,
    duration_traffic_aware: quote.durationTrafficAware,
    ...(quote.routePolylineEncoded
      ? { route_polyline_encoded: quote.routePolylineEncoded }
      : {}),
    drivers_available: quote.driversAvailable,
    pickup_eta_source: quote.pickupEtaSource,
    ...(quote.driversAvailable && quote.etaPickupSeconds > 0
      ? {
        pickup_eta_minutes_estimate: Math.ceil(quote.etaPickupSeconds / 60),
        eta_pickup_seconds_estimate: quote.etaPickupSeconds,
      }
      : { eta_pickup_seconds_estimate: 0 }),
    ...(quote.etaArrivalAt ? { eta_arrival_at: quote.etaArrivalAt } : {}),
    fare_breakdown: quote.breakdown,
    quote_token: quote.quoteToken,
  });
});

app.post("/v1/requests", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:requests`, 20, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (deniesPassengerSurface(auth.user)) {
    return jsonEdgeForbidden(c, "forbidden_role");
  }

  const bookingCheck = await assertRiderCanBook(svc(), auth.user.id);
  if (!bookingCheck.ok) {
    return c.json({ error: "rider_account_restricted", status: bookingCheck.status }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const pickup_lat = Number(body.pickup_lat);
  const pickup_lng = Number(body.pickup_lng);
  const dropoff_lat = Number(body.dropoff_lat);
  const dropoff_lng = Number(body.dropoff_lng);
  if ([pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((x) => Number.isNaN(x))) {
    return c.json({ error: "invalid_coordinates" }, 400);
  }

  const idempotency_key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  const db = svc();

  if (idempotency_key) {
    const existing = await loadRideRequestByIdempotencyKey(idempotency_key);
    if (existing) {
      return c.json({ ride: existing });
    }
  }

  const vehicle_option = typeof body.vehicle_option === "string" ? body.vehicle_option : "uberx";
  const quote_token = typeof body.quote_token === "string" ? body.quote_token : null;
  if (!quote_token) {
    return c.json({ error: "quote_token_required" }, 400);
  }

  const verified = await verifyQuoteToken(quote_token, {
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    vehicle_type: vehicle_option,
  });

  if (!verified.ok) {
    return c.json({ error: "quote_stale", reason: verified.reason }, 409);
  }

  const locked = verified.payload;
  const cellKey = gridCellKey(pickup_lat, pickup_lng);

  await cancelPriorMatchingRidesForRider(auth.user.id, "replaced_by_new_booking");

  await bumpSurgeDemand(cellKey, 1);

  let bookDispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    bookDispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const insertRow: Record<string, unknown> = {
    rider_user_id: auth.user.id,
    status: "matching" as RideStatus,
    pickup_lat,
    pickup_lng,
    pickup_address: body.pickup_address ?? null,
    dropoff_lat,
    dropoff_lng,
    dropoff_address: body.dropoff_address ?? null,
    vehicle_option,
    fare_estimate_minor: locked.fare_estimate_minor,
    surge_multiplier: locked.surge_multiplier,
    currency: locked.currency,
    distance_estimate_km: locked.distance_km,
    duration_estimate_minutes: locked.duration_minutes,
    eta_pickup_seconds_estimate: Math.round((locked.distance_km / AVG_SPEED_KMH) * 3600),
    quote_token_hash: quoteTokenHash(quote_token),
    fare_breakdown: locked.fare_breakdown ?? null,
    idempotency_key,
    driver_offer_timeout_seconds: Number(
      body.driver_offer_timeout_seconds ?? bookDispatchSettings.default_driver_offer_timeout_seconds,
    ),
    matching_wave: 0,
    route_polyline_encoded: typeof body.route_polyline_encoded === "string"
      ? body.route_polyline_encoded
      : null,
    verification_pin: isPinFeatureEnabled(bookDispatchSettings) ? generatePin() : null,
  };

  const paymentMethod = body.payment_method;
  if (paymentMethod === "cash" || paymentMethod === "card") {
    insertRow.payment_method = paymentMethod;
  }

  const arrearsCheck = await isRiderArrearsBlocked(db, auth.user.id, paymentMethod ?? "cash", locked.currency);
  if (arrearsCheck.blocked) {
    return c.json({
      error: "rider_arrears_blocked",
      message: "Clear outstanding balance before requesting cash rides",
      arrears_minor: arrearsCheck.arrearsMinor,
      currency: locked.currency,
    }, 403);
  }

  const guestPassengerName = typeof body.guest_passenger_name === "string"
    ? body.guest_passenger_name.trim()
    : "";
  const guestPassengerPhone = typeof body.guest_passenger_phone === "string"
    ? body.guest_passenger_phone.trim()
    : "";
  const bookingPurpose = typeof body.booking_purpose === "string"
    ? body.booking_purpose.trim()
    : "";
  if (guestPassengerName || guestPassengerPhone) {
    if (!guestPassengerName || !guestPassengerPhone) {
      return c.json({ error: "invalid_guest_passenger" }, 400);
    }
    if (bookingPurpose && !["guest", "family", "business"].includes(bookingPurpose)) {
      return c.json({ error: "invalid_booking_purpose" }, 400);
    }
    insertRow.guest_passenger_name = guestPassengerName;
    insertRow.guest_passenger_phone = guestPassengerPhone;
    if (bookingPurpose) insertRow.booking_purpose = bookingPurpose;
  }

  const riderContactId = typeof body.rider_contact_id === "string" ? body.rider_contact_id : null;
  if (riderContactId) {
    const { db: contactsDb, tables: ct } = await getRidesContactsDb();
    const { data: contact } = await contactsDb.from(ct.rider_contacts).select("id, linked_user_id")
      .eq("id", riderContactId).eq("owner_user_id", auth.user.id).maybeSingle();
    if (!contact) return c.json({ error: "invalid_rider_contact" }, 400);
    insertRow.rider_contact_id = riderContactId;
    if (contact.linked_user_id) {
      insertRow.passenger_user_id = contact.linked_user_id;
    }
  }

  const bookingRequestId = typeof body.trip_intent_id === "string"
    ? body.trip_intent_id
    : typeof body.booking_request_id === "string"
      ? body.booking_request_id
      : null;
  if (bookingRequestId) {
    const { db: contactsDb, tables: ct } = await getRidesContactsDb();
    const { data: br } = await contactsDb.from(ct.booking_requests).select(
      "id, status, claimed_by_user_id, requester_user_id, requester_name, requester_phone, expires_at, pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address, vehicle_option, roam_mode, quote_token",
    )
      .eq("id", bookingRequestId).eq("claimed_by_user_id", auth.user.id).maybeSingle();
    if (!br || br.status !== "claimed") return c.json({ error: "invalid_booking_request" }, 400);
    if (new Date(String(br.expires_at)) <= new Date()) {
      return c.json({ error: "booking_request_expired" }, 410);
    }
    if (paymentMethod !== "card") {
      return c.json({ error: "roam_tag_digital_payment_required" }, 400);
    }
    insertRow.booking_request_id = bookingRequestId;
    if (br.requester_user_id) insertRow.passenger_user_id = br.requester_user_id;
    if (!insertRow.guest_passenger_name) {
      insertRow.guest_passenger_name = br.requester_name;
      insertRow.guest_passenger_phone = br.requester_phone;
    }
    if (br.pickup_lat != null && br.pickup_lng != null) {
      insertRow.pickup_lat = br.pickup_lat;
      insertRow.pickup_lng = br.pickup_lng;
      if (br.pickup_address) insertRow.pickup_address = br.pickup_address;
    }
    if (br.dropoff_lat != null && br.dropoff_lng != null) {
      insertRow.dropoff_lat = br.dropoff_lat;
      insertRow.dropoff_lng = br.dropoff_lng;
      if (br.dropoff_address) insertRow.dropoff_address = br.dropoff_address;
    }
    if (br.vehicle_option && typeof br.vehicle_option === "string") {
      insertRow.vehicle_option = br.vehicle_option;
    }
    if (br.roam_mode === "shadow_roam" || br.roam_mode === "open_roam") {
      insertRow.roam_mode = br.roam_mode;
    }
  }

  const explicitPassengerId = typeof body.passenger_user_id === "string" ? body.passenger_user_id : null;
  if (explicitPassengerId && !insertRow.passenger_user_id) {
    insertRow.passenger_user_id = explicitPassengerId;
  }

  const passengerAuthId = typeof body.passenger_authorization_id === "string"
    ? body.passenger_authorization_id
    : null;

  const isDelegatedCreate = Boolean(
    insertRow.guest_passenger_name ||
      insertRow.guest_passenger_phone ||
      insertRow.rider_contact_id ||
      insertRow.booking_request_id ||
      passengerAuthId,
  );

  if (isDelegatedCreate && !insertRow.passenger_user_id) {
    return c.json({
      error: "passenger_not_linked",
      message: "The passenger must authorize before matching can start.",
    }, 400);
  }

  if (passengerAuthId) {
    const { db: contactsDb, tables: ct } = await getRidesContactsDb();
    const { data: authRow } = await contactsDb.from(ct.passenger_authorizations)
      .select("*")
      .eq("id", passengerAuthId)
      .eq("booker_user_id", auth.user.id)
      .maybeSingle();
    if (!authRow || authRow.status !== "claimed") {
      return c.json({ error: "invalid_authorization" }, 400);
    }
    if (String(authRow.passenger_user_id) !== String(insertRow.passenger_user_id)) {
      return c.json({ error: "authorization_passenger_mismatch" }, 400);
    }
    if (new Date(String(authRow.expires_at)) <= new Date()) {
      return c.json({ error: "authorization_expired" }, 410);
    }
  }

  if (isDelegatedCreate && !isDigitalRidePayment(paymentMethod)) {
    return c.json({
      error: "delegated_digital_payment_required",
      message: "Book for others trips must be paid with a digital payment method.",
    }, 400);
  }

  let ride: Record<string, unknown> | null = null;
  const { data: rpcRide, error: rpcError } = await pubSvc().rpc("rides_create_ride_request", {
    p_row: insertRow,
  });
  if (!rpcRide && rpcError) {
    logLine({ event: "create_ride_rpc_failed", error: rpcError.message });
  }
  if (!rpcError && rpcRide) {
    ride = rpcRide as Record<string, unknown>;
  } else {
    const { data, error } = await db.from("ride_requests").insert(insertRow).select("*").single();
    ride = data;
    if (error || !ride) {
      logLine({
        event: "insert_ride_failed",
        error: error?.message,
        rpc_error: rpcError?.message,
      });
      return c.json({ error: "insert_failed" }, 500);
    }
  }

  const pinEnabled = isPinFeatureEnabled(bookDispatchSettings);
  if (pinEnabled && !ride.verification_pin) {
    const pin = generatePin();
    await patchRideRequest(ride.id as string, {
      verification_pin: pin,
      updated_at: new Date().toISOString(),
    });
    ride = { ...ride, verification_pin: pin };
  }

  const reqId = crypto.randomUUID();
  await audit(ride.id, auth.user.id, "ride_created", {
    request_id: reqId,
    cell_key: cellKey,
    fare_locked: locked.fare_estimate_minor,
  });
  await audit(ride.id, auth.user.id, "fare_locked", {
    fare_estimate_minor: locked.fare_estimate_minor,
    surge_multiplier: locked.surge_multiplier,
  });

  await startMatchingForRide(ride.id as string, ride, reqId);

  if (bookingRequestId) {
    await linkBookingRequestToRide(getRidesContactsDb, bookingRequestId, ride.id as string);
  }

  if (passengerAuthId && insertRow.passenger_user_id) {
    await consumePassengerAuthorization(
      passengerAuthId,
      auth.user.id,
      String(insertRow.passenger_user_id),
      ride.id as string,
    );
  }

  const freshRide = await loadRideRequestById(ride.id as string);
  let rideOut = freshRide ?? ride;
  if (pinEnabled && rideOut) {
    rideOut = await ensureRideVerificationPin(ride.id as string, rideOut, bookDispatchSettings);
  }

  logLine({ event: "ride_created", ride_id: ride.id, request_id: reqId });

  const passengerId = insertRow.passenger_user_id ? String(insertRow.passenger_user_id) : null;
  if (passengerId && passengerId !== auth.user.id) {
    const notifyRide = freshRide ?? ride;
    void notifyPassengerOfRideEvent(pubSvc(), notifyRide, "delegated_ride_booked", {
      guest_name: notifyRide.guest_passenger_name ?? "there",
      url: `${PASSENGER_APP_ORIGIN}/ride/${ride.id}`,
    }).catch((e) => logLine({ event: "delegated_ride_notify_failed", error: String(e) }));
  }

  return c.json({
    ride: rideOut,
    rider_pin:
      pinEnabled && rideOut && shouldExposeRiderPin(rideOut)
        ? normalizeVerificationPin(rideOut.verification_pin)
        : null,
  });
});

async function loadActiveRideForUser(userId: string): Promise<{
  ride: Record<string, unknown>;
  participant_role: "booker" | "passenger";
} | null> {
  return loadHubActiveRideForUser(svc(), pubSvc(), getRidesContactsDb, userId);
}

app.get("/v1/requests/me/active", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (deniesPassengerSurface(auth.user)) {
    return jsonEdgeForbidden(c, "forbidden_role");
  }

  const active = await loadActiveRideForUser(auth.user.id);
  if (c.req.query("summary") === "1") {
    if (!active) return c.json({ summary: null });
    const delegated = isDelegatedBooking(active.ride);
    if (active.participant_role === "booker" && !delegated) {
      return c.json({ summary: null });
    }
    if (active.ride.roam_mode === "shadow_roam" && active.participant_role === "booker") {
      return c.json({ summary: null });
    }
    return c.json({
      summary: {
        ride_id: String(active.ride.id),
        status: active.ride.status,
        guest_passenger_name:
          typeof active.ride.guest_passenger_name === "string"
            ? active.ride.guest_passenger_name
            : null,
        participant_role: active.participant_role,
        is_delegated: delegated,
        roam_mode: active.ride.roam_mode ?? null,
      },
    });
  }

  if (!active) return c.json({ ride: null, participant_role: null });

  let rideOut = active.ride;
  if (active.participant_role === "booker" && active.ride.roam_mode === "shadow_roam") {
    rideOut = sanitizeRideForShadowBooker(sanitizeRideForRider(active.ride))!;
  }

  return c.json({
    ride: rideOut,
    participant_role: active.participant_role,
    is_delegated: isDelegatedBooking(active.ride),
  });
});

app.get("/v1/requests/:id", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const id = c.req.param("id");
  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);
  const participantRole = getRideParticipantRole(ride, auth.user.id);
  const isDriver = participantRole === "driver";
  const isBooker = participantRole === "booker";
  const isPassenger = participantRole === "passenger";
  if (participantRole === "none") {
    return jsonEdgeForbidden(c, "forbidden");
  }
  const reqId = crypto.randomUUID();
  if (ride.status === "matching") {
    await reconcileMatching(id, reqId);
  }
  const fresh = await loadRideRequestById(id);
  const offers = await loadDriverOffersForRide(id);

  const settings = await loadDispatchSettingsForRides();
  let waitTimeInfo: Record<string, unknown> | null = null;
  let rideOut = fresh ?? ride;

  const pinPrepStatuses = ["driver_assigned", "driver_en_route_pickup", "driver_arrived_pickup"];
  let riderPin: string | null = null;
  const pinEligible = rideOut &&
    shouldExposePinToUser(rideOut, auth.user.id) &&
    isPinFeatureEnabled(settings);
  if (rideOut && pinEligible && pinPrepStatuses.includes(String(rideOut.status))) {
    rideOut = await ensureRideVerificationPin(id, rideOut, settings);
  }
  const exposePin = rideOut && pinEligible && shouldExposeRiderPin(rideOut);
  if (rideOut && exposePin) {
    riderPin = normalizeVerificationPin(rideOut.verification_pin);
    if (!riderPin) {
      const { data: pinRow } = await svc().from("ride_requests").select("verification_pin").eq("id", id)
        .maybeSingle();
      riderPin = normalizeVerificationPin(pinRow?.verification_pin);
      if (riderPin) rideOut = { ...rideOut, verification_pin: riderPin };
    }
  }

  const graceAnchor = rideOut ? getWaitTimeGraceAnchor(rideOut) : null;
  if (graceAnchor && shouldExposePickupWaitTime(String(rideOut?.status))) {
    waitTimeInfo = buildWaitTimeInfo(graceAnchor, settings, {
      surgeMultiplier: Number(rideOut?.surge_multiplier ?? 1),
    });
  }

  const rideForParticipant = rideOut ?? ride;
  const bookerVis = bookerVisibilityForRide(rideForParticipant, auth.user.id);
  let rideResponse = isDriver && rideOut
    ? sanitizeRideForDriver(rideOut, settings.pin_verification_required_for_start)
    : isBooker || isPassenger
      ? sanitizeRideForRider(rideOut)
      : rideOut;
  if (bookerVis === "shadow" && rideResponse) {
    rideResponse = sanitizeRideForShadowBooker(rideResponse);
  }

  let assignedDriver = null;
  const driverUserId = rideForParticipant.assigned_driver_user_id
    ? String(rideForParticipant.assigned_driver_user_id)
    : null;
  if (
    driverUserId &&
    bookerVis !== "shadow" &&
    (isBooker || isPassenger)
  ) {
    assignedDriver = await loadAssignedDriverSummary(pubSvc(), driverUserId);
  }

  return c.json({
    ride: rideResponse,
    offers: bookerVis === "shadow" ? [] : offers,
    wait_time: bookerVis === "shadow" ? null : waitTimeInfo,
    rider_pin: exposePin ? riderPin : null,
    participant_role: participantRole,
    can_chat: canChatOnRide(rideForParticipant, auth.user.id),
    can_cancel: canCancelRide(rideForParticipant, auth.user.id),
    is_delegated: isDelegatedBooking(rideForParticipant),
    pin_enabled: isPinFeatureEnabled(settings) && Boolean(shouldExposePinToUser(rideForParticipant, auth.user.id)),
    booker_visibility: bookerVis === "none" ? undefined : bookerVis,
    roam_mode: rideForParticipant.roam_mode ?? null,
    assigned_driver: assignedDriver,
  });
});

app.post("/v1/requests/:id/cancel", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (!canAccessRide(ride, auth.user.id)) return jsonEdgeForbidden(c, "forbidden");
  if (!canCancelRide(ride, auth.user.id)) {
    return c.json({ error: "cancel_not_allowed", message: "You cannot cancel this ride at its current stage." }, 403);
  }

  const terminal = ["completed", "cancelled"];
  if (terminal.includes(ride.status as string)) return c.json({ ride });

  const participantRole = getRideParticipantRole(ride, auth.user.id);
  const cancelReason = typeof body.reason === "string" ? body.reason : null;
  const cancelledBy = participantRole === "driver" ? "driver" as const : "rider" as const;
  const patched = await cancelRideRequestRow(id, cancelledBy, cancelReason);
  if (!patched) {
    return c.json({
      error: "update_failed",
      message:
        "Could not cancel ride. Run supabase/scripts/apply_rides_matching_writes.sql in the Supabase SQL editor, then redeploy the rides edge function.",
    }, 500);
  }

  await supersedePendingOffersForRide(id);

  const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
  await bumpSurgeDemand(cellKey, -1);
  const auditEvent = participantRole === "passenger" ? "ride_cancelled_passenger" : "ride_cancelled_rider";
  await audit(id, auth.user.id, auditEvent, { participant_role: participantRole });
  logLine({ event: auditEvent, ride_id: id, participant_role: participantRole });
  await handleTerminalRideLedgerAndSync(id);

  const fresh = await loadRideRequestById(id);
  return c.json({ ride: fresh });
});

// --- Driver ---
app.post("/v1/drivers/presence", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const body = await c.req.json().catch(() => ({}));
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return c.json({ error: "invalid_coordinates" }, 400);

  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const goingOnline = Boolean(body.available_for_rides ?? true);
  if (goingOnline) {
    const eligibility = await isDriverEligibleForDispatch(auth.user.id, dispatchSettings);
    if (!eligibility.eligible) {
      return c.json({ error: eligibility.reason ?? "not_eligible_for_dispatch" }, 403);
    }
  }

  let bodyTypeSlug: string | null = null;
  const explicit = typeof body.body_type_slug === "string"
    ? normalizePresenceBodyTypeSlug(body.body_type_slug)
    : null;
  bodyTypeSlug = await resolveDriverBodyTypeSlug(auth.user.id, explicit);

  if (bodyTypeSlug) {
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      const ok = await isActiveBodyTypeSlug(adminDb, tables.vehicle_types, bodyTypeSlug);
      if (!ok) bodyTypeSlug = null;
    } catch {
      const ok = await isActiveBodyTypeSlug(svc(), "vehicle_types", bodyTypeSlug);
      if (!ok) bodyTypeSlug = null;
    }
  }

  if (goingOnline && !bodyTypeSlug) {
    const mode = typeof body.dispatch_mode === "string" ? body.dispatch_mode.trim() : "";
    const surfaceMode = ridesUserSurfaceRole(auth.user) === "hauler" ? "haulage" : "rideshare";
    const effectiveMode = mode === "haulage" || mode === "rideshare" ? mode : surfaceMode;
    bodyTypeSlug = effectiveMode === "haulage" ? "cargo-van" : "sedan";
  }

  const headingRaw = body.heading_degrees != null ? Number(body.heading_degrees) : null;
  const headingDegrees = headingRaw != null && Number.isFinite(headingRaw) ? headingRaw : null;

  // Compute H3 cell for spatial indexing (Phase 4)
  let h3Cell: string | null = null;
  try {
    h3Cell = latLngToH3(lat, lng, 7); // Default resolution 7
  } catch {
    // H3 computation failed, proceed without it
  }

  const dispatchModeRaw = typeof body.dispatch_mode === "string"
    ? body.dispatch_mode.trim().toLowerCase()
    : "";
  const dispatchMode = dispatchModeRaw === "haulage" || dispatchModeRaw === "rideshare"
    ? dispatchModeRaw
    : (ridesUserSurfaceRole(auth.user) === "hauler" ? "haulage" : "rideshare");

  const upsert = {
    user_id: auth.user.id,
    lat,
    lng,
    heading_degrees: headingDegrees,
    available_for_rides: Boolean(body.available_for_rides ?? true),
    body_type_slug: bodyTypeSlug,
    h3_cell: h3Cell,
    dispatch_mode: dispatchMode,
    updated_at: new Date().toISOString(),
  };

  const { error: rpcError } = await pubSvc().rpc("rides_upsert_driver_presence", {
    p_user_id: upsert.user_id,
    p_lat: upsert.lat,
    p_lng: upsert.lng,
    p_heading_degrees: upsert.heading_degrees,
    p_available_for_rides: upsert.available_for_rides,
    p_body_type_slug: upsert.body_type_slug,
    p_h3_cell: upsert.h3_cell,
    p_dispatch_mode: upsert.dispatch_mode,
  });

  if (rpcError) {
    const { error: fallbackError } = await svc().from("driver_locations").upsert(upsert);
    if (fallbackError) {
      logLine({ event: "presence_failed", message: rpcError.message, fallback: fallbackError.message });
      return c.json({ error: "presence_failed", message: rpcError.message }, 500);
    }
  }

  logLine({ event: "driver_presence", user_id: auth.user.id, available: upsert.available_for_rides });
  return c.json({ ok: true });
});

app.get("/v1/drivers/offers", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const db = svc();
  const nowIso = new Date().toISOString();
  await expireDriverPendingOffers(auth.user.id, nowIso);

  const offers = await loadPendingDriverOffersForDriver(auth.user.id, nowIso);

  const rideIds = [...new Set(offers.map((o) => o.ride_request_id as string))];
  let ridesById: Record<string, Record<string, unknown>> = {};
  if (rideIds.length > 0) {
    const rides = await loadRideRequestsByIds(
      rideIds,
      "id, status, assigned_driver_user_id, pickup_address, dropoff_address, fare_estimate_minor, currency, distance_estimate_km, duration_estimate_minutes, vehicle_option, surge_multiplier, guest_passenger_name",
    );
    ridesById = Object.fromEntries(rides.map((r) => [r.id as string, r]));
  }

  const enriched = offers.map((o) => ({
    ...o,
    ride: ridesById[o.ride_request_id as string] ?? null,
  }));

  return c.json({ offers: enriched });
});

app.post("/v1/drivers/offers/:offerId/accept", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const offerId = c.req.param("offerId");
  const db = svc();
  const nowIso = new Date().toISOString();

  const offer = await loadDriverOfferById(offerId);
  if (!offer || offer.driver_user_id !== auth.user.id) return c.json({ error: "not_found" }, 404);
  if (offer.status !== "pending") return c.json({ error: "offer_not_pending" }, 409);
  if ((offer.expires_at as string) <= nowIso) {
    await patchDriverOfferRow(offerId, { status: "expired" });
    return c.json({ error: "offer_expired" }, 410);
  }

  const rideId = offer.ride_request_id as string;
  const ride = await loadRideRequestById(rideId);
  if (!ride || ride.status !== "matching") return c.json({ error: "ride_not_matching" }, 409);

  if (isDriverDebtDispatchGuardEnabled()) {
    const currency = String(ride.currency ?? "JMD");
    const openDebt = await getOpenDebtMinor(svc(), auth.user.id, currency);
    const threshold = driverDebtDispatchThresholdMinor();
    if (openDebt > threshold) {
      return c.json({
        error: "driver_debt_blocked",
        message: "Resolve open change debt before accepting new trips.",
        open_debt_minor: openDebt,
        threshold_minor: threshold,
      }, 409);
    }
  }

  // Use atomic accept RPC for race-free assignment
  const { data: atomicResult, error: atomicError } = await pubSvc().rpc("matching_accept_driver_offer", {
    p_offer_id: offerId,
    p_driver_user_id: auth.user.id,
  });

  let freshRide: Record<string, unknown> | null = null;
  let usedAtomicPath = false;

  if (!atomicError && atomicResult) {
    const result = atomicResult as { ok: boolean; error?: string; ride?: Record<string, unknown> };
    if (result.ok && result.ride) {
      freshRide = result.ride;
      usedAtomicPath = true;
      logLine({ event: "atomic_accept_success", ride_id: rideId, driver_id: auth.user.id });
    } else if (!result.ok) {
      const errorMap: Record<string, { error: string; status: number }> = {
        offer_not_found: { error: "not_found", status: 404 },
        offer_not_pending: { error: "offer_not_pending", status: 409 },
        offer_expired: { error: "offer_expired", status: 410 },
        ride_not_matching: { error: "ride_not_matching", status: 409 },
        assign_failed: { error: "assign_failed", status: 409 },
      };
      const mapped = errorMap[result.error ?? ""] ?? { error: result.error ?? "accept_failed", status: 409 };
      await audit(rideId, auth.user.id, "accept_race_lost", { offer_id: offerId, atomic_error: result.error });
      return c.json({ error: mapped.error }, mapped.status);
    }
  }

  if (!usedAtomicPath) {
    // Fallback to legacy path (atomic RPC failed or unavailable)
    if (atomicError) {
      logLine({ event: "atomic_accept_rpc_failed", offer_id: offerId, error: atomicError.message });
    }

    await patchDriverOfferRow(offerId, { status: "accepted" });
    await supersedePendingOffersForRide(rideId, offerId);
    await supersedeAllPendingOffersForDriver(auth.user.id);

    await patchRideRequest(rideId, {
      status: "driver_assigned",
      assigned_driver_user_id: auth.user.id,
      updated_at: nowIso,
    });

    freshRide = await loadRideRequestById(rideId);

    if (!freshRide || freshRide.status !== "driver_assigned") {
      await audit(rideId, auth.user.id, "accept_race_lost", { offer_id: offerId });
      return c.json({ error: "assign_failed" }, 409);
    }
  }

  await audit(rideId, auth.user.id, "offer_accepted", { offer_id: offerId, atomic: usedAtomicPath });
  logLine({ event: "offer_accepted", ride_id: rideId, driver_id: auth.user.id, atomic: usedAtomicPath });

  void notifyPassengerOfRideEvent(db, freshRide!, "driver_assigned", {
    url: `${PASSENGER_APP_ORIGIN}/ride/${rideId}`,
  }).catch((e) =>
    console.warn("[rides] passenger SMS driver_assigned failed:", e)
  );

  const settings = await loadDispatchSettingsForRides();
  const rideOut = await maybeAutoEnRouteOnAccept(
    transitionDeps(),
    settings,
    rideId,
    auth.user.id,
  );

  const enRouteRide = rideOut ?? freshRide;
  if (String(enRouteRide?.status) === "driver_en_route_pickup") {
    void maybeAutoShareWithTrustedContacts(
      { getContactsDb: getRidesContactsDb, requireUser, loadRideRequestById, audit },
      enRouteRide as Record<string, unknown>,
    ).catch((e) => console.warn("[rides] auto trip share failed:", e));
  }

  return c.json({
    ride: sanitizeRideForDriver(
      (rideOut ?? freshRide) as Record<string, unknown>,
      settings.pin_verification_required_for_start,
    ),
  });
});

app.post("/v1/drivers/offers/:offerId/decline", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const offerId = c.req.param("offerId");
  const db = svc();
  const offer = await loadDriverOfferById(offerId);
  if (!offer || offer.driver_user_id !== auth.user.id) return c.json({ error: "not_found" }, 404);

  await patchDriverOfferRow(offerId, { status: "declined" });

  await reconcileMatching(offer.ride_request_id as string);

  logLine({ event: "offer_declined", offer_id: offerId });
  return c.json({ ok: true });
});

app.get("/v1/drivers/me/trips", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));

  const result = await listDriverRideRequests(svc(), pubSvc(), {
    driverUserId: auth.user.id,
    page,
    limit,
  });

  if ("error" in result) {
    return c.json({ error: "list_failed", message: result.error }, 500);
  }

  return c.json(result);
});

app.get("/v1/drivers/me/active-ride", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const result = await getDriverActiveRideRequest(svc(), pubSvc(), auth.user.id);
  if ("error" in result) {
    return c.json({ error: "active_ride_failed", message: result.error }, 500);
  }

  const settings = await loadDispatchSettingsForRides();
  return c.json({
    ride: result
      ? sanitizeRideForDriver(
        result as Record<string, unknown>,
        settings.pin_verification_required_for_start,
      )
      : null,
  });
});

app.get("/v1/drivers/me/earnings", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const rawPeriod = (c.req.query("period") ?? "week").toLowerCase();
  const period: DriverEarningsPeriod = rawPeriod === "today" || rawPeriod === "all"
    ? rawPeriod
    : "week";

  const result = await aggregateDriverEarnings(svc(), pubSvc(), auth.user.id, period);
  if ("error" in result) {
    return c.json({ error: "earnings_failed", message: result.error }, 500);
  }

  return c.json(result);
});

function driverTransitions(): Record<RideStatus, RideStatus[]> {
  return driverTransitionsFor(isCashSettlementEnabled()) as Record<RideStatus, RideStatus[]>;
}

app.post("/v1/drivers/ride-location", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const body = await c.req.json().catch(() => ({}));
  const rideId = typeof body.ride_id === "string" ? body.ride_id : "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const clientSeq = Number(body.client_seq);
  if (!rideId || Number.isNaN(lat) || Number.isNaN(lng) || !Number.isFinite(clientSeq)) {
    return c.json({ error: "invalid_body" }, 400);
  }

  if (!rateLimit(`loc:${rideId}:${auth.user.id}`, 1, 2000)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const recordedAtRaw = typeof body.recorded_at === "string" ? body.recorded_at : new Date().toISOString();
  const recordedMs = Date.parse(recordedAtRaw);
  const nowMs = Date.now();
  if (!Number.isFinite(recordedMs) || recordedMs < nowMs - 60_000 || recordedMs > nowMs + 10_000) {
    return c.json({ error: "stale_location" }, 400);
  }

  const { data: rpcResult, error: rpcError } = await pubSvc().rpc("rides_insert_location_update", {
    p_ride_id: rideId,
    p_driver_user_id: auth.user.id,
    p_lat: lat,
    p_lng: lng,
    p_heading: body.heading_degrees != null ? Number(body.heading_degrees) : null,
    p_speed_mps: body.speed_mps != null ? Number(body.speed_mps) : null,
    p_accuracy_m: body.accuracy_m != null ? Number(body.accuracy_m) : null,
    p_recorded_at: new Date(recordedMs).toISOString(),
    p_client_seq: Math.trunc(clientSeq),
  });

  if (rpcError) {
    if (isMissingDbRpc(rpcError)) {
      return c.json({ error: "location_rpc_missing", message: rpcError.message }, 503);
    }
    return c.json({ error: "location_failed", message: rpcError.message }, 500);
  }

  const ingest = rpcResult as Record<string, unknown> | null;
  if (ingest && ingest.ok === false) {
    const err = String(ingest.error ?? "forbidden");
    const status = err === "not_found" ? 404 : err === "ride_not_active" ? 409 : 403;
    return c.json({ error: err }, status);
  }

  const ride = await loadRideRequestById(rideId);
  if (!ride) return c.json({ error: "not_found" }, 404);

  let geofenceResult = null;
  const settings = await loadDispatchSettingsForRides();
  const isDuplicateIngest = Boolean(ingest && ingest.duplicate === true);
  const dwellHeartbeat =
    isDuplicateIngest &&
    ride.status === "driver_en_route_pickup" &&
    Boolean(ride.wait_time_started_at);
  if ((ingest && !isDuplicateIngest) || dwellHeartbeat) {
    geofenceResult = await evaluateGeofenceTransitions(
      svc(),
      transitionDeps(),
      settings,
      ride,
      {
        lat,
        lng,
        speedMps: body.speed_mps != null ? Number(body.speed_mps) : null,
        accuracyM: body.accuracy_m != null ? Number(body.accuracy_m) : null,
        recordedAt: new Date(recordedMs).toISOString(),
      },
      auth.user.id,
    );
  }

  const freshRide = await loadRideRequestById(rideId);
  const liveBase = geofenceResult
    ? {
        distance_to_pickup_m: geofenceResult.distanceToPickupM,
        distance_to_dropoff_m: geofenceResult.distanceToDropoffM,
        transition_applied: geofenceResult.transitionApplied ?? null,
        complete_suggested: geofenceResult.completeSuggested ?? false,
      }
    : undefined;

  let live = liveBase;
  if (liveBase && geofenceResult?.tollsCrossed && geofenceResult.tollsCrossed.length > 0) {
    live = {
      ...liveBase,
      tolls_crossed: geofenceResult.tollsCrossed.map((t) => ({
        toll_plaza_id: t.toll_plaza_id,
        toll_plaza_name: t.toll_plaza_name,
        toll_amount_minor: t.toll_amount_minor,
      })),
      total_new_tolls_minor: geofenceResult.totalNewTollsMinor ?? 0,
      actual_tolls_minor: Number(freshRide?.actual_tolls_minor ?? 0),
    };
  }

  return c.json({
    ok: true,
    ride: sanitizeRideForDriver(freshRide, settings.pin_verification_required_for_start),
    live,
  });
});

app.get("/v1/requests/:id/live", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);

  const id = c.req.param("id");
  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);

  const role = ridesUserSurfaceRole(auth.user);
  const participantRole = getRideParticipantRole(ride, auth.user.id);
  const isDriver = participantRole === "driver";
  const isBooker = participantRole === "booker";
  const isPassenger = participantRole === "passenger";
  if (participantRole === "none" && role !== "admin") {
    return jsonEdgeForbidden(c, "forbidden");
  }

  if (!canShadowBookerAccessLive(ride, auth.user.id)) {
    return c.json({ error: "shadow_booker_live_forbidden" }, 403);
  }

  const driverLocation =
    ride.last_driver_lat != null && ride.last_driver_lng != null
      ? {
          lat: Number(ride.last_driver_lat),
          lng: Number(ride.last_driver_lng),
          heading: ride.last_driver_heading != null ? Number(ride.last_driver_heading) : null,
          updated_at: ride.last_driver_location_at ?? null,
        }
      : null;

  return c.json({
    ride: {
      id: ride.id,
      status: ride.status,
      pickup_lat: ride.pickup_lat,
      pickup_lng: ride.pickup_lng,
      dropoff_lat: ride.dropoff_lat,
      dropoff_lng: ride.dropoff_lng,
      route_polyline_encoded: ride.route_polyline_encoded ?? null,
      complete_suggested_at: ride.complete_suggested_at ?? null,
      last_driver_location_at: ride.last_driver_location_at ?? null,
    },
    driver_location: driverLocation,
  });
});

app.get("/v1/requests/:id/toll-crossings", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);

  const id = c.req.param("id");
  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);

  const role = ridesUserSurfaceRole(auth.user);
  const participantRole = getRideParticipantRole(ride, auth.user.id);
  if (participantRole === "none" && role !== "admin") {
    return jsonEdgeForbidden(c, "forbidden");
  }

  const { totalMinor, crossings } = await getTotalTollsForRide(svc(), id);
  return c.json({
    ride_id: id,
    actual_tolls_minor: totalMinor,
    crossings: crossings.map((x) => ({
      toll_plaza_id: x.toll_plaza_id,
      toll_plaza_name: x.toll_plaza_name,
      toll_amount_minor: x.toll_amount_minor,
      currency: x.currency,
      driver_lat: x.driver_lat,
      driver_lng: x.driver_lng,
    })),
  });
});

app.patch("/v1/requests/:id/driver-transition", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsHaulerOrDriverSurface(auth.user)) return jsonEdgeForbidden(c, "forbidden_role");

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const next = body.status as RideStatus;

  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (ride.assigned_driver_user_id !== auth.user.id) return jsonEdgeForbidden(c, "forbidden");

  const current = ride.status as RideStatus;
  if (!driverTransitions()[current]?.includes(next)) {
    return c.json({ error: "invalid_transition", current, next }, 400);
  }

  const settings = await loadDispatchSettingsForRides();

  const result = await applyRideTransition(transitionDeps(), {
    rideId: id,
    next,
    actorUserId: auth.user.id,
    source: "manual",
    expectedFrom: current,
    cancelReason: typeof body.reason === "string" ? body.reason : null,
    cancelledBy: next === "cancelled" ? "driver" : undefined,
    waitTimeSettings: next === "on_trip" ? {
      graceMinutes: settings.wait_time_grace_minutes,
      ratePerMinMinor: settings.wait_time_rate_per_min_minor,
      chargeEnabled: settings.wait_time_charge_enabled,
    } : undefined,
    pinSettings: (next === "on_trip" || next === "driver_arrived_pickup") ? {
      enabled: settings.pin_verification_enabled,
      requiredForStart: settings.pin_verification_required_for_start,
      providedPin: next === "on_trip" && typeof body.verification_pin === "string"
        ? body.verification_pin
        : undefined,
    } : undefined,
  });

  if (!result.ok) {
    if (result.error === "invalid_fare") {
      return c.json({ error: "invalid_fare", message: "Cannot complete ride without a valid fare" }, 400);
    }
    if (result.error?.startsWith("pin_")) {
      const pinError = result.error.replace("pin_", "");
      return c.json({ error: result.error, message: `PIN verification failed: ${pinError}`, pin_required: true }, 400);
    }
    if (result.error === "cash_settlement_required") {
      return c.json({
        error: "cash_settlement_required",
        message: "Use Collect payment to confirm cash before completing this trip",
        current: result.current,
      }, 400);
    }
    if (result.error === "status_changed") {
      return c.json({
        error: "status_changed",
        message: "This ride already moved to a new status. Refresh and try again.",
        current: result.current,
      }, 409);
    }
    return c.json({ error: result.error ?? "transition_failed", current: result.current }, 400);
  }

  logLine({ event: "driver_transition", ride_id: id, from: current, to: next, source: "manual" });

  if (next === "driver_arrived_pickup" && result.ride) {
    void notifyPassengerOfRideEvent(svc(), result.ride as Record<string, unknown>, "driver_arrived", {
      url: `${PASSENGER_APP_ORIGIN}/ride/${id}`,
    }).catch((e) =>
      console.warn("[rides] passenger SMS driver_arrived failed:", e)
    );
  }

  if (next === "driver_en_route_pickup" && result.ride) {
    void maybeAutoShareWithTrustedContacts(
      { getContactsDb: getRidesContactsDb, requireUser, loadRideRequestById, audit },
      result.ride as Record<string, unknown>,
    ).catch((e) => console.warn("[rides] auto trip share failed:", e));
  }

  return c.json({
    ride: sanitizeRideForDriver(
      result.ride as Record<string, unknown> | undefined ?? null,
      settings.pin_verification_required_for_start,
    ),
  });
});

app.post("/v1/internal/reconcile-matching", async (c) => {
  const secret = Deno.env.get("RIDES_CRON_SECRET");
  const token = c.req.header("X-Rides-Cron-Secret") ?? "";
  if (!secret || token !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let hygiene: Record<string, unknown> | null = null;
  const { data: hygieneData, error: hygieneErr } = await pubSvc().rpc("rides_run_matching_hygiene");
  if (!hygieneErr && hygieneData) {
    hygiene = hygieneData as Record<string, unknown>;
  } else if (hygieneErr) {
    logLine({ event: "matching_hygiene_rpc_skipped", error: hygieneErr.message });
  }

  const rideIds = await loadMatchingRideIds();
  let processed = 0;
  for (const rideId of rideIds) {
    await reconcileMatching(rideId);
    processed += 1;
  }

  logLine({ event: "reconcile_matching_batch", processed, hygiene });
  return c.json({ ok: true, processed, hygiene });
});

app.post("/v1/internal/reconcile-active-rides", async (c) => {
  const secret = Deno.env.get("RIDES_CRON_SECRET");
  const token = c.req.header("X-Rides-Cron-Secret") ?? "";
  if (!secret || token !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const settings = await loadDispatchSettingsForRides();
  const rideIds = await loadActiveRideIds();
  let noShowCancelled = 0;
  let staleAlerts = 0;
  const nowMs = Date.now();

  for (const rideId of rideIds) {
    const ride = await loadRideRequestById(rideId);
    if (!ride) continue;

    const lastLocMs = ride.last_driver_location_at
      ? Date.parse(String(ride.last_driver_location_at))
      : NaN;
    if (
      Number.isFinite(lastLocMs) &&
      nowMs - lastLocMs > 2 * 60 * 60 * 1000 &&
      ["driver_en_route_pickup", "driver_arrived_pickup", "on_trip"].includes(String(ride.status))
    ) {
      staleAlerts += 1;
      await audit(rideId, null, "ride_stale_location_alert", {
        last_driver_location_at: ride.last_driver_location_at,
        status: ride.status,
      });
    }

    if (
      settings.no_show_auto_cancel_enabled &&
      ride.status === "driver_arrived_pickup" &&
      ride.arrived_pickup_at
    ) {
      const arrivedMs = Date.parse(String(ride.arrived_pickup_at));
      const waitMin = (nowMs - arrivedMs) / 60_000;
      if (waitMin >= settings.no_show_cancel_minutes) {
        const tr = await applyRideTransition(transitionDeps(), {
          rideId,
          next: "cancelled",
          actorUserId: null,
          source: "system",
          expectedFrom: "driver_arrived_pickup",
          cancelReason: "rider_no_show",
          cancelledBy: "system",
        });
        if (tr.ok && !tr.skipped) noShowCancelled += 1;
      }
    }
  }

  logLine({ event: "reconcile_active_rides", rides: rideIds.length, noShowCancelled, staleAlerts });
  return c.json({ ok: true, rides: rideIds.length, no_show_cancelled: noShowCancelled, stale_alerts: staleAlerts });
});

async function loadRiderDisplayNameForChat(userId: string): Promise<string | null> {
  const { data } = await pubSvc().from("rider_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? null;
}

registerRideChatRoutes(app, {
  messageDb: pubSvc,
  loadRideRequestById,
  loadRiderDisplayName: loadRiderDisplayNameForChat,
  requireUser,
  audit,
});

registerContactsRoutes(app, { getContactsDb: getRidesContactsDb, requireUser, audit });
registerSavedPlacesRoutes(app, { getContactsDb: getRidesContactsDb, requireUser });
registerPassengerInviteRoutes(app, {
  getContactsDb: getRidesContactsDb,
  pubSvc,
  requireUser,
  loadRideRequestById,
  audit,
});
registerPassengerAuthorizationRoutes(app, {
  getContactsDb: getRidesContactsDb,
  requireUser,
  audit,
  rateLimit,
});
registerPickupLocationRequestRoutes(app, {
  getContactsDb: getRidesContactsDb,
  requireUser,
  audit,
  rateLimit,
});
registerRoamConnectionRoutes(app, {
  getContactsDb: getRidesContactsDb,
  requireUser,
  audit,
  rateLimit,
});
registerTripIntentRoutes(app, {
  getContactsDb: getRidesContactsDb,
  requireUser,
  audit,
  rideSvc: svc,
  quoteIntent: async (params) => {
    const db = svc();
    const fareRulesAccess = await resolveFareRulesDbForQuote();
    let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      dispatchSettings = await loadDispatchSettings(adminDb, tables);
    } catch { /* defaults */ }
    const quote = await buildFareQuote(db, {
      pickupLat: params.pickup_lat,
      pickupLng: params.pickup_lng,
      dropoffLat: params.dropoff_lat,
      dropoffLng: params.dropoff_lng,
      vehicleType: params.vehicle_option,
      readSurge: readSurgeMultiplier,
      dispatchSettings,
      fareRulesDb: fareRulesAccess.db,
      fareRulesTable: fareRulesAccess.fareRulesTable,
      vehicleTypesTable: fareRulesAccess.vehicleTypesTable,
      quoteTtlMs: params.quote_ttl_ms,
    });
    return {
      quote_token: quote.quoteToken,
      fare_estimate_minor: quote.fareEstimateMinor.toString(),
      currency: quote.currency,
    };
  },
  fulfillIntent: async ({ bookerUserId, intent, paymentMethod }) => {
    const intentCurrency = String(intent.currency ?? "JMD");
    const arrearsCheck = await isRiderArrearsBlocked(svc(), bookerUserId, paymentMethod, intentCurrency);
    if (arrearsCheck.blocked) {
      throw new Error(`rider_arrears_blocked:${arrearsCheck.arrearsMinor}:${intentCurrency}`);
    }

    let bookDispatchSettings = DEFAULT_DISPATCH_SETTINGS;
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      bookDispatchSettings = await loadDispatchSettings(adminDb, tables);
    } catch { /* defaults */ }
    const ride = await createRideFromTripIntent(
      {
        svc,
        pubSvc,
        loadRideRequestById,
        patchRideRequest,
        runMatchingWave,
        reconcileMatching,
        audit,
        gridCellKey,
        bumpSurgeDemand,
        cancelPriorMatchingRidesForRider,
        bookDispatchSettings,
        isPinFeatureEnabled,
        notifyPassengerBooked: (r) => {
          const passengerId = r.passenger_user_id ? String(r.passenger_user_id) : null;
          if (passengerId && passengerId !== bookerUserId) {
            void notifyPassengerOfRideEvent(pubSvc(), r, "delegated_ride_booked", {
              guest_name: r.guest_passenger_name ?? "there",
              url: `${PASSENGER_APP_ORIGIN}/ride/${r.id}`,
            }).catch(() => undefined);
          }
        },
      },
      bookerUserId,
      intent,
      paymentMethod,
    );
    return { ride };
  },
  cancelLinkedRide: async (rideId: string, requesterUserId: string) => {
    const ride = await loadRideRequestById(rideId);
    if (!ride) return { ok: true };
    if (String(ride.status) === "completed" || String(ride.status) === "cancelled") {
      return { ok: true };
    }
    if (!canCancelRide(ride, requesterUserId)) {
      return { ok: false, reason: "ride_not_cancellable" };
    }
    const patched = await cancelRideRequestRow(rideId, "rider", "requester_withdrew_trip");
    if (!patched) return { ok: false, reason: "cancel_failed" };
    await supersedePendingOffersForRide(rideId);
    const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
    await bumpSurgeDemand(cellKey, -1);
    await audit(rideId, requesterUserId, "ride_cancelled_passenger", { via: "trip_intent_withdraw" });
    await handleTerminalRideLedgerAndSync(rideId);
    return { ok: true };
  },
});

registerBookForOthersActivityRoutes(app, {
  svc,
  pubSvc,
  getContactsDb: getRidesContactsDb,
  requireUser,
});

registerPassengerActivityHistoryRoutes(app, {
  svc,
  pubSvc,
  getContactsDb: getRidesContactsDb,
  requireUser,
});

registerPassengerActivityUpcomingRoutes(app, {
  svc,
  pubSvc,
  getContactsDb: getRidesContactsDb,
  requireUser,
});

registerScheduledRidesRoutes(app, {
  svc,
  pubSvc,
  requireUser,
  ridesUserSurfaceRole,
  audit,
  readSurgeMultiplier,
  resolveFareRulesDbForQuote,
  getRidesAdminDb,
  loadRideRequestById,
  loadRideRequestByIdempotencyKey,
  patchRideRequest,
  cancelRideRequestRow,
  gridCellKey,
  bumpSurgeDemand,
  startMatchingForRide,
  clientIp,
  rateLimit,
});

registerHaulageRoutes(app, {
  svc,
  pubSvc,
  requireUser,
  readSurgeMultiplier,
  getRidesAdminDb,
  loadRideRequestByIdempotencyKey,
  cancelPriorMatchingRidesForRider,
  bumpSurgeDemand,
  startMatchingForRide,
  clientIp,
  rateLimit,
  audit,
});

registerCashSettlementRoutes(app, {
  svc,
  requireUser,
  ridesUserSurfaceRole,
  loadRideRequestById,
  patchRideRequest,
  handleTerminalRideLedgerAndSync,
  cleanupLiveState: async (rideId: string) => cleanupRideLiveState(svc(), rideId),
  audit,
  sanitizeRideForDriver,
  loadDispatchSettingsForRides,
});

app.get("/v1/wallet/transactions", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (!allowsPassengerSurface(auth.user)) {
    return jsonEdgeForbidden(c, "forbidden_role");
  }
  if (isCashSettlementEnabled() && c.req.query("legacy") !== "1") {
    const currency = c.req.query("currency")?.trim() || "JMD";
    if (isCashSettlementV2Enabled()) {
      try {
        const { repairIncompleteCashSettlementsForRider } = await import(
          "./cashSettlement/repairIncompleteSettlement.ts"
        );
        const { repairMissingCardTripSettlementsForRider } = await import(
          "./cashSettlement/processCardTripSettlement.ts"
        );
        await repairIncompleteCashSettlementsForRider(svc(), auth.user.id, currency);
        await repairMissingCardTripSettlementsForRider(svc(), auth.user.id, currency);
      } catch (e) {
        console.error("[cashSettlement] rider_repair_on_transactions_failed", e);
      }
    }
    const { listRiderWalletTransactions, riderWalletTransactionToDto } = await import(
      "./cashSettlement/riderWalletTransactions.ts"
    );
    const rows = await listRiderWalletTransactions(svc(), auth.user.id, currency);
    const transactions = rows.map(riderWalletTransactionToDto);
    return c.json({ transactions });
  }
  const db = svc();
  const { data: rides } = await db.from("ride_requests")
    .select("id, status, roam_mode, fare_estimate_minor, currency, created_at, updated_at, guest_passenger_name, rider_user_id")
    .eq("rider_user_id", auth.user.id)
    .in("status", ["completed", "cancelled", "on_trip", "matching", "driver_assigned", "driver_en_route_pickup", "driver_arrived_pickup"])
    .order("created_at", { ascending: false })
    .limit(50);
  const transactions = (rides ?? []).map((r: Record<string, unknown>) => {
    const isShadow = r.roam_mode === "shadow_roam";
    const passengerName = typeof r.guest_passenger_name === "string"
      ? r.guest_passenger_name.trim()
      : "";
    const shadowTitle = passengerName ? `Trip for ${passengerName}` : "Shadow trip";
    const amount = r.fare_estimate_minor != null ? `-${r.fare_estimate_minor}` : "0";
    return {
      id: String(r.id),
      kind: isShadow ? "shadow_trip" : "open_trip",
      title: isShadow ? shadowTitle : `Ride for ${r.guest_passenger_name ?? "passenger"}`,
      amount_minor: String(amount).replace(/^-/, ""),
      currency: r.currency ?? "JMD",
      date: r.updated_at ?? r.created_at,
      meta: String(r.status).toUpperCase(),
      ride_id: r.id,
      pickup_at: r.created_at,
      dropoff_at: r.status === "completed" ? r.updated_at : null,
    };
  });
  return c.json({ transactions });
});

registerBookingRequestRoutes(app, { getContactsDb: getRidesContactsDb, requireUser, audit });
registerRoamPassengerTagRoutes(app, { getContactsDb: getRidesContactsDb, requireUser });
registerPassengerProfileRoutes(app, { requireUser });
registerTripShareRoutes(app, {
  getContactsDb: getRidesContactsDb,
  requireUser,
  loadRideRequestById,
  audit,
});

registerAdminRoutes(app, { logLine });

app.onError((err, c) => {
  logLine({ event: "unhandled_error", message: err.message, path: c.req.path });
  return c.json({ error: "internal_error", message: err.message }, 500);
});

Deno.serve(app.fetch);
