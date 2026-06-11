import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canonicalPair,
  connectionRequestExpiresAt,
  isConnectionRequestExpired,
  maskPhoneE164,
  ROAM_CONNECTION_REQUEST_TTL_MS,
} from "./roamConnectionHelpers.ts";
import { isRoamConnectionsEnabled } from "./roamConnectionFlags.ts";

Deno.test("canonicalPair orders UUIDs with user_a_id < user_b_id", () => {
  const pair = canonicalPair(
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  );
  assertEquals(pair.user_a_id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assertEquals(pair.user_b_id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
});

Deno.test("canonicalPair throws for self-connection", () => {
  assertThrows(
    () => canonicalPair("same-id", "same-id"),
    Error,
    "cannot_connect_self",
  );
});

Deno.test("maskPhoneE164 masks all but last four digits", () => {
  assertEquals(maskPhoneE164("+15551234567"), "+*******4567");
});

Deno.test("ROAM_CONNECTION_REQUEST_TTL_MS is 30 days", () => {
  assertEquals(ROAM_CONNECTION_REQUEST_TTL_MS, 30 * 24 * 60 * 60_000);
});

Deno.test("connectionRequestExpiresAt is 30 days from now", () => {
  const now = Date.UTC(2026, 5, 1, 12, 0, 0);
  const expires = connectionRequestExpiresAt(now);
  assertEquals(
    new Date(expires).getTime(),
    now + ROAM_CONNECTION_REQUEST_TTL_MS,
  );
});

Deno.test("isConnectionRequestExpired is true when pending and past expires_at", () => {
  assertEquals(
    isConnectionRequestExpired({
      status: "pending",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }),
    true,
  );
  assertEquals(
    isConnectionRequestExpired({
      status: "accepted",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }),
    false,
  );
});

Deno.test("isRoamConnectionsEnabled is false when env unset", () => {
  const prev = Deno.env.get("ROAM_CONNECTIONS");
  try {
    Deno.env.delete("ROAM_CONNECTIONS");
    assertEquals(isRoamConnectionsEnabled(), false);
    Deno.env.set("ROAM_CONNECTIONS", "1");
    assertEquals(isRoamConnectionsEnabled(), true);
  } finally {
    if (prev === undefined) Deno.env.delete("ROAM_CONNECTIONS");
    else Deno.env.set("ROAM_CONNECTIONS", prev);
  }
});
