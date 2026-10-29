import { assertEquals } from "jsr:@std/assert";
import { evidenceTitle, PLACE_EVIDENCE_COLUMNS, PLACE_PRICE_COLUMNS, reviewChipForPlace } from "./place_admin.ts";

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

Deno.test("place detail asks for columns that exist", () => {
  assertEquals(PLACE_EVIDENCE_COLUMNS.includes("kind"), false);
  assertEquals(PLACE_EVIDENCE_COLUMNS.includes("note"), true);
  assertEquals(PLACE_PRICE_COLUMNS.includes("updated_at"), false);
  assertEquals(PLACE_PRICE_COLUMNS.includes("observed_at"), true);
});

Deno.test("evidence uses the note, or a plain title", () => {
  assertEquals(evidenceTitle("Photo of the pump"), "Photo of the pump");
  assertEquals(evidenceTitle("  "), "Evidence");
  assertEquals(evidenceTitle(null), "Evidence");
});
