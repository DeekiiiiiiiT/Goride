/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { fp3AreaIcon, isMaterialSymbolIconKey } from "./findPartsViewModels";

describe("fp3AreaIcon", () => {
  it("rejects catalog icon_key slugs", () => {
    expect(isMaterialSymbolIconKey("brakes")).toBe(false);
    expect(isMaterialSymbolIconKey("droplet")).toBe(false);
    expect(fp3AreaIcon("Brakes", "brakes")).toBe("disc_full");
  });

  it("keeps real Material Symbols names from the catalog", () => {
    expect(isMaterialSymbolIconKey("disc_full")).toBe(true);
    expect(fp3AreaIcon("Brakes", "disc_full")).toBe("disc_full");
  });

  it("maps area names when icon_key is missing or invalid", () => {
    expect(fp3AreaIcon("Battery & electrical")).toBe("bolt");
    expect(fp3AreaIcon("Belts & hoses", "belt")).toBe("alt_route");
    expect(fp3AreaIcon("Fluids", "droplet")).toBe("water_drop");
    expect(fp3AreaIcon("Unknown area")).toBe("category");
  });
});

describe("fp3 area numbering", () => {
  it("assigns sequential indices for systems browse", async () => {
    const { buildFp3ViewModel } = await import("./findPartsViewModels");
    const vm = buildFp3ViewModel({
      browse: {
        systems: [
          { id: "a", plainName: "Brakes", count: 6, components: [] },
          { id: "b", plainName: "Engine", count: 1, components: [] },
        ],
      },
      selectedAreaId: "a",
      selectedChipId: "",
    });
    expect(vm.areas.map((r) => r.areaIndex)).toEqual(["01", "02"]);
  });
});
