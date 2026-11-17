import { assert, assertEquals } from "jsr:@std/assert@1";
import { cleanLastError } from "./lastError.ts";

Deno.test("cleanLastError redacts URLs and long tokens", () => {
  const msg = "fail at https://secret.example/x key=abcdef Bearer xyz " + "x".repeat(25);
  const out = cleanLastError(msg);
  assert(!out.includes("https://"));
  assert(out.includes("[hidden]"));
});

Deno.test("cleanLastError caps at 300 characters", () => {
  assertEquals(cleanLastError(("fail " + "x ").repeat(120)).length, 300);
});