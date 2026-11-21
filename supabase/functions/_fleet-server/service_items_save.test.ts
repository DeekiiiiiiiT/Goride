/**
 * service_items_save helpers — line ids, flag, patch body detection, error map.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  isBoardOnlyBody,
  isContentEditBody,
  isMixedPatchBody,
  mapDbLineItemToApi,
  sourcingFieldsFromOutbox,
  mapSaveWorkOrderError,
  prepareWorkOrderLines,
} from "./service_items_save.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VEH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_LINE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JOB = "11111111-1111-4111-8111-111111111111";
const SUPPLY_A = "22222222-2222-4222-8222-222222222222";
const SUPPLY_B = "33333333-3333-4333-8333-333333333333";
const JOB_ITEM = "44444444-4444-4444-8444-444444444444";
const PART_TYPE = "55555555-5555-4555-8555-555555555556";

function stubSupabase(handlers: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      const state: Record<string, unknown> = { table };
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          state.eq = { col, val };
          return chain;
        },
        in: () => chain,
        is: () => chain,
        order: () => chain,
        maybeSingle: async () => handlers[`${table}:maybeSingle`] ?? { data: null, error: null },
        then: undefined,
      };
      Object.assign(chain, {
        async then(resolve: (v: unknown) => void) {
          const key = `${table}:select`;
          resolve(handlers[key] ?? { data: [], error: null });
        },
      });
      return chain as ReturnType<SupabaseClient["from"]>;
    },
  } as unknown as SupabaseClient;
}

Deno.test("patch body content vs board vs mixed", () => {
  assertEquals(isContentEditBody({ lines: [] }), true);
  assertEquals(isContentEditBody({ discount: 0 }), true);
  assertEquals(isBoardOnlyBody({ status: "draft" }), true);
  assertEquals(isBoardOnlyBody({ status: "draft", expectedVersion: 2 }), true);
  assertEquals(isMixedPatchBody({ status: "in_progress", lines: [] }), false);
  assertEquals(isMixedPatchBody({ vendorId: "aaaa", lines: [] }), true);
  assertEquals(isMixedPatchBody({ status: "draft" }), false);
});

Deno.test("mapSaveWorkOrderError table", () => {
  assertEquals(mapSaveWorkOrderError("stale_edit").status, 409);
  assertEquals(mapSaveWorkOrderError("version_required").status, 428);
  assertEquals(mapSaveWorkOrderError("actor_required").status, 401);
  assertEquals(mapSaveWorkOrderError("line_items_amount_mismatch").status, 500);
  assertEquals(mapSaveWorkOrderError("position_invalid").status, 400);
  assertEquals(mapSaveWorkOrderError("position_invalid").code, "position_invalid");
});

Deno.test("prepareWorkOrderLines service_items_off when flag off", async () => {
  const sb = stubSupabase({});
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: null,
    rawLines: [{ items: [{ source: "other", itemKind: "other", itemName: "X", qty: 1 }] }],
    itemsEnabled: false,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "service_items_off");
});

Deno.test("prepareWorkOrderLines flag off with no items passes", async () => {
  const sb = stubSupabase({
    "maintenance_job_item:select": { data: [], error: null },
  });
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: null,
    rawLines: [{ componentId: JOB, declined: false }],
    itemsEnabled: false,
  });
  assertEquals(r.ok, true);
});

Deno.test("prepareWorkOrderLines line_work_order_mismatch", async () => {
  const wrongWo = "99999999-9999-4999-8999-999999999999";
  let lineQueries = 0;
  const sb = {
    from(table: string) {
      if (table === "maintenance_work_order_lines") {
        const chain = {
          select: () => chain,
          eq: () => ({
            async then(resolve: (v: unknown) => void) {
              lineQueries++;
              resolve({ data: [{ id: LINE }], error: null });
            },
          }),
          in: () => ({
            async then(resolve: (v: unknown) => void) {
              resolve({
                data: [{ id: OTHER_LINE, work_order_id: wrongWo }],
                error: null,
              });
            },
          }),
        };
        return chain;
      }
      if (table === "maintenance_job_item") {
        const chain = {
          select: () => chain,
          in: () => ({
            async then(resolve: (v: unknown) => void) {
              resolve({ data: [], error: null });
            },
          }),
        };
        return chain;
      }
      const empty = {
        select: () => empty,
        eq: () => empty,
        in: () => empty,
        maybeSingle: async () => ({ data: null, error: null }),
        async then(resolve: (v: unknown) => void) {
          resolve({ data: [], error: null });
        },
      };
      return empty;
    },
  } as unknown as SupabaseClient;
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: WO,
    rawLines: [{ id: OTHER_LINE, componentId: JOB }],
    itemsEnabled: true,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "line_work_order_mismatch");
});

Deno.test("prepareWorkOrderLines line_item_link_wrong_job without job on line", async () => {
  const sb = stubSupabase({
    "maintenance_job_item:select": {
      data: [{
        id: JOB_ITEM,
        job_id: JOB,
        part_type_id: null,
        supply_id: SUPPLY_A,
      }],
      error: null,
    },
  });
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: null,
    rawLines: [{
      declined: false,
      items: [{
        source: "suggested",
        itemKind: "supply",
        jobItemId: JOB_ITEM,
        supplyId: SUPPLY_A,
        itemName: "x",
        qty: 1,
      }],
    }],
    itemsEnabled: true,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "line_item_link_wrong_job");
});

Deno.test("prepareWorkOrderLines line_item_link_mismatch supply", async () => {
  const sb = stubSupabase({
    "maintenance_job_item:select": {
      data: [{
        id: JOB_ITEM,
        job_id: JOB,
        part_type_id: null,
        supply_id: SUPPLY_A,
      }],
      error: null,
    },
    "maintenance_supply:select": {
      data: [{ id: SUPPLY_B, name: "Other", unit_id: "55555555-5555-4555-8555-555555555555" }],
      error: null,
    },
  });
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: null,
    rawLines: [{
      componentId: JOB,
      declined: false,
      items: [{
        source: "suggested",
        itemKind: "supply",
        jobItemId: JOB_ITEM,
        supplyId: SUPPLY_B,
        itemName: "x",
        qty: 1,
      }],
    }],
    itemsEnabled: true,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "line_item_link_mismatch");
});

Deno.test("mapDbLineItemToApi returns partSource", () => {
  const row = {
    id: "99999999-9999-4999-8999-999999999999",
    source: "suggested",
    job_item_id: JOB_ITEM,
    item_kind: "part_type",
    part_type_id: PART_TYPE,
    supply_id: null,
    part_id: null,
    part_source: "typed",
    item_name: "Gasket",
    unit_label: "pc",
    brand: "B",
    part_number: "1",
    qty: 1,
    unit_cost: null,
    amount: 0,
  };
  const api = mapDbLineItemToApi(row);
  assertEquals(api.partSource, "typed");
});

Deno.test("sourcingFieldsFromOutbox maps state and reason", () => {
  assertEquals(sourcingFieldsFromOutbox(undefined), { sourcingState: null, sourcingReason: null });
  assertEquals(
    sourcingFieldsFromOutbox({ state: "pending", reason_code: "daily_limit" }),
    { sourcingState: "pending", sourcingReason: "daily_limit" },
  );
  assertEquals(
    sourcingFieldsFromOutbox({ state: "sent", reason_code: null }),
    { sourcingState: "sent", sourcingReason: null },
  );
});

Deno.test("prepareWorkOrderLines passes part_source through", async () => {
  const sb = stubSupabase({
    "maintenance_job_item:select": {
      data: [{
        id: JOB_ITEM,
        job_id: JOB,
        part_type_id: PART_TYPE,
        supply_id: null,
      }],
      error: null,
    },
    "maintenance_service_categories:select": {
      data: [{
        id: PART_TYPE,
        name: "Gasket",
        kind: "component",
        is_part: true,
        status: "active",
      }],
      error: null,
    },
  });
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: null,
    rawLines: [{
      componentId: JOB,
      declined: false,
      items: [{
        source: "suggested",
        itemKind: "part_type",
        jobItemId: JOB_ITEM,
        partTypeId: PART_TYPE,
        partSource: "typed",
        brand: "After",
        partNumber: "PN",
        qty: 1,
      }],
    }],
    itemsEnabled: true,
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    const items = r.lines[0].items as Record<string, unknown>[];
    assertEquals(items[0].part_source, "typed");
  }
});

Deno.test("prepareWorkOrderLines create drops client line ids", async () => {
  const sb = stubSupabase({
    "maintenance_job_item:select": { data: [], error: null },
  });
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEH,
    workOrderId: null,
    rawLines: [{ id: LINE, componentId: JOB }],
    itemsEnabled: true,
  });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.lines[0].id, undefined);
});
