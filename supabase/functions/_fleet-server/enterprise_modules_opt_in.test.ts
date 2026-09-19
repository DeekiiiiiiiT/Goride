import { assertEquals } from "jsr:@std/assert";
import {
  DEFAULT_ENTERPRISE_MODULES,
  resolveEffectiveModules,
} from "./enterprise_modules.ts";

Deno.test("fuelSplitPayment is on by default (product line allows, no org override)", () => {
  const effective = resolveEffectiveModules(DEFAULT_ENTERPRISE_MODULES, null);
  assertEquals(effective.fuelSplitPayment, true);
});

Deno.test("fuelSplitPayment stays off when org override is false", () => {
  const effective = resolveEffectiveModules(DEFAULT_ENTERPRISE_MODULES, {
    fuelSplitPayment: false,
  });
  assertEquals(effective.fuelSplitPayment, false);
});

Deno.test("fuelSplitPayment stays on when org override is true", () => {
  const effective = resolveEffectiveModules(DEFAULT_ENTERPRISE_MODULES, {
    fuelSplitPayment: true,
  });
  assertEquals(effective.fuelSplitPayment, true);
});
