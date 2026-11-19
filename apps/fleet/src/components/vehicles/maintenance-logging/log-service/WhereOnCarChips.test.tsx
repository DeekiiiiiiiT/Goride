/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SaveLineHint, WhereOnCarChips } from "./WhereOnCarChips";

const options = [
  { code: "before_cat", label: "Front (before converter)" },
  { code: "after_cat", label: "Rear (after converter)" },
  { code: "unknown", label: "Not sure" },
];

describe("WhereOnCarChips", () => {
  it("shows the label, every chip and the helper until one is picked (Stitch F1)", () => {
    render(<WhereOnCarChips options={options} picked={[]} onToggle={() => {}} showHelper />);
    expect(screen.getByText("Where on the car")).toBeTruthy();
    for (const o of options) expect(screen.getByRole("button", { name: o.label })).toBeTruthy();
    expect(screen.getByText("Pick where on the car. Tap Not sure if the paper doesn't say.")).toBeTruthy();
    expect(screen.getAllByRole("button").every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("marks the picked chip and hides the helper (Stitch F2)", () => {
    render(<WhereOnCarChips options={options} picked={["before_cat"]} onToggle={() => {}} showHelper={false} />);
    expect(screen.getByRole("button", { name: "Front (before converter)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/Tap Not sure/)).toBeNull();
  });

  it("tapping a chip sends its code", () => {
    const onToggle = vi.fn();
    render(<WhereOnCarChips options={options} picked={[]} onToggle={onToggle} showHelper />);
    fireEvent.click(screen.getByRole("button", { name: "Not sure" }));
    expect(onToggle).toHaveBeenCalledWith("unknown");
  });
});

describe("SaveLineHint", () => {
  it("shows 'Pick where on the car first' only while Save line waits", () => {
    const { rerender } = render(<SaveLineHint show />);
    expect(screen.getByText("Pick where on the car first")).toBeTruthy();
    rerender(<SaveLineHint show={false} />);
    expect(screen.queryByText("Pick where on the car first")).toBeNull();
  });
});
