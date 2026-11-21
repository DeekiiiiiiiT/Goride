/**
 * Slice A server — positions, scheme enrichment, find-parts fit, feature flag wiring.
 */
import { assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  mapApiLineToDb,
  mapSaveWorkOrderError,
  loadWorkOrderLinesForRpc,
  loadJobMetaForLines,
  mapDbLineToApi,
} from "./service_items_save.ts";
import {
  buildPartsSourcingInsert,
  fitFieldsForPartsRequest,
} from "./parts_sourcing_request_build.ts";
import { FEATURE_FLAGS } from "./feature_flags.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const JOB_A = "11111111-1111-4111-8111-111111111111";
const JOB_B = "22222222-2222-4222-8222-222222222222";
const WO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function catalogClient(platformId = "plat-1") {
  return {
    from(table: string) {
      if (table !== "vehicle_catalog") throw new Error(table);
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: () => Promise.resolve({
          data: { id: "cat-1", platform_id: platformId },
          error: null,
        }),
      };
    },
  };
}

Deno.test("mapApiLineToDb absent vs empty positions", () => {
  const none = mapApiLineToDb({}, 0);
  assertFalse("positions" in none);

  const nul = mapApiLineToDb({ positions: null }, 0);
  // Sent null = clear (code review #5); only a missing key keeps what is saved.
  assertEquals(nul.positions, null);

  const empty = mapApiLineToDb({ positions: [] }, 0);
  assertEquals(empty.positions, []);

  const one = mapApiLineToDb({ positions: ["LF"] }, 0);
  assertEquals(one.positions, ["LF"]);

  const rpcJson = JSON.stringify([none, empty, one]);
  assertEquals(rpcJson.includes('"positions"'), true);
  assertEquals(JSON.parse(rpcJson)[0].positions, undefined);
  assertEquals(JSON.parse(rpcJson)[1].positions, []);
});

Deno.test("mapSaveWorkOrderError position_invalid", () => {
  const r = mapSaveWorkOrderError("position_invalid hint");
  assertEquals(r.status, 400);
  assertEquals(r.code, "position_invalid");
  assertEquals(r.error, "That position doesn't fit this job. Pick again.");
});

Deno.test("loadWorkOrderLinesForRpc keeps stored positions", async () => {
  const sb = {
    from(table: string) {
      if (table === "maintenance_work_order_lines") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => Promise.resolve({
                  data: [{
                    id: LINE,
                    work_order_id: WO,
                    component_id: JOB_A,
                    positions: ["LF"],
                    sort_order: 0,
                    items_amount: 0,
                  }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "maintenance_work_order_line_item") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(table);
    },
  } as unknown as SupabaseClient;

  const rows = await loadWorkOrderLinesForRpc(sb, WO);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].positions, ["LF"]);
});

Deno.test("loadJobMetaForLines: one categories query; the shared mapper reads its position kind", async () => {
  let catQueries = 0;
  const sb = {
    from(table: string) {
      if (table !== "maintenance_service_categories") throw new Error(table);
      return {
        select: () => ({
          in: () => {
            catQueries++;
            return Promise.resolve({
              data: [
                {
                  id: JOB_A,
                  is_high_voltage: false,
                  position_scheme: "before_after_catalyst",
                  position_aware: false,
                },
              ],
              error: null,
            });
          },
        }),
      };
    },
  } as unknown as SupabaseClient;

  const lines = [
    { id: "1", component_id: JOB_A },
    { id: "2", component_id: JOB_B },
    { id: "3" },
  ];
  const meta = await loadJobMetaForLines(sb, lines.map((l) => l.component_id));
  assertEquals(catQueries, 1);
  const out = lines.map((l) => mapDbLineToApi({ ...l, ...(meta.get(String(l.component_id ?? "")) ?? {}) }));
  assertEquals(out[0].positionScheme, "before_after_catalyst");
  assertEquals(out[0].positionAware, false);
  assertEquals(out[1].positionScheme, null);
  assertEquals(out[2].positionAware, null);
});

Deno.test("buildPartsSourcingInsert wheel codes fill fit without body fit", async () => {
  const row = await buildPartsSourcingInsert(catalogClient() as never, {
    orgId: "org",
    vehicleId: "veh",
    needText: "Pads",
    componentId: JOB_A,
    engineFamilyId: null,
    vehicleCatalogId: "cat-1",
    matchType: null,
    fit: {},
    kind: "add_part_info",
    urgency: null,
    qty: null,
    userId: null,
    photoUrl: null,
    sentAt: null,
    replyDueAt: null,
    positionScheme: "four_corners",
    positionCodes: ["LF", "RF"],
  });
  assertEquals(row.fit_descriptor, "front:both");
  assertEquals(row.install_position, "front");
  assertEquals(row.install_side, "both");
  assertEquals(row.position_codes, ["LF", "RF"]);
  assertEquals(row.position_scheme, "four_corners");
});

Deno.test("buildPartsSourcingInsert non-wheel codes leave fit null", async () => {
  const row = await buildPartsSourcingInsert(catalogClient() as never, {
    orgId: "org",
    vehicleId: "veh",
    needText: "O2",
    componentId: JOB_A,
    engineFamilyId: null,
    vehicleCatalogId: "cat-1",
    matchType: null,
    fit: {},
    kind: "add_part_info",
    urgency: null,
    qty: null,
    userId: null,
    photoUrl: null,
    sentAt: null,
    replyDueAt: null,
    positionScheme: "before_after_catalyst",
    positionCodes: ["before_cat"],
  });
  assertEquals(row.fit_descriptor, null);
  assertEquals(row.install_position, null);
  assertEquals(row.position_codes, ["before_cat"]);
});

Deno.test("buildPartsSourcingInsert body fit unchanged when explicit", () => {
  const fields = fitFieldsForPartsRequest(
    { position: "both", side: "both" },
    ["LF", "RF"],
  );
  assertEquals(fields.fitDescriptor, "front:both,rear:both");
});

Deno.test("buildPartsSourcingInsert no codes leaves position columns null", async () => {
  const row = await buildPartsSourcingInsert(catalogClient() as never, {
    orgId: "org",
    vehicleId: "veh",
    needText: "Filter",
    componentId: JOB_A,
    engineFamilyId: null,
    vehicleCatalogId: "cat-1",
    matchType: null,
    fit: { position: "front", side: "left" },
    kind: "add_part_info",
    urgency: null,
    qty: null,
    userId: null,
    photoUrl: null,
    sentAt: null,
    replyDueAt: null,
  });
  assertEquals(row.position_scheme, null);
  assertEquals(row.position_codes, null);
  assertEquals(row.install_position, "front");
});

Deno.test("feature flag LOG_SERVICE_PARTS_GAPS registered", () => {
  assertEquals(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, "log_service_parts_gaps");
  const routes = Deno.readTextFileSync(new URL("./maintenance_routes.ts", import.meta.url));
  assertEquals(routes.includes("LOG_SERVICE_PARTS_GAPS"), true);
  assertEquals(routes.includes("logServicePartsGapsEnabled"), true);
});

Deno.test("callSaveWorkOrder path uses mapSaveWorkOrderError", () => {
  const src = Deno.readTextFileSync(new URL("./service_items_save.ts", import.meta.url));
  assertEquals(src.includes("mapSaveWorkOrderError(error.message"), true);
  const routes = Deno.readTextFileSync(new URL("./maintenance_routes.ts", import.meta.url));
  assertEquals(routes.includes("callSaveWorkOrder"), true);
});