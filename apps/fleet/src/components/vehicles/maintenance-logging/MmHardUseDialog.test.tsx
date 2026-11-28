/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VehicleHardUse } from "../../../types/hardUse";

const { patchVehicleHardUse } = vi.hoisted(() => ({
  patchVehicleHardUse: vi.fn(async () => ({ hardUse: false, source: "fleet_kept_normal" })),
}));
vi.mock("../../../services/api", () => ({ api: { patchVehicleHardUse } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MmHardUseDialog } from "./MmHardUseDialog";
import { hardUseChoices, hardUseLine, hardUseSaveProblem, hardUseTitle } from "./hardUseModel";

afterEach(cleanup);

const AUTO_ON: VehicleHardUse = {
  hardUse: true,
  source: "auto",
  why: "19,262 km in 88 days, 8.0× the normal 10,000 km a year",
  signs: { km: 19262, span_days: 88, multiple: 7.99, measured: true },
  checkedAt: "2026-11-28T06:45:00Z",
  keptNormalUntil: null,
  keptHardUntil: null,
  policy: { baselineKmPerYear: 10000, highUseMultiple: 2, windowDays: 90, keptNormalDays: 90, keptHardDays: 90 },
};

describe("Hard use (maintenance step 16d)", () => {
  it("shows Roam's decision and the reason", () => {
    expect(hardUseTitle(AUTO_ON)).toBe("Hard use: on");
    expect(hardUseLine(AUTO_ON)).toBe("19,262 km in 88 days, 8.0× the normal 10,000 km a year · Checked 28 Nov");
    expect(hardUseTitle({ ...AUTO_ON, checkedAt: null })).toBe("Hard use: not checked yet");
    expect(hardUseTitle({ ...AUTO_ON, source: "fleet_kept_normal", hardUse: false })).toBe("Normal schedules (kept by the fleet)");
  });

  it("offers only the other choices, and Let Roam decide once the fleet has kept one", () => {
    expect(hardUseChoices(AUTO_ON)).toEqual(["keep_normal", "keep_hard"]);
    expect(hardUseChoices({ ...AUTO_ON, source: "fleet_kept_normal" })).toEqual(["auto", "keep_hard"]);
    expect(hardUseSaveProblem(null, "")).toBe("Pick one.");
    expect(hardUseSaveProblem("auto", "")).toBeNull();
    expect(hardUseSaveProblem("keep_hard", "123456789")).toBe("At least 10 characters");
  });

  it("keeping normal schedules needs a reason of 10 characters, and sends it", async () => {
    const saved = vi.fn();
    render(
      <MmHardUseDialog open onOpenChange={() => {}} vehicleId="5179KZ" plate="5179KZ" carName="Toyota Roomy · 2019" current={AUTO_ON} onSaved={saved} />,
    );
    expect(screen.getByText("Change for this car")).toBeTruthy();
    expect(screen.getByTestId("mm-hard-use-now").textContent).toContain("8.0× the normal 10,000 km a year");
    const btn = screen.getByTestId("mm-hard-use-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("mm-hard-use-choice-keep_normal"));
    fireEvent.change(screen.getByTestId("mm-hard-use-reason"), { target: { value: "private" } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("mm-hard-use-reason"), { target: { value: "Car moved to private use" } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(patchVehicleHardUse).toHaveBeenCalledWith("5179KZ", { mode: "keep_normal", reason: "Car moved to private use" });
  });

  it("Let Roam decide asks no reason", () => {
    render(
      <MmHardUseDialog
        open
        onOpenChange={() => {}}
        vehicleId="1505LM"
        plate="1505LM"
        current={{ ...AUTO_ON, source: "fleet_kept_hard" }}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("mm-hard-use-choice-auto"));
    expect(screen.queryByTestId("mm-hard-use-reason")).toBeNull();
    expect((screen.getByTestId("mm-hard-use-save") as HTMLButtonElement).disabled).toBe(false);
  });
});
