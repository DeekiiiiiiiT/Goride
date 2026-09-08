/**
 * JAA linked-fill pair resolver (pure map helpers).
 * Run: deno test --no-check fuel_entry_pair.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  collectDeclaredTwinIds,
  expandLinkedFuelEntryIdsFromMap,
  pickFleetVisibleEntryId,
} from "./fuel_entry_pair.ts";

const STATEMENT_ID = "c2845020-eaf5-4c2b-b542-3ca44405a571";
const DRIVER_ID = "66d4f62a-8798-40d6-b4ba-4000e4d38271";

Deno.test("collectDeclaredTwinIds: statement → driver", () => {
  assertEquals(
    collectDeclaredTwinIds({
      id: STATEMENT_ID,
      metadata: {
        importSource: "jaa_raw",
        jaaMatchedDriverEntryId: DRIVER_ID,
      },
    }),
    [DRIVER_ID],
  );
});

Deno.test("collectDeclaredTwinIds: driver → statement", () => {
  assertEquals(
    collectDeclaredTwinIds({
      id: DRIVER_ID,
      metadata: {
        entrySource: "driver-portal",
        jaaMatchedStatementId: STATEMENT_ID,
      },
    }),
    [STATEMENT_ID],
  );
});

Deno.test("expandLinkedFuelEntryIdsFromMap: FESCO reciprocal pair from statement", () => {
  const byId = new Map<string, Record<string, unknown>>([
    [
      STATEMENT_ID,
      {
        id: STATEMENT_ID,
        metadata: {
          importSource: "jaa_raw",
          jaaMatchedDriverEntryId: DRIVER_ID,
        },
      },
    ],
    [
      DRIVER_ID,
      {
        id: DRIVER_ID,
        entrySource: "driver-portal",
        metadata: {
          jaaMatchedStatementId: STATEMENT_ID,
        },
      },
    ],
  ]);
  const ids = expandLinkedFuelEntryIdsFromMap(STATEMENT_ID, byId);
  assertEquals(ids, [DRIVER_ID, STATEMENT_ID].sort());
});

Deno.test("expandLinkedFuelEntryIdsFromMap: one-way link from statement still expands", () => {
  const byId = new Map<string, Record<string, unknown>>([
    [
      STATEMENT_ID,
      {
        id: STATEMENT_ID,
        metadata: {
          importSource: "jaa_raw",
          jaaMatchedDriverEntryId: DRIVER_ID,
        },
      },
    ],
    [
      DRIVER_ID,
      {
        id: DRIVER_ID,
        entrySource: "driver-portal",
        metadata: {},
      },
    ],
  ]);
  const ids = expandLinkedFuelEntryIdsFromMap(STATEMENT_ID, byId);
  assertEquals(ids.includes(DRIVER_ID), true);
  assertEquals(ids.includes(STATEMENT_ID), true);
});

Deno.test("expandLinkedFuelEntryIdsFromMap: solo seed", () => {
  const byId = new Map<string, Record<string, unknown>>([
    [DRIVER_ID, { id: DRIVER_ID, metadata: {} }],
  ]);
  assertEquals(expandLinkedFuelEntryIdsFromMap(DRIVER_ID, byId), [DRIVER_ID]);
});

Deno.test("pickFleetVisibleEntryId: prefers driver over JAA statement", () => {
  const byId = new Map<string, Record<string, unknown>>([
    [
      STATEMENT_ID,
      {
        id: STATEMENT_ID,
        metadata: { importSource: "jaa_raw", jaaRowKind: "approved_fuel" },
      },
    ],
    [
      DRIVER_ID,
      {
        id: DRIVER_ID,
        entrySource: "driver-portal",
        metadata: {},
      },
    ],
  ]);
  assertEquals(
    pickFleetVisibleEntryId([STATEMENT_ID, DRIVER_ID], byId),
    DRIVER_ID,
  );
});

Deno.test("pickFleetVisibleEntryId: statement-only falls back to statement", () => {
  const byId = new Map<string, Record<string, unknown>>([
    [
      STATEMENT_ID,
      {
        id: STATEMENT_ID,
        metadata: { importSource: "jaa_raw" },
      },
    ],
  ]);
  assertEquals(pickFleetVisibleEntryId([STATEMENT_ID], byId), STATEMENT_ID);
});
