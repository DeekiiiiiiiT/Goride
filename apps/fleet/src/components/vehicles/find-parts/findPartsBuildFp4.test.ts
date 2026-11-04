/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { buildFp4ViewModel, fp4PageTitle } from "./findPartsBuildFp4";

describe("buildFp4ViewModel", () => {
  it("uses component name for page label and distinct axle part titles", () => {
    const vm = buildFp4ViewModel({
      componentName: "Brake pads",
      fitHints: {
        hasSideSpecificListings: false,
        countsByPosition: { front: 4, rear: 2 },
        labelsByPosition: {
          front: "Front brake pad set",
          rear: "Rear brake pad set",
        },
      },
      selectedAxle: "front",
    });
    expect(vm.partLabel).toBe("Brake pads");
    expect(vm.axleRows.find((r) => r.id === "front")?.partTitle).toBe("Front brake pad set");
    expect(vm.axleRows.find((r) => r.id === "rear")?.partTitle).toBe("Rear brake pad set");
  });

  it("builds brake spec titles from vehicle specs", () => {
    const vm = buildFp4ViewModel({
      componentName: "Brake pads",
      ctx: {
        specs: {
          brake_front_type: "Ventilated Disc",
          brake_rear_type: "Drum",
        },
      },
    });
    expect(vm.frontSpec.title).toBe("FRONT · Ventilated Disc");
    expect(vm.rearSpec.title).toBe("REAR · Drum");
  });

  it("shows em dash brake titles when specs missing", () => {
    const vm = buildFp4ViewModel({ componentName: "Brake pads", ctx: { specs: {} } });
    expect(vm.frontSpec.title).toBe("FRONT · —");
    expect(vm.rearSpec.title).toBe("REAR · —");
  });

  it("fp4PageTitle uses sentence case for the part name", () => {
    expect(fp4PageTitle("Brake pads")).toBe("Which brake pads?");
    expect(fp4PageTitle("None yet")).toBe("Which part?");
  });

  it("diagram badge uses axle position for left/right labels", () => {
    const vm = buildFp4ViewModel({
      componentName: "Brake pads",
      selectedAxle: "front",
      selectedSide: "left",
    });
    expect(vm.diagramBadge).toBe("FRONT AXLE · FRONT LEFT");
  });

  it("side step labels include axle position for left and right", () => {
    const vm = buildFp4ViewModel({
      componentName: "Brake pads",
      selectedAxle: "front",
      selectedSide: "left",
    });
    expect(vm.sideOptions.find((o) => o.id === "left")?.label).toBe("Front left");
    expect(vm.sideOptions.find((o) => o.id === "right")?.label).toBe("Front right");
  });

  it("diagram badge lists front and rear when both axles are selected", () => {
    const vm = buildFp4ViewModel({
      componentName: "Brake pads",
      selectedAxle: "both",
      selectedSide: "both",
    });
    expect(vm.diagramBadge).toBe("FRONT · BOTH SIDES / REAR · BOTH SIDES");
  });

  it("maps abs and handbrake from vehicle-context specs", () => {
    const vm = buildFp4ViewModel({
      componentName: "Brake pads",
      ctx: {
        specs: {
          abs_channels: "4-wheel Bosch",
          handbrake_type: "Rear drum cable",
        },
      },
    });
    expect(vm.chassisProfile.abs).toBe("4-wheel Bosch");
    expect(vm.chassisProfile.handbrake).toBe("Rear drum cable");
  });
});
