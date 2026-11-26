/**
 * @vitest-environment jsdom
 *
 * S1 part pictures on the saved-page result (docs/part-pictures-audit.md §4 S1, done-tests 1, 2, 13): the row
 * thumbnail and state, the pictures line, the single-file notice, "Nothing new to save" and See pictures.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const research = vi.hoisted(() => ({ savedPage: vi.fn(), savedPageWithPictures: vi.fn(), uploadSavedPage: vi.fn(), savedPages: vi.fn() }));
vi.mock("../../../services/researchEngineService", () => ({ researchApi: research }));

import { SavedPageOverlay } from "./SavedPageOverlay";

const made = {
  id: "pp1",
  status: "made",
  waitingReason: null,
  url: { src: "https://media.roamfleet.co/catalogue/parts/pp1/v1.jpg", srcSet: "" },
  urlDetail: null,
  partNumber: "99999-Z0101",
  partName: "Test filter",
  manufacturer: "Testmake",
  catalogGroup: null,
  madeAt: "2026-11-26T10:00:00Z",
  version: 1,
  templateVersion: 1,
  hasDiagram: true,
};

const page = (over: Record<string, unknown> = {}, rows: Array<Record<string, unknown>> = []) => ({
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
    counts: { saved: 0, already: 1, held: 0, not_roam_type: 2 },
    rows: [
      { partType: "Air filter", place: null, number: "99999-Z0101", dates: "11.2016 – 09.2020", group: "already", reason: null, jobId: null, ...rows[0] },
      { partType: "Hose", place: null, number: "99999-Z0900", dates: null, group: "not_roam_type", reason: null, jobId: null },
    ],
    pictures: { queued: 1, alreadyHave: 0, noDiagram: 0, failed: false, rows: [{ number: "99999-Z0101", status: "queued" }] },
  },
  ...over,
});

const open = () =>
  render(
    <SavedPageOverlay token="t" carId="car-1" carLabel="Testmake Testmodel" savedPageId="sp-1" onClose={() => {}} onChanged={() => {}} onCheckPart={() => {}} />,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SavedPageOverlay — part pictures", () => {
  it("Nothing new to save, the row's Making state, the pictures line and See pictures", async () => {
    const p = page({}, [{ picture: { ...made, status: "being_made", url: null } }]);
    research.savedPage.mockResolvedValue(page());
    research.savedPageWithPictures.mockResolvedValue({ savedPage: p, picturesAiOn: true });
    open();
    expect(await screen.findByText("Nothing new to save")).toBeTruthy();
    expect((await screen.findByTestId("saved-page-picture-state")).textContent).toMatch(/Making/);
    expect(screen.getByTestId("saved-page-pictures-line").textContent).toMatch(/Pictures: 1 being made/);
    expect(screen.queryByTestId("saved-page-needs-drawing")).toBeNull();
    const pushed = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByTestId("saved-page-see-pictures"));
    expect(String(pushed.mock.calls[0]?.[2])).toMatch(/page=part-pictures&savedPageId=sp-1/);
  });

  it("a normal .html save shows the single-file notice and No diagram, and no See pictures", async () => {
    const p = page({ file_name: "page.html" });
    research.savedPage.mockResolvedValue(p);
    research.savedPageWithPictures.mockResolvedValue({ savedPage: p, picturesAiOn: true });
    open();
    const notice = await screen.findByTestId("saved-page-needs-drawing");
    expect(notice.textContent).toMatch(/Pictures need the drawing/);
    expect(notice.textContent).toMatch(/Webpage, Single File/);
    expect(screen.getByTestId("saved-page-picture-state").textContent).toMatch(/No diagram/);
    expect(screen.queryByTestId("saved-page-see-pictures")).toBeNull();
  });

  it("a picture step that failed says so; the parts stay", async () => {
    const p = page();
    (p.result.pictures as { failed: boolean }).failed = true;
    research.savedPage.mockResolvedValue(p);
    research.savedPageWithPictures.mockResolvedValue({ savedPage: p, picturesAiOn: true });
    open();
    expect((await screen.findByTestId("saved-page-pictures-line")).textContent).toMatch(/couldn.t be queued — try again in a minute/);
    expect(within(screen.getByTestId("group-already")).getByText(/99999-Z0101/)).toBeTruthy();
  });

  it("with AI part pictures off, nothing about pictures shows", async () => {
    const p = page({}, [{ picture: made }]);
    research.savedPage.mockResolvedValue(p);
    research.savedPageWithPictures.mockResolvedValue({ savedPage: p, picturesAiOn: false });
    open();
    await screen.findByText("Nothing new to save");
    expect(screen.queryByTestId("saved-page-pictures-line")).toBeNull();
    expect(screen.queryByTestId("saved-page-picture-state")).toBeNull();
    expect(screen.queryByTestId("saved-page-see-pictures")).toBeNull();
  });
});
