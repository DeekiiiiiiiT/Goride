import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapTollCommandError, tollsV2OffResponse } from "./toll_v2_command_errors.ts";

const MAPPED: Array<{ code: string; status: number }> = [
  { code: "VERSION_CHANGED", status: 409 },
  { code: "WEEK_SEALED", status: 409 },
  { code: "WEEK_NOT_SEALED", status: 409 },
  { code: "PENDING_NOT_RESOLVED", status: 409 },
  { code: "DRIVERS_ALREADY_PAID", status: 409 },
  { code: "WEEK_NOT_ENDED", status: 409 },
  { code: "REOPEN_INSTEAD", status: 409 },
  { code: "COMMAND_ID_REUSED", status: 409 },
  { code: "TOLLS_V2_OFF", status: 409 },
  { code: "FORBIDDEN", status: 403 },
  { code: "NO_COMPANY", status: 401 },
  { code: "BAD_REQUEST", status: 400 },
  { code: "COMPANY_NOT_ACCEPTED", status: 400 },
  { code: "UNKNOWN_INTENT", status: 400 },
  { code: "INTENT_NOT_BUILT", status: 501 },
];

for (const { code, status } of MAPPED) {
  Deno.test(`mapTollCommandError maps ${code} to ${status}`, () => {
    const r = mapTollCommandError({
      code: "P0001",
      message: code,
      details: JSON.stringify({ week_key: "2026-03-10" }),
    });
    assertEquals(r.status, status);
    assertEquals(r.body.code, code);
    assertEquals(r.body.current_state.week_key, "2026-03-10");
  });
}

Deno.test("mapTollCommandError: unknown business code → 500 generic", () => {
  const r = mapTollCommandError({
    code: "P0001",
    message: "SOME_NEW_DB_CODE",
    details: "{}",
  });
  assertEquals(r.status, 500);
  assertEquals(r.body.code, "INTERNAL_ERROR");
  assertEquals(r.body.current_state, {});
});

Deno.test("mapTollCommandError: non-P0001 does not leak SQL", () => {
  const r = mapTollCommandError({
    code: "42P01",
    message: 'relation "secret_table" does not exist',
    details: "",
  });
  assertEquals(r.status, 500);
  assertEquals(r.body.code, "INTERNAL_ERROR");
  assertFalse(JSON.stringify(r.body).includes("secret_table"));
});

Deno.test("mapTollCommandError: invalid details JSON → current_state {}", () => {
  const r = mapTollCommandError({
    code: "P0001",
    message: "BAD_REQUEST",
    details: "not-json",
  });
  assertEquals(r.body.current_state, {});
});

Deno.test("tollsV2OffResponse", () => {
  const r = tollsV2OffResponse();
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "TOLLS_V2_OFF");
});
