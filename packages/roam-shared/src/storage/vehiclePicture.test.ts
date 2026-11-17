import { describe, expect, it } from "vitest";
import { pictureStateLabel, vehiclePictureSrc } from "./vehiclePicture";

const RAW = "https://media.roamfleet.co/catalogue/images/pic/v1.png";

describe("vehiclePictureSrc", () => {
  it("returns null for null/empty", () => {
    expect(vehiclePictureSrc(null, "card")).toBeNull();
    expect(vehiclePictureSrc("", "card")).toBeNull();
  });

  it("builds card URLs", () => {
    const out = vehiclePictureSrc(RAW, "card");
    expect(out!.src).toContain("/cdn-cgi/image/width=480,quality=80,format=auto/");
    expect(out!.srcSet).toContain("960w");
    expect(out!.srcSet).toContain("480w");
  });

  it("builds detail URLs", () => {
    const out = vehiclePictureSrc(RAW, "detail");
    expect(out!.src).toContain("width=1200,quality=85,format=auto");
    expect(out!.srcSet).toContain("2400w");
  });

  it("is idempotent when already transformed", () => {
    const already =
      "https://media.roamfleet.co/cdn-cgi/image/width=480,quality=80,format=auto/catalogue/images/pic/v1.png";
    expect(vehiclePictureSrc(already, "card")).toEqual({ src: already, srcSet: "" });
  });
});

describe("pictureStateLabel", () => {
  it("maps API display statuses", () => {
    expect(pictureStateLabel("queued")).toBe("Picture coming");
    expect(pictureStateLabel("failed")).toBe("Picture unavailable — Roam is on it");
    expect(pictureStateLabel("none")).toBe("");
  });
});