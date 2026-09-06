import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Access-control guard for ledger ensure-from-trip-ids routes.
 * Reading the registration source avoids booting the whole server.
 */

Deno.test("authenticated ensure-from-trip-ids is registered with requireAuth", async () => {
  const source = await Deno.readTextFile(new URL("./ledger_ensure_routes.ts", import.meta.url));
  const authRoute =
    /app\.post\(\s*`\$\{PREFIX\}\/ledger\/ensure-from-trip-ids`\s*,\s*requireAuth\(\)/.test(source) ||
    /app\.post\([^)]*ensure-from-trip-ids`[^,]*,\s*requireAuth\(\)/.test(source);
  assertEquals(
    authRoute,
    true,
    "POST /ledger/ensure-from-trip-ids must use requireAuth()",
  );
  assertEquals(
    /data\.backfill/.test(source) && /transactions\.edit/.test(source),
    true,
    "Authenticated ensure must check data.backfill or transactions.edit",
  );
});

Deno.test("import ensure-from-trip-ids is key-gated (not open)", async () => {
  const source = await Deno.readTextFile(new URL("./ledger_ensure_routes.ts", import.meta.url));
  assertEquals(
    /requireImportAnonOrServiceKey\s*\(\s*\)/.test(source),
    true,
    "POST /ledger/ensure-from-trip-ids/import must use requireImportAnonOrServiceKey()",
  );
  // Must not register the import path as a bare open handler.
  const openImport =
    /app\.post\([^)]*ensure-from-trip-ids\/import`[^,]*,\s*async\s*\(c\)\s*=>\s*handleEnsureFromTripIds/.test(
      source,
    );
  assertEquals(openImport, false, "Import ensure must not be registered without a key gate");
});
