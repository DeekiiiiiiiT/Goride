import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOrFilterSegment,
  buildTripSearchOrClause,
  isMappedOrExpression,
  postgrestOrColRef,
  wildcardSearchTerm,
} from "./fleet_sql_bridge_filters.ts";

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
