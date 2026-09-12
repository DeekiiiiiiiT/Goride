import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOrFilterSegment,
  buildTripSearchOrClause,
  isMappedOrExpression,
  postgrestOrColRef,
  resolveMappedOrFilter,
  wildcardSearchTerm,
} from "./fleet_sql_bridge_filters.ts";
import { executeMapped } from "./fleet_sql_bridge.ts";
import type { FleetQueryFilter } from "./repos/baseRepo.ts";

Deno.test("wildcardSearchTerm adds % when missing", () => {
  assertEquals(wildcardSearchTerm("alice"), "%alice%");
  assertEquals(wildcardSearchTerm("%alice%"), "%alice%");
});

Deno.test("buildTripSearchOrClause covers name + id + legacy key", () => {
  const clause = buildTripSearchOrClause("Dee");
  assertEquals(clause.includes("value->>driverName.ilike.%Dee%"), true);
  assertEquals(clause.includes("value->>id.ilike.%Dee%"), true);
  assertEquals(clause.includes("legacy_kv_id.ilike.%Dee%"), true);
});

Deno.test("postgrestOrColRef never quotes JSON paths", () => {
  assertEquals(postgrestOrColRef("payload_json->>driverName"), "payload_json->>driverName");
  assertEquals(
    buildOrFilterSegment("payload_json->>driverName", "ilike", "%Dee%"),
    "payload_json->>driverName.ilike.%Dee%",
  );
  assertEquals(buildOrFilterSegment("id", "ilike", "%abc%"), "id.ilike.%abc%");
  assertEquals(buildOrFilterSegment("legacy_kv_id", "ilike", "%abc%"), "legacy_kv_id.ilike.%abc%");
});

Deno.test("resolveMappedOrFilter emits unquoted search + rideshare filters (N-13)", () => {
  const search = resolveMappedOrFilter(
    "value->>driverName.ilike.%Kenny%,value->>id.ilike.%Kenny%,legacy_kv_id.ilike.%Kenny%",
  );
  assertEquals(search?.op, "or");
  assertEquals(String(search?.value).includes("payload_json->>driverName.ilike.%Kenny%"), true);
  assertEquals(String(search?.value).includes('"payload_json'), false);

  const rideshare = resolveMappedOrFilter(
    "value->>platform.is.null,value->>platform.neq.Roam Rush",
  );
  assertEquals(rideshare, { op: "or", value: "platform.is.null,platform.neq.Roam Rush" });
});

Deno.test("production or() shapes are mapped", () => {
  assertEquals(isMappedOrExpression("value->>organizationId.eq.org1,value->>organizationId.is.null"), true);
  assertEquals(
    isMappedOrExpression(
      "value->>status.eq.Processing,value->>status.eq.In Progress,value->>status.eq.started",
    ),
    true,
  );
  assertEquals(
    isMappedOrExpression("value->>platform.eq.Roam,value->>platform.eq.GoRide"),
    true,
  );
  assertEquals(
    isMappedOrExpression(
      "value->>driverName.ilike.%x%,value->>id.ilike.%x%,legacy_kv_id.ilike.%x%",
    ),
    true,
  );
  assertEquals(isMappedOrExpression("totally.unknown.filter"), false);
});

/** N-13: real executeMapped path — stub queryFleet, assert emitted filters. */
Deno.test("executeMapped emits rideshare null-inclusive platform filter (N-13)", async () => {
  let captured: FleetQueryFilter[] | undefined;
  const stubQueryFleet: typeof import("./repos/baseRepo.ts").queryFleet = async (_domain, opts = {}) => {
    captured = opts.filters;
    return { data: [], error: null, count: 0 };
  };

  const res = await executeMapped(
    [
      { method: "select", args: ["value"] },
      { method: "like", args: ["key", "trip:%"] },
      { method: "or", args: ["value->>platform.is.null,value->>platform.neq.Roam Rush"] },
    ],
    { queryFleet: stubQueryFleet },
  );

  assertEquals(res.error, null);
  assertEquals(captured, [{ op: "or", value: "platform.is.null,platform.neq.Roam Rush" }]);
});
