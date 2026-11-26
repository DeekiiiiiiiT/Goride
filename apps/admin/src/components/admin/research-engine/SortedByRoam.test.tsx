/**
 * @vitest-environment jsdom
 *
 * S2 of docs/part-type-auto-sort-audit.md: "Sorted by Roam" — both tabs, flip buttons, Track on more uploads,
 * owner answers, staff view, empty and error. Made-up names only.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const research = vi.hoisted(() => ({ partNames: vi.fn(), trackPartName: vi.fn(), skipPartName: vi.fn() }));
vi.mock("../../../services/researchEngineService", () => ({ researchApi: research }));

import { SortedByRoam } from "./SortedByRoam";

const added = {
  key: "MOTORSUBASSYEXAMPLE",
  phrase: "example motor",
  name: "Example motor",
  typeId: "t-1",
  typeName: "Example motor",
  groupName: "HVAC",
  reason: "Replaced on its own",
  setBy: "roam",
  at: "2026-11-26T10:00:00Z",
  uploads: 1,
};
const skipped = {
  key: "DUCTEXAMPLE",
  phrase: "DUCT, EXAMPLE",
  name: null,
  typeId: null,
  typeName: null,
  groupName: null,
  reason: "Part of the heater unit",
  setBy: "roam",
  at: "2026-11-26T10:00:00Z",
  uploads: 34,
};
const ownerSkip = { ...skipped, key: "WASHEREXAMPLE", phrase: "WASHER, EXAMPLE", setBy: "owner", reason: "You said not tracked", at: "2026-11-20T10:00:00Z" };

function lists(addedItems: unknown[], notTracked: unknown[], next: string | null = null) {
  research.partNames.mockImplementation((_t: string, tab: string) =>
    Promise.resolve(tab === "added" ? { items: addedItems, nextCursor: next } : { items: notTracked, nextCursor: null }),
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SortedByRoam", () => {
  it("Added tab: name, group, reason · uploads · date, Don't track; Show more pages on", async () => {
    lists([added], [skipped], "cursor-1");
    render(<SortedByRoam token="t" owner />);
    const row = await screen.findByTestId("sorted-row");
    expect(row.textContent).toMatch(/Example motor/);
    expect(row.textContent).toMatch(/HVAC/);
    expect(within(row).getByTestId("sorted-row-line").textContent).toBe("Replaced on its own · on 1 upload · 26 Nov 2026");
    expect(within(row).getByTestId("sorted-row-button").textContent).toMatch(/Don't track/);
    expect(screen.getByTestId("sorted-tab-added").textContent).toMatch(/1\+/);
    fireEvent.click(screen.getByTestId("sorted-show-more"));
    await waitFor(() => expect(research.partNames).toHaveBeenCalledWith("t", "added", "cursor-1"));
  });

  it("Don't track flips the answer and reloads both tabs", async () => {
    lists([added], []);
    research.skipPartName.mockResolvedValue({ ok: true, drafted: true, pages: 1 });
    render(<SortedByRoam token="t" owner />);
    fireEvent.click(within(await screen.findByTestId("sorted-row")).getByTestId("sorted-row-button"));
    await waitFor(() => expect(research.skipPartName).toHaveBeenCalledWith("t", "MOTORSUBASSYEXAMPLE"));
    await waitFor(() => expect(research.partNames.mock.calls.filter((c) => c[1] === "added").length).toBe(2));
  });

  it("Not tracked: the page's words, Track it, then Track on N more uploads while some remain", async () => {
    lists([], [skipped, ownerSkip]);
    research.trackPartName.mockResolvedValueOnce({ ok: true, saved: 10, pages: 10, remaining: 24, busy: false, type: { id: "t-2", name: "Example duct" } });
    render(<SortedByRoam token="t" owner />);
    fireEvent.click(await screen.findByTestId("sorted-tab-not_tracked"));
    const rows = await screen.findAllByTestId("sorted-row");
    expect(rows[0].textContent).toMatch(/DUCT, EXAMPLE/);
    expect(within(rows[1]).getByTestId("sorted-row-line").textContent).toBe("You set this · 20 Nov 2026");
    fireEvent.click(within(rows[0]).getByTestId("sorted-row-button"));
    await waitFor(() => expect(within(rows[0]).getByTestId("sorted-tracked").textContent).toMatch(/Tracked on 10 uploads/));
    expect(within(rows[0]).getByTestId("sorted-row-button").textContent).toMatch(/Track on 24 more uploads/);
  });

  it("staff see the list with every button disabled and one line", async () => {
    lists([added], []);
    render(<SortedByRoam token="t" owner={false} />);
    const row = await screen.findByTestId("sorted-row");
    expect((within(row).getByTestId("sorted-row-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("sorted-owner-only").textContent).toMatch(/Only the owner can change this/);
  });

  it("empty, and couldn't load with Try again", async () => {
    lists([], []);
    render(<SortedByRoam token="t" owner />);
    expect((await screen.findByTestId("sorted-empty")).textContent).toMatch(/Nothing sorted yet\./);
    cleanup();
    research.partNames.mockRejectedValueOnce(new Error("HTTP 504")).mockResolvedValue({ items: [], nextCursor: null });
    render(<SortedByRoam token="t" owner />);
    const box = await screen.findByTestId("sorted-error");
    expect(box.textContent).toMatch(/Couldn.t load Roam.s answers\./);
    expect(box.textContent).not.toMatch(/504/);
    fireEvent.click(within(box).getByText(/Try again/));
    expect(await screen.findByTestId("sorted-empty")).toBeTruthy();
  });
});
