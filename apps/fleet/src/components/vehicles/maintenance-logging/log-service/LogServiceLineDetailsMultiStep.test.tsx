/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogServiceLineDetailsMultiStep } from "./LogServiceLineDetailsMultiStep";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

afterEach(() => cleanup());

const baseProps = {
  componentCount: 1,
  configuredCount: 1,
  subtotalLabel: "JMD 1,000",
  mechanicNote: "",
  onMechanicNoteChange: vi.fn(),
};

describe("LogServiceLineDetailsMultiStep add another job", () => {
  it("does not show the button when onAddAnotherJob is omitted", () => {
    render(<LogServiceLineDetailsMultiStep {...baseProps} />);
    expect(screen.queryByTestId("log-service-details-add-another-job")).toBeNull();
  });

  it("shows the button and calls onAddAnotherJob when clicked", () => {
    const onAddAnotherJob = vi.fn();
    render(<LogServiceLineDetailsMultiStep {...baseProps} onAddAnotherJob={onAddAnotherJob} />);
    const btn = screen.getByTestId("log-service-details-add-another-job");
    expect(btn.textContent).toContain(LOG_SERVICE_COPY.addAnotherJob);
    fireEvent.click(btn);
    expect(onAddAnotherJob).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows reason when addAnotherDisabledReason is set", () => {
    const onAddAnotherJob = vi.fn();
    const reason = LOG_SERVICE_COPY.addAnotherJobSaveFirst;
    render(
      <LogServiceLineDetailsMultiStep
        {...baseProps}
        onAddAnotherJob={onAddAnotherJob}
        addAnotherDisabledReason={reason}
      />,
    );
    const btn = screen.getByTestId("log-service-details-add-another-job");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(reason).textContent).toBe(reason);
    fireEvent.click(btn);
    expect(onAddAnotherJob).not.toHaveBeenCalled();
  });
});