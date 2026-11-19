/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({ fetchPendingPartsCandidates: vi.fn(), resolvePendingPartsGroupAdded: vi.fn() }));
vi.mock("../../../../services/pendingPartsCatalogService", () => svc);
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { AddedPickPartPanel } from "./AddedPickPartPanel";

beforeEach(() => {
  svc.fetchPendingPartsCandidates.mockReset();
  svc.resolvePendingPartsGroupAdded.mockReset();
  toastMock.success.mockReset();
});

describe("Added — pick the part (LC-09)", () => {
  it("lists the parts on file; Use this part answers the group and tells the companies", async () => {
    svc.fetchPendingPartsCandidates.mockResolvedValue([
      { partId: "p1", name: "Rear oxygen sensor", brand: "Toyota", number: "89465-B1120", place: "after_cat", fitLabel: "made_for_car" },
    ]);
    svc.resolvePendingPartsGroupAdded.mockResolvedValue({ resolved: 2, companies: 2 });
    const onDone = vi.fn();
    render(<AddedPickPartPanel accessToken="t" groupId="g1" onDone={onDone} onCancel={vi.fn()} />);
    const row = await screen.findByTestId("added-pick-part-row");
    expect((screen.getByTestId("added-pick-part-confirm") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(row);
    fireEvent.click(screen.getByTestId("added-pick-part-confirm"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(svc.resolvePendingPartsGroupAdded).toHaveBeenCalledWith("t", "g1", "p1");
    expect(toastMock.success).toHaveBeenCalledWith("Added. 2 companies were told the part is on file.");
  });

  it("nothing on file yet: says so, Check again reloads", async () => {
    svc.fetchPendingPartsCandidates.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<AddedPickPartPanel accessToken="t" groupId="g1" onDone={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByTestId("added-pick-part-empty");
    fireEvent.click(screen.getByText("Check again"));
    await waitFor(() => expect(svc.fetchPendingPartsCandidates).toHaveBeenCalledTimes(2));
  });
});
