/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogServiceReviewStep } from "./LogServiceReviewStep";
import type { MaintenanceLogLine } from "../../../../types/maintenance";

const baseProps = {
  baySessionLabel: "ABCD1234",
  date: "2026-11-11",
  odometer: 100000,
  provider: "Test Shop",
  currency: "JMD",
  notes: "",
  invoiceUrl: "",
  scanLoading: false,
  onDateChange: vi.fn(),
  onOdometerChange: vi.fn(),
  onProviderChange: vi.fn(),
  onCurrencyChange: vi.fn(),
  onNotesChange: vi.fn(),
  onScanFile: vi.fn(),
  lineTotalPreview: () => 0,
  subtotal: 17_600,
  netTotal: 16_600,
  onEditLine: vi.fn(),
  showMarkPackageComplete: false,
  markPackageComplete: false,
  onMarkPackageCompleteChange: vi.fn(),
};

const lines: MaintenanceLogLine[] = [
  { categoryId: "1", categoryCode: "a", categoryName: "Line 1", material: 1000 } as MaintenanceLogLine,
  { categoryId: "2", categoryCode: "b", categoryName: "Line 2", material: 600 } as MaintenanceLogLine,
  { categoryId: "3", categoryCode: "c", categoryName: "Line 3", material: 8000 } as MaintenanceLogLine,
  { categoryId: "4", categoryCode: "d", categoryName: "Line 4", material: 8000 } as MaintenanceLogLine,
];

describe("LogServiceReviewStep discount", () => {
  it("shows only Total when no discount", () => {
    render(
      <LogServiceReviewStep
        {...baseProps}
        lines={lines}
        discountEnabled
        discountAmount={0}
        discountRowOpen={false}
      />,
    );
    expect(screen.getByTestId("log-service-review-total")).toHaveTextContent("JMD 17,600");
    expect(screen.queryByTestId("log-service-review-subtotal")).toBeNull();
    expect(screen.queryByTestId("log-service-review-discount")).toBeNull();
  });

  it("hides Add discount when discountEnabled is false", () => {
    render(
      <LogServiceReviewStep {...baseProps} lines={lines} discountEnabled={false} discountAmount={0} />,
    );
    expect(screen.queryByTestId("log-service-add-discount")).toBeNull();
  });

  it("Add discount shows the row", () => {
    const onAdd = vi.fn();
    render(
      <LogServiceReviewStep
        {...baseProps}
        lines={lines}
        discountEnabled
        discountAmount={0}
        discountRowOpen={false}
        onAddDiscount={onAdd}
      />,
    );
    fireEvent.click(screen.getByTestId("log-service-add-discount"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("shows discount row and Remove hides via callback", () => {
    const onRemove = vi.fn();
    render(
      <LogServiceReviewStep
        {...baseProps}
        lines={lines}
        discountEnabled
        discountAmount={0}
        discountRowOpen
        discountInputValue=""
        onRemoveDiscount={onRemove}
      />,
    );
    expect(screen.getByTestId("log-service-discount-amount")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("log-service-remove-discount"));
    expect(onRemove).toHaveBeenCalled();
  });

  it("shows subtotal, discount, and net total when discount > 0", () => {
    render(
      <LogServiceReviewStep
        {...baseProps}
        lines={lines}
        discountEnabled
        discountAmount={1000}
        discountInputValue="1000"
        discountRowOpen
        netTotal={16_600}
      />,
    );
    expect(screen.getByTestId("log-service-review-subtotal")).toHaveTextContent("17,600");
    expect(screen.getByTestId("log-service-review-discount")).toHaveTextContent("−JMD 1,000");
    expect(screen.getByTestId("log-service-review-total")).toHaveTextContent("16,600");
  });

  it("shows too-large message when discountTooLarge", () => {
    render(
      <LogServiceReviewStep
        {...baseProps}
        lines={lines}
        discountEnabled
        discountAmount={20_000}
        discountInputValue="20000"
        discountRowOpen
        discountTooLarge
        subtotal={17_600}
        netTotal={0}
      />,
    );
    expect(screen.getByTestId("log-service-discount-error")).toHaveTextContent(
      "Discount can't be more than the bill.",
    );
  });
});
