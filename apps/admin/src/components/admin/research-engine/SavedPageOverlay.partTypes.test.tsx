/**
 * @vitest-environment jsdom
 *
 * S1 of docs/part-type-learning-audit.md: the "Parts Roam doesn't know yet" cards on the saved-page result.
 * Made-up numbers only (the repo is public).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const research = vi.hoisted(() => ({
  savedPage: vi.fn(),
  savedPageWithPictures: vi.fn(),
  uploadSavedPage: vi.fn(),
  savedPages: vi.fn(),
  savedPagePartType: vi.fn(),
  partNames: vi.fn(),
  trackPartName: vi.fn(),
  skipPartName: vi.fn(),
}));
vi.mock("../../../services/researchEngineService", () => ({ researchApi: research }));
const pictures = vi.hoisted(() => ({ listTemplates: vi.fn() }));
vi.mock("../part-pictures/partPicturesApi", () => pictures);

import { SavedPageOverlay } from "./SavedPageOverlay";

const ENGINE = "g-engine";
const BELTS = "g-belts";
const FLUIDS = "g-fluids";

const card = (over: Record<string, unknown> = {}) => ({
  key: "INLET, AIR CLEANER, NO.1",
  name: "Air cleaner inlet",
  groupId: ENGINE,
  groupName: "Engine",
  kind: "new",
  existingTypeId: null,
  positionScheme: "none",
  pagePhrase: "INLET, AIR CLEANER, NO.1",
  numbers: ["99999-Z0301", "99999-Z0302"],
  rowCount: 3,
  numberCount: 2,
  status: "open",
  typeId: null,
  typeName: null,
  reason: null,
  ...over,
});

const unknownRow = (number: string, dates: string, suggestion: string | null, over: Record<string, unknown> = {}) => ({
  partType: "Inlet, air cleaner",
  place: null,
  number,
  dates,
  group: "not_roam_type",
  reason: null,
  jobId: null,
  suggestion,
  ...over,
});

const page = (suggestions: unknown[], rows: unknown[], over: Record<string, unknown> = {}) => ({
  id: "sp-1",
  vehicle_catalog_id: "car-1",
  job_id: null,
  domain: "catalog.example",
  source_url: "https://catalog.example/p",
  file_name: "page.mhtml",
  status: "done",
  stop_reason: null,
  created_at: "2026-11-26T10:00:00Z",
  result: {
    counts: { saved: 0, already: 0, held: 0, not_roam_type: rows.filter((r) => (r as { group: string }).group === "not_roam_type").length },
    rows,
    suggestions,
    ...over,
  },
});

const KEY = "INLET, AIR CLEANER, NO.1";
const baseRows = [
  unknownRow("99999-Z0301", "11.2016 – 12.2019", KEY),
  unknownRow("99999-Z0301", "01.2020 – 09.2020", KEY),
  unknownRow("99999-Z0302", "11.2016 – 09.2020", KEY),
  unknownRow("99999-Z0901", "11.2016 – 09.2020", "CLIP, HOSE", { partType: "Clip, hose" }),
];
const fixing = card({ key: "CLIP, HOSE", name: "Hose clip", kind: "fixings", pagePhrase: "CLIP, HOSE", numbers: ["99999-Z0901"], rowCount: 1, numberCount: 1 });

function show(p: unknown, owner = true) {
  research.savedPage.mockResolvedValue(p);
  research.savedPageWithPictures.mockResolvedValue({ savedPage: p, picturesAiOn: true });
  return render(
    <SavedPageOverlay
      token="t"
      carId="car-1"
      carLabel="Testmake Testmodel"
      savedPageId="sp-1"
      owner={owner}
      onClose={() => {}}
      onChanged={() => {}}
      onCheckPart={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  pictures.listTemplates.mockResolvedValue([
    { catalogGroupId: ENGINE, name: "Engine", materials: "", enabled: true, version: 1, updatedBy: null, updatedByName: null, updatedAt: "" },
    { catalogGroupId: BELTS, name: "Belts & hoses", materials: "", enabled: true, version: 1, updatedBy: null, updatedByName: null, updatedAt: "" },
    { catalogGroupId: FLUIDS, name: "Fluids", materials: "", enabled: false, version: 1, updatedBy: null, updatedByName: null, updatedAt: "" },
  ]);
});
afterEach(cleanup);

describe("SavedPageOverlay — parts Roam doesn't know yet", () => {
  it("shows a ready card: name, page words, group picker with 'no picture', rows, dates, the fixings line", async () => {
    show(page([card(), fixing], baseRows));
    const c = await screen.findByTestId("suggestion-card");
    expect(c.getAttribute("data-state")).toBe("ready");
    expect((within(c).getByTestId("suggestion-name") as HTMLInputElement).value).toBe("Air cleaner inlet");
    expect(within(c).getAllByText(KEY).length).toBeGreaterThan(0);
    expect(within(c).getByTestId("suggestion-rows").textContent).toMatch(/3 rows · 99999-Z0301, 99999-Z0302/);
    expect(within(c).getByTestId("suggestion-rows").textContent).toMatch(/11\.2016 – 12\.2019 and 01\.2020 – 09\.2020/);
    await waitFor(() => expect(within(c).getByText("Fluids — no picture")).toBeTruthy());
    expect(screen.getByTestId("saved-page-fixings").textContent).toMatch(/1 fixing \(hose clip\) — Roam doesn.t track these/);
    expect(within(c).getByTestId("suggestion-add").textContent).toMatch(/Add part type/);
  });

  it("Add part type sends the owner's name and group, then redraws from the answer as Added", async () => {
    const after = page(
      [card({ status: "added", typeId: "t-1", typeName: "Intake inlet", groupId: BELTS, groupName: "Belts & hoses" }), fixing],
      [
        ...baseRows.slice(0, 3).map((r) => ({ ...r, group: "saved", partType: "Intake inlet" })),
        baseRows[3],
      ],
    );
    research.savedPagePartType.mockResolvedValue({ savedPage: after, picturesAiOn: true });
    show(page([card(), fixing], baseRows));
    const c = await screen.findByTestId("suggestion-card");
    await waitFor(() => expect(within(c).getByText("Belts & hoses")).toBeTruthy());
    fireEvent.change(within(c).getByTestId("suggestion-name"), { target: { value: "Intake inlet" } });
    fireEvent.change(within(c).getByTestId("suggestion-group"), { target: { value: BELTS } });
    fireEvent.click(within(c).getByTestId("suggestion-add"));
    await waitFor(() => expect(screen.getByTestId("suggestion-card").getAttribute("data-state")).toBe("added"));
    expect(research.savedPagePartType).toHaveBeenCalledWith("t", "sp-1", { key: KEY, action: "add", name: "Intake inlet", groupId: BELTS });
    expect(screen.getByTestId("suggestion-added-line").textContent).toMatch(/3 parts saved · pictures being made/);
    expect(screen.queryByTestId("suggestion-add")).toBeNull();
  });

  it("an added card with held rows says Added, needs you and never offers Check this part (Rev 2 §4)", async () => {
    const p = page(
      [card({ status: "added", typeId: "t-1", typeName: "Air cleaner inlet" })],
      [{ ...baseRows[0], group: "held", reason: "Dates missing 03.2019 – 09.2020", jobId: "job-9" }],
    );
    show(p);
    const c = await screen.findByTestId("suggestion-card");
    expect(c.getAttribute("data-state")).toBe("added_held");
    expect(within(c).getByText("Added, needs you")).toBeTruthy();
    expect(within(c).queryByTestId("saved-page-check-part")).toBeNull();
    expect(within(c).getByTestId("saved-page-reason").textContent).toMatch(/Dates missing/);
  });

  it("a different number on file shows under Not saved with its reason, never under Already on file (Rev 2 §3.8)", async () => {
    const reason = "Roam already has a different number here (11111-A0001)";
    const base = page([], [{ ...baseRows[0], group: "not_saved", reason, jobId: null }]);
    const p = { ...base, result: { ...base.result, counts: { saved: 0, already: 0, held: 0, not_saved: 1, left_for_later: 0, not_roam_type: 0 } } };
    show(p);
    const g = await screen.findByTestId("group-not-saved");
    expect(within(g).getByTestId("saved-page-reason").textContent).toContain(reason);
    // A fact, not a warning: grey with the info icon.
    expect(within(g).getByTestId("saved-page-reason").textContent).toMatch(/^info/);
    expect(screen.queryByTestId("group-already")).toBeNull();
    expect(screen.queryByTestId("saved-page-check-part")).toBeNull();
    expect(screen.getByTestId("saved-page-result-title").textContent).toBe("Nothing new to save");
  });

  it("left-for-later rows show only as one skipped line with no button and don't count as need you (Rev 2 §3.3)", async () => {
    const base = page([], [{ ...baseRows[0], group: "left_for_later", reason: null, jobId: null }, { ...baseRows[1], group: "left_for_later", reason: null, jobId: null }]);
    const p = { ...base, result: { ...base.result, counts: { saved: 0, already: 0, held: 0, not_saved: 0, left_for_later: 2, not_roam_type: 0 }, skipped: 2 } };
    show(p);
    const line = await screen.findByTestId("saved-page-skipped");
    expect(line.textContent).toMatch(/Roam skipped 2 rows it couldn.t prove from the page/);
    expect(line.querySelector("button")).toBeNull();
    expect(screen.queryByTestId("group-held")).toBeNull();
    expect(screen.getByTestId("saved-page-result-title").textContent).not.toMatch(/need you/);
  });

  it("a failed add keeps the typed name and shows the server's reason with Try again", async () => {
    research.savedPagePartType.mockRejectedValue(new Error("Roam is checking this part now. Try again in a few minutes."));
    show(page([card()], baseRows.slice(0, 3)));
    const c = await screen.findByTestId("suggestion-card");
    fireEvent.change(within(c).getByTestId("suggestion-name"), { target: { value: "Breather inlet" } });
    fireEvent.click(within(c).getByTestId("suggestion-add"));
    await waitFor(() => expect(within(c).getByTestId("suggestion-reason").textContent).toMatch(/checking this part now/));
    expect(within(c).getByTestId("suggestion-add").textContent).toMatch(/Try again/);
    expect((within(c).getByTestId("suggestion-name") as HTMLInputElement).value).toBe("Breather inlet");
  });

  it("an existing match offers Save under that type and sends no name or group", async () => {
    research.savedPagePartType.mockResolvedValue({ savedPage: page([card({ kind: "existing", name: "Coil spring", status: "added", typeId: "t-2", typeName: "Coil spring" })], []), picturesAiOn: false });
    show(page([card({ kind: "existing", name: "Coil spring", existingTypeId: "t-2" })], baseRows.slice(0, 3)));
    const c = await screen.findByTestId("suggestion-card");
    expect(within(c).getByTestId("suggestion-existing").textContent).toMatch(/Roam already has this: Coil spring/);
    expect(within(c).queryByTestId("suggestion-name")).toBeNull();
    fireEvent.click(within(c).getByText("Save under Coil spring"));
    await waitFor(() => expect(research.savedPagePartType).toHaveBeenCalledWith("t", "sp-1", { key: KEY, action: "add" }));
  });

  it("Not a part we track removes the card; its rows stay listed with no button", async () => {
    research.savedPagePartType.mockResolvedValue({ savedPage: page([card({ status: "dismissed" })], baseRows.slice(0, 3)), picturesAiOn: true });
    show(page([card()], baseRows.slice(0, 3)));
    const c = await screen.findByTestId("suggestion-card");
    fireEvent.click(within(c).getByTestId("suggestion-dismiss"));
    await waitFor(() => expect(screen.queryByTestId("suggestion-card")).toBeNull());
    expect(research.savedPagePartType).toHaveBeenCalledWith("t", "sp-1", { key: KEY, action: "dismiss" });
    expect(within(screen.getByTestId("saved-page-other-list")).getAllByText(/99999-Z030/).length).toBe(3);
  });

  it("a staff login sees the card locked with 'Only the owner can add a part type'", async () => {
    show(page([card()], baseRows.slice(0, 3)), false);
    const c = await screen.findByTestId("suggestion-card");
    expect(within(c).getByTestId("suggestion-owner-only").textContent).toMatch(/Only the owner can add a part type/);
    expect((within(c).getByTestId("suggestion-add") as HTMLButtonElement).disabled).toBe(true);
    expect((within(c).getByTestId("suggestion-dismiss") as HTMLButtonElement).disabled).toBe(true);
    expect((within(c).getByTestId("suggestion-name") as HTMLInputElement).disabled).toBe(true);
  });

  it("a page whose unknown rows are all fixings shows the fixings line and no cards", async () => {
    show(page([fixing], [baseRows[3]]));
    expect((await screen.findByTestId("saved-page-fixings")).textContent).toMatch(/hose clip/);
    expect(screen.queryByTestId("suggestion-card")).toBeNull();
  });

  it("an older result with no suggestions keeps the folded Not a Roam part type list", async () => {
    const old = page([], baseRows.slice(0, 1));
    delete (old.result as { suggestions?: unknown }).suggestions;
    show(old);
    expect(await screen.findByTestId("group-other")).toBeTruthy();
    expect(screen.queryByTestId("group-unknown")).toBeNull();
  });

  it("an upload Roam sorted shows one summary line, New part type on its rows, the waiting line, and Review", async () => {
    research.partNames.mockResolvedValue({ items: [], nextCursor: null });
    const rows = [
      { ...unknownRow("99999-Z0301", "11.2016 – 09.2020", KEY), group: "saved", partType: "Air cleaner inlet" },
      unknownRow("99999-Z0700", "11.2016 – 09.2020", "DUCT, EXAMPLE", { partType: "Duct, example" }),
      unknownRow("99999-Z0800", "11.2016 – 09.2020", "PIPE, EXAMPLE", { partType: "Pipe, example" }),
      baseRows[3],
    ];
    const p = page(
      [
        card({ status: "added", typeId: "t-1", typeName: "Air cleaner inlet", rowCount: 1 }),
        card({ key: "DUCT, EXAMPLE", name: "Example duct", status: "skipped", rowCount: 1, pagePhrase: "DUCT, EXAMPLE" }),
        card({ key: "PIPE, EXAMPLE", name: "Example pipe", status: "waiting", rowCount: 1, pagePhrase: "PIPE, EXAMPLE" }),
        fixing,
      ],
      rows,
    );
    show(p);
    const line = await screen.findByTestId("sort-summary-line");
    expect(line.textContent).toBe("Roam sorted 3 rows · 1 new part type · 1 fixing · 1 name not tracked");
    expect(screen.getByTestId("sort-summary-waiting").textContent).toMatch(/Roam will sort 1 name shortly/);
    expect(screen.queryByTestId("suggestion-card")).toBeNull();
    expect(within(screen.getByTestId("group-saved")).getByTestId("saved-page-new-type").textContent).toMatch(/New part type/);
    fireEvent.click(screen.getByTestId("sort-summary-review"));
    expect(await screen.findByTestId("sorted-by-roam")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sorted-back"));
    expect(await screen.findByTestId("sort-summary-line")).toBeTruthy();
  });
});
