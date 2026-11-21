/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import { emptyDraft, type PartTypeRow } from "../addPartsTypes";
import { bySpecExtras, Step2BySpec } from "./Step2BySpec";

function type(specKey: string, name: string): PartTypeRow {
  return {
    id: name,
    opCode: null,
    name,
    tradeTerm: null,
    editorHint: null,
    defaultFitMode: "spec",
    positionScheme: "none",
    status: "active",
    iconKey: null,
    areaId: null,
    specFields: [{ specKey, label: specKey, unit: null, dataType: "text", options: null, required: true, example: null }],
  };
}

describe("LC-19 by-size extras", () => {
  it("batteries get a Battery type choice; wipers keep connector + blade; others neither", () => {
    expect(bySpecExtras(["battery_jis"])).toEqual({ wiper: false, battery: true });
    expect(bySpecExtras(["wiper_driver_mm"])).toEqual({ wiper: true, battery: false });
    expect(bySpecExtras(["tire_size"])).toEqual({ wiper: false, battery: false });
  });

  it("a battery shows Battery type (no connector / blade) and stores the pick", () => {
    const setDraft = vi.fn();
    render(<Step2BySpec draft={{ ...emptyDraft(), partType: type("battery_jis", "Battery") }} setDraft={setDraft} />);
    expect(screen.queryByText("Connector type")).toBeNull();
    expect(screen.queryByText("Which blade?")).toBeNull();
    fireEvent.change(screen.getByTestId("add-part-battery-type"), { target: { value: "EFB" } });
    expect(setDraft).toHaveBeenCalledWith(expect.objectContaining({ batteryType: "EFB" }));
  });

  it("a wiper still shows connector and blade, and no battery type", () => {
    render(<Step2BySpec draft={{ ...emptyDraft(), partType: type("wiper_driver_mm", "Wiper blade") }} setDraft={vi.fn()} />);
    expect(screen.getByText("Connector type")).toBeTruthy();
    expect(screen.getByText("Which blade?")).toBeTruthy();
    expect(screen.queryByTestId("add-part-battery-type")).toBeNull();
  });
});
