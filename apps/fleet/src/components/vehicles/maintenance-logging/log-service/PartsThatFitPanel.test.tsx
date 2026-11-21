/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ findParts: vi.fn(), requestFindPart: vi.fn(), partsLookup: vi.fn(), partsMatch: vi.fn() }));
vi.mock("../../../../services/api", () => ({ api: apiMock }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { PartsThatFitPanel } from "./PartsThatFitPanel";

const twoParts = {
  linked: true,
  car: { make: "Toyota", model: "Roomy" },
  plainSections: [
    {
      items: [
        { partId: "p1", name: "Front oxygen sensor", brand: "Toyota (genuine)", number: "89467-B1040", fitLabel: "made_for_car", status: "verified" },
        { partId: "p2", name: "Front oxygen sensor", brand: "Denso", number: "234-9119", fitLabel: "also_fits", status: "verified" },
      ],
    },
  ],
  ask: { state: "none", askedAt: null, byYou: false },
};
const none = { linked: true, car: { make: "Toyota", model: "Roomy" }, plainSections: [], ask: { state: "none", askedAt: null, byYou: false } };

function renderPanel(over: Partial<React.ComponentProps<typeof PartsThatFitPanel>> = {}) {
  const props: React.ComponentProps<typeof PartsThatFitPanel> = {
    vehicleId: "car-1",
    jobId: "o2",
    jobName: "oxygen sensor",
    places: ["before_cat"],
    placeLabels: ["Front (Air fuel ratio sensor)"],
    needsPlace: false,
    partId: null,
    onPick: vi.fn(),
    onPlanIt: vi.fn(),
    ...over,
  };
  return { props, ...render(<PartsThatFitPanel {...props} />) };
}

describe("PartsThatFitPanel", () => {
  beforeEach(() => {
    apiMock.findParts.mockReset();
    apiMock.requestFindPart.mockReset();
    apiMock.partsLookup.mockReset();
    apiMock.partsLookup.mockResolvedValue({ reference: null, brandNumbers: [] });
  });

  it("waits for a place before asking the server", () => {
    renderPanel({ needsPlace: true, places: [] });
    expect(screen.getByTestId("parts-fit-pick-place")).toBeTruthy();
    expect(apiMock.findParts).not.toHaveBeenCalled();
  });

  it("lists the cards with badges and the parts store number; tap picks the part", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    const { props } = renderPanel();
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
    expect(apiMock.findParts).toHaveBeenCalledWith({ vehicleId: "car-1", componentId: "o2", places: "before_cat" });
    expect(screen.getByTestId("parts-fit-title").textContent).toBe("Parts that fit your Toyota Roomy");
    expect(screen.getAllByText("Made for your car").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("parts-fit-number")[0].textContent).toBe("89467-B1040");
    expect(screen.queryByLabelText(/part number/i)).toBeNull();
    fireEvent.click(screen.getAllByTestId("parts-fit-card")[0]);
    expect(props.onPick).toHaveBeenCalledWith(expect.objectContaining({ partId: "p1", brand: "Toyota (genuine)", number: "89467-B1040" }));
  });

  it("chosen state: Using … + Change clears it", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    const { props } = renderPanel({ partId: "p1" });
    await waitFor(() => expect(screen.getByTestId("parts-fit-using")).toBeTruthy());
    expect(screen.getByTestId("parts-fit-using").textContent).toContain("Using Toyota (genuine) front oxygen sensor");
    fireEvent.click(screen.getByTestId("parts-fit-change"));
    expect(props.onPick).toHaveBeenCalledWith(null);
  });

  it("Plan it passes the chosen part", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    const { props } = renderPanel({ partId: "p2" });
    await waitFor(() => expect(screen.getByTestId("parts-fit-plan-it")).toBeTruthy());
    fireEvent.click(screen.getByTestId("parts-fit-plan-it"));
    expect(props.onPlanIt).toHaveBeenCalledWith(expect.objectContaining({ partId: "p2" }));
  });

  it("no Plan it when the host doesn't allow it", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    renderPanel({ onPlanIt: undefined });
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
    expect(screen.queryByTestId("parts-fit-plan-it")).toBeNull();
  });

  it("nothing on file: Ask Roam once, then Roam is looking (button never twice)", async () => {
    apiMock.findParts.mockResolvedValue(none);
    apiMock.requestFindPart.mockResolvedValue({ ok: true });
    renderPanel({ places: ["after_cat"], placeLabels: ["Rear (Oxygen sensor No.2)"], jobName: "oxygen sensor" });
    await waitFor(() => expect(screen.getByTestId("parts-fit-none")).toBeTruthy());
    expect(screen.getByText("Roam doesn't have this part for your Toyota Roomy yet")).toBeTruthy();
    fireEvent.click(screen.getByTestId("parts-fit-ask"));
    await waitFor(() => expect(screen.getByTestId("parts-fit-looking")).toBeTruthy());
    expect(apiMock.requestFindPart).toHaveBeenCalledTimes(1);
    expect(apiMock.requestFindPart).toHaveBeenCalledWith({
      kind: "add_part_info",
      vehicleId: "car-1",
      maintenanceComponentId: "o2",
      positionCodes: ["after_cat"],
      needText: "oxygen sensor · Rear (Oxygen sensor No.2)",
    });
    expect(screen.queryByTestId("parts-fit-ask")).toBeNull();
    expect(screen.getByTestId("parts-fit-asked-on").textContent).toMatch(/^Asked on /);
  });

  it("already asked (by anyone): opens on Roam is looking", async () => {
    apiMock.findParts.mockResolvedValue({ ...none, ask: { state: "looking", askedAt: "2026-11-18T09:00:00Z", byYou: false } });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("parts-fit-looking")).toBeTruthy());
    expect(screen.getByTestId("parts-fit-asked-on").textContent).toBe("Asked on 18 Nov 2026");
    expect(screen.queryByTestId("parts-fit-ask")).toBeNull();
  });

  it("no Skip button (owner 20 Nov): picking is optional; nothing is picked unless a card is tapped", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    const { props } = renderPanel();
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
    expect(screen.queryByTestId("parts-fit-skip")).toBeNull();
    expect(screen.queryByText(/I don't know the part/)).toBeNull();
    expect(props.onPick).not.toHaveBeenCalled();
  });

  it("load error: try again, and the job can still be saved", async () => {
    apiMock.findParts.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(twoParts);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("parts-fit-error")).toBeTruthy());
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
  });

  it("Copy part info copies the car, the part, its number and the other brands (like Find parts)", async () => {
    apiMock.findParts.mockResolvedValue({
      ...twoParts,
      car: { make: "Toyota", model: "Roomy", year: 2019 },
      pickedVariantId: "var-1",
      picked: { id: "var-1", chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD" },
    });
    apiMock.partsLookup.mockImplementation(async (id: string) =>
      id === "p1" ? { reference: { brand: "Toyota (genuine)", number: "89467-B1040" }, brandNumbers: [{ brand: "Denso", number: "234-9119" }] } : {},
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel();
    await waitFor(() => expect(apiMock.partsLookup).toHaveBeenCalledWith("p1", "var-1"));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getAllByTestId("parts-fit-copy")[0]);
    expect(writeText).toHaveBeenCalledWith(
      [
        "Toyota Roomy 2019",
        "Chassis: M900A · Engine: 1KR-FE · Drive: 2WD",
        "Front oxygen sensor (Air fuel ratio sensor)",
        "Toyota (genuine) number: 89467-B1040",
        "Also sold as: Denso 234-9119",
      ].join("\n"),
    );
    expect(screen.getAllByTestId("parts-fit-copy")[0].textContent).toMatch(/Copied|Copy part info/);
  });

  it("the car maker's size sits above the parts (battery M-42 · EFB)", async () => {
    apiMock.findParts.mockResolvedValue({
      ...twoParts,
      carSizes: [{ specKey: "battery_jis", label: "Battery size", value: "M-42", unit: null, type: "EFB", fromCarMaker: true }],
    });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("parts-fit-car-size")).toBeTruthy());
    expect(screen.getByTestId("parts-fit-car-size").textContent).toContain("Toyota lists for your car");
    expect(screen.getByTestId("parts-fit-car-size-line").textContent).toBe("Battery size: M-42 · EFB");
    expect(screen.getByTestId("parts-fit-car-size").textContent).toContain("The parts below fit this size.");
  });

  it("the car's size still shows when Roam has no part for it yet", async () => {
    apiMock.findParts.mockResolvedValue({
      ...none,
      carSizes: [{ specKey: "battery_jis", label: "Battery size", value: "M-42", unit: null, type: null, fromCarMaker: false }],
    });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("parts-fit-none")).toBeTruthy());
    expect(screen.getByTestId("parts-fit-car-size").textContent).toContain("Your car takes");
    expect(screen.getByTestId("parts-fit-car-size").textContent).not.toContain("The parts below");
  });

  it("no size box when the car has no size for this job", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    renderPanel();
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
    expect(screen.queryByTestId("parts-fit-car-size")).toBeNull();
  });

  it("a saved line's part not in today's list still reads as chosen", async () => {
    apiMock.findParts.mockResolvedValue(none);
    renderPanel({ partId: "old", chosenInfo: { name: "Oxygen sensor", brand: "Bosch", number: "0258" } });
    await waitFor(() => expect(screen.getByTestId("parts-fit-chosen-saved")).toBeTruthy());
    expect(screen.queryByTestId("parts-fit-none")).toBeNull();
  });
});

describe("PartsThatFitPanel — Parts to buy (LC-10)", () => {
  beforeEach(() => {
    apiMock.findParts.mockReset();
    apiMock.requestFindPart.mockReset();
    apiMock.partsLookup.mockReset();
    apiMock.partsLookup.mockResolvedValue({});
  });

  it("read-only cards: nothing to pick, no Skip / Plan it / Using, Copy part info stays", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    const { props } = renderPanel({ toBuy: true, partId: "p1" });
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
    expect(screen.getByTestId("parts-fit-title").textContent).toBe("Parts to buy for your Toyota Roomy");
    fireEvent.click(screen.getAllByTestId("parts-fit-card")[0]);
    expect(props.onPick).not.toHaveBeenCalled();
    expect(screen.queryByTestId("parts-fit-skip")).toBeNull();
    expect(screen.queryByTestId("parts-fit-plan-it")).toBeNull();
    expect(screen.queryByTestId("parts-fit-using")).toBeNull();
    expect(screen.getAllByTestId("parts-fit-copy")).toHaveLength(2);
  });

  it("nothing on file: Ask Roam stays, no Skip", async () => {
    apiMock.findParts.mockResolvedValue(none);
    renderPanel({ toBuy: true });
    await waitFor(() => expect(screen.getByTestId("parts-fit-ask")).toBeTruthy());
    expect(screen.queryByTestId("parts-fit-skip")).toBeNull();
  });
});

describe("PartsThatFitPanel — I used a different part (LC-21)", () => {
  const battery = {
    linked: true,
    car: { make: "Toyota", model: "Roomy" },
    carSizes: [{ specKey: "battery_jis", label: "Battery size", value: "M-42", type: "EFB", fromCarMaker: true }],
    plainSections: [
      { items: [{ partId: "u-gs", name: "GS Yuasa M-55", brand: "GS Yuasa", number: "ER-M-55/55B20L", fitLabel: "fits_by_size", status: "verified" }] },
    ],
    ask: { state: "none", askedAt: null, byYou: false },
  };
  beforeEach(() => {
    apiMock.findParts.mockReset();
    apiMock.partsMatch.mockReset();
    apiMock.partsLookup.mockReset();
    apiMock.partsLookup.mockResolvedValue({ reference: null, brandNumbers: [] });
  });

  async function openSearch(over: Partial<React.ComponentProps<typeof PartsThatFitPanel>> = {}) {
    apiMock.findParts.mockResolvedValue(battery);
    const onPickOther = vi.fn();
    const r = renderPanel({ jobId: "bat", jobName: "battery", places: [], placeLabels: [], onPickOther, ...over });
    await waitFor(() => expect(screen.getByTestId("parts-fit-used-different")).toBeTruthy());
    fireEvent.click(screen.getByTestId("parts-fit-used-different"));
    return { ...r, onPickOther };
  }

  it("one box: what's on the label; nothing asked under 4 letters; no part number box, no 'looks it up'", async () => {
    await openSearch();
    expect(screen.getByText("Search by what's on the label")).toBeTruthy();
    expect(screen.queryByText(/part number/i)).toBeNull();
    fireEvent.change(screen.getByTestId("parts-fit-other-search"), { target: { value: "NS6" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(apiMock.partsMatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("roam-looks-it-up")).toBeNull();
    expect(screen.queryByText(/look/i)).toBeNull();
  });

  it("a Roam match not on the car's list: tap → found, with the grey Toyota line", async () => {
    apiMock.partsMatch.mockResolvedValue({
      matches: [{ key: "pm-1", partId: "pm-1", kind: "part", name: "Battery NS60L", brand: "Interstate", number: "PF-NS60L-5-INTL", size: null, type: null }],
    });
    const { onPickOther } = await openSearch();
    fireEvent.change(screen.getByTestId("parts-fit-other-search"), { target: { value: "Interstate NS60" } });
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-other-match")).toHaveLength(1));
    expect(apiMock.partsMatch).toHaveBeenCalledWith("car-1", "bat", "Interstate NS60");
    expect(screen.queryByText(/parts list|database|not on/i)).toBeNull();
    fireEvent.click(screen.getByTestId("parts-fit-other-match"));
    expect(onPickOther).toHaveBeenCalledWith({
      source: "found",
      name: "Interstate Battery NS60L",
      brand: "Interstate",
      number: "PF-NS60L-5-INTL",
      key: "pm-1",
      notListedFor: "Not what Toyota lists (Battery size: M-42 · EFB).",
    });
  });

  it("a match that is a card above picks that card", async () => {
    apiMock.partsMatch.mockResolvedValue({
      matches: [{ key: "size:u-gs", partId: null, kind: "size", name: "GS Yuasa M-55", brand: "GS Yuasa", number: "ER-M-55/55B20L", size: "55B20L", type: "EFB" }],
    });
    const { props, onPickOther } = await openSearch();
    fireEvent.change(screen.getByTestId("parts-fit-other-search"), { target: { value: "yuasa m55" } });
    await waitFor(() => expect(screen.getByTestId("parts-fit-other-match")).toBeTruthy());
    fireEvent.click(screen.getByTestId("parts-fit-other-match"));
    expect(props.onPick).toHaveBeenCalledWith(expect.objectContaining({ partId: "u-gs" }));
    expect(onPickOther).not.toHaveBeenCalled();
  });

  it("not in Roam: Add \"…\" as the battery I used", async () => {
    apiMock.partsMatch.mockResolvedValue({ matches: [] });
    const { onPickOther } = await openSearch();
    fireEvent.change(screen.getByTestId("parts-fit-other-search"), { target: { value: "  Interstate   NS60L " } });
    await waitFor(() => expect(screen.getByTestId("parts-fit-other-add")).toBeTruthy());
    expect(screen.getByTestId("parts-fit-other-add").textContent).toContain('Add "Interstate NS60L" as the battery I used');
    fireEvent.click(screen.getByTestId("parts-fit-other-add"));
    expect(onPickOther).toHaveBeenCalledWith(
      expect.objectContaining({ source: "added", name: "Interstate NS60L", key: null, notListedFor: "Not what Toyota lists (Battery size: M-42 · EFB)." }),
    );
  });

  it("chosen: Using … · Added by you, grey line, cards dimmed, Change clears", async () => {
    apiMock.findParts.mockResolvedValue(battery);
    const onPickOther = vi.fn();
    renderPanel({
      jobId: "bat", jobName: "battery", places: [], placeLabels: [], onPickOther,
      otherPick: { source: "added", name: "Interstate NS60L", brand: "", number: "", key: null, notListedFor: "Not what Toyota lists (Battery size: M-42 · EFB)." },
    });
    await waitFor(() => expect(screen.getByTestId("parts-fit-other-chosen")).toBeTruthy());
    expect(screen.getByTestId("parts-fit-other-label").textContent).toBe("Using Interstate NS60L");
    expect(screen.getByText("Added by you")).toBeTruthy();
    expect(screen.getByTestId("parts-fit-not-listed").textContent).toContain("Not what Toyota lists (Battery size: M-42 · EFB).");
    expect(screen.getAllByTestId("parts-fit-card")[0].className).toContain("opacity-50");
    fireEvent.click(screen.getByTestId("parts-fit-other-change"));
    expect(onPickOther).toHaveBeenCalledWith(null);
  });

  it("never on Parts to buy", async () => {
    apiMock.findParts.mockResolvedValue(battery);
    renderPanel({ jobId: "bat", jobName: "battery", places: [], placeLabels: [], onPickOther: vi.fn(), toBuy: true });
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(1));
    expect(screen.queryByTestId("parts-fit-used-different")).toBeNull();
  });
});

describe("PartsThatFitPanel — label search dropdown (LC-21)", () => {
  it("results drop down under the box; arrow keys + Enter pick; 5 hits say type more; Add is the last row", async () => {
    apiMock.findParts.mockReset();
    apiMock.partsLookup.mockResolvedValue({ reference: null, brandNumbers: [] });
    apiMock.findParts.mockResolvedValue({ linked: true, car: { make: "Toyota", model: "Roomy" }, plainSections: [], ask: { state: "none", askedAt: null, byYou: false } });
    apiMock.partsMatch.mockReset();
    apiMock.partsMatch.mockResolvedValue({
      matches: Array.from({ length: 5 }, (_, i) => ({
        key: `pm-${i}`, partId: `pm-${i}`, kind: "part", name: `Battery ${i}`, brand: "Interstate", number: `N-${i}`, size: null, type: null,
      })),
    });
    const onPickOther = vi.fn();
    renderPanel({ jobId: "bat", jobName: "battery", places: [], placeLabels: [], onPickOther });
    await waitFor(() => expect(screen.getByTestId("parts-fit-used-different")).toBeTruthy());
    fireEvent.click(screen.getByTestId("parts-fit-used-different"));
    const box = screen.getByTestId("parts-fit-other-search");
    fireEvent.change(box, { target: { value: "interstate" } });
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-other-match")).toHaveLength(5));
    expect(screen.getByTestId("parts-fit-other-dropdown")).toBeTruthy();
    expect(screen.queryByText(/narrow|type more|parts list/i)).toBeNull();
    const rows = screen.getByTestId("parts-fit-other-dropdown").querySelectorAll("[role=option]");
    expect(rows[rows.length - 1].getAttribute("data-testid")).toBe("parts-fit-other-add");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPickOther).toHaveBeenCalledWith(expect.objectContaining({ source: "found", key: "pm-1" }));
  });
});
