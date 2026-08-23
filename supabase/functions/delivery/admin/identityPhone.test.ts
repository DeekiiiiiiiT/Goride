/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeJmPhone, phonesMatch } from "./identityPhone.ts";

Deno.test("normalize Jamaica mobile", () => {
  assertEquals(normalizeJmPhone("8765551234"), "+8765551234");
  assertEquals(normalizeJmPhone("5551234"), "+18765551234");
});

Deno.test("phonesMatch after normalization", () => {
  assertEquals(phonesMatch("8765551234", "+18765551234"), true);
});
