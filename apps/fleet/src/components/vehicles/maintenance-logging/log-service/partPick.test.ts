import { describe, expect, it } from "vitest";
import {
  carrierItem,
  isCarrierItem,
  notListedText,
  partPickFromValues,
  partPickLabel,
  partPickValues,
  shownItems,
  withCarrier,
  type PartPick,
} from "./partPick";
import { newOtherItem } from "./itemsUsed";

const added: PartPick = {
  source: "added",
  name: "Interstate NS60L",
  brand: "Interstate NS60L",
  number: "",
  key: null,
  notListedFor: "Not what Toyota lists (Battery size: M-42 · EFB).",
};

describe("partPick (LC-21)", () => {
  it("round-trips through the job's values", () => {
    const values = partPickValues(added);
    expect(values).toEqual({
      part_pick_source: "added",
      part_pick_name: "Interstate NS60L",
      part_pick_key: null,
      part_not_listed_for: "Not what Toyota lists (Battery size: M-42 · EFB).",
    });
    expect(partPickFromValues(values, { brand: "Interstate NS60L", partNumber: "" })).toEqual(added);
    expect(partPickFromValues(partPickValues(null))).toBeNull();
    expect(partPickFromValues({ part_pick_source: "weird", part_pick_name: "x" })).toBeNull();
    expect(partPickFromValues(undefined)).toBeNull();
  });

  it("an added part gets one hidden carrier; switching or clearing removes it", () => {
    const grease = { ...newOtherItem(), itemName: "Grease", unitCost: "500" };
    const withIt = withCarrier([grease], null, added);
    expect(withIt).toHaveLength(2);
    expect(withIt[1]).toMatchObject({ source: "other", itemKind: "other", itemName: "Interstate NS60L" });
    expect(shownItems(withIt, added)).toEqual([grease]);
    const found: PartPick = { ...added, source: "found", key: "pm-1" };
    expect(withCarrier(withIt, added, found)).toEqual([grease]);
    expect(withCarrier(withIt, added, null)).toEqual([grease]);
  });

  it("a user's own Other item with the same name but a cost is never hidden", () => {
    const own = { ...carrierItem(added), unitCost: "18000" };
    expect(isCarrierItem(own, added)).toBe(false);
    expect(shownItems([own], added)).toHaveLength(1);
  });

  it("labels and the grey line", () => {
    expect(partPickLabel(added)).toBe("Interstate NS60L · Added by you");
    expect(partPickLabel({ ...added, source: "found" })).toBe("Interstate NS60L");
    expect(notListedText("Toyota", "Battery size: M-42 · EFB")).toBe("Not what Toyota lists (Battery size: M-42 · EFB).");
    expect(notListedText(null, null)).toBe("Not on the parts list for this car.");
  });
});
