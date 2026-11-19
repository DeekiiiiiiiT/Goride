/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ findParts: vi.fn(), requestFindPart: vi.fn() }));
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
    placeLabels: ["Front (before converter)"],
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
    renderPanel({ places: ["after_cat"], placeLabels: ["Rear (after converter)"], jobName: "oxygen sensor" });
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
      needText: "oxygen sensor · Rear (after converter)",
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

  it("Skip collapses the panel and can be undone", async () => {
    apiMock.findParts.mockResolvedValue(twoParts);
    const { props } = renderPanel();
    await waitFor(() => expect(screen.getByTestId("parts-fit-skip")).toBeTruthy());
    fireEvent.click(screen.getByTestId("parts-fit-skip"));
    expect(props.onPick).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("parts-fit-skipped")).toBeTruthy();
    fireEvent.click(screen.getByText("Show the parts that fit"));
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
  });

  it("load error: try again, and the job can still be saved", async () => {
    apiMock.findParts.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(twoParts);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("parts-fit-error")).toBeTruthy());
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getAllByTestId("parts-fit-card")).toHaveLength(2));
  });

  it("a saved line's part not in today's list still reads as chosen", async () => {
    apiMock.findParts.mockResolvedValue(none);
    renderPanel({ partId: "old", chosenInfo: { name: "Oxygen sensor", brand: "Bosch", number: "0258" } });
    await waitFor(() => expect(screen.getByTestId("parts-fit-chosen-saved")).toBeTruthy());
    expect(screen.queryByTestId("parts-fit-none")).toBeNull();
  });
});
