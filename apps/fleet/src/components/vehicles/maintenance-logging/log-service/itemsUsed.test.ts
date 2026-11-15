import { describe, expect, it } from "vitest";
import {
  draftFromJobItem,
  groupJobItems,
  itemErrorText,
  linesHaveItemErrors,
  mayNeedSummary,
  newOtherItem,
  draftFromSavedItem,
  pickedPartBadge,
  qtyWithUnit,
  splitLineTotal,
  stepQty,
  toggleSuggested,
  type JobItem,
} from "./itemsUsed";
import {
  lineItemForWire,
  sumMaintenanceLogLines,
  type MaintenanceLogLine,
} from "../../../../types/maintenance";

const cleaner: JobItem = {
  linkId: "11111111-1111-4111-8111-111111111111",
  kind: "supply",
  itemId: "22222222-2222-4222-8222-222222222222",
  name: "Throttle body cleaner",
  need: "usually",
  qtyHint: 1,
  note: null,
  sortOrder: 1,
  unitLabelOne: "can",
  unitLabelMany: "cans",
  defaultFitMode: null,
};
const gasket: JobItem = {
  linkId: "33333333-3333-4333-8333-333333333333",
  kind: "part_type",
  itemId: "44444444-4444-4444-8444-444444444444",
  name: "Intake Manifold Gasket",
  need: "sometimes",
  qtyHint: null,
  note: null,
  sortOrder: 0,
  unitLabelOne: "piece",
  unitLabelMany: "pieces",
  defaultFitMode: null,
};

function serviceLine(charge: number, items: MaintenanceLogLine["items"]): MaintenanceLogLine {
  return { categoryCode: "tbc", categoryName: "Throttle Body Cleaning", labor: charge, items };
}

describe("items used", () => {
  it("nothing is ticked until the user ticks it; ticking twice unticks", () => {
    let items = toggleSuggested([], cleaner);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "suggested", jobItemId: cleaner.linkId, supplyId: cleaner.itemId, qty: "1", unitCost: "" });
    items = toggleSuggested(items, cleaner);
    expect(items).toHaveLength(0);
  });

  it("test 21: $3,000 service + cleaner $1,200 + gasket $800 = 5,000", () => {
    const c = { ...draftFromJobItem(cleaner), unitCost: "1200" };
    const g = { ...draftFromJobItem(gasket), unitCost: "800" };
    const line = serviceLine(3000, [c, g]);
    expect(sumMaintenanceLogLines([line])).toBe(5000);
    expect(splitLineTotal(line, 5000)).toEqual({ job: 3000, items: 2000 });
  });

  it("test 22: part line $4,000 + labour $1,000 + item $500 = 5,500", () => {
    const line: MaintenanceLogLine = {
      categoryCode: "pads",
      categoryName: "Brake Pads",
      material: 4000,
      labor: 1000,
      items: [{ ...newOtherItem(), itemName: "Brake cleaner", unitCost: "500" }],
    };
    expect(sumMaintenanceLogLines([line])).toBe(5500);
  });

  it("test 24: a blank cost counts 0 (cost not recorded)", () => {
    const line = serviceLine(3000, [draftFromJobItem(cleaner)]);
    expect(sumMaintenanceLogLines([line])).toBe(3000);
  });

  it("amounts round like the server: 1.5 × 333.33 = 500.00 (499.995 → 500.00)", () => {
    const line = serviceLine(0, [{ ...newOtherItem(), itemName: "Rag", qty: "1.5", unitCost: "333.33" }]);
    expect(sumMaintenanceLogLines([line])).toBe(500);
  });

  it("declined lines never count, items or not", () => {
    const line = { ...serviceLine(3000, [{ ...draftFromJobItem(cleaner), unitCost: "1200" }]), declined: true };
    expect(sumMaintenanceLogLines([line])).toBe(0);
  });

  it("lines read back from the server count their items once", () => {
    const line: MaintenanceLogLine = {
      categoryCode: "tbc",
      categoryName: "Throttle Body Cleaning",
      labor: 3000,
      itemsAmount: 1200,
      items: [{ id: "x", source: "suggested", jobItemId: cleaner.linkId, itemKind: "supply", supplyId: cleaner.itemId, itemName: "Throttle body cleaner", unitLabel: "can", qty: 1, unitCost: 1200, amount: 1200 }],
    };
    expect(sumMaintenanceLogLines([line])).toBe(4200);
  });

  it("quantity steps never reach 0 and keep the unit right", () => {
    expect(stepQty("1", -1)).toBe("1");
    expect(stepQty("1", 1)).toBe("2");
    expect(stepQty("0.5", -1)).toBe("0.5");
    const c = draftFromJobItem(cleaner);
    expect(qtyWithUnit(c)).toBe("1 can");
    expect(qtyWithUnit({ ...c, qty: "2" })).toBe("2 cans");
  });

  it("server refusals show as plain words and block Continue", () => {
    const bad = { ...newOtherItem(), itemName: "Rag", unitCost: "1.234" };
    expect(itemErrorText(bad)).toBe("Use up to 2 decimals for the cost.");
    expect(itemErrorText({ ...newOtherItem(), itemName: "" })).toBe("Say what it was.");
    expect(itemErrorText({ ...newOtherItem(), itemName: "Rag", qty: "1.2345" })).toBe("Use up to 3 decimals for the quantity.");
    expect(linesHaveItemErrors([serviceLine(1, [bad])])).toBe(true);
    expect(linesHaveItemErrors([{ ...serviceLine(1, [bad]), declined: true }])).toBe(false);
  });

  it("what goes to the server: no part number or part on a supply, name only on Other", () => {
    const wire = lineItemForWire({ ...draftFromJobItem(cleaner), partNumber: "X1", partId: "p", brand: " CRC " });
    expect(wire).toMatchObject({ itemKind: "supply", partNumber: null, partId: null, itemName: null, brand: "CRC", unitCost: null });
    const other = lineItemForWire({ ...newOtherItem(), itemName: "Shop rags", unitCost: "200" });
    expect(other).toMatchObject({ source: "other", jobItemId: null, itemName: "Shop rags", unitCost: "200" });
  });

  it("Usually first, then Sometimes; Step 2 summary lists them", () => {
    expect(groupJobItems([gasket, cleaner])).toEqual({ usually: [cleaner], sometimes: [gasket] });
    expect(mayNeedSummary([gasket, cleaner])).toBe("May need: Throttle body cleaner, Intake Manifold Gasket");
    expect(mayNeedSummary([])).toBe("");
  });
});

describe("pickedPartBadge (green tick only for this car's own parts)", () => {
  it("car-list pick is verified", () => {
    expect(pickedPartBadge({ partFit: "car", partId: "p1" })).toBe("car");
  });
  it("fits-by-size pick is never verified", () => {
    expect(pickedPartBadge({ partFit: "size", partId: null })).toBe("size");
  });
  it("typed-in part is never verified", () => {
    expect(pickedPartBadge({ partFit: null, partId: null })).toBe("typed");
    expect(pickedPartBadge({ partId: null })).toBe("typed");
  });
  it("a saved catalogue part read back (no partFit) stays verified", () => {
    expect(pickedPartBadge({ partId: "p1" })).toBe("car");
  });
  it("a saved typed-in or fits-by-size part read back is never verified (falls to typed)", () => {
    expect(pickedPartBadge({ partId: null, partFit: undefined })).toBe("typed");
    expect(pickedPartBadge({ partId: undefined })).toBe("typed");
    expect(pickedPartBadge(draftFromSavedItem({
      itemKind: "part_type",
      partSource: "typed",
      brand: "B",
      partId: null,
    }))).toBe("typed");
    expect(pickedPartBadge(draftFromSavedItem({
      itemKind: "part_type",
      partSource: "size",
      brand: "B",
      partId: null,
    }))).toBe("size");
  });
  it("never shows car without partId", () => {
    expect(pickedPartBadge({ partFit: "car", partId: null })).toBe("typed");
  });
});

describe("lineItemForWire partSource", () => {
  const partDraft = () => ({
    ...draftFromJobItem(gasket),
    partTypeId: gasket.itemId,
    partNumber: "",
    brand: "",
  });

  it("car / size / typed / unnamed / supply", () => {
    expect(lineItemForWire({ ...partDraft(), partId: "p1" }).partSource).toBe("car");
    expect(lineItemForWire({ ...partDraft(), partFit: "size", brand: "B" }).partSource).toBe("size");
    expect(lineItemForWire({ ...partDraft(), brand: "B" }).partSource).toBe("typed");
    expect(lineItemForWire({ ...partDraft() }).partSource).toBeNull();
    expect(lineItemForWire(draftFromJobItem(cleaner)).partSource).toBeNull();
  });
});

describe("draftFromSavedItem", () => {
  it("maps partSource to partFit and partLabel", () => {
    const typed = draftFromSavedItem({
      source: "suggested",
      itemKind: "part_type",
      partSource: "typed",
      brand: "Toyota genuine",
      partNumber: "22271",
      qty: 1,
    });
    expect(typed.partFit).toBeNull();
    expect(typed.partLabel).toBe("Toyota genuine");
    expect(pickedPartBadge(typed)).toBe("typed");

    const nullBrand = draftFromSavedItem({
      itemKind: "part_type",
      partSource: null,
      brand: "ACME",
      partId: null,
      qty: 1,
    });
    expect(pickedPartBadge(nullBrand)).toBe("typed");

    expect(draftFromSavedItem({ itemKind: "part_type", partSource: "car", partId: "p1" }).partFit).toBe("car");
    expect(draftFromSavedItem({ itemKind: "part_type", partSource: null, partId: null }).partLabel).toBeUndefined();
  });

  // Code review 15 Nov: reopening a job in the same visit must not forget a "fits by size" pick.
  it("keeps a draft already on screen as it is (in-visit reopen)", () => {
    const onScreen = { ...draftFromJobItem(gasket), partFit: "size" as const, partLabel: "Fel-Pro · Gasket", brand: "Fel-Pro" };
    const reopened = draftFromSavedItem(onScreen);
    expect(reopened.partFit).toBe("size");
    expect(reopened.partLabel).toBe("Fel-Pro · Gasket");
    expect(pickedPartBadge(reopened)).toBe("size");
    expect(lineItemForWire(reopened).partSource).toBe("size");
  });

  // Code review 15 Nov: an older saved item (part_source NULL) is sent back as NULL, never relabelled "typed".
  it("sends a saved item's partSource back unchanged, NULL included", () => {
    const legacy = draftFromSavedItem({ ...draftFromJobItem(gasket), partSource: null, brand: "ACME" });
    expect(lineItemForWire(legacy).partSource).toBeNull();
    const savedSize = draftFromSavedItem({ ...draftFromJobItem(gasket), partSource: "size", brand: "ACME" });
    expect(lineItemForWire(savedSize).partSource).toBe("size");
    // a new pick clears partSource (the dialog sets it to undefined), so the wire works it out again
    expect(lineItemForWire({ ...legacy, partSource: undefined }).partSource).toBe("typed");
  });

  it("a fits-by-size pick with no maker or part number is still sent as size", () => {
    expect(lineItemForWire({ ...draftFromJobItem(gasket), partFit: "size", partLabel: "Universal clamp" }).partSource).toBe("size");
  });
});
