/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchSelfServePartTypes: vi.fn(),
  fetchVehicleSpecValues: vi.fn(),
  saveFluidBundle: vi.fn(),
  saveSizeProductOnly: vi.fn(),
}));
vi.mock("../addPartsApi", () => api);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../catalog/CatalogStep2Cars", () => ({ CatalogStep2Cars: () => null }));

import { FluidPartFlow } from "./FluidPartFlow";

const battery = {
  id: "bat", opCode: null, name: "Battery", tradeTerm: null, editorHint: null, defaultFitMode: "spec",
  positionScheme: "none", status: "active", iconKey: null, areaId: null,
  specFields: [{ specKey: "battery_jis", label: "JIS size", unit: null, dataType: "text", options: null, required: true, example: "46B24L" }],
};

function renderFlow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FluidPartFlow onHome={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("FluidPartFlow — a battery with no cars (LC-21)", () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.fetchSelfServePartTypes.mockResolvedValue([battery]);
    api.fetchVehicleSpecValues.mockResolvedValue([]);
    api.saveSizeProductOnly.mockResolvedValue({});
  });

  it("asks Standard / EFB / AGM and who makes it; saves the product only, never a car spec", async () => {
    renderFlow();
    fireEvent.click(await screen.findByText("Battery"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Toyota"), { target: { value: "	Interstate " } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 2500H-A"), { target: { value: "PF-NS60L-5-INTL" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 46B24L"), { target: { value: "46B24L" } });
    // No source page (LC-21b): the product alone saves as Needs checking.
    const save = screen.getByTestId("fluid-save") as HTMLButtonElement;
    expect(save.textContent).toContain("Save the product");
    expect(save.disabled).toBe(true); // no maker / battery type yet
    fireEvent.click(screen.getByTestId("fluid-maker-other_brand"));
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("fluid-battery-type-Standard"));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.saveSizeProductOnly).toHaveBeenCalledTimes(1));
    expect(api.saveSizeProductOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        partTypeId: "bat",
        brand: "Interstate",
        partNumber: "PF-NS60L-5-INTL",
        specKey: "battery_jis",
        specValue: "46B24L",
        batteryType: "Standard",
        partKind: "aftermarket",
        sourceType: "part_maker_catalogue",
        evidenceUrl: "",
      }),
    );
    expect(api.saveFluidBundle).not.toHaveBeenCalled();
    expect(await screen.findByText("No car specs were changed.")).toBeTruthy();
  });
});
