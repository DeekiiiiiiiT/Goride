/**
 * @vitest-environment jsdom
 *
 * Stitch F16 vehicle cards: picture + "Picture ready", outline + status wording, colour + status chips, opens the vehicle.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../find-parts/everyday/EverydayShared", () => ({ MakerLogo: () => null }));
vi.mock("@roam/roam-shared", () => ({
  vehiclePictureSrc: (url: string | null) => (url ? { src: `${url}?w=480`, srcSet: "" } : null),
  pictureStateLabel: (s: string) =>
    ({ limited: "Picture will be added tomorrow", paused: "Pictures are paused for now — Roam will add yours shortly", failed: "Picture unavailable — Roam is on it" })[s] ?? "",
}));

import { VehicleListCard, vehicleCardSubtitle } from "./VehicleListCard";

afterEach(cleanup);

const roomy = {
  id: "5179KZ", licensePlate: "5179KZ", make: "Toyota", model: "Roomy", year: "2019", bodyType: "Hatchback",
  status: "Active", colorStandard: "white", picture: { status: "ready", url: "https://media.roamfleet.co/a.png" },
} as never;

describe("VehicleListCard", () => {
  it("ready: picture, Picture ready, name · plate, colour and Active; click opens", () => {
    const onOpen = vi.fn();
    render(<VehicleListCard vehicle={roomy} onOpen={onOpen} />);
    expect((screen.getByAltText("White Toyota Roomy") as HTMLImageElement).src).toContain("?w=480");
    expect(screen.getByText("Picture ready")).toBeTruthy();
    expect(screen.getByText("5179KZ")).toBeTruthy();
    expect(screen.getByText("White")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    fireEvent.click(screen.getByTestId("vehicle-list-card"));
    expect(onOpen).toHaveBeenCalledWith("5179KZ");
  });
  it.each([
    ["queued", "Picture coming"],
    ["limited", "Picture will be added tomorrow"],
    ["paused", "Pictures are paused for now — Roam will add yours shortly"],
    ["failed", "Picture unavailable — Roam is on it"],
  ])("%s: outline with its wording and no image", (status, text) => {
    render(<VehicleListCard vehicle={{ ...(roomy as object), picture: { status, url: null } } as never} onOpen={vi.fn()} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("no colour yet → asks for one; subtitle skips blanks", () => {
    render(<VehicleListCard vehicle={{ ...(roomy as object), colorStandard: null, status: "Inactive" } as never} onOpen={vi.fn()} />);
    expect(screen.getByText("Colour not set")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(vehicleCardSubtitle({ year: "2019", bodyType: "", vehicle_catalog_generation_hint: undefined })).toBe("2019");
  });
});
