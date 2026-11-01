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

  it("buildFp13 queue, short id, and median turnaround", async () => {
    const { buildFp13ViewModel, formatPartsRequestShortId } = await import("./findPartsViewModels");
    expect(formatPartsRequestShortId("abc12345-6789-4def-9012-345678901234")).toBe("ABC-12-345");
    const vm = buildFp13ViewModel({
      activity: {
        requests: { items: [{ id: "abc12345-6789-4def-9012-345678901234", status: "open", need_text: "Pads", created_at: "2026-11-01T12:00:00Z" }], total: 1 },
        meta: { queueDepth: 2, medianAddMinutes: 90, batchMatchRate: 40, resolvedCount30d: 6 },
      },
    });
    expect(vm.queueAheadLabel).toContain("2 requests ahead");
    expect(vm.showOrgMetrics).toBe(true);
    expect(vm.medianTurnaroundLabel).toContain("1.5 hrs");
    expect(vm.cards[0]?.shortId).toBe("ABC-12-345");
  });

  it("hides org median turnaround under five resolved requests", async () => {
    const { buildFp13ViewModel } = await import("./findPartsViewModels");
    const vm = buildFp13ViewModel({
      activity: {
        requests: { items: [{ id: "x", status: "open", need_text: "Pads" }], total: 1 },
        meta: { queueDepth: 0, medianAddMinutes: 90, resolvedCount30d: 4 },
      },
    });
    expect(vm.showOrgMetrics).toBe(false);
    expect(vm.medianTurnaroundLabel).toBe("Avg dispatch turnaround: hidden until 5 resolves");
  });
});

describe("FP13/14 stitch formatters (R29)", () => {
  it("formats cant-find retry and note confirmation", async () => {
    const {
      buildFp13ViewModel,
      formatFp13CantFindWithRetry,
      formatFp13NoteConfirmation,
      FP13_EMPTY_BODY,
      FP13_HELP_CARD_TITLE,
    } = await import("./findPartsViewModels");
    expect(formatFp13CantFindWithRetry("cabin filter", "GP5", "8 Nov")).toContain("GP5");
    expect(formatFp13NoteConfirmation("kgnja774-0000-4000-8000-000000000000")).toContain("KGN-JA-774");
    const vm = buildFp13ViewModel({ activity: { requests: { items: [] } } });
    expect(vm.emptyBody).toBe(FP13_EMPTY_BODY);
    expect(vm.helpCardTitle).toBe(FP13_HELP_CARD_TITLE);
  });

  it("formats resolved notice with en-GB date", async () => {
    const { formatCatalogResolvedNoticeLine } = await import("./findPartsViewModels");
    const line = formatCatalogResolvedNoticeLine("2026-10-28T12:00:00Z");
    expect(line).toMatch(/28 Oct 2026/);
    expect(line.toLowerCase()).toContain("resolved from oem parts catalogue lookup");
  });
});
