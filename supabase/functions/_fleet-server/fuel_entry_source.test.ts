import { assertEquals } from "jsr:@std/assert@1.0.13";
import { resolveFuelEntrySource, stampFuelEntrySource } from "./fuel_entry_source.ts";

Deno.test("F-14: driver submit → scan; statement match → card_statement", () => {
  assertEquals(
    resolveFuelEntrySource({ receiptUrl: "x" }, { isNew: true, isDriverSubmitter: true }),
    "scan",
  );
  assertEquals(
    resolveFuelEntrySource({ type: "Card_Transaction" }, { isNew: true, statementLine: true }),
    "card_statement",
  );
  const entry: Record<string, unknown> = {};
  stampFuelEntrySource(entry, { isNew: true, splitFillScan: true });
  assertEquals(entry.source, "scan");
});