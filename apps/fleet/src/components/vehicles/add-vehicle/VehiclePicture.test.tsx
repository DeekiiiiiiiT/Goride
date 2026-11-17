/**
 * @vitest-environment jsdom
 *
 * Vehicle page + list picture states (Stitch F14/F16, audit §3.6) and Change colour.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { setVehicleColor, getVehiclePicture } = vi.hoisted(() => ({ setVehicleColor: vi.fn(), getVehiclePicture: vi.fn() }));
vi.mock("../../../services/api", () => ({ api: { setVehicleColor, getVehiclePicture } }));
vi.mock("../find-parts/everyday/EverydayShared", () => ({ MakerLogo: () => null }));
vi.mock("@roam/roam-shared", () => ({
  vehiclePictureSrc: (url: string | null) => (url ? { src: `${url}?w=480`, srcSet: "" } : null),
  pictureStateLabel: (s: string) =>
    ({
      paused: "Pictures are paused for now — Roam will add yours shortly",
      limited: "Picture will be added tomorrow",
      failed: "Picture unavailable — Roam is on it",
    })[s] ?? "",
}));

import { VehicleColorRow, VehiclePicture, VehicleThumb } from "./VehiclePicture";

afterEach(cleanup);

describe("VehiclePicture", () => {
  it("ready → the sized picture", () => {
    render(<VehiclePicture picture={{ status: "ready", url: "https://media.roamfleet.co/a.png" }} slot="card" />);
    expect((screen.getByAltText("Studio picture of this car") as HTMLImageElement).src).toContain("?w=480");
  });
  it.each([
    ["queued", "Picture coming"],
    ["generating", "Picture coming"],
    ["paused", "Pictures are paused for now — Roam will add yours shortly"],
    ["limited", "Picture will be added tomorrow"],
    ["failed", "Picture unavailable — Roam is on it"],
  ])("%s → outline with its wording", (status, text) => {
    render(<VehiclePicture picture={{ status, url: null }} slot="card" />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Studio picture of this car" })).toBeNull();
  });
  it("none → outline only, and the thumbnail never shows a broken image", () => {
    const { container } = render(<VehicleThumb picture={{ status: "none", url: null }} />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("VehicleColorRow", () => {
  it("Change colour saves the new colour and passes the new picture status up", async () => {
    setVehicleColor.mockResolvedValueOnce({ status: "queued", url: null });
    const onUpdated = vi.fn();
    render(<VehicleColorRow vehicle={{ id: "5179KZ", colorStandard: "grey" } as never} onUpdated={onUpdated} />);
    expect(screen.getByText("Grey")).toBeTruthy();
    fireEvent.click(screen.getByText("Change colour"));
    fireEvent.click(screen.getByRole("option", { name: /^White$/ }));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(setVehicleColor).toHaveBeenCalledWith("5179KZ", "white"));
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ colorStandard: "white", picture: { status: "queued", url: null } })),
    );
  });
  it("an older vehicle with no colour asks for one", () => {
    render(<VehicleColorRow vehicle={{ id: "X1" } as never} />);
    expect(screen.getByText("Pick this vehicle's colour to get its picture")).toBeTruthy();
  });
});

describe("VehiclePicture refresh while being made", () => {
  it("shows the finished picture without a page refresh", async () => {
    vi.useFakeTimers();
    getVehiclePicture.mockResolvedValueOnce({ status: "generating", url: null })
      .mockResolvedValueOnce({ status: "ready", url: "https://media.roamfleet.co/b.jpg" });
    render(<VehiclePicture picture={{ status: "queued", url: null }} vehicleId="5404LK" slot="detail" />);
    expect(screen.getByText("Picture coming")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByAltText("Studio picture of this car")).toBeTruthy());
    expect(getVehiclePicture).toHaveBeenCalledWith("5404LK");
  });
  it("does not poll without a vehicle id or once ready", async () => {
    getVehiclePicture.mockClear();
    vi.useFakeTimers();
    render(<VehiclePicture picture={{ status: "queued", url: null }} slot="card" />);
    render(<VehiclePicture picture={{ status: "ready", url: "https://media.roamfleet.co/a.png" }} vehicleId="X" slot="card" />);
    await vi.advanceTimersByTimeAsync(20_000);
    vi.useRealTimers();
    expect(getVehiclePicture).not.toHaveBeenCalled();
  });
});
