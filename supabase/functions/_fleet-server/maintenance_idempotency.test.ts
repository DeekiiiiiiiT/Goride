import { assertEquals } from "jsr:@std/assert@1";
import { idempotentCompleteNowAction } from "./maintenance_logging_helpers.ts";

Deno.test("idempotentCompleteNowAction returns complete_in_progress for stuck saves (R-01)", () => {
  assertEquals(idempotentCompleteNowAction({ status: "in_progress" }), "complete_in_progress");
  assertEquals(idempotentCompleteNowAction({ status: "completed" }), "return_completed");
  assertEquals(idempotentCompleteNowAction({ status: "draft" }), null);
  assertEquals(idempotentCompleteNowAction(null), null);
});
