/**
 * Shared trip filter application for /trips/search, /trips/stats, /trips/export (R-02).
 * Canonical behavior matches /trips/search (Processing expand + date clear).
 */

export type TripFilterBody = {
  driverId?: string;
  driverName?: string;
  driverIds?: string[];
  startDate?: string;
  endDate?: string;
  status?: string;
  platform?: string;
  vehicleId?: string;
  anchorPeriodId?: string;
  serviceLine?: string;
  /** Set when a name search matched no driver. The list must come back empty. */
  driverFilterMiss?: boolean;
};

export type TripFilterCtx = {
  effectiveOrgId?: string | null;
  useStrict: boolean;
};

/**
 * Apply org + domain filters to a PostgREST kv_store query (key like trip:%).
 * May clear startDate/endDate when status === Processing.
 */
export function applyTripFilters(
  query: any,
  body: TripFilterBody,
  ctx: TripFilterCtx,
): { query: any; startDate?: string; endDate?: string; empty?: boolean } {
  let { startDate, endDate } = body;
  const {
    driverId,
    driverName,
    driverIds,
    status,
    platform,
    vehicleId,
    anchorPeriodId,
    serviceLine,
  } = body;
  const { effectiveOrgId, useStrict } = ctx;

  if (effectiveOrgId) {
    if (useStrict) {
      query = query.eq("value->>organizationId", effectiveOrgId);
    } else {
      query = query.or(
        `value->>organizationId.eq.${effectiveOrgId},value->>organizationId.is.null`,
      );
    }
  } else if (useStrict) {
    return { query, startDate, endDate, empty: true };
  }

  if (body.driverFilterMiss) {
    return { query, startDate, endDate, empty: true };
  }

  // Driver id hits the typed column. Name search is resolved to those ids
  // before this runs (fleet.drivers.name), so the list is not a JSON or/ilike.
  if (driverIds && Array.isArray(driverIds) && driverIds.length > 0) {
    query = query.in("value->>driverId", driverIds);
  } else if (driverId) {
    query = query.eq("value->>driverId", driverId);
  } else if (driverName) {
    return { query, startDate, endDate, empty: true };
  }

  if (anchorPeriodId) {
    query = query.eq("value->>anchorPeriodId", anchorPeriodId);
  }

  if (status === "Processing") {
    query = query.or(
      `value->>status.eq.Processing,value->>status.eq.In Progress,value->>status.eq.In_Progress,value->>status.eq.started`,
    );
    startDate = undefined;
    endDate = undefined;
  } else if (status) {
    query = query.eq("value->>status", status);
  }

  if (platform) {
    if (platform === "Roam") {
      query = query.or("value->>platform.eq.Roam,value->>platform.eq.GoRide");
    } else {
      query = query.eq("value->>platform", platform);
    }
  }

  if (vehicleId) {
    query = query.eq("value->>vehicleId", vehicleId);
  }

  if (serviceLine === "rush_delivery") {
    query = query.or(
      "value->>serviceLine.eq.rush_delivery,value->>service_line.eq.rush_delivery,value->>platform.eq.Roam Rush",
    );
  } else if (serviceLine === "rideshare") {
    query = query.or("value->>platform.is.null,value->>platform.neq.Roam Rush");
  }

  if (startDate) {
    query = query.gte("value->>date", String(startDate).slice(0, 10));
  }
  if (endDate) {
    query = query.lte("value->>date", String(endDate).slice(0, 10));
  }

  return { query, startDate, endDate };
}

/** Turn a typed name into driver ids on fleet.drivers so trip search does not ilike JSON. */
export async function resolveTripDriverFilter(body: TripFilterBody): Promise<TripFilterBody> {
  const name = String(body.driverName || "").trim();
  if (!name) return body;
  const { fleetDb } = await import("./repos/baseRepo.ts");
  const term = (name.includes("%") ? name : `%${name}%`).replace(/,/g, "");
  const { data, error } = await fleetDb()
    .from("fleet_drivers")
    .select("id")
    .ilike("name", term)
    .limit(500);
  if (error) throw new Error(error.message);
  const fromName = (data || [])
    .map((row: { id: string }) => String(row.id || ""))
    .filter(Boolean);
  const explicit = [
    ...(body.driverId ? [String(body.driverId)] : []),
    ...((body.driverIds || []).map((id) => String(id))),
  ].filter(Boolean);
  const merged = [...new Set([...explicit, ...fromName])];
  if (merged.length === 0) {
    return {
      ...body,
      driverName: undefined,
      driverId: undefined,
      driverIds: undefined,
      driverFilterMiss: true,
    };
  }
  return {
    ...body,
    driverName: undefined,
    driverId: undefined,
    driverIds: merged,
  };
}

/** Snapshot of filter predicates for parity tests (R-02). */
export function describeTripFilters(body: TripFilterBody, ctx: TripFilterCtx): string[] {
  const calls: string[] = [];
  const fake = {
    eq: (a: string, b: unknown) => {
      calls.push(`eq:${a}=${b}`);
      return fake;
    },
    in: (a: string, b: unknown) => {
      const list = Array.isArray(b) ? b.join(",") : String(b);
      calls.push(`in:${a}=${list}`);
      return fake;
    },
    or: (v: string) => {
      calls.push(`or:${v}`);
      return fake;
    },
    gte: (a: string, b: unknown) => {
      calls.push(`gte:${a}=${b}`);
      return fake;
    },
    lte: (a: string, b: unknown) => {
      calls.push(`lte:${a}=${b}`);
      return fake;
    },
  };
  applyTripFilters(fake, { ...body }, ctx);
  return calls;
}
