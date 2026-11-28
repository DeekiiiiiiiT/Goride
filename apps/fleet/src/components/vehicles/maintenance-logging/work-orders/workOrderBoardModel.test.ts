import { describe, expect, it } from "vitest";
import type { WorkOrderBoardCard } from "../../../../types/maintenance";
import { boardActions, boardSections, matchesSearch, money, reasonProblem, whenLine } from "./workOrderBoardModel";

const card = (over: Partial<WorkOrderBoardCard> = {}): WorkOrderBoardCard => ({
  id: "w1",
  status: "in_shop",
  stage: "garage",
  stageLabel: "At the garage",
  vehicleId: "5179KZ",
  plate: "5179KZ",
  make: "Toyota",
  model: "Roomy",
  year: "2019",
  garage: "Whol-Hearted Car Service Ltd",
  openedAt: "2026-11-25T18:10:00Z",
  offRoadAt: "2026-11-26T14:30:00Z",
  daysOffRoad: 1,
  performedAtDate: null,
  closedAt: null,
  odometer: null,
  total: null,
  priority: null,
  cancelReason: null,
  jobs: ["Rotate tires", "Engine oil"],
  request: { recordId: "r1", recordStatus: "Requested", type: "Brakes", text: "Squeak from the front when braking", priority: "High", date: "2026-11-25T18:10:00Z", photoUrl: null, odometer: 200932, performedAtDate: "2026-11-25", version: 1 },
  ...over,
});

describe("Work orders tab (maintenance step 11)", () => {
  it("search finds a work order by plate, garage, job or the driver's words", () => {
    expect(matchesSearch(card(), "5179")).toBe(true);
    expect(matchesSearch(card(), "whol-hearted")).toBe(true);
    expect(matchesSearch(card(), "engine oil")).toBe(true);
    expect(matchesSearch(card(), "squeak")).toBe(true);
    expect(matchesSearch(card(), "honda")).toBe(false);
  });

  it("chips show their own sections", () => {
    const board = { open: [card()], done: [card({ id: "d", stage: "done" })], cancelled: [card({ id: "c", stage: "cancelled" })] };
    expect(boardSections(board, "open", "").open).toHaveLength(1);
    expect(boardSections(board, "open", "").done).toHaveLength(0);
    const all = boardSections(board, "all", "");
    expect([all.open.length, all.done.length, all.cancelled.length]).toEqual([1, 1, 1]);
  });

  it("done work is listed newest first by the day it was done", () => {
    const board = {
      open: [],
      done: [
        card({ id: "mar", stage: "done", performedAtDate: "2026-03-10" }),
        card({ id: "aug", stage: "done", performedAtDate: "2026-08-22" }),
        card({ id: "may", stage: "done", performedAtDate: "2026-05-23" }),
      ],
      cancelled: [],
    };
    expect(boardSections(board, "done", "").done.map((w) => w.id)).toEqual(["aug", "may", "mar"]);
  });

  it("what each stage can do: Mark done only with the driver's request behind it", () => {
    expect(boardActions(card({ stage: "decision" }))).toMatchObject({ approve: true, decline: true, takeIn: false, markDone: false });
    expect(boardActions(card({ stage: "waiting" }))).toMatchObject({ takeIn: true, markDone: true, cancel: true });
    expect(boardActions(card({ stage: "garage", request: null }))).toMatchObject({ markDone: false, cancel: true });
    expect(boardActions(card({ stage: "done" }))).toMatchObject({ viewService: true, cancel: false });
  });

  it("lines read plainly", () => {
    expect(whenLine(card())).toMatch(/^At the garage since 26 Nov 2026, .* · 1 day off the road$/);
    expect(whenLine(card({ stage: "done", performedAtDate: "2026-08-22", odometer: 180088 }))).toBe("22 Aug 2026 · 180,088 km");
    expect(whenLine(card({ stage: "cancelled", cancelReason: "Driver fixed it" }))).toBe("Cancelled: Driver fixed it");
    expect(money(8000)).toBe("J$8,000.00");
    expect(reasonProblem("no")).toBe("Say why in a few words.");
    expect(reasonProblem("Fixed at home")).toBeNull();
  });
});
