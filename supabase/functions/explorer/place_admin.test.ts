import { assertEquals } from "jsr:@std/assert";
import { evidenceTitle, reviewChipForPlace } from "./place_admin.ts";

Deno.test("imported pending places are not hand review", () => {
  assertEquals(reviewChipForPlace({
    status: "pending",
    origin_app: "manual",
    legacy_payload: { dataSource: "import" },
  }), "import");
  assertEquals(reviewChipForPlace({
    status: "pending",
    origin_app: "roam_plug",
    legacy_payload: {},
  }), "plug");
  assertEquals(reviewChipForPlace({ status: "learnt", origin_app: "roam_fleet" }), "learnt");
  assertEquals(reviewChipForPlace({ status: "pending", origin_app: "manual" }), "hand");
});

Deno.test("evidence uses the note, or a plain title", () => {
  assertEquals(evidenceTitle("Photo of the pump"), "Photo of the pump");
  assertEquals(evidenceTitle("  "), "Evidence");
  assertEquals(evidenceTitle(null), "Evidence");
});
