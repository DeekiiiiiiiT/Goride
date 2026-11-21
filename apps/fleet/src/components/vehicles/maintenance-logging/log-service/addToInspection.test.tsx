/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceSaveError } from "../../../../services/maintenanceSaveError";
import { ADD_TO_INSPECTION_COPY, AddToInspectionReview, addFoundErrorText } from "./addToInspection";

describe("LC-14 add-to-inspection pieces", () => {
  it("Review lists each job with its place and note at J$ 0; Edit / Remove call back", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const lines = [
      { categoryId: "wb", categoryCode: "wheel_bearing", categoryName: "Wheel bearing", positions: ["LR", "RR"], notes: "Humming" },
      { categoryId: "tbc", categoryCode: "throttle_body_cleaning", categoryName: "Throttle Body Cleaning" },
    ];
    render(
      <AddToInspectionReview
        lines={lines}
        placesText={(l) => (l.positions ?? []).map((p) => (p === "LR" ? "Rear left" : "Rear right")).join(", ")}
        quoteOf={(l) => (l.categoryId === "wb" ? 18000 : 0)}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );
    const names = screen.getAllByTestId("add-to-inspection-name").map((n) => n.textContent);
    expect(names).toEqual(["Wheel bearing · Rear left, Rear right", "Throttle Body Cleaning"]);
    expect(screen.getByText("“Humming”")).toBeTruthy();
    expect(screen.getAllByText("J$ 0 · not done yet")).toHaveLength(2);
    expect(screen.getAllByTestId("add-to-inspection-quote").map((q) => q.textContent)).toEqual(["Quote J$ 18,000"]);
    fireEvent.click(screen.getAllByText("Edit")[1]);
    expect(onEdit).toHaveBeenCalledWith(lines[1]);
    fireEvent.click(screen.getAllByTestId("add-to-inspection-remove")[0]);
    expect(onRemove).toHaveBeenCalledWith(lines[0]);
  });

  it("button and toast words", () => {
    expect(ADD_TO_INSPECTION_COPY.confirm(1)).toBe("Add 1 job to this inspection");
    expect(ADD_TO_INSPECTION_COPY.confirm(3)).toBe("Add 3 jobs to this inspection");
    expect(ADD_TO_INSPECTION_COPY.done(2, 1)).toBe("2 jobs added to the inspection · 1 already on Not done yet");
    expect(ADD_TO_INSPECTION_COPY.done(1, 0)).toBe("1 job added to the inspection");
  });

  it("error words: a server without this action yet says so; others pass through", () => {
    expect(addFoundErrorText(new MaintenanceSaveError(404, {}, "x"))).toBe(ADD_TO_INSPECTION_COPY.notAvailable);
    expect(addFoundErrorText(new MaintenanceSaveError(400, { code: "position_invalid", error: "That position doesn't fit this job. Pick again." }, "x"))).toBe(
      "That position doesn't fit this job. Pick again.",
    );
  });
});
