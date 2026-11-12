import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTollV2RpcMissing } from "./toll_v2_rpc.ts";

Deno.test("isTollV2RpcMissing — PGRST202", () => {
  assertEquals(isTollV2RpcMissing({ code: "PGRST202", message: "whatever" }), true);
});

Deno.test("isTollV2RpcMissing — 42883", () => {
  assertEquals(
    isTollV2RpcMissing({ code: "42883", message: 'function "toll_sys_tolls_v2_on" does not exist' }),
    true,
  );
});

Deno.test("isTollV2RpcMissing — other errors are not missing", () => {
  assertEquals(isTollV2RpcMissing({ code: "42501", message: "permission denied" }), false);
  assertEquals(isTollV2RpcMissing(null), false);
});
