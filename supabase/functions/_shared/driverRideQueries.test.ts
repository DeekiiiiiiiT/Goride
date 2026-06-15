import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { effectiveCashInHandMinor } from "./driverRideQueries.ts";

Deno.test("effectiveCashInHandMinor uses cash_received when settled", () => {
  assertEquals(
    effectiveCashInHandMinor({ cash_received_minor: 100000 }, 62320, true),
    100000,
  );
});

Deno.test("effectiveCashInHandMinor treats zero received as settled unpaid", () => {
  assertEquals(
    effectiveCashInHandMinor({ cash_received_minor: 0 }, 62320, true),
    0,
  );
});

Deno.test("effectiveCashInHandMinor falls back to fare when unsettled", () => {
  assertEquals(
    effectiveCashInHandMinor({}, 62320, true),
    62320,
  );
});

Deno.test("effectiveCashInHandMinor is zero for card trips", () => {
  assertEquals(
    effectiveCashInHandMinor({ cash_received_minor: 100000 }, 62320, false),
    0,
  );
});
