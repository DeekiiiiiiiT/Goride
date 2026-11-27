/**
 * Rev 2 (docs/saved-page-reads-disagree-audit.md §5.2): the P4 filler words, the group row's head word that picks a
 * name, and the place rule that only fills in "rear" when the page itself says REAR.
 * deno test --no-check supabase/functions/_fleet-server/saved_page_proof.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { impliedAxle, nameFromPageWords, type PartType, rowNamesType, typeWords } from "./saved_page_proof.ts";

const brakePads: PartType = { id: "pads", name: "Brake pads", scheme: "axle" };
const brakeShoes: PartType = { id: "shoes", name: "Brake shoes", scheme: "axle" };
const cylinderKit: PartType = { id: "cyl-kit", name: "Rear wheel cylinder kit", scheme: "axle" };
const hoseClamp: PartType = { id: "clamp", name: "Hose clamp", scheme: "none" };

Deno.test("P4: KIT, SET, ASSY, SUB-ASSY, BRAKE, REAR, FRONT and WHEEL never name a type", () => {
  // The row that started the audit: a drum-brake shoe kit must never be read as brake pads.
  assertEquals(rowNamesType(brakePads, "Toyota", "04495 - SHOE KIT, REAR BRAKE", null), false);
  assertEquals(rowNamesType(brakeShoes, "Toyota", "04495 - SHOE KIT, REAR BRAKE", null), true);
  // Each filler word on its own names nothing at all.
  for (const word of ["KIT", "SET", "ASSY", "SUB-ASSY", "BRAKE", "REAR", "FRONT", "WHEEL"]) {
    assertEquals(rowNamesType(brakePads, "Toyota", `04495 - ${word}`, null), false, word);
  }
  // The type's own word still names it, and the filler is gone from its word list.
  assertEquals(rowNamesType(brakePads, "Toyota", "PAD KIT, DISC BRAKE", null), true);
  assertEquals(typeWords(brakeShoes, "Toyota").includes("KIT"), false);
  assertEquals(typeWords(brakePads, "Toyota").includes("BRAKE"), false);
});

Deno.test("the group row's head word picks the name", () => {
  // "SHOE KIT, REAR BRAKE" head is SHOE, so Brake shoes wins whatever order the reads gave.
  assertEquals(nameFromPageWords([brakePads, brakeShoes], "04495 - SHOE KIT, REAR BRAKE", null)?.id, "shoes");
  assertEquals(nameFromPageWords([brakeShoes, brakePads], "04495 - SHOE KIT, REAR BRAKE", null)?.id, "shoes");
  // "CYLINDER KIT, REAR WHEEL" head is CYLINDER.
  assertEquals(nameFromPageWords([cylinderKit, hoseClamp], "04474 - CYLINDER KIT, REAR WHEEL", null)?.id, "cyl-kit");
  // The page names neither (only filler), so nothing is picked and the row waits.
  assertEquals(nameFromPageWords([brakePads, brakeShoes], "04495 - KIT, REAR", null), null);
  // No group row: the row's own title counts — and only then (Rev 2 §3.2).
  assertEquals(nameFromPageWords([brakePads, brakeShoes], null, "Genuine Toyota 04495-B1310 - brake pads, set")?.id, "pads");
});

Deno.test("impliedAxle fills in rear only when the page says REAR", () => {
  // The page's own section heading says REAR: a parking-brake row that never says it itself gets rear.
  assertEquals(impliedAxle("REAR DRUM BRAKE", "47061 - STRUT SET, PARKING BRAKE SHOE, RH", "47061-B2040 11.2016 - 02.2019"), "rear");
  // The same row on a page that never says REAR: no place, so it waits for later (Rev 2 §3.6).
  assertEquals(impliedAxle("BRAKE", "47061 - STRUT SET, PARKING BRAKE SHOE, RH", "47061-B2040 11.2016 - 02.2019"), null);
  // A page that says FRONT anywhere never fills in rear, even when its heading says REAR.
  assertEquals(impliedAxle("REAR DRUM BRAKE", "CYLINDER ASSY(FOR RH, FRONT OR UPPER)", "47550-B1030 11.2016 - 09.2020"), null);
  // A front page fills in nothing.
  assertEquals(impliedAxle("FRONT SHOCK ABSORBER", "ABSORBER SET, SHOCK, FRONT RH", "11111-A1001 11.2016 - 09.2020"), null);
  // The part's name alone is never a page fact.
  assertEquals(impliedAxle("Parking brake shoe strut set"), null);
});
