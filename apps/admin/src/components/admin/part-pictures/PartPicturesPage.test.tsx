/**
 * @vitest-environment jsdom
 *
 * Dominion Part pictures (docs/part-pictures-audit.md §4 S3, done-tests 8, 9, 11, 15, 16, 19): tiles, cards and
 * paging, Remake (with its cost confirmation) / Hide / Show, the waiting reasons and banners, owner-only switch,
 * template Save and the remake-older dialog, loading / error / empty — and no fleet data anywhere (PP-17).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const api = vi.hoisted(() => ({
  listPartPictures: vi.fn(),
  listTemplates: vi.fn(),
  remakeOlder: vi.fn(),
  remakeOlderCount: vi.fn(),
  saveTemplate: vi.fn(),
  setAiPartPictures: vi.fn(),
  remakePartPicture: vi.fn(),
  hidePartPicture: vi.fn(),
  showPartPicture: vi.fn(),
  picturesForNumbers: vi.fn(),
}));
vi.mock("./partPicturesApi", () => api);

import { PartPicturesPage } from "./PartPicturesPage";
import { pictureWord, waitingLine } from "./PartPictureBits";

const BRAKES = { id: "g-brakes", name: "Brakes" };
const pic = (over: Record<string, unknown> = {}) => ({
  id: "pp1",
  status: "made",
  waitingReason: null,
  url: { src: "https://media.roamfleet.co/catalogue/parts/pp1/v1.jpg", srcSet: "" },
  urlDetail: { src: "https://media.roamfleet.co/catalogue/parts/pp1/v1.jpg", srcSet: "" },
  partNumber: "99999-Z0101",
  partName: "Test brake pads",
  manufacturer: "Testmake",
  catalogGroup: BRAKES,
  madeAt: "2026-11-26T10:00:00Z",
  version: 1,
  templateVersion: 1,
  hasDiagram: true,
  ...over,
});

const list = (over: Record<string, unknown> = {}) => ({
  items: [
    pic(),
    pic({ id: "pp2", status: "being_made", url: null, urlDetail: null, partNumber: "99999-Z0102", madeAt: null }),
    pic({ id: "pp3", status: "waiting", waitingReason: "budget", url: null, urlDetail: null, partNumber: "99999-Z0103", madeAt: null }),
    pic({ id: "pp4", status: "hidden", partNumber: "99999-Z0104" }),
    pic({ id: "pp5", status: "failed", url: null, urlDetail: null, partNumber: "99999-Z0105", madeAt: null, hasDiagram: false }),
  ],
  total: 30,
  page: 1,
  pageSize: 24,
  hasOlder: true,
  hasNewer: false,
  nextAfter: "cursor-after",
  nextBefore: "cursor-before",
  counts: { ready: 26, beingMade: 1, waiting: 1, failed: 1, hidden: 1 },
  madeToday: { count: 3, dailyMax: 50 },
  partPictureSpendUsd: 0.16,
  pictureSpend: { usedUsd: 0.31, budgetUsd: 80 },
  aiPicturesOn: true,
  pause: null,
  banners: [],
  ...over,
});

const template = (over: Record<string, unknown> = {}) => ({
  catalogGroupId: "g-filters",
  name: "Filters",
  materials: "Pleated white filter media.",
  enabled: true,
  version: 2,
  updatedBy: "u1",
  updatedByName: "Test Owner",
  updatedAt: "2026-11-26T10:00:00Z",
  ...over,
});

/** "Roam Fleet" is the app's name and Hide/Show "from/in Fleet" are its buttons; nothing else may name a fleet. */
const FLEET_DATA = /\bplates?\b|\bdrivers?\b|used by|vehicles? using|\d+ vehicles?\b/i;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/?page=part-pictures");
  api.listPartPictures.mockResolvedValue(list());
  api.listTemplates.mockResolvedValue([template()]);
  api.remakeOlderCount.mockResolvedValue({ count: 3, needUpload: 1, costUsd: 0.12, days: 1 });
});
afterEach(cleanup);

describe("helpers", () => {
  it("state words and waiting reasons are the plan's", () => {
    expect(pictureWord(null)).toBeNull();
    expect(pictureWord(null, true)).toBe("No diagram");
    expect(pictureWord(pic({ status: "hidden" }) as never)).toBe("Hidden from Fleet");
    expect(waitingLine("off")).toBe("AI pictures are off");
    expect(waitingLine("budget")).toBe("Today's budget is used up");
    expect(waitingLine("key_refused")).toBe("The picture service refused the key");
  });
});

describe("PartPicturesPage", () => {
  it("S3 shows the settings card, five tiles, every card state and paging, with no fleet data", async () => {
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    await screen.findByText("99999-Z0101");
    const page = screen.getByTestId("part-pictures-page");
    expect(within(page).getByText(/Made today/)).toBeTruthy();
    expect(within(page).getByText("3 of 50")).toBeTruthy();
    expect(within(page).getByText("US$0.16")).toBeTruthy();
    expect(screen.getAllByTestId("part-picture-card")).toHaveLength(5);
    expect(screen.getByText("Making the picture")).toBeTruthy();
    expect(screen.getByText("Today's budget is used up")).toBeTruthy();
    expect(screen.getByText(/Roam Fleet doesn.t show this picture/)).toBeTruthy();
    expect(screen.getByText(/The picture couldn.t be made/)).toBeTruthy();
    expect(screen.getByText(/Showing/).textContent).toMatch(/1–5\s*of\s*30/);
    const left = (page.textContent ?? "").replace(/Roam Fleet|from Fleet|in Fleet/g, "");
    expect([left.match(/.{0,30}\bfleet\b.{0,30}/i)?.[0], left.match(FLEET_DATA)?.[0]]).toEqual([undefined, undefined]);
  });

  it("tiles and Older go to the server; the upload filter comes from the address", async () => {
    window.history.replaceState({}, "", "/?page=part-pictures&savedPageId=sp-1");
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    await screen.findByText("99999-Z0101");
    expect(api.listPartPictures).toHaveBeenLastCalledWith(expect.objectContaining({ savedPageId: "sp-1" }));
    fireEvent.click(screen.getByRole("button", { name: /Failed\s*1/ }));
    await waitFor(() => expect(api.listPartPictures).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" })));
    fireEvent.click(screen.getByRole("button", { name: /Older/ }));
    await waitFor(() => expect(api.listPartPictures).toHaveBeenLastCalledWith(expect.objectContaining({ after: "cursor-after" })));
  });

  it("Remake asks first with the cost; Hide and Show act at once", async () => {
    api.remakePartPicture.mockResolvedValue({ ok: true, picture: pic({ status: "being_made", url: null }) });
    api.hidePartPicture.mockResolvedValue({ ok: true, picture: pic({ status: "hidden" }) });
    api.showPartPicture.mockResolvedValue({ ok: true, picture: pic({ id: "pp4", status: "made", partNumber: "99999-Z0104" }) });
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    const card = (await screen.findByText("99999-Z0101")).closest("article")!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /Remake/ }));
    const dialog = await screen.findByRole("dialog", { name: "Make this picture again?" });
    expect(dialog.textContent).toMatch(/US\$0\.04/);
    expect(api.remakePartPicture).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Remake/ }));
    await waitFor(() => expect(api.remakePartPicture).toHaveBeenCalledWith("pp1"));

    const hidden = screen.getByText("99999-Z0104").closest("article") as HTMLElement;
    fireEvent.click(within(hidden).getByRole("button", { name: /Show in Fleet/ }));
    await waitFor(() => expect(api.showPartPicture).toHaveBeenCalledWith("pp4"));
  });

  it("a picture with no diagram left cannot be remade and says why", async () => {
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    const card = (await screen.findByText("99999-Z0105")).closest("article") as HTMLElement;
    expect((within(card).getByRole("button", { name: /Remake/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(card).getByText(/Upload the page again as a single file/)).toBeTruthy();
  });

  it("the large view opens from a picture and closes", async () => {
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Open the picture of 99999-Z0101/ }));
    const view = await screen.findByRole("dialog", { name: /Picture of 99999-Z0101/ });
    expect(view.textContent).toMatch(/Made by AI from the maker's diagram/);
    fireEvent.click(within(view).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Picture of/ })).toBeNull());
  });

  it("banners: key refused, paused, AI off and 80% of the budget", async () => {
    api.listPartPictures.mockResolvedValue(
      list({ banners: [{ kind: "key_refused" }, { kind: "paused", until: "2026-11-26T19:30:00Z" }, { kind: "ai_off" }, { kind: "budget_80" }] }),
    );
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    const banners = await screen.findByTestId("part-pictures-banners");
    expect(banners.textContent).toMatch(/refused the key/);
    expect(banners.textContent).toMatch(/paused/i);
    expect(banners.textContent).toMatch(/AI part pictures are off/);
    expect(banners.textContent).toMatch(/80% of the Gemini budget/);
  });

  it("staff see the switch, template Save and bulk remake disabled with the reason", async () => {
    render(<PartPicturesPage isOwner={false} onBack={() => {}} />);
    await screen.findByText("99999-Z0101");
    expect((screen.getByRole("switch", { name: "AI part pictures" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Only the owner can change this").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: /Templates/ }));
    const card = await screen.findByTestId("part-picture-template");
    expect((within(card).getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
    await within(card).findByText(/3 pictures/);
    expect((within(card).getByRole("button", { name: /Remake pictures made with an older version/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("owner turns AI part pictures off", async () => {
    api.setAiPartPictures.mockResolvedValue({ ok: true });
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    await screen.findByText("99999-Z0101");
    fireEvent.click(screen.getByRole("switch", { name: "AI part pictures" }));
    await waitFor(() => expect(api.setAiPartPictures).toHaveBeenCalledWith(false));
  });

  it("Templates: Save is off until something changes; the bulk remake shows count, cost and days, then confirms", async () => {
    api.saveTemplate.mockResolvedValue({ ok: true, template: template({ version: 3 }) });
    api.remakeOlder.mockResolvedValue({ ok: true, queued: 3, needUpload: 1 });
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Templates/ }));
    const card = await screen.findByTestId("part-picture-template");
    const save = within(card).getByRole("button", { name: /Save/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(within(card).getByText("No changes")).toBeTruthy();
    fireEvent.change(within(card).getByRole("textbox"), { target: { value: "Pleated white filter media, orange edge." } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.saveTemplate).toHaveBeenCalledWith("g-filters", { materials: "Pleated white filter media, orange edge." }));

    const line = await within(card).findByText(/3 pictures · about US\$0\.12 · about 1 day at 50 a day/);
    expect(line).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: /Remake pictures made with an older version/ }));
    const dialog = await screen.findByRole("dialog", { name: /Remake 3 Filters pictures/ });
    expect(dialog.textContent).toMatch(/About US\$0\.12/);
    expect(dialog.textContent).toMatch(/1 more picture needs its page uploaded again/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Remake 3/ })).toBeNull());
    expect(api.remakeOlder).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button", { name: /Remake pictures made with an older version/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: /Remake 3/ })).getByRole("button", { name: /Remake 3 pictures/ }));
    await waitFor(() => expect(api.remakeOlder).toHaveBeenCalledWith("g-filters"));
  });

  it("loading, couldn't load with Try again, and empty", async () => {
    let resolve!: (v: unknown) => void;
    api.listPartPictures.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    expect(screen.getByTestId("part-pictures-loading")).toBeTruthy();
    resolve(list({ items: [], total: 0, counts: { ready: 0, beingMade: 0, waiting: 0, failed: 0, hidden: 0 } }));
    expect(await screen.findByText("No part pictures yet")).toBeTruthy();
    expect(screen.getByText(/Upload a saved page as a single file/)).toBeTruthy();
    cleanup();

    api.listPartPictures.mockRejectedValueOnce(new Error("offline"));
    render(<PartPicturesPage isOwner onBack={() => {}} />);
    const err = await screen.findByTestId("part-pictures-error");
    expect(err.textContent).toMatch(/Couldn.t load the pictures/);
    api.listPartPictures.mockResolvedValue(list());
    fireEvent.click(within(err).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("99999-Z0101")).toBeTruthy();
  });
});
