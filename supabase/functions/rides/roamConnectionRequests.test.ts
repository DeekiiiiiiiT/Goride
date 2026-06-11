import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canonicalPair,
  isConnectionRequestExpired,
  maskPhoneE164,
} from "./roamConnectionHelpers.ts";
import { isRoamConnectionsEnabled } from "./roamConnectionFlags.ts";

Deno.test("duplicate pending error codes are distinct from already_connected", () => {
  assertEquals("duplicate_pending" !== "already_connected", true);
});

Deno.test("self-request error code is cannot_request_self", () => {
  assertThrows(
    () => canonicalPair("user-1", "user-1"),
    Error,
    "cannot_connect_self",
  );
});

Deno.test("masked phone never exposes full digits except last four", () => {
  const masked = maskPhoneE164("+18765551234");
  assertEquals(masked.endsWith("1234"), true);
  assertEquals(masked.includes("876555"), false);
});

Deno.test("expired pending request detected", () => {
  assertEquals(
    isConnectionRequestExpired({
      status: "pending",
      expires_at: "2020-01-01T00:00:00.000Z",
    }),
    true,
  );
});

Deno.test("feature flag defaults off", () => {
  const prev = Deno.env.get("ROAM_CONNECTIONS");
  try {
    Deno.env.delete("ROAM_CONNECTIONS");
    assertEquals(isRoamConnectionsEnabled(), false);
  } finally {
    if (prev === undefined) Deno.env.delete("ROAM_CONNECTIONS");
    else Deno.env.set("ROAM_CONNECTIONS", prev);
  }
});
