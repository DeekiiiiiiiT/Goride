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

describe("buildFp3OverlayViewModel on-file count", () => {
  it("counts part types on file not listing totals", async () => {
    const { buildFp3OverlayViewModel } = await import("./findPartsViewModels");
    const vm = buildFp3OverlayViewModel({
      area: { id: "brakes", name: "Brakes", icon: "disc_full", count: 6 },
      browse: {
        systems: [{
          id: "brakes",
          plainName: "Brakes",
          components: [
            { id: "pads", plainName: "Brake pads", count: 4, positionAware: true },
            { id: "shoes", plainName: "Brake shoes", count: 2, positionAware: true },
            { id: "rotors", plainName: "Brake rotors", count: 0 },
            { id: "lines", plainName: "Brake lines", count: 0 },
          ],
        }],
      },
    });
    expect(vm?.partsInArea).toBe(4);
    expect(vm?.onFileForCar).toBe(2);
  });
});

describe("formatPartsVersionTag", () => {
  it("reads version field from vehicle-context shape", async () => {
    const { formatPartsVersionTag } = await import("@roam/types/partsVehicleContext");
    expect(formatPartsVersionTag({
      version: "Pre-Facelift · 1KR-FE · 2WD",
      specs: { trim_series: "Ignored when version set" },
    })).toBe("Pre-Facelift · 1KR-FE · 2WD");
  });

  it("builds FP3 header from specs when version missing", async () => {
    const { buildFp3ViewModel } = await import("./findPartsViewModels");
    const vm = buildFp3ViewModel({
      ctx: {
        specs: { trim_series: "Pre-Facelift", engine_code: "1KR-FE", drivetrain: "2WD" },
      },
      selectedChipId: "",
    });
    expect(vm.versionTag).toBe("Pre-Facelift · 1KR-FE · 2WD");
  });
});
