import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatPartPositionSideLabel } from "./partPositionNorm.ts";

Deno.test("formatPartPositionSideLabel includes catalogue number", () => {
  assertEquals(formatPartPositionSideLabel("rear", null, 2), "Rear · No.2");
  assertEquals(formatPartPositionSideLabel("rear", "left", null), "Rear left");
  assertEquals(formatPartPositionSideLabel("rear", "left", 2), "Rear left · No.2");
});
