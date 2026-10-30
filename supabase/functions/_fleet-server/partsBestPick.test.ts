/**
 * T6. deno test supabase/functions/_fleet-server/partsBestPick.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickBestPart, type BestPickItem } from "../../../packages/types/src/partsBestPick.ts";

function item(partial: BestPickItem): BestPickItem {
  return partial;
}

Deno.test("a verified part in the lowest tier wins", () => {
  const picked = pickBestPart([
    { tier: 1, items: [item({ id: "oem", tier: 1, status: "verified" })] },
    { tier: 2, items: [item({ id: "sister", tier: 2, status: "verified" })] },
  ]);
  assertEquals(picked?.id, "oem");
  assertEquals(picked?.badge, undefined);
});

Deno.test("a verified part beats an unverified part in the same tier", () => {
  const picked = pickBestPart([
    { tier: 1, items: [
      item({ id: "open", tier: 1, status: "needs_checking" }),
      item({ id: "checked", tier: 1, status: "verified" }),
    ] },
  ]);
  assertEquals(picked?.id, "checked");
  assertEquals(picked?.badge, undefined);
});

Deno.test("stock beats a lower tier when the fleet asks for stock", () => {
  const picked = pickBestPart([
    { tier: 1, items: [item({ id: "oem", tier: 1, status: "verified", stockQty: 0 })] },
    { tier: 4, items: [item({ id: "shelf", tier: 4, status: "verified", stockQty: 2 })] },
  ], { useStock: true });
  assertEquals(picked?.id, "shelf");
});

Deno.test("the lower fresh price wins inside a tier", () => {
  const picked = pickBestPart([
    { tier: 4, items: [
      item({ id: "stale-cheap", tier: 4, status: "verified", landedJmd: 100, priceStale: true }),
      item({ id: "fresh-dear", tier: 4, status: "verified", landedJmd: 400, priceStale: false }),
      item({ id: "fresh-cheap", tier: 4, status: "verified", landedJmd: 250, priceStale: false }),
    ] },
  ], { usePrice: true });
  assertEquals(picked?.id, "fresh-cheap");
});

Deno.test("an unverified part is shown with Needs checking", () => {
  const picked = pickBestPart([
    { tier: 3, items: [item({ id: "open", tier: 3, status: "needs_checking" })] },
  ]);
  assertEquals(picked?.id, "open");
  assertEquals(picked?.badge, "Needs checking");
});

Deno.test("a universal part is used only when the other types are empty", () => {
  const skipped = pickBestPart([
    { tier: 1, items: [item({ id: "oem", tier: 1, status: "verified" })] },
    { tier: 5, items: [item({ id: "size", tier: 5, status: "verified" })] },
  ]);
  assertEquals(skipped?.id, "oem");
  const only = pickBestPart([
    { tier: 5, items: [item({ id: "size", tier: 5, status: "verified" })] },
  ]);
  assertEquals(only?.id, "size");
});

Deno.test("an empty search picks nothing", () => {
  assertEquals(pickBestPart([]), null);
  assertEquals(pickBestPart([{ tier: 1, items: [] }]), null);
});
