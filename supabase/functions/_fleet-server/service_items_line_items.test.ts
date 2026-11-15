/**
 * Service line items — parseLineItems amounts and computeWoLineTotal.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { parseLineItems } from "../../../packages/types/src/serviceItems.ts";
import { computeWoLineTotal } from "./maintenance_logging_helpers.ts";

function baseItem(over: Record<string, unknown> = {}) {
  return {
    source: "other",
    itemKind: "other",
    itemName: "Shop towel",
    qty: 1,
    ...over,
  };
}

Deno.test("parseLineItems golden amounts", () => {
  const cases: Array<{ qty: string; unitCost: string; amount: string }> = [
    { qty: "2", unitCost: "600.50", amount: "1201.00" },
    { qty: "1.5", unitCost: "0.33", amount: "0.50" },
    { qty: "0.005", unitCost: "1.00", amount: "0.01" },
    { qty: "0.015", unitCost: "1.00", amount: "0.02" },
    { qty: "1.005", unitCost: "2.00", amount: "2.01" },
    { qty: "1.005", unitCost: "", amount: "0.00" },
  ];
  for (const c of cases) {
    const r = parseLineItems([baseItem({ qty: c.qty, unitCost: c.unitCost })], { declined: false });
    if (!r.ok) throw new Error(`${c.qty}×${c.unitCost}: ${r.code}`);
    assertEquals(r.itemsAmount, c.amount);
  }
});

Deno.test("parseLineItems qty_precision and cost_precision", () => {
  const q = parseLineItems([baseItem({ qty: "1.2345" })], { declined: false });
  assertEquals(q.ok, false);
  if (!q.ok) assertEquals(q.code, "qty_precision");

  const c = parseLineItems([baseItem({ qty: "1", unitCost: "0.005" })], { declined: false });
  assertEquals(c.ok, false);
  if (!c.ok) assertEquals(c.code, "cost_precision");
});

Deno.test("parseLineItems validation edge cases", () => {
  assertEquals(parseLineItems([baseItem({ unitCost: "-1" })], { declined: false }).ok, false);
  const blank = parseLineItems([baseItem({ unitCost: null })], { declined: false });
  assertEquals(blank.ok, true);
  if (blank.ok) {
    assertEquals(blank.itemsAmount, "0.00");
    assertEquals(blank.items[0].unit_cost, null);
  }
  assertEquals(parseLineItems([baseItem()], { declined: true }).ok, false);
  assertEquals(
    parseLineItems([{
      source: "other",
      itemKind: "supply",
      supplyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      qty: 1,
      partNumber: "X",
    }], { declined: false }).ok,
    false,
  );
  assertEquals(parseLineItems([{ source: "other", itemKind: "other", qty: 1 }], { declined: false }).ok, false);
  const many = Array.from({ length: 31 }, () => baseItem());
  assertEquals(parseLineItems(many, { declined: false }).ok, false);
});

Deno.test("parseLineItems sum several items in BigInt", () => {
  const r = parseLineItems([
    baseItem({ qty: "2", unitCost: "10.50" }),
    baseItem({ qty: "1", unitCost: "0.25" }),
  ], { declined: false });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.itemsAmount, "21.25");
});

const PART_TYPE = "f1111111-1111-4111-8111-111111111111";
const JOB_ITEM = "f2222222-2222-4222-8222-222222222222";

function partRow(over: Record<string, unknown> = {}) {
  return {
    source: "suggested",
    itemKind: "part_type",
    jobItemId: JOB_ITEM,
    partTypeId: PART_TYPE,
    qty: 1,
    ...over,
  };
}

Deno.test("parseLineItems part_source validation", () => {
  assertEquals(parseLineItems([partRow({ partSource: "typed", brand: "B", partNumber: "1" })], { declined: false }).ok, true);
  const legacy = parseLineItems([partRow({ partId: "a1111111-1111-4111-8111-111111111111" })], { declined: false });
  assertEquals(legacy.ok, true);
  if (legacy.ok) assertEquals(legacy.items[0].part_source, "car");
  const miss = parseLineItems([partRow()], { declined: false });
  assertEquals(miss.ok, true);
  if (miss.ok) assertEquals(miss.items[0].part_source, null);

  assertEquals(parseLineItems([baseItem({ partSource: "car" })], { declined: false }).ok, false);
  assertEquals(parseLineItems([partRow({ partSource: "nope", brand: "B" })], { declined: false }).ok, false);
  assertEquals(parseLineItems([partRow({ partSource: "", brand: "B" })], { declined: false }).ok, false);
  assertEquals(parseLineItems([partRow({ partSource: "car" })], { declined: false }).ok, false);
  assertEquals(
    parseLineItems([partRow({
      partSource: "typed",
      partId: "a1111111-1111-4111-8111-111111111111",
      brand: "B",
    })], { declined: false }).ok,
    false,
  );
  assertEquals(parseLineItems([partRow({ partSource: "size" })], { declined: false }).ok, false);
  assertEquals(parseLineItems([partRow({ partSource: "typed", brand: "B" })], { declined: false }).ok, true);
});

Deno.test("computeWoLineTotal with items (tests 21–23)", () => {
  assertEquals(
    computeWoLineTotal({ labor_amount: 3000, items_amount: 2000 }),
    5000,
  );
  assertEquals(
    computeWoLineTotal({ qty: 4, unit_price: 1000, labor_amount: 1000, items_amount: 500 }),
    5500,
  );
  assertEquals(computeWoLineTotal({ qty: 1, unit_price: 100, labor_amount: 50 }), 150);
  assertEquals(
    computeWoLineTotal({ declined: true, labor_amount: 100, items_amount: 50 }),
    0,
  );
});
