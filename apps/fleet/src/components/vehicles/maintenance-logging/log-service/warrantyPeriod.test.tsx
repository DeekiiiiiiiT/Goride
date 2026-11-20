/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { warrantyFromValues, warrantyLength, warrantyText, warrantyUntil, warrantyValues } from "./warrantyPeriod";
import { WarrantyDialog } from "./WarrantyDialog";

describe("warranty period (LC-22)", () => {
  it("lengths read like people say them", () => {
    expect(warrantyLength(6)).toBe("6 months");
    expect(warrantyLength(12)).toBe("1 year");
    expect(warrantyLength(18)).toBe("18 months");
    expect(warrantyLength(24)).toBe("2 years");
    expect(warrantyLength(1)).toBe("1 month");
  });

  it("until = service date + months; month ends clamp", () => {
    expect(warrantyUntil("2026-11-19", 12)).toBe("2027-11-19");
    expect(warrantyUntil("2026-01-31", 1)).toBe("2026-02-28");
    expect(warrantyUntil("2026-11-19", 18)).toBe("2028-05-19");
    expect(warrantyUntil("", 12)).toBeNull();
  });

  it("round-trips through the job's values", () => {
    const w = { months: 12, until: "2027-11-19" };
    expect(warrantyFromValues(warrantyValues(w))).toEqual(w);
    expect(warrantyFromValues(warrantyValues(null))).toBeNull();
    expect(warrantyText(w)).toBe("1 year · until 19 Nov 2027");
  });
});

describe("WarrantyDialog (LC-22)", () => {
  it("pick a length → shows the end date → Save sends it", () => {
    const onSave = vi.fn();
    render(<WarrantyDialog open partName="battery" serviceDate="2026-11-19" initial={null} onCancel={vi.fn()} onSave={onSave} />);
    expect(screen.getByText("How long is the warranty on the battery?")).toBeTruthy();
    expect((screen.getByTestId("warranty-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("warranty-choice-12"));
    expect(screen.getByTestId("warranty-until").textContent).toContain("Covered until 19 Nov 2027");
    fireEvent.click(screen.getByTestId("warranty-save"));
    expect(onSave).toHaveBeenCalledWith({ months: 12, until: "2027-11-19" });
  });

  it("Other: 30 months typed", () => {
    const onSave = vi.fn();
    render(<WarrantyDialog open partName="battery" serviceDate="2026-11-19" initial={null} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("warranty-choice-other"));
    fireEvent.change(screen.getByTestId("warranty-other-amount"), { target: { value: "30" } });
    fireEvent.click(screen.getByTestId("warranty-save"));
    expect(onSave).toHaveBeenCalledWith({ months: 30, until: "2029-05-19" });
  });
});
