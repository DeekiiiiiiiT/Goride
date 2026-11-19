/**
 * deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/inspection_findings.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  buildFoundStatusForLine,
  childWorkOrderClosesFoundLine,
  enrichSectionsRecordsFindings,
  mapFoundWorkCloseError,
  mapJobRecordsFindings,
} from "./inspection_findings_helpers.ts";
import {
  dbLinesToLedgerInputs,
  lineNeedsPartsUsage,
} from "./maintenance_completion.ts";
import {
  inspectInspectionFindingsOffPayload,
  mapApiLineToDb,
  mapSaveWorkOrderError,
  prepareWorkOrderLines,
} from "./service_items_save.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const JOB = "11111111-1111-4111-8111-111111111111";
const FOUND_LINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DONE_LINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_WO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

Deno.test("gate 2 lineNeedsPartsUsage and ledger inputs skip found job", () => {
  const done = { declined: false, recommended: false, part_number: "ABC", component_id: JOB, id: DONE_LINE };
  const found = { declined: false, recommended: true, part_number: "XYZ", component_id: JOB, id: FOUND_LINE };
  assertEquals(lineNeedsPartsUsage(found), false);
  assertEquals(lineNeedsPartsUsage(done), true);
  const inputs = dbLinesToLedgerInputs([done, found]);
  assertEquals(inputs.length, 2);
  assertEquals(inputs[0].recommended, false);
  assertEquals(inputs[1].recommended, true);
  const targets = inputs.filter((l) => !l.declined && !l.recommended);
  assertEquals(targets.length, 1);
  assertEquals(targets[0].workOrderLineId, DONE_LINE);
});

Deno.test("mapApiLineToDb strips found line parts and items", () => {
  const foundRaw = {
    componentId: JOB,
    categoryCode: "shock",
    categoryName: "Shock absorber",
    recommended: true,
    partNumber: "PN-1",
    partId: DONE_LINE,
    brand: "Toyota",
    unitPrice: 5000,
    material: 100,
    laborAmount: 200,
    laborRate: 50,
    itemsAmount: 99,
    items: [{ source: "other", itemKind: "other", itemName: "x", qty: 1 }],
  };
  const foundDb = mapApiLineToDb(foundRaw, 0);
  assertEquals(foundDb.recommended, true);
  assertEquals(foundDb.part_number, null);
  assertEquals(foundDb.part_id, null);
  assertEquals(foundDb.brand, null);
  assertEquals(foundDb.unit_price, null);
  assertEquals(foundDb.material, null);
  assertEquals(foundDb.labor_amount, null);
  assertEquals(foundDb.labor_rate, null);
  assertEquals(foundDb.items_amount, 0);
  assertEquals(foundDb.line_total, 0);

  const normalRaw = {
    componentId: JOB,
    categoryCode: "wiper",
    categoryName: "Wiper",
    action: "replace",
    unitPrice: 1500,
    laborAmount: 500,
    itemsAmount: 0,
  };
  const normalDb = mapApiLineToDb(normalRaw, 1);
  assertEquals(normalDb.recommended, false);
  assertEquals(normalDb.part_number, null);
  assertEquals(Number(normalDb.unit_price), 1500);
  assertEquals(Number(normalDb.labor_amount), 500);
  assertEquals(Number(normalDb.line_total) > 0, true);
});

Deno.test("gate 9 inspectInspectionFindingsOffPayload", () => {
  assertEquals(inspectInspectionFindingsOffPayload([{ categoryId: JOB }]), false);
  assertEquals(inspectInspectionFindingsOffPayload([{ recommended: true }]), false);
  assertEquals(inspectInspectionFindingsOffPayload([{ recommended: true, values: {} }]), false);
  assertEquals(inspectInspectionFindingsOffPayload([{ fromFoundLineId: FOUND_LINE }]), true);
  assertEquals(inspectInspectionFindingsOffPayload([
    { values: { found_by_job: "x" } },
  ]), true);
  assertEquals(inspectInspectionFindingsOffPayload([
    { values: { found_today: true } },
  ]), true);
});

function emptyStubSupabase(): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    order: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve: (v: unknown) => void) {
      resolve({ data: [], error: null });
    },
  };
  return {
    from: () => chain as ReturnType<SupabaseClient["from"]>,
  } as unknown as SupabaseClient;
}

Deno.test("IF-24 prepareWorkOrderLines recommended and fromFoundLineId", async () => {
  const r = await prepareWorkOrderLines(emptyStubSupabase(), {
    orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    vehicleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workOrderId: null,
    rawLines: [{
      componentId: JOB,
      recommended: true,
      fromFoundLineId: FOUND_LINE,
      items: [],
    }],
    itemsEnabled: false,
  });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.status, 400);
    assertEquals(r.code, "found_line_invalid");
  }
});

Deno.test("IF-19 enrichApiLinesWithFound draft child stays waiting", () => {
  assertEquals(childWorkOrderClosesFoundLine({ status: "draft", voided_at: null }), false);
  assertEquals(childWorkOrderClosesFoundLine({ status: "in_progress", voided_at: null }), false);
  assertEquals(childWorkOrderClosesFoundLine({ status: "completed", voided_at: null }), true);
  const waiting = buildFoundStatusForLine({
    lineId: FOUND_LINE,
    currentWorkOrderId: WO,
    closedReason: null,
    closedAt: null,
    closedBy: null,
    doneByFoundId: new Map(),
    closedByNames: new Map(),
  });
  assertEquals(waiting.status, "waiting");
});

Deno.test("mapSaveWorkOrderError found and found job items", () => {
  const open = mapSaveWorkOrderError("found_line_not_open");
  assertEquals(open.status, 409);
  assertEquals(open.code, "found_line_not_open");
  const items = mapSaveWorkOrderError("line_items_on_found_job");
  assertEquals(items.status, 400);
  assertEquals(items.code, "line_items_on_found_job");
});

Deno.test("mapFoundWorkCloseError", () => {
  const open = mapFoundWorkCloseError("found_line_not_open");
  assertEquals(open?.status, 409);
  assertEquals(open?.code, "found_line_not_open");
  const bad = mapFoundWorkCloseError("found_line_not_found");
  assertEquals(bad?.status, 404);
});

Deno.test("buildFoundStatusForLine statuses and doneSameDay", () => {
  const doneMap = new Map([
    [FOUND_LINE, { workOrderId: OTHER_WO, performedAtDate: "2026-12-01", sameWorkOrder: false }],
  ]);
  const sameMap = new Map([
    [FOUND_LINE, { workOrderId: WO, performedAtDate: "2026-11-17", sameWorkOrder: true }],
  ]);
  const names = new Map([["user-1", "Deeki T"]]);

  const done = buildFoundStatusForLine({
    lineId: FOUND_LINE,
    currentWorkOrderId: WO,
    closedReason: null,
    closedAt: null,
    closedBy: null,
    doneByFoundId: doneMap,
    closedByNames: names,
  });
  assertEquals(done.status, "done");
  assertEquals(done.doneWorkOrderId, OTHER_WO);
  assertEquals(done.doneDate, "2026-12-01");
  assertEquals(done.doneSameDay, false);

  const same = buildFoundStatusForLine({
    lineId: FOUND_LINE,
    currentWorkOrderId: WO,
    closedReason: null,
    closedAt: null,
    closedBy: null,
    doneByFoundId: sameMap,
    closedByNames: names,
  });
  assertEquals(same.doneSameDay, true);

  const notNeeded = buildFoundStatusForLine({
    lineId: FOUND_LINE,
    currentWorkOrderId: WO,
    closedReason: "not_needed",
    closedAt: "2026-11-18T00:00:00Z",
    closedBy: "user-1",
    doneByFoundId: new Map(),
    closedByNames: names,
  });
  assertEquals(notNeeded.status, "not_needed");
  assertEquals(notNeeded.closedByName, "Deeki T");

  const deleted = buildFoundStatusForLine({
    lineId: FOUND_LINE,
    currentWorkOrderId: WO,
    closedReason: "service_deleted",
    closedAt: "2026-11-18T00:00:00Z",
    closedBy: null,
    doneByFoundId: new Map(),
    closedByNames: names,
  });
  assertEquals(deleted.status, "service_deleted");

  const waiting = buildFoundStatusForLine({
    lineId: FOUND_LINE,
    currentWorkOrderId: WO,
    closedReason: null,
    closedAt: null,
    closedBy: null,
    doneByFoundId: new Map(),
    closedByNames: names,
  });
  assertEquals(waiting.status, "waiting");
});

Deno.test("recordsFindings on jobs when switch off vs on", () => {
  const job = { id: JOB, records_findings: true };
  assertEquals(mapJobRecordsFindings(job, false).recordsFindings, false);
  assertEquals(mapJobRecordsFindings(job, true).recordsFindings, true);
  const payload = enrichSectionsRecordsFindings(
    {
      groups: [{ sections: [{ jobs: [job] }] }],
      otherJobs: [job],
    },
    false,
  );
  assertEquals(payload.groups[0].sections[0].jobs[0].recordsFindings, false);
  assertEquals(payload.otherJobs[0].recordsFindings, false);
});
Deno.test("code review #4: an edit may send back saved finding marks; a new mark is still refused", () => {
  const stored = new Map([
    ["line-1", { fromFound: "", foundByJob: "", foundToday: true }],
    ["line-2", { fromFound: "found-9", foundByJob: "", foundToday: false }],
  ]);
  // Same marks as saved → allowed.
  assertEquals(
    inspectInspectionFindingsOffPayload(
      [{ id: "line-1", values: { found_today: true } }, { id: "line-2", fromFoundLineId: "found-9" }],
      stored,
    ),
    false,
  );
  // A new line with a mark, or a saved line gaining one → refused.
  assertEquals(inspectInspectionFindingsOffPayload([{ values: { found_today: true } }], stored), true);
  assertEquals(inspectInspectionFindingsOffPayload([{ id: "line-2", values: { found_by_job: JOB } }], stored), true);
  assertEquals(inspectInspectionFindingsOffPayload([{ id: "line-1", fromFoundLineId: "found-1" }], stored), true);
});
