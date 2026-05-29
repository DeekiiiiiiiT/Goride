import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  generatePin,
  isValidPinFormat,
  verifyPin,
  verifyRidePin,
  maskPin,
} from "./pinVerification.ts";

Deno.test("generatePin - generates 4-digit string", () => {
  const pin = generatePin();
  assertEquals(pin.length, 4);
  assertEquals(/^\d{4}$/.test(pin), true);
});

Deno.test("generatePin - generates different pins", () => {
  const pins = new Set<string>();
  for (let i = 0; i < 100; i++) {
    pins.add(generatePin());
  }
  assertEquals(pins.size > 50, true);
});

Deno.test("isValidPinFormat - valid pins", () => {
  assertEquals(isValidPinFormat("1234"), true);
  assertEquals(isValidPinFormat("0000"), true);
  assertEquals(isValidPinFormat("9999"), true);
});

Deno.test("isValidPinFormat - invalid pins", () => {
  assertEquals(isValidPinFormat("123"), false);
  assertEquals(isValidPinFormat("12345"), false);
  assertEquals(isValidPinFormat("abcd"), false);
  assertEquals(isValidPinFormat("123a"), false);
  assertEquals(isValidPinFormat(""), false);
  assertEquals(isValidPinFormat(null), false);
  assertEquals(isValidPinFormat(undefined), false);
  assertEquals(isValidPinFormat(1234), false);
});

Deno.test("verifyPin - correct pin", () => {
  assertEquals(verifyPin("1234", "1234"), true);
  assertEquals(verifyPin("0000", "0000"), true);
});

Deno.test("verifyPin - incorrect pin", () => {
  assertEquals(verifyPin("1234", "5678"), false);
  assertEquals(verifyPin("1234", "1235"), false);
});

Deno.test("verifyPin - invalid format", () => {
  assertEquals(verifyPin("123", "1234"), false);
  assertEquals(verifyPin("1234", "123"), false);
  assertEquals(verifyPin("abcd", "1234"), false);
});

Deno.test("verifyRidePin - successful verification", () => {
  const result = verifyRidePin("1234", {
    verification_pin: "1234",
    pin_verified_at: null,
  });
  assertEquals(result.verified, true);
  assertEquals(result.error, undefined);
});

Deno.test("verifyRidePin - already verified", () => {
  const result = verifyRidePin("1234", {
    verification_pin: "1234",
    pin_verified_at: "2026-01-15T10:00:00Z",
  });
  assertEquals(result.verified, true);
  assertEquals(result.error, "already_verified");
});

Deno.test("verifyRidePin - pin not set", () => {
  const result = verifyRidePin("1234", {
    verification_pin: null,
    pin_verified_at: null,
  });
  assertEquals(result.verified, false);
  assertEquals(result.error, "pin_not_set");
});

Deno.test("verifyRidePin - pin mismatch", () => {
  const result = verifyRidePin("1234", {
    verification_pin: "5678",
    pin_verified_at: null,
  });
  assertEquals(result.verified, false);
  assertEquals(result.error, "pin_mismatch");
});

Deno.test("verifyRidePin - invalid format", () => {
  const result = verifyRidePin("123", {
    verification_pin: "1234",
    pin_verified_at: null,
  });
  assertEquals(result.verified, false);
  assertEquals(result.error, "invalid_format");
});

Deno.test("maskPin - masks correctly", () => {
  assertEquals(maskPin("1234"), "1***");
  assertEquals(maskPin("9876"), "9***");
});

Deno.test("maskPin - handles invalid", () => {
  assertEquals(maskPin("123"), "****");
  assertEquals(maskPin(""), "****");
});
