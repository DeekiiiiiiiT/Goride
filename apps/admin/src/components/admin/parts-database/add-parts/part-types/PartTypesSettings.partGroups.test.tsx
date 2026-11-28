/**
 * @vitest-environment jsdom
 *
 * S2 of docs/part-type-learning-audit.md: Create part type needs a part group (no default). And S2 of
 * docs/part-type-auto-sort-audit.md: "Sorted by Roam" sits on the Part types page (its states are in SortedByRoam.test).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  decidePartTypeRequest: vi.fn(),
  fetchPartTypeRequests: vi.fn(),
  fetchSelfServePartTypes: vi.fn(),
  upsertPartType: vi.fn(),
}));
vi.mock("../addPartsApi", () => api);
vi.mock("../../partsDatabaseApi", () => ({ fetchSpecKeys: vi.fn().mockResolvedValue({ items: [] }) }));
const pictures = vi.hoisted(() => ({ listTemplates: vi.fn() }));
vi.mock("../../../part-pictures/partPicturesApi", () => pictures);
const research = vi.hoisted(() => ({ partNames: vi.fn(), trackPartName: vi.fn(), skipPartName: vi.fn() }));
vi.mock("../../../../../services/researchEngineService", () => ({ researchApi: research }));
vi.mock("../../../../auth/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "t" }, role: "platform_owner" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PartTypesSettings } from "./PartTypesSettings";

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PartTypesSettings owner onClose={() => {}} fullPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSelfServePartTypes.mockResolvedValue([]);
  api.fetchPartTypeRequests.mockResolvedValue({ items: [] });
  api.upsertPartType.mockResolvedValue({ id: "t-1" });
  research.partNames.mockResolvedValue({ items: [], nextCursor: null });
  pictures.listTemplates.mockResolvedValue([
    { catalogGroupId: "g-engine", name: "Engine", materials: "", enabled: true, version: 1, updatedBy: null, updatedByName: null, updatedAt: "" },
    { catalogGroupId: "g-fluids", name: "Fluids", materials: "", enabled: false, version: 1, updatedBy: null, updatedByName: null, updatedAt: "" },
  ]);
});
afterEach(cleanup);

describe("PartTypesSettings — part group and Sorted by Roam", () => {
  it("Create part type cannot be published until a part group is chosen, then sends it", async () => {
    open();
    fireEvent.click(screen.getByText("Create part type"));
    const publish = screen.getByTestId("create-part-type-publish") as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    await waitFor(() => expect(screen.getByText("Fluids — no picture")).toBeTruthy());
    fireEvent.change(screen.getByTestId("create-part-group"), { target: { value: "g-engine" } });
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await waitFor(() => expect(api.upsertPartType).toHaveBeenCalled());
    expect(api.upsertPartType.mock.calls[0][0]).toMatchObject({ areaId: "g-engine" });
  });

  it("shows Sorted by Roam with the owner's login, in place of the old hidden list", async () => {
    open();
    expect(await screen.findByTestId("sorted-by-roam")).toBeTruthy();
    await waitFor(() => expect(research.partNames).toHaveBeenCalledWith("t", "added", undefined));
    expect(research.partNames).toHaveBeenCalledWith("t", "not_tracked", undefined);
    expect(screen.queryByText(/Hidden from saved pages/)).toBeNull();
  });
});
