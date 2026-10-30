// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  groupRowUsesColourBackground,
  groupSwatchStyle,
  isRetireBlocked,
  retireDialogShowsButton,
  retireTitle,
} from "./categoriesFormat";

describe("retire dialog", () => {
  it("T10 hides Retire when anything is in use", () => {
    expect(retireDialogShowsButton({ places: 205, plug_chip: true, search_as: 0, children: 0, facilities: 0, default_facilities: 0 })).toBe(false);
    expect(retireDialogShowsButton({ places: 0, plug_chip: true, search_as: 0, children: 0, facilities: 0, default_facilities: 0 })).toBe(false);
    expect(retireDialogShowsButton({ places: 0, plug_chip: false, search_as: 0, children: 2, facilities: 0, default_facilities: 0 })).toBe(false);
    expect(isRetireBlocked({ places: 0, plug_chip: false, search_as: 0, children: 0, facilities: 0, default_facilities: 0 })).toBe(false);
    expect(retireDialogShowsButton({ places: 0, plug_chip: false, search_as: 0, children: 0, facilities: 0, default_facilities: 0 })).toBe(true);
  });

  it("keeps the Stitch titles for the blocked and clear samples", () => {
    expect(retireTitle("Gas station")).toBe("Retire Gas station?");
    expect(retireTitle("Beach")).toBe("Retire Beach?");
  });
});

describe("group colour", () => {
  it("T11 paints only the swatch", () => {
    expect(groupRowUsesColourBackground()).toBe(false);
    expect(groupSwatchStyle("#ffe6cc")).toEqual({ backgroundColor: "#ffe6cc", width: "12px", height: "12px" });
    const tree = readFileSync(new URL("./TaxonomyTree.tsx", import.meta.url), "utf8");
    expect(tree).not.toMatch(/background:\s*(row|group)\.colour/);
    expect(tree).toContain("groupSwatchStyle");
  });
});
