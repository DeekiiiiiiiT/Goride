import { describe, expect, it, vi } from "vitest";
import { fitWithin, uploadToStorage } from "./uploadToStorage";

describe("fitWithin", () => {
  it("shrinks the longest side to 1600 and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges small photos", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("uploadToStorage", () => {
  const started = { uploadUrl: "https://r2.test/put", headers: { "content-type": "image/webp" }, ticket: "t1" };
  const finished = { key: "evidence/o/x.webp", bucket: "private" as const, size: 3, contentType: "image/webp", publicUrl: null };

  it("shrinks, starts with the shrunk size, PUTs to R2, then finishes", async () => {
    const big = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
    const small = new Blob([new Uint8Array(3)], { type: "image/webp" });
    const start = vi.fn().mockResolvedValue(started);
    const finish = vi.fn().mockResolvedValue(finished);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const out = await uploadToStorage({ file: big, start, finish, fetchImpl, shrinkImpl: async () => small });

    expect(start).toHaveBeenCalledWith({ contentType: "image/webp", size: 3 });
    expect(fetchImpl).toHaveBeenCalledWith("https://r2.test/put", {
      method: "PUT",
      headers: { "content-type": "image/webp" },
      body: small,
    });
    expect(finish).toHaveBeenCalledWith({ ticket: "t1" });
    expect(out).toEqual(finished);
  });

  it("sends the file untouched when shrinking is off", async () => {
    const pdf = new Blob([new Uint8Array(5)], { type: "application/pdf" });
    const start = vi.fn().mockResolvedValue({ ...started, headers: { "content-type": "application/pdf" } });
    const shrinkImpl = vi.fn();
    await uploadToStorage({
      file: pdf,
      start,
      finish: vi.fn().mockResolvedValue(finished),
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      shrinkPhotos: false,
      shrinkImpl,
    });
    expect(shrinkImpl).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith({ contentType: "application/pdf", size: 5 });
  });

  it("does not call finish when the R2 upload fails", async () => {
    const finish = vi.fn();
    await expect(
      uploadToStorage({
        file: new Blob([new Uint8Array(2)], { type: "image/png" }),
        start: vi.fn().mockResolvedValue(started),
        finish,
        fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
        shrinkImpl: async (f) => f,
      }),
    ).rejects.toThrow("Upload failed (403)");
    expect(finish).not.toHaveBeenCalled();
  });
});

import { mediaPublicUrl } from "./mediaUrl";

describe("mediaPublicUrl", () => {
  it("builds the media address from a stored key", () => {
    expect(mediaPublicUrl("catalogue/logos/platform/a b.png")).toBe(
      "https://media.roamfleet.co/catalogue/logos/platform/a%20b.png",
    );
  });
  it("returns null for an empty key", () => {
    expect(mediaPublicUrl("  ")).toBeNull();
    expect(mediaPublicUrl(null)).toBeNull();
  });
});
