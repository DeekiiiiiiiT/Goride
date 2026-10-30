/**
 * T11. deno test supabase/functions/_fleet-server/findPartsParse.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseQuickCar } from "../../../packages/types/src/findPartsParse.ts";

const makes = ["Toyota", "Honda", "Land", "Land Rover"];

Deno.test("a two-word make stays whole", () => {
  assertEquals(parseQuickCar("Land Rover Defender 2020", makes), {
    make: "Land Rover",
    model: "Defender",
    year: 2020,
  });
});

Deno.test("Toyota Roomy 2019 parses", () => {
  assertEquals(parseQuickCar("Toyota Roomy 2019", makes), {
    make: "Toyota",
    model: "Roomy",
    year: 2019,
  });
});

Deno.test("a line with no year does not parse", () => {
  assertEquals(parseQuickCar("Honda Fit", makes), null);
});
