/**
 * @vitest-environment jsdom
 *
 * F1 (docs/part-pictures-audit.md §4 F1, done-tests 10, 17): the photo with its caption, the drawing when there is
 * none or it breaks (never an empty box, never a caption without a photo), and the in-app large view.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PICTURE_CAPTION, PartPictureTile } from "./PartPictureTile";

const picture = {
  url: { src: "https://media.roamfleet.co/catalogue/parts/x/v1.jpg", srcSet: "" },
  urlDetail: { src: "https://media.roamfleet.co/catalogue/parts/x/v1.jpg", srcSet: "" },
};
const Drawing = () => <svg data-testid="drawing" />;

afterEach(cleanup);

describe("PartPictureTile", () => {
  it("shows the photo with the AI caption, and the large view opens and closes", () => {
    render(<PartPictureTile picture={picture} fallback={<Drawing />} partName="Front brake pads" partNumber="99999-Z0101" />);
    expect(screen.getByTestId("part-picture-caption").textContent).toBe(PICTURE_CAPTION);
    fireEvent.click(screen.getByRole("button", { name: /See the picture of Front brake pads larger/ }));
    const view = screen.getByTestId("part-picture-large-view");
    expect(view.textContent).toMatch(/99999-Z0101/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("part-picture-large-view")).toBeNull();
  });

  it("no picture: the drawing stays and there is no caption", () => {
    render(<PartPictureTile picture={null} fallback={<Drawing />} partName="Front brake pads" partNumber="99999-Z0101" />);
    expect(screen.getByTestId("drawing")).toBeTruthy();
    expect(screen.queryByTestId("part-picture-caption")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a broken photo falls back to the drawing", () => {
    render(<PartPictureTile picture={picture} fallback={<Drawing />} partName="Front brake pads" partNumber="99999-Z0101" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByTestId("drawing")).toBeTruthy();
    expect(screen.queryByTestId("part-picture-caption")).toBeNull();
  });
});
