/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { patchVehicleSevereDuty } = vi.hoisted(() => ({ patchVehicleSevereDuty: vi.fn(async () => ({ item: {} })) }));
vi.mock("../../../services/api", () => ({ api: { patchVehicleSevereDuty } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MmHardUseDialog, hardUseOffReasonProblem } from "./MmHardUseDialog";

afterEach(cleanup);

describe("Hard use (maintenance step 12, MER-25)", () => {
  it("turning it off needs a reason of 10 characters, and sends the typed reason", async () => {
    const saved = vi.fn();
    render(<MmHardUseDialog open onOpenChange={() => {}} vehicleId="5179KZ" plate="5179KZ" carName="Toyota Roomy · 2019" initial onSaved={saved} />);
    expect(screen.getByText("Turn off hard use?")).toBeTruthy();
    const btn = screen.getByTestId("mm-hard-use-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("mm-hard-use-reason"), { target: { value: "private" } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("mm-hard-use-reason"), { target: { value: "Car moved to private use" } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(saved).toHaveBeenCalledWith(false));
    expect(patchVehicleSevereDuty).toHaveBeenCalledWith("5179KZ", { severe_duty: false, reason: "Car moved to private use" });
  });

  it("turning it on asks no reason", () => {
    render(<MmHardUseDialog open onOpenChange={() => {}} vehicleId="1505LM" plate="1505LM" initial={false} onSaved={() => {}} />);
    expect(screen.getByText("Turn on hard use?")).toBeTruthy();
    expect(screen.queryByTestId("mm-hard-use-reason")).toBeNull();
    expect((screen.getByTestId("mm-hard-use-save") as HTMLButtonElement).disabled).toBe(false);
    expect(hardUseOffReasonProblem("123456789")).toBe("At least 10 characters");
  });
});
