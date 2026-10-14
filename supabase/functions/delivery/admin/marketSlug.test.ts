/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { marketSlugFromBoundary } from "./marketSlug.ts";

Deno.test("parish qualifies a repeated town name", () => {
  assertEquals(marketSlugFromBoundary("may-pen", "clarendon"), "may-pen-clarendon");
  assertEquals(marketSlugFromBoundary("may-pen", "hanover"), "may-pen-hanover");
  assertEquals(marketSlugFromBoundary(" May-Pen ", "St-Catherine"), "may-pen-st-catherine");
});

Deno.test("missing slug is empty so the route can reject it", () => {
  assertEquals(marketSlugFromBoundary("", "clarendon"), "");
  assertEquals(marketSlugFromBoundary("lucea", ""), "");
});
