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

  if (driverIds && Array.isArray(driverIds) && driverIds.length > 0) {
    const orParts: string[] = [];
    for (const id of driverIds) {
      orParts.push(`value->>driverId.eq.${id}`);
      const idTerm = String(id).includes("%") ? String(id) : `%${id}%`;
      orParts.push(`value->>driverName.ilike.${idTerm.replace(/,/g, "")}`);
    }
    if (driverName) {
      const nameTerm = String(driverName).includes("%") ? String(driverName) : `%${driverName}%`;
      const safe = nameTerm.replace(/,/g, "");
      orParts.push(`value->>driverName.ilike.${safe}`);
      orParts.push(`value->>driverId.ilike.${safe}`);
    }
    query = query.or(orParts.join(","));
  } else if (driverId) {
    if (driverName) {
      const nameTerm = String(driverName).includes("%") ? String(driverName) : `%${driverName}%`;
      const safe = nameTerm.replace(/,/g, "");
      query = query.or(`value->>driverId.eq.${driverId},value->>driverName.ilike.${safe}`);
    } else {
      query = query.eq("value->>driverId", driverId);
    }
  } else if (driverName) {
    const raw = String(driverName).trim();
    const term = raw.includes("%") ? raw : `%${raw}%`;
    const safe = term.replace(/,/g, "");
    query = query.or(
      `value->>driverName.ilike.${safe},value->>id.ilike.${safe},legacy_kv_id.ilike.${safe}`,
    );
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

/** Snapshot of filter predicates for parity tests (R-02). */
export function describeTripFilters(body: TripFilterBody, ctx: TripFilterCtx): string[] {
  const calls: string[] = [];
  const fake = {
    eq: (a: string, b: unknown) => {
      calls.push(`eq:${a}=${b}`);
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
