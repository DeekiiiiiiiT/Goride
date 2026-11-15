/**
 * deno test --no-check supabase/functions/_fleet-server/maintenance_service_ledger_core.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";

const coreUrl = new URL("./maintenance_service_ledger_core.ts", import.meta.url);

Deno.test("recordCompletedServiceLines: 23505 still runs schedule upsert before continue", () => {
  const text = Deno.readTextFileSync(coreUrl);
  const start = text.indexOf("for (const pos of targets)");
  if (start < 0) throw new Error("position loop not found");
  const slice = text.slice(start, start + 2200);
  const dupBlock = slice.indexOf('if (ledErr.code === "23505")');
  assertEquals(dupBlock > 0, true);
  const afterDup = slice.slice(dupBlock, dupBlock + 600);
  const scheduleAt = afterDup.indexOf("upsertComponentScheduleRow");
  const contAt = afterDup.indexOf("continue");
  assertEquals(scheduleAt > 0 && contAt > scheduleAt, true);
});
