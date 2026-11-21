/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { LogServiceLineDetailsStep, type LogServiceLineDetailsStepProps } from "./LogServiceLineDetailsStep";

function props(over: Partial<LogServiceLineDetailsStepProps> = {}): LogServiceLineDetailsStepProps {
  return {
    category: { id: "wb", code: "wheel_bearing", name: "Wheel bearing", is_part: true, position_scheme: "four_corners" } as MaintenanceServiceCategory,
    action: "replace",
    onActionChange: vi.fn(),
    categoryFields: null,
    laborHours: null,
    laborRate: null,
    onLaborHoursChange: vi.fn(),
    onLaborRateChange: vi.fn(),
    brand: "",
    partNumber: "",
    onBrandChange: vi.fn(),
    onPartNumberChange: vi.fn(),
    showPositions: true,
    positions: ["LR"],
    onTogglePosition: vi.fn(),
    warranty: false,
    complimentary: false,
    onWarrantyChange: vi.fn(),
    onComplimentaryChange: vi.fn(),
    partsLoading: false,
    compatibleParts: [],
    partId: null,
    onPartSelect: vi.fn(),
    lineTotalLabel: "Line total",
    currency: "JMD",
    lineTotal: 0,
    laborAmount: null,
    onLaborAmountChange: vi.fn(),
    ...over,
  };
}

describe("Details step — quote mode (LC-16: the same form, entered as the garage's quote)", () => {
  it("full job form (action, labour, positions, total) + quote banner + note; total reads Quote total", () => {
    const onNoteChange = vi.fn();
    const onTogglePosition = vi.fn();
    render(
      <LogServiceLineDetailsStep
        {...props({ onTogglePosition, lineTotalLabel: "Quote total", lineTotal: 9500 })}
        partsPanel={<div data-testid="to-buy-panel" />}
        quoteMode={{ note: "", onNoteChange }}
        alsoDoSlot={<div data-testid="also-do">Also do: Throttle Body Relearn</div>}
      />,
    );
    expect(screen.getByTestId("quote-mode-banner").textContent).toContain("Garage's quote — not paid yet");
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByLabelText("Labor (J$)")).toBeTruthy();
    expect(screen.queryByLabelText("Labor hours")).toBeNull();
    expect(screen.queryByLabelText("Labor rate")).toBeNull();
    expect(screen.getByText("Quote total")).toBeTruthy();
    expect(screen.getByTestId("to-buy-panel")).toBeTruthy();
    expect(screen.getByTestId("also-do")).toBeTruthy();
    fireEvent.click(screen.getByText("RR"));
    expect(onTogglePosition).toHaveBeenCalledWith("RR");
    fireEvent.change(screen.getByTestId("quote-mode-note"), { target: { value: "Humming" } });
    expect(onNoteChange).toHaveBeenCalledWith("Humming");
  });

  it("without quote mode: today's form, no banner, no note box", () => {
    render(<LogServiceLineDetailsStep {...props()} />);
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("Line total")).toBeTruthy();
    expect(screen.queryByTestId("quote-mode-banner")).toBeNull();
    expect(screen.queryByTestId("quote-mode-note")).toBeNull();
  });
});

describe("Details step — one Labor amount (owner 20 Nov: no hours × rate)", () => {
  it("one Labor box; typing calls back with the amount", () => {
    const onLaborAmountChange = vi.fn();
    render(<LogServiceLineDetailsStep {...props({ laborAmount: 4000, onLaborAmountChange })} />);
    const box = screen.getByLabelText("Labor (J$)") as HTMLInputElement;
    expect(box.value).toBe("4000");
    fireEvent.change(box, { target: { value: "5500" } });
    expect(onLaborAmountChange).toHaveBeenCalledWith(5500);
    expect(screen.queryByLabelText("Labor hours")).toBeNull();
  });
});
