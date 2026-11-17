/**
 * Maker logo upload via Cloudflare R2 (M3 of docs/cloudflare-r2-storage-migration-audit.md).
 * deno test --no-check --allow-env supabase/functions/_fleet-server/catalog_maker_logo_routes.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { registerCatalogRoutes, setCatalogStorageDepsForTests } from "./catalog_routes.ts";
import { makerLogoUrl } from "./fleet_find_parts_routes.ts";
import type { ObjectStore } from "../_shared/objectStorage/index.ts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

type Handler = (c: unknown) => Promise<Response>;

function routes(supabase: unknown) {
  const map = new Map<string, Handler>();
  const add = (m: string) => (path: string, ...h: unknown[]) => map.set(`${m} ${path}`, h[h.length - 1] as Handler);
  registerCatalogRoutes({ get: add("GET"), post: add("POST"), patch: add("PATCH"), delete: add("DELETE") }, supabase as SupabaseClient);
  return map;
}

function ctx(role: string, body: unknown, make = "Suzuki") {
  return {
    get: (k: string) => (k === "rbacUser" ? { userId: OWNER_ID, id: OWNER_ID, resolvedRole: role, rawRole: role } : undefined),
    json: (b: unknown, status?: number) => new Response(JSON.stringify(b), { status: status ?? 200 }),
    req: {
      header: () => `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`,
      json: () => Promise.resolve(body),
      query: () => "",
      param: (n: string) => (n === "make" ? make : ""),
    },
  };
}

function fakeStore() {
  const objects = new Map<string, Uint8Array>();
  const store: ObjectStore = {
    presignUpload: (b, k) => Promise.resolve(`https://r2.test/${b}/${k}`),
    presignDownload: (b, k) => Promise.resolve(`https://r2.test/${b}/${k}?get`),
    publicUrl: (k) => `https://media.test/${k}`,
    head: (b, k) => Promise.resolve(objects.has(`${b}:${k}`) ? { size: objects.get(`${b}:${k}`)!.length, contentType: null } : null),
    readStart: (b, k, n = 4096) => Promise.resolve(objects.get(`${b}:${k}`)!.subarray(0, n)),
    read: (b, k) => Promise.resolve(objects.get(`${b}:${k}`)!),
    copy: (f, t) => {
      objects.set(`${t.bucket}:${t.key}`, objects.get(`${f.bucket}:${f.key}`)!);
      return Promise.resolve();
    },
    remove: (b, keys) => {
      keys.forEach((k) => objects.delete(`${b}:${k}`));
      return Promise.resolve();
    },
    put: (b, k, bytes) => {
      objects.set(`${b}:${k}`, bytes);
      return Promise.resolve();
    },
  };
  return { store, objects };
}

function fakeSupabase(existingLogo: string | null) {
  const saved: Record<string, unknown>[] = [];
  return {
    saved,
    client: {
      from: (_t: string) => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingLogo ? { logo_storage_path: existingLogo } : null, error: null }) }),
        }),
        upsert: (row: Record<string, unknown>) => {
          saved.push(row);
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) };
        },
      }),
    },
  };
}

const START = "POST /make-server-37f42386/admin/catalog/makers/:make/logo/start";
const FINISH = "POST /make-server-37f42386/admin/catalog/makers/:make/logo/finish";

Deno.test("old multipart logo route is gone (it wrote to Supabase Storage)", () => {
  const r = routes(fakeSupabase(null).client);
  assertEquals(r.has("POST /make-server-37f42386/admin/catalog/makers/:make/logo"), false);
  assert(r.has(START) && r.has(FINISH));
});

Deno.test("staff upload: start → PUT → finish saves the R2 key and removes the old logo", async () => {
  const { store, objects } = fakeStore();
  setCatalogStorageDepsForTests({ store, ticketSecret: "t" });
  const oldKey = "catalogue/logos/platform/old.png";
  objects.set(`public:${oldKey}`, PNG);
  const db = fakeSupabase(oldKey);
  const r = routes(db.client);

  const s = await (await r.get(START)!(ctx("platform_owner", { contentType: "image/png", size: PNG.length }))).json();
  const pending = new URL(s.uploadUrl).pathname.replace(/^\/private\//, "");
  objects.set(`private:${pending}`, PNG);

  const res = await r.get(FINISH)!(ctx("platform_owner", { ticket: s.ticket }));
  assertEquals(res.status, 200);
  const out = await res.json();
  assert(out.logo_storage_path.startsWith("catalogue/logos/platform/") && out.logo_storage_path.endsWith(".png"));
  assertEquals(out.publicUrl, `https://media.test/${out.logo_storage_path}`);
  assertEquals(db.saved[0].logo_storage_path, out.logo_storage_path);
  assertEquals(objects.has(`public:${oldKey}`), false, "old logo removed");
  assertEquals(objects.has(`private:${pending}`), false, "pending removed");
  setCatalogStorageDepsForTests(null);
});

Deno.test("non-staff cannot start a logo upload", async () => {
  setCatalogStorageDepsForTests({ store: fakeStore().store, ticketSecret: "t" });
  const res = await routes(fakeSupabase(null).client).get(START)!(ctx("fleet_owner", { contentType: "image/png", size: 10 }));
  assertEquals(res.status, 403);
  setCatalogStorageDepsForTests(null);
});

Deno.test("wrong file type is refused with 415", async () => {
  setCatalogStorageDepsForTests({ store: fakeStore().store, ticketSecret: "t" });
  const res = await routes(fakeSupabase(null).client).get(START)!(ctx("platform_owner", { contentType: "text/html", size: 10 }));
  assertEquals(res.status, 415);
  setCatalogStorageDepsForTests(null);
});

Deno.test("Fleet logo list builds media addresses from keys", () => {
  Deno.env.set("R2_PUBLIC_BASE_URL", "https://media.roamfleet.co");
  assertEquals(makerLogoUrl("catalogue/logos/platform/a.png"), "https://media.roamfleet.co/catalogue/logos/platform/a.png");
  assertEquals(makerLogoUrl(null), null);
  assertEquals(makerLogoUrl("../x"), null);
});
