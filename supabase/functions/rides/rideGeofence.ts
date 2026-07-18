/**
 * Server-side geofence evaluation for in-trip automation.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { distanceMeters, isInsideGeofence, type LatLng } from "../_shared/geo.ts";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";
import {
  applyRideTransition,
  type ApplyTransitionDeps,
  type RideStatus,
} from "./rideLifecycle.ts";
import {
  evaluateTollCrossings,
  recordTollCrossings,
  loadCrossedTollIds,
  loadRecentlyCrossedAt,
  type TollCrossingRecord,
} from "./fare/tollGeofence.ts";
import {
  brainEvaluatePoint,
  brainRecordCrossings,
  isRidesTollBrainEnabled,
} from "./fare/tollBrainClient.ts";

export interface LocationFix {
  lat: number;
  lng: number;
  speedMps?: number | null;
  accuracyM?: number | null;
  recordedAt: string;
}

export interface GeofenceEvalResult {
  transitionApplied?: RideStatus;
  completeSuggested?: boolean;
  distanceToPickupM?: number;
  distanceToDropoffM?: number;
  tollsCrossed?: TollCrossingRecord[];
  totalNewTollsMinor?: number;
}

const TELEPORT_THRESHOLD_M = 500;

async function loadLiveState(db: SupabaseClient, rideId: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("ride_live_state").select("*").eq("ride_request_id", rideId).maybeSingle();
  return (data ?? {}) as Record<string, unknown>;
}

async function upsertLiveState(
  db: SupabaseClient,
  rideId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const row = { ride_request_id: rideId, updated_at: new Date().toISOString(), ...patch };
  await db.from("ride_live_state").upsert(row, { onConflict: "ride_request_id" });
}

function speedOk(speedMps: number | null | undefined, maxSpeed: number): boolean {
  if (speedMps == null || !Number.isFinite(speedMps)) return true;
  return speedMps <= maxSpeed;
}

function accuracyOk(accuracyM: number | null | undefined, maxAccuracy: number): boolean {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return true;
  return accuracyM <= maxAccuracy;
}

function detectTeleport(
  prev: LatLng | null,
  fix: LatLng,
  intervalSec = 5,
): boolean {
  if (!prev) return false;
  const d = distanceMeters(prev, fix);
  return d > TELEPORT_THRESHOLD_M && intervalSec <= 10;
}

export async function evaluateGeofenceTransitions(
  db: SupabaseClient,
  deps: ApplyTransitionDeps,
  settings: DispatchSettings,
  ride: Record<string, unknown>,
  fix: LocationFix,
  driverUserId: string,
): Promise<GeofenceEvalResult> {
  const rideId = String(ride.id);
  const status = ride.status as RideStatus;
  const point: LatLng = { lat: fix.lat, lng: fix.lng };
  const pickup: LatLng = { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) };
  const dropoff: LatLng = { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) };

  const distPickup = distanceMeters(point, pickup);
  const distDropoff = distanceMeters(point, dropoff);

  const live = await loadLiveState(db, rideId);
  const prevPoint: LatLng | null =
    live.last_lat != null && live.last_lng != null
      ? { lat: Number(live.last_lat), lng: Number(live.last_lng) }
      : null;

  if (detectTeleport(prevPoint, point)) {
    await upsertLiveState(db, rideId, {
      last_lat: fix.lat,
      last_lng: fix.lng,
      last_speed_mps: fix.speedMps ?? null,
      last_accuracy_m: fix.accuracyM ?? null,
    });
    return { distanceToPickupM: distPickup, distanceToDropoffM: distDropoff };
  }

  const nowMs = Date.parse(fix.recordedAt) || Date.now();
  const result: GeofenceEvalResult = {
    distanceToPickupM: distPickup,
    distanceToDropoffM: distDropoff,
  };

  const pickupStatusActive =
    status === "driver_en_route_pickup" || status === "driver_assigned";

  const pickupArriveStrict =
    settings.auto_arrive_enabled &&
    pickupStatusActive &&
    accuracyOk(fix.accuracyM, settings.gps_max_accuracy_m_for_arrival) &&
    speedOk(fix.speedMps, settings.max_speed_mps_for_arrival);

  const dwellInProgress = Boolean(ride.wait_time_started_at) ||
    Boolean(live.pickup_dwell_started_at);

  /** After pickup zone entry, keep counting dwell even if speed/accuracy briefly fail. */
  const pickupDwellContinue =
    settings.auto_arrive_enabled &&
    status === "driver_en_route_pickup" &&
    dwellInProgress;

  const pickupGeofenceActive = pickupArriveStrict || pickupDwellContinue;

  if (pickupGeofenceActive) {
    let arriveStatus = status;

    if (arriveStatus === "driver_assigned" && pickupArriveStrict) {
      const enRouteTr = await applyRideTransition(deps, {
        rideId,
        next: "driver_en_route_pickup",
        actorUserId: driverUserId,
        source: "geofence",
        expectedFrom: "driver_assigned",
      });
      if (enRouteTr.ok && !enRouteTr.skipped) {
        arriveStatus = "driver_en_route_pickup";
        ride.status = arriveStatus;
      } else {
        return result;
      }
    }

    const accuracyForInside = pickupDwellContinue && !pickupArriveStrict
      ? Math.min(fix.accuracyM ?? 0, settings.gps_max_accuracy_m_for_arrival)
      : (fix.accuracyM ?? 0);

    const inside = isInsideGeofence(
      point,
      pickup,
      settings.pickup_geofence_radius_m,
      accuracyForInside,
    );
    let dwellStart = live.pickup_dwell_started_at
      ? Date.parse(String(live.pickup_dwell_started_at))
      : null;
    if (!dwellStart && ride.wait_time_started_at) {
      dwellStart = Date.parse(String(ride.wait_time_started_at));
    }

    const canEnterDwell =
      arriveStatus === "driver_en_route_pickup" &&
      inside.isInside &&
      (pickupArriveStrict || pickupDwellContinue);

    if (canEnterDwell) {
      const hadDwellStart = dwellStart != null && Number.isFinite(dwellStart);
      const isFirstEntry = !hadDwellStart;
      if (!hadDwellStart) dwellStart = nowMs;

      if (isFirstEntry && !ride.wait_time_started_at && pickupArriveStrict) {
        const graceStartedIso = new Date(dwellStart).toISOString();
        await deps.patchRideRequest(rideId, {
          wait_time_started_at: graceStartedIso,
          updated_at: new Date().toISOString(),
        });
        ride.wait_time_started_at = graceStartedIso;
      }

      const dwellSec = (nowMs - dwellStart) / 1000;
      if (dwellSec >= settings.arrival_dwell_seconds) {
        const tr = await applyRideTransition(deps, {
          rideId,
          next: "driver_arrived_pickup",
          actorUserId: driverUserId,
          source: "geofence",
          expectedFrom: "driver_en_route_pickup",
          pinSettings: {
            enabled: settings.pin_verification_enabled,
            requiredForStart: settings.pin_verification_required_for_start,
          },
        });
        if (tr.ok && !tr.skipped) {
          result.transitionApplied = "driver_arrived_pickup";
          await upsertLiveState(db, rideId, {
            pickup_dwell_started_at: null,
            dropoff_dwell_started_at: null,
            distance_to_target_m: distDropoff,
            target: "dropoff",
            last_lat: fix.lat,
            last_lng: fix.lng,
            last_speed_mps: fix.speedMps ?? null,
            last_accuracy_m: fix.accuracyM ?? null,
          });
          return result;
        }
      }
      await upsertLiveState(db, rideId, {
        pickup_dwell_started_at: new Date(dwellStart).toISOString(),
        distance_to_target_m: inside.distanceM,
        target: "pickup",
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_speed_mps: fix.speedMps ?? null,
        last_accuracy_m: fix.accuracyM ?? null,
      });
    } else if (arriveStatus === "driver_en_route_pickup") {
      const clearDwell =
        !inside.isInside && inside.distanceM > inside.effectiveRadiusM * 1.75;
      await upsertLiveState(db, rideId, {
        pickup_dwell_started_at: clearDwell
          ? null
          : dwellStart && Number.isFinite(dwellStart)
          ? new Date(dwellStart).toISOString()
          : null,
        distance_to_target_m: inside.distanceM,
        target: "pickup",
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_speed_mps: fix.speedMps ?? null,
        last_accuracy_m: fix.accuracyM ?? null,
      });
    }
  }

  // Detect on-trip always; en route to pickup only when enabled (deadhead tolls).
  const tollDetectStatus =
    status === "on_trip" ||
    (settings.toll_detect_enroute && status === "driver_en_route_pickup");
  if (settings.toll_detection_enabled && tollDetectStatus) {
    // Cooldown-based de-dup lets genuine round trips through while preventing
    // dwell double-counting. Prefer Toll Brain when RIDES_USE_TOLL_BRAIN=1.
    const [crossedTollIds, recentByPlaza] = await Promise.all([
      loadCrossedTollIds(db, rideId),
      loadRecentlyCrossedAt(db, rideId),
    ]);
    const recentObj: Record<string, number> = {};
    for (const [k, v] of recentByPlaza.entries()) recentObj[k] = v;

    let tollResult: { tollsCrossed: TollCrossingRecord[]; totalTollsMinor: number };
    if (isRidesTollBrainEnabled()) {
      const brain = await brainEvaluatePoint({
        lat: fix.lat,
        lng: fix.lng,
        geofenceRadiusM: settings.toll_geofence_radius_m,
        alreadyCrossedPlazaIds: [...crossedTollIds],
        recentByPlaza: recentObj,
      });
      tollResult = brain ?? await evaluateTollCrossings(
        db,
        fix.lat,
        fix.lng,
        settings.toll_geofence_radius_m,
        crossedTollIds,
        { recentByPlaza },
      );
    } else {
      tollResult = await evaluateTollCrossings(
        db,
        fix.lat,
        fix.lng,
        settings.toll_geofence_radius_m,
        crossedTollIds,
        { recentByPlaza },
      );
    }
    if (tollResult.tollsCrossed.length > 0) {
      let recorded = 0;
      let total = 0;
      if (isRidesTollBrainEnabled()) {
        const brainRec = await brainRecordCrossings({
          rideRequestId: rideId,
          crossings: tollResult.tollsCrossed,
          driverId: driverUserId,
          vehicleId: ride.vehicle_id ? String(ride.vehicle_id) : null,
        });
        if (brainRec) {
          recorded = brainRec.recorded;
          total = brainRec.total;
        }
      }
      if (recorded === 0) {
        const local = await recordTollCrossings(db, rideId, tollResult.tollsCrossed);
        recorded = local.recorded;
        total = local.total;
        if (recorded > 0) {
          const currentTolls = Number(ride.actual_tolls_minor ?? 0);
          await deps.patchRideRequest(rideId, {
            actual_tolls_minor: currentTolls + total,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        // Brain already bumped actual_tolls_minor + optional live ledger
        result.tollsCrossed = tollResult.tollsCrossed;
        result.totalNewTollsMinor = total;
      }
      if (recorded > 0 && !result.tollsCrossed) {
        result.tollsCrossed = tollResult.tollsCrossed;
        result.totalNewTollsMinor = total;
      }
    }
  }

  if (
    settings.auto_complete_suggest_enabled &&
    status === "on_trip" &&
    speedOk(fix.speedMps, settings.max_speed_mps_for_arrival)
  ) {
    const inside = isInsideGeofence(
      point,
      dropoff,
      settings.dropoff_geofence_radius_m,
      fix.accuracyM ?? 0,
    );
    let dwellStart = live.dropoff_dwell_started_at
      ? Date.parse(String(live.dropoff_dwell_started_at))
      : null;

    if (inside.isInside) {
      if (!dwellStart) dwellStart = nowMs;
      const dwellSec = (nowMs - dwellStart) / 1000;
      if (dwellSec >= settings.arrival_dwell_seconds) {
        const patchData: Record<string, unknown> = {
          complete_suggested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (!ride.dropoff_arrived_at) {
          patchData.dropoff_arrived_at = new Date().toISOString();
        }
        await deps.patchRideRequest(rideId, patchData);
        result.completeSuggested = true;
      }
      await upsertLiveState(db, rideId, {
        dropoff_dwell_started_at: dwellStart ? new Date(dwellStart).toISOString() : null,
        distance_to_target_m: inside.distanceM,
        target: "dropoff",
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_speed_mps: fix.speedMps ?? null,
        last_accuracy_m: fix.accuracyM ?? null,
      });
    } else {
      await upsertLiveState(db, rideId, {
        dropoff_dwell_started_at: null,
        distance_to_target_m: inside.distanceM,
        target: "dropoff",
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_speed_mps: fix.speedMps ?? null,
        last_accuracy_m: fix.accuracyM ?? null,
      });
    }
  }

  if (!result.transitionApplied && status !== "on_trip") {
    await upsertLiveState(db, rideId, {
      last_lat: fix.lat,
      last_lng: fix.lng,
      last_speed_mps: fix.speedMps ?? null,
      last_accuracy_m: fix.accuracyM ?? null,
      distance_to_target_m: status === "driver_arrived_pickup" ? distPickup : distPickup,
      target: status === "driver_en_route_pickup" || status === "driver_assigned" ? "pickup" : "dropoff",
    });
  }

  return result;
}

export async function cleanupRideLiveState(db: SupabaseClient, rideId: string): Promise<void> {
  await db.from("ride_live_state").delete().eq("ride_request_id", rideId);
}
