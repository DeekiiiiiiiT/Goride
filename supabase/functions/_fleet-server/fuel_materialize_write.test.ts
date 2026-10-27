import { assertEquals } from "jsr:@std/assert";
import { decideMaterializeWrite } from "./fuel_materialize_write.ts";

Deno.test("materialize: locked period → locked (no write)", () => {
  assertEquals(
    decideMaterializeWrite({ periodLocked: true, snapMoneyOk: false }),
    { mode: "locked" },
  );
  assertEquals(
    decideMaterializeWrite({ periodLocked: true, snapMoneyOk: true }),
    { mode: "locked" },
  );
});

Deno.test("materialize: open week + no snaps → counts_only pending_finalize", () => {
  assertEquals(
    decideMaterializeWrite({ periodLocked: false, snapMoneyOk: false }),
    { mode: "counts_only", money: "pending_finalize" },
  );
});

Deno.test("materialize: open week + snaps → full_money", () => {
  assertEquals(
    decideMaterializeWrite({ periodLocked: false, snapMoneyOk: true }),
    { mode: "full_money" },
  );
});
