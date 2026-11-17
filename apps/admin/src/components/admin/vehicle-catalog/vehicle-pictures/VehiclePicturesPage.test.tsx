/**
 * @vitest-environment jsdom
 *
 * Dominion Vehicle pictures (audit D1–D7): gallery, drawer actions, owner-only controls,
 * and T20 — no fleet name, plate, driver, vehicle count or "used by" on any screen.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const api = vi.hoisted(() => ({
  listPictures: vi.fn(),
  getPicture: vi.fn(),
  setAiPictures: vi.fn(),
  previewRemake: vi.fn(),
  startRemake: vi.fn(),
  ratePicture: vi.fn(),
  regeneratePicture: vi.fn(),
  restorePicture: vi.fn(),
  removePicture: vi.fn(),
  replacePicture: vi.fn(),
}));
vi.mock("./vehiclePicturesApi", () => api);

import {
  VehiclePicturesPage,
  carTitle,
  madeLine,
  remakeBudgetSentence,
  restorableVersion,
  uploadProblem,
} from "./VehiclePicturesPage";

const roomy = {
  id: "p1", make: "Toyota", model: "Roomy", generation: "1st gen", bodyType: "Hatchback",
  startYear: 2016, endYear: 2020, color: "white", status: "ready" as const, rating: null,
  source: "ai", madeAt: "2026-11-16T10:00:00Z", url: { src: "https://media.roamfleet.co/x.png", srcSet: "" }, stale: false,
};
const failed = { ...roomy, id: "p2", model: "Swift", make: "Suzuki", status: "failed" as const, url: null };

const list = (over: Record<string, unknown> = {}) => ({
  items: [roomy, failed],
  total: 2,
  counts: { ready: 1, beingMade: 0, failed: 1, stale: 0 },
  pictureSpend: { usedUsd: 12.4, budgetUsd: 50 },
  aiPicturesOn: true,
  pause: null,
  remakePausedLeft: null,
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  picture: roomy,
  inUse: true,
  howMade: { promptVersion: 1, aiModel: "imagen-4.0-generate-001", costUsd: 0.04, madeAt: roomy.madeAt, attempts: 1, lastError: null },
  versions: [
    { version: 2, source: "ai", createdAt: "2026-11-16T10:00:00Z", retiredAt: null, url: roomy.url },
    { version: 1, source: "ai", createdAt: "2026-11-10T10:00:00Z", retiredAt: "2026-11-16T10:00:00Z", url: roomy.url },
  ],
  ...over,
});

const FLEET_WORDS = /\bfleet\b|plate|driver|used by|vehicles? using|\d+ vehicles?\b/i;

beforeEach(() => {
  vi.clearAllMocks();
  api.listPictures.mockResolvedValue(list());
  api.getPicture.mockResolvedValue(detail());
});
afterEach(cleanup);

describe("helpers", () => {
  it("made line, restore window, upload checks, budget sentence", () => {
    expect(madeLine(roomy)).toBe("Made 16 Nov 2026 · AI");
    expect(madeLine({ ...roomy, status: "queued" })).toBe("Queued · AI");
    expect(restorableVersion(detail() as never, new Date("2026-11-20T00:00:00Z"))?.version).toBe(1);
    expect(restorableVersion(detail() as never, new Date("2027-01-20T00:00:00Z"))).toBeNull();
    expect(uploadProblem(new File(["x"], "a.gif", { type: "image/gif" }))).toMatch(/PNG, JPEG or WebP/);
    expect(uploadProblem(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
    expect(
      remakeBudgetSentence({ count: 1204, costUsd: 48.16, hours: 10, fitsThisMonth: false }, { usedUsd: 12.4, budgetUsd: 50 }, new Date("2026-11-16T00:00:00Z")),
    ).toBe("This month has US$37.60 of picture budget left. About 940 pictures will be remade this month; the rest continue from 1 Dec.");
  });
});

describe("VehiclePicturesPage", () => {
  it("D1 shows counts, cards and paging with no fleet data", async () => {
    const { container } = render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    expect(screen.getByText("One studio picture per car and colour.")).toBeTruthy();
    expect(screen.getAllByText("Made 16 Nov 2026 · AI").length).toBe(2);
    expect(screen.getByText("Picture failed")).toBeTruthy();
    expect(screen.getByText(/Showing/).textContent).toContain("1–2");
    expect(container.textContent ?? "").not.toMatch(FLEET_WORDS);
  });

  it("filters go to the server: status tile and Stale look", async () => {
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    fireEvent.click(screen.getByRole("button", { name: /^Failed/ }));
    await waitFor(() => expect(api.listPictures).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", page: 1 })));
    fireEvent.click(screen.getByRole("button", { name: /Stale look/ }));
    await waitFor(() => expect(api.listPictures).toHaveBeenLastCalledWith(expect.objectContaining({ stale: true })));
  });

  it("AI switch and Remake are owner only", async () => {
    render(<VehiclePicturesPage isOwner={false} onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    expect((screen.getByRole("switch", { name: "AI pictures" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Remake all/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("owner turns AI pictures off", async () => {
    api.setAiPictures.mockResolvedValueOnce({ ok: true, aiPicturesOn: false });
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    fireEvent.click(screen.getByRole("switch", { name: "AI pictures" }));
    await waitFor(() => expect(api.setAiPictures).toHaveBeenCalledWith(false));
    expect(await screen.findByText(/AI pictures are off/)).toBeTruthy();
  });

  it("banners: key rejected and remake paused", async () => {
    api.listPictures.mockResolvedValue(list({ pause: { until: "2026-11-16T15:40:00Z", reason: "key" }, remakePausedLeft: 264 }));
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    expect(await screen.findByText(/Picture service key rejected/)).toBeTruthy();
    expect(screen.getByText(/Remake paused at the monthly budget — 264 left/)).toBeTruthy();
  });

  it("D7 empty and error states", async () => {
    api.listPictures.mockResolvedValueOnce(list({ items: [], total: 0 }));
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    expect(await screen.findByText("No pictures yet")).toBeTruthy();
    expect(screen.getByText("Roam makes them as cars are added.")).toBeTruthy();
    cleanup();
    api.listPictures.mockRejectedValueOnce(new Error("Network down")).mockResolvedValueOnce(list());
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    fireEvent.click(await screen.findByText("Try again"));
    expect(await screen.findByText("Toyota Roomy")).toBeTruthy();
  });

  it("D2 → Looks wrong → Regenerate (D3); Remove is blocked while apps use it; no fleet data", async () => {
    api.ratePicture.mockResolvedValue({ ok: true });
    api.regeneratePicture.mockResolvedValue({ ok: true });
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    fireEvent.click(screen.getAllByText("Open")[0]);
    const drawer = await screen.findByRole("dialog", { name: "Picture" });
    await within(drawer).findByText("How it was made");
    expect(within(drawer).getByText("imagen-4.0-generate-001")).toBeTruthy();
    expect((within(drawer).getByText("Remove picture") as HTMLButtonElement).disabled).toBe(true);
    expect(within(drawer).getByText("Apps already use this picture — regenerate or replace it instead.")).toBeTruthy();
    expect(within(drawer).getByText(/Restore previous/)).toBeTruthy();
    expect(drawer.textContent ?? "").not.toMatch(FLEET_WORDS);

    fireEvent.click(within(drawer).getByText("Looks wrong"));
    await waitFor(() => expect(api.ratePicture).toHaveBeenCalledWith("p1", "wrong"));
    await within(drawer).findByText("Marked as wrong. Make a new one?");
    fireEvent.click(within(drawer).getAllByRole("button", { name: "Regenerate" })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Make a new picture" });
    expect(within(dlg).getByText(/The new one replaces it everywhere/)).toBeTruthy();
    fireEvent.click(within(dlg).getByText("Make new picture"));
    await waitFor(() => expect(api.regeneratePicture).toHaveBeenCalledWith("p1"));
  });

  it("D5 remove works when no app uses the picture", async () => {
    api.getPicture.mockResolvedValue(detail({ inUse: false }));
    api.removePicture.mockResolvedValue({ ok: true });
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    fireEvent.click(screen.getAllByText("Open")[0]);
    const drawer = await screen.findByRole("dialog", { name: "Picture" });
    fireEvent.click(await within(drawer).findByText("Remove picture"));
    const dlg = await screen.findByRole("dialog", { name: "Remove picture" });
    expect(within(dlg).getByText(/deleted after 30 days/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Remove picture" }));
    await waitFor(() => expect(api.removePicture).toHaveBeenCalledWith("p1"));
  });

  it("Remake dialog shows count, cost, time and the budget warning", async () => {
    api.previewRemake.mockResolvedValue({ count: 1204, costUsd: 48.16, hours: 10, fitsThisMonth: false });
    api.startRemake.mockResolvedValue({ ok: true, queued: 1204 });
    render(<VehiclePicturesPage isOwner onBack={vi.fn()} />);
    await screen.findByText("Toyota Roomy");
    fireEvent.click(screen.getByRole("button", { name: /Remake all/ }));
    const dlg = await screen.findByRole("dialog", { name: "Remake older pictures" });
    expect(await within(dlg).findByText("1,204")).toBeTruthy();
    expect(within(dlg).getByText("About US$48.16")).toBeTruthy();
    expect(within(dlg).getByText(/New pictures always come first/)).toBeTruthy();
    expect(within(dlg).getByText(/the rest continue from 1 /)).toBeTruthy();
    fireEvent.click(within(dlg).getByText("Start remaking"));
    await waitFor(() => expect(api.startRemake).toHaveBeenCalled());
    expect(await screen.findByText("1,204 pictures queued for remaking.")).toBeTruthy();
  });
});

describe("carTitle", () => {
  it("shows the lower-case look names the way people write them", () => {
    expect(carTitle({ make: "toyota", model: "roomy" })).toBe("Toyota Roomy");
    expect(carTitle({ make: "toyota", model: "c-hr" })).toBe("Toyota C-HR");
    expect(carTitle({ make: "mazda", model: "cx-5" })).toBe("Mazda CX-5");
    expect(carTitle({ make: "toyota", model: "rav4" })).toBe("Toyota RAV4");
    expect(carTitle({ make: "bmw", model: "x5" })).toBe("BMW X5");
    expect(carTitle({ make: "mercedes-benz", model: "c class" })).toBe("Mercedes-Benz C Class");
    expect(carTitle({ make: "Toyota", model: "Roomy" })).toBe("Toyota Roomy");
  });
});
