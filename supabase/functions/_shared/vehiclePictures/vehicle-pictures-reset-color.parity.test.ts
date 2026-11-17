/**
 * Parity: reset script mapVehicleColor vs shared color.ts (C4b).
 */
import { assertEquals } from "jsr:@std/assert@1";
import { mapVehicleColor as sharedMap } from "./color.ts";
import { mapVehicleColor as resetMap } from "../../../../scripts/vehicle-pictures-reset-color.mjs";

const SAMPLES = [
  "PEARL",
  "PEARL WHITE",
  "GUNMETAL",
  "CHARCOAL",
  "DARK GREY",
  "DARK GRAY",
  "NAVY",
  "DARK BLUE",
  "MAROON",
  "WINE",
  "BURGUNDY",
  "WHITE",
  "BLACK",
  "SILVER",
  "GREY",
  "GRAY",
  "BLUE",
  "RED",
  "GREEN",
  "BROWN",
  "BRONZE",
  "BEIGE",
  "CHAMPAGNE MIST",
  "CREAM",
  "GOLD",
  "YELLOW",
  "ORANGE",
  "WHITE/BLACK",
  "WHITE & BLACK",
  "MAGENTA",
  " ",
  "",
  "TAN",
  "METALLIC SILVER",
  "MIDNIGHT BLUE",
  "OFF WHITE",
];

Deno.test("reset script mapVehicleColor matches shared color.ts on 30+ strings", () => {
  for (const raw of SAMPLES) {
    assertEquals(
      resetMap(raw),
      sharedMap(raw),
      `mismatch for ${JSON.stringify(raw)}: reset=${resetMap(raw)} shared=${sharedMap(raw)}`,
    );
  }
  assertEquals(SAMPLES.length >= 30, true);
});