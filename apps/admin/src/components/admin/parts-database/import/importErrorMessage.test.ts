import { describe, expect, it } from "vitest";
import { humanizeHttpErrorText, importErrorMessage } from "./importErrorMessage";

describe("importErrorMessage", () => {
  it("turns gateway HTML into plain English", () => {
    const html = "<html><head><title>504 Gateway Time-out</title></head><body><h1>504</h1></body></html>";
    expect(humanizeHttpErrorText(html, 504)).toMatch(/timed out/i);
    expect(importErrorMessage(html)).toMatch(/timed out/i);
  });
});
