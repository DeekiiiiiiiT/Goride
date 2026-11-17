/**
 * T1 — mapVehicleColor (§3.2)
 * deno test --allow-env supabase/functions/_shared/vehiclePictures/
 */
import { assertEquals } from "jsr:@std/assert@1";
import { colorLabel, mapVehicleColor, VEHICLE_COLORS } from "./color.ts";

Deno.test("VEHICLE_COLORS has 16 lowercase values", () => {
  assertEquals(VEHICLE_COLORS.length, 16);
});

Deno.test("every §3.2 row maps correctly", () => {
  assertEquals(mapVehicleColor("PEARL"), "pearl white");
  assertEquals(mapVehicleColor("PEARL WHITE"), "pearl white");
  assertEquals(mapVehicleColor("GUNMETAL"), "dark grey");
  assertEquals(mapVehicleColor("CHARCOAL"), "dark grey");
  assertEquals(mapVehicleColor("DARK GREY"), "dark grey");
  assertEquals(mapVehicleColor("NAVY"), "dark blue");
  assertEquals(mapVehicleColor("MAROON"), "maroon");
  assertEquals(mapVehicleColor("WHITE"), "white");
  assertEquals(mapVehicleColor("BLACK"), "black");
  assertEquals(mapVehicleColor("SILVER"), "silver");
  assertEquals(mapVehicleColor("GREY"), "grey");
  assertEquals(mapVehicleColor("BLUE"), "blue");
  assertEquals(mapVehicleColor("RED"), "red");
  assertEquals(mapVehicleColor("GREEN"), "green");
  assertEquals(mapVehicleColor("BROWN"), "brown");
  assertEquals(mapVehicleColor("BEIGE"), "beige");
  assertEquals(mapVehicleColor("GOLD"), "gold");
  assertEquals(mapVehicleColor("YELLOW"), "yellow");
  assertEquals(mapVehicleColor("ORANGE"), "orange");
});

Deno.test("order: PEARL before WHITE; dark before plain", () => {
  assertEquals(mapVehicleColor("PEARL WHITE"), "pearl white");
  assertEquals(mapVehicleColor("DARK GREY"), "dark grey");
});

Deno.test("two-tone uses first colour", () => {
  assertEquals(mapVehicleColor("WHITE/BLACK"), "white");
  assertEquals(mapVehicleColor("WHITE & BLACK"), "white");
});

Deno.test("CHAMPAGNE MIST → beige; MAGENTA → null", () => {
  assertEquals(mapVehicleColor("CHAMPAGNE MIST"), "beige");
  assertEquals(mapVehicleColor("MAGENTA"), null);
});

Deno.test("colorLabel capitalises words", () => {
  assertEquals(colorLabel("pearl white"), "Pearl White");
});