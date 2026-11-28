/**
 * §3.5 Dominion part pictures: every route, the staff/owner split, remake with no diagram (409), idempotent Hide and
 * Show, the bulk-remake numbers, before/after paging, every waitingReason and its banner, and the PP-17 leak scan.
 * Fake database only; no Supabase, no R2, no Gemini. Made-up part numbers.
 * deno test --no-config --no-lock --no-check --allow-env supabase/functions/_fleet-server/part_picture_admin_routes.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  dominionPartPictureJsonLeak,
  NO_DIAGRAM_MESSAGE,
  PART_PICTURE_ADMIN_PREFIX,
  PART_PICTURE_TEMPLATE_PREFIX,
  registerPartPictureAdminRoutes,
  setPartPictureAdminAuditForTests,
  setPartPictureAdminDbForTests,
  setPartPictureAdminSettingsForTests,
  setPartPictureAdminSpendForTests,
} from "./part_picture_admin_routes.ts";
import type {
  AdminPicturePage,
  AdminPictureQuery,
  AdminPictureRow,
  AdminPictureStateCounts,
  AdminTemplateRow,
  PartPictureAdminDb,
} from "./part_picture_admin_db.ts";
import { mergePartPicturesSettings, type PartPicturesSettings } from "./part_pictures_settings.ts";

Deno.env.set("R2_PUBLIC_BASE_URL", "https://media.test");

const GROUP_BRAKES = "10000000-0000-4000-8000-000000000001";
const GROUP_FILTERS = "10000000-0000-4000-8000-000000000002";
const PAGE_ONE = "20000000-0000-4000-8000-000000000001";

const pictureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (minute: number) => new Date(Date.parse("2026-11-26T08:00:00.000Z") + minute * 60_000).toISOString();

type StoredPicture = AdminPictureRow & {
  source_saved_page_id?: string | null;
  attempts?: number;
  next_attempt_at?: string | null;
  last_error?: string | null;
  hidden_at?: string | null;
};

function pictureRow(patch: Partial<StoredPicture> = {}): StoredPicture {
  return {
    id: pictureId(1),
    interchange_group_id: "30000000-0000-4000-8000-000000000001",
    manufacturer: "Testmake",
    part_number: "11111-A1001",
    part_name: "Brake pad set",
    catalog_group_id: GROUP_BRAKES,
    status: "ready",
    r2_key: "catalogue/parts/00000000-0000-4000-8000-000000000001/v1.png",
    version: 1,
    template_version: 1,
    made_at: at(10),
    created_at: at(0),
    ...patch,
  };
}

function templateRow(patch: Partial<AdminTemplateRow> = {}): AdminTemplateRow {
  return {
    catalog_group_id: GROUP_BRAKES,
    materials: "Machined cast-iron rotors.",
    enabled: true,
    version: 3,
    updated_by: null,
    updated_at: at(0),
    ...patch,
  };
}

class FakeDb implements PartPictureAdminDb {
  pictures: StoredPicture[] = [];
  liveDiagrams = new Set<string>();
  templates: AdminTemplateRow[] = [
    templateRow(),
    templateRow({ catalog_group_id: GROUP_FILTERS, materials: "Pleated white filter media.", enabled: false, version: 1 }),
  ];
  groups = [
    { id: GROUP_BRAKES, name: "Brakes" },
    { id: GROUP_FILTERS, name: "Filters" },
  ];
  /** number norm → interchange group */
  master = new Map<string, string>();
  madeToday = 0;
  monthSpend = 0;
  updateCalls: string[] = [];

  private sorted(): StoredPicture[] {
    return [...this.pictures].sort((a, b) => {
      if (a.created_at === b.created_at) return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      return a.created_at < b.created_at ? 1 : -1;
    });
  }

  async listPictures(query: AdminPictureQuery): Promise<AdminPicturePage> {
    if (query.statusIn && !query.statusIn.length) return { rows: [], total: 0, hasOlder: false };
    const search = (query.search ?? "").toLowerCase();
    const matching = this.sorted().filter((row) =>
      (!query.catalogGroupId || row.catalog_group_id === query.catalogGroupId) &&
      (!query.statusIn || query.statusIn.includes(row.status)) &&
      (!query.savedPageId || row.source_saved_page_id === query.savedPageId) &&
      (!search || row.part_number.toLowerCase().includes(search) || row.part_name.toLowerCase().includes(search))
    );
    const total = matching.length;
    const indexOf = (cursor: { createdAt: string; id: string } | null) =>
      cursor ? matching.findIndex((row) => row.created_at === cursor.createdAt && row.id === cursor.id) : -1;
    if (query.before) {
      const index = indexOf(query.before);
      const rows = index < 0 ? [] : matching.slice(Math.max(0, index - query.pageSize), index);
      return { rows, total, hasOlder: true };
    }
    if (query.after) {
      const index = indexOf(query.after);
      const start = index < 0 ? 0 : index + 1;
      const rows = matching.slice(start, start + query.pageSize);
      return { rows, total, hasOlder: start + rows.length < total };
    }
    const offset = (Math.max(1, query.page) - 1) * query.pageSize;
    const rows = matching.slice(offset, offset + query.pageSize);
    return { rows, total, hasOlder: offset + rows.length < total };
  }

  async countStates(): Promise<AdminPictureStateCounts> {
    const count = (statuses: string[]) => this.pictures.filter((row) => statuses.includes(row.status)).length;
    return {
      ready: count(["ready"]),
      failed: count(["failed"]),
      hidden: count(["hidden"]),
      inProgress: count(["queued", "making"]),
    };
  }
  async countMadeOn(): Promise<number> {
    return this.madeToday;
  }
  async sumCostSince(): Promise<number> {
    return this.monthSpend;
  }
  async getPicture(id: string): Promise<AdminPictureRow | null> {
    return this.pictures.find((row) => row.id === id) ?? null;
  }
  async liveDiagramPictureIds(ids: string[]): Promise<string[]> {
    return ids.filter((id) => this.liveDiagrams.has(id));
  }
  async remake(id: string, nextVersion: number, nowIso: string): Promise<void> {
    const row = this.pictures.find((p) => p.id === id)!;
    row.status = "queued";
    row.version = nextVersion;
    row.attempts = 0;
    row.next_attempt_at = nowIso;
    row.last_error = null;
    this.updateCalls.push(`remake:${id}:v${nextVersion}`);
  }
  async hide(id: string, actorId: string | null, nowIso: string): Promise<void> {
    const row = this.pictures.find((p) => p.id === id)!;
    row.status = "hidden";
    row.hidden_at = nowIso;
    this.updateCalls.push(`hide:${id}:${actorId ?? ""}`);
  }
  async show(id: string): Promise<void> {
    const row = this.pictures.find((p) => p.id === id)!;
    row.status = "ready";
    row.hidden_at = null;
    this.updateCalls.push(`show:${id}`);
  }
  async loadTemplates(): Promise<AdminTemplateRow[]> {
    return this.templates;
  }
  async getTemplate(catalogGroupId: string): Promise<AdminTemplateRow | null> {
    return this.templates.find((row) => row.catalog_group_id === catalogGroupId) ?? null;
  }
  async saveTemplate(
    catalogGroupId: string,
    patch: { materials?: string; enabled?: boolean },
    actorId: string | null,
    nextVersion: number,
  ): Promise<AdminTemplateRow | null> {
    const row = this.templates.find((t) => t.catalog_group_id === catalogGroupId);
    if (!row) return null;
    if (patch.materials !== undefined) row.materials = patch.materials;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    row.version = nextVersion;
    row.updated_by = actorId;
    row.updated_at = at(30);
    return row;
  }
  async outdatedPictures(catalogGroupId: string, templateVersion: number): Promise<AdminPictureRow[]> {
    return this.pictures.filter((row) =>
      row.catalog_group_id === catalogGroupId && row.status === "ready" &&
      (row.template_version == null || row.template_version < templateVersion)
    );
  }
  async queueForRemake(ids: string[], nowIso: string): Promise<number> {
    let queued = 0;
    for (const id of ids) {
      const row = await this.getPicture(id);
      if (!row || row.status !== "ready") continue;
      await this.remake(id, row.version + 1, nowIso);
      queued += 1;
    }
    return queued;
  }
  async interchangeGroupsForNumbers(norms: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const n of norms) {
      const group = this.master.get(String(n).toUpperCase().replace(/[^A-Z0-9]/g, ""));
      if (group) map.set(String(n).toUpperCase().replace(/[^A-Z0-9]/g, ""), group);
    }
    return map;
  }
  async picturesByGroupIds(groupIds: string[]): Promise<AdminPictureRow[]> {
    return this.pictures.filter((row) => groupIds.includes(row.interchange_group_id));
  }
  async groupNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const group of this.groups) if (ids.includes(group.id)) map.set(group.id, group.name);
    return map;
  }
}

// ---------------------------------------------------------------- harness

type Registered = { method: string; path: string; handler: (c: unknown) => Promise<Response> };

function register(db: FakeDb, settings: PartPicturesSettings, spend = { usedUsd: 1, budgetUsd: 80 }) {
  const routes: Registered[] = [];
  const record = (method: string) => (path: string, ...handlers: unknown[]) => {
    routes.push({ method, path, handler: handlers[handlers.length - 1] as Registered["handler"] });
  };
  registerPartPictureAdminRoutes(
    { get: record("GET"), post: record("POST"), put: record("PUT") },
    {} as SupabaseClient,
  );
  setPartPictureAdminDbForTests(db);
  setPartPictureAdminSpendForTests(async () => spend);
  setPartPictureAdminSettingsForTests({
    load: async () => settings,
    save: async () => {},
  });
  setPartPictureAdminAuditForTests(async () => {});
  return routes;
}

function clearHooks(): void {
  setPartPictureAdminDbForTests(null);
  setPartPictureAdminSpendForTests(null);
  setPartPictureAdminSettingsForTests(null);
  setPartPictureAdminAuditForTests(null);
}

function aal2Token(): string {
  return `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
}

function mockContext(opts: {
  role?: string;
  query?: Record<string, string>;
  param?: Record<string, string>;
  body?: unknown;
}) {
  const userId = "11111111-1111-4111-8111-111111111111";
  const token = aal2Token();
  return {
    get: (key: string) => {
      if (key !== "rbacUser") return undefined;
      if (opts.role === "") return undefined;
      return {
        userId,
        id: userId,
        email: "staff@test",
        resolvedRole: opts.role ?? "platform_owner",
        rawRole: opts.role ?? "platform_owner",
        organizationId: null,
        mfaVerified: true,
        aal: "aal2",
      };
    },
    json: (body: unknown, status?: number) => new Response(JSON.stringify(body), { status: status ?? 200 }),
    req: {
      raw: new Request("http://test"),
      header: (name: string) => (name.toLowerCase() === "authorization" ? token : ""),
      json: async () => opts.body ?? {},
      query: (name: string) => opts.query?.[name] ?? "",
      param: (name: string) => opts.param?.[name] ?? "",
    },
  };
}

function route(routes: Registered[], method: string, path: string): Registered {
  const found = routes.find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`${method} ${path} not registered`);
  return found;
}

async function call(
  routes: Registered[],
  method: string,
  path: string,
  opts: { role?: string; query?: Record<string, string>; param?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await route(routes, method, path).handler(mockContext(opts));
  const body = await response.json() as Record<string, unknown>;
  return { status: response.status, body };
}

function on(settings: Partial<Record<string, unknown>> = {}): PartPicturesSettings {
  return mergePartPicturesSettings({ ai_part_pictures: true, ...settings });
}

// ---------------------------------------------------------------- 1: the routes exist

Deno.test("§3.5 every route is registered on platform-catalog's admin namespace", () => {
  const routes = register(new FakeDb(), on());
  try {
    const expected = [
      ["GET", PART_PICTURE_ADMIN_PREFIX],
      ["GET", `${PART_PICTURE_ADMIN_PREFIX}/by-numbers`],
      ["GET", `${PART_PICTURE_ADMIN_PREFIX}/settings`],
      ["PUT", `${PART_PICTURE_ADMIN_PREFIX}/settings`],
      ["POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/remake`],
      ["POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/hide`],
      ["POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/show`],
      ["GET", PART_PICTURE_TEMPLATE_PREFIX],
      ["PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`],
      ["GET", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`],
      ["POST", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`],
    ];
    assertEquals(routes.length, expected.length);
    for (const [method, path] of expected) {
      assert(routes.some((r) => r.method === method && r.path === path), `${method} ${path} missing`);
    }
    // The plan's names (docs/part-pictures-audit.md §3.5).
    assert(PART_PICTURE_ADMIN_PREFIX.endsWith("/admin/part-pictures"));
    assert(PART_PICTURE_TEMPLATE_PREFIX.endsWith("/admin/part-picture-templates"));
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 2: who may do what

Deno.test("§3.5 only platform staff read; fleet users never get in", async () => {
  const db = new FakeDb();
  const routes = register(db, on());
  try {
    assertEquals((await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "fleet_owner" })).status, 403);
    assertEquals((await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "driver" })).status, 403);
    assertEquals((await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "" })).status, 401);
    assertEquals((await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "platform_analyst" })).status, 200);
    assertEquals((await call(routes, "GET", PART_PICTURE_TEMPLATE_PREFIX, { role: "platform_support" })).status, 200);
  } finally {
    clearHooks();
  }
});

Deno.test("§3.5 Remake, Hide and Show are staff actions; staff cannot write templates, bulk remake or settings", async () => {
  const db = new FakeDb();
  db.pictures.push(pictureRow());
  db.liveDiagrams.add(pictureId(1));
  const routes = register(db, on());
  try {
    // Staff (support, and an analyst too — §3.5 says staff) may remake.
    const remake = await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/remake`, {
      role: "platform_analyst",
      param: { id: pictureId(1) },
    });
    assertEquals(remake.status, 200);

    // Owner-only: the template save, the bulk remake and the settings.
    const template = await call(routes, "PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, {
      role: "platform_support",
      param: { catalogGroupId: GROUP_BRAKES },
      body: { materials: "New text" },
    });
    assertEquals(template.status, 403);
    assertEquals(String(template.body.error).toLowerCase().includes("owner"), true);

    const bulk = await call(routes, "POST", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, {
      role: "platform_support",
      param: { catalogGroupId: GROUP_BRAKES },
    });
    assertEquals(bulk.status, 403);

    const settings = await call(routes, "PUT", `${PART_PICTURE_ADMIN_PREFIX}/settings`, {
      role: "platform_support",
      body: { aiPartPictures: false },
    });
    assertEquals(settings.status, 403);

    // The owner may.
    const ownerTemplate = await call(routes, "PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, {
      role: "platform_owner",
      param: { catalogGroupId: GROUP_BRAKES },
      body: { materials: "New text" },
    });
    assertEquals(ownerTemplate.status, 200);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 3: remake

Deno.test("§3.5 Remake with no diagram answers 409 and spends nothing", async () => {
  const db = new FakeDb();
  db.pictures.push(pictureRow());
  const routes = register(db, on());
  try {
    const res = await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/remake`, {
      role: "platform_support",
      param: { id: pictureId(1) },
    });
    assertEquals(res.status, 409);
    assertEquals(res.body.error, NO_DIAGRAM_MESSAGE);
    assertEquals(db.pictures[0].status, "ready");
    assertEquals(db.updateCalls, []);
  } finally {
    clearHooks();
  }
});

Deno.test("§3.5 Remake with a diagram queues the next version; a hidden picture must be shown first", async () => {
  const db = new FakeDb();
  db.pictures.push(pictureRow());
  db.liveDiagrams.add(pictureId(1));
  const routes = register(db, on());
  try {
    const res = await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/remake`, {
      role: "platform_support",
      param: { id: pictureId(1) },
    });
    assertEquals(res.status, 200);
    assertEquals(res.body.ok, true);
    const picture = res.body.picture as Record<string, unknown>;
    assertEquals(picture.status, "being_made");
    assertEquals(picture.version, 2);
    assertEquals(db.pictures[0].version, 2);
    assertEquals(db.pictures[0].status, "queued");
    // The file stays: a remake that fails leaves the last good picture in place.
    assertEquals(db.pictures[0].r2_key, "catalogue/parts/00000000-0000-4000-8000-000000000001/v1.png");

    db.pictures[0].status = "hidden";
    const hidden = await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/remake`, {
      role: "platform_support",
      param: { id: pictureId(1) },
    });
    assertEquals(hidden.status, 409);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 4: hide / show

Deno.test("§3.5 Hide and Show are idempotent and Hide keeps the file", async () => {
  const db = new FakeDb();
  db.pictures.push(pictureRow());
  const routes = register(db, on());
  const hide = () =>
    call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/hide`, {
      role: "platform_support",
      param: { id: pictureId(1) },
    });
  const show = () =>
    call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/show`, {
      role: "platform_support",
      param: { id: pictureId(1) },
    });
  try {
    const first = await hide();
    assertEquals(first.status, 200);
    assertEquals((first.body.picture as Record<string, unknown>).status, "hidden");
    assertEquals(db.pictures[0].r2_key != null, true, "Hide keeps the file");
    assertEquals(db.updateCalls.length, 1);

    const second = await hide();
    assertEquals(second.status, 200);
    assertEquals((second.body.picture as Record<string, unknown>).status, "hidden");
    assertEquals(db.updateCalls.length, 1, "the second Hide changes nothing");

    const back = await show();
    assertEquals(back.status, 200);
    assertEquals((back.body.picture as Record<string, unknown>).status, "made");
    const again = await show();
    assertEquals(again.status, 200);
    assertEquals(db.updateCalls.filter((c) => c.startsWith("show")).length, 1);

    // A queued picture is neither hiddable nor showable.
    db.pictures[0].status = "queued";
    assertEquals((await hide()).status, 409);
    assertEquals((await show()).status, 409);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 5: bulk remake numbers

Deno.test("§4 S3 remake-older: count, needUpload, cost at US$0.04 and days at the daily max", async () => {
  const db = new FakeDb();
  db.pictures.push(
    pictureRow({ id: pictureId(1), template_version: 2, created_at: at(1) }),
    pictureRow({ id: pictureId(2), template_version: 1, created_at: at(2) }),
    pictureRow({ id: pictureId(3), template_version: 3, created_at: at(3) }),
    pictureRow({ id: pictureId(4), template_version: 2, created_at: at(4) }),
  );
  db.liveDiagrams.add(pictureId(1));
  db.liveDiagrams.add(pictureId(2));
  db.liveDiagrams.add(pictureId(3));
  const routes = register(db, on({ daily_max: 50 }));
  try {
    const preview = await call(routes, "GET", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, {
      role: "platform_analyst",
      param: { catalogGroupId: GROUP_BRAKES },
    });
    assertEquals(preview.status, 200);
    assertEquals(preview.body, { count: 2, needUpload: 1, costUsd: 0.08, days: 1 });

    const run = await call(routes, "POST", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, {
      role: "platform_owner",
      param: { catalogGroupId: GROUP_BRAKES },
    });
    assertEquals(run.status, 200);
    assertEquals(run.body.ok, true);
    assertEquals(run.body.queued, 2);
    assertEquals(run.body.needUpload, 1);
    // The current-version picture and the one with no diagram are untouched.
    assertEquals(db.pictures.find((p) => p.id === pictureId(3))!.status, "ready");
    assertEquals(db.pictures.find((p) => p.id === pictureId(4))!.status, "ready");
    assertEquals(db.pictures.find((p) => p.id === pictureId(1))!.version, 2);
  } finally {
    clearHooks();
  }
});

Deno.test("§4 S3 remake-older days follow the current daily max", async () => {
  const db = new FakeDb();
  for (let i = 1; i <= 5; i++) {
    db.pictures.push(pictureRow({ id: pictureId(i), template_version: 1, created_at: at(i) }));
    db.liveDiagrams.add(pictureId(i));
  }
  const routes = register(db, on({ daily_max: 2 }));
  try {
    const preview = await call(routes, "GET", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, {
      role: "platform_owner",
      param: { catalogGroupId: GROUP_BRAKES },
    });
    assertEquals(preview.body, { count: 5, needUpload: 0, costUsd: 0.2, days: 3 });
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 6: paging

Deno.test("§3.5 24 a page, with Newer/Older (before/after) paging", async () => {
  const db = new FakeDb();
  for (let i = 1; i <= 30; i++) {
    db.pictures.push(pictureRow({ id: pictureId(i), part_number: `11111-A${1000 + i}`, created_at: at(i) }));
  }
  const routes = register(db, on());
  try {
    const first = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "platform_support" });
    assertEquals(first.status, 200);
    const items = first.body.items as Array<Record<string, unknown>>;
    assertEquals(items.length, 24);
    assertEquals(first.body.total, 30);
    assertEquals(first.body.page, 1);
    assertEquals(first.body.pageSize, 24);
    assertEquals(first.body.hasOlder, true);
    assertEquals(first.body.hasNewer, false);
    // Newest first.
    assertEquals(items[0].partNumber, "11111-A1030");

    // Older: the next 6 through the cursor.
    const older = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, {
      role: "platform_support",
      query: { after: String(first.body.nextAfter) },
    });
    assertEquals((older.body.items as unknown[]).length, 6);
    assertEquals(older.body.hasOlder, false);
    assertEquals((older.body.items as Array<Record<string, unknown>>)[5].partNumber, "11111-A1001");

    // The page number and the cursor agree.
    const page2 = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, {
      role: "platform_support",
      query: { page: "2" },
    });
    assertEquals((page2.body.items as Array<Record<string, unknown>>).length, 6);
    assertEquals(page2.body.hasNewer, true);

    // Newer: back to the first page from the first row of page 2.
    const newer = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, {
      role: "platform_support",
      query: { before: String(page2.body.nextBefore) },
    });
    assertEquals((newer.body.items as Array<Record<string, unknown>>).length, 24);
    assertEquals((newer.body.items as Array<Record<string, unknown>>)[0].partNumber, "11111-A1030");

    const bad = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, {
      role: "platform_support",
      query: { after: "not-a-token" },
    });
    assertEquals(bad.status, 400);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 7: filters and the picture shape

Deno.test("§3.5 filters: state, part group, this upload and a number or name search", async () => {
  const db = new FakeDb();
  db.pictures.push(
    pictureRow({ id: pictureId(1), status: "ready", created_at: at(1) }),
    pictureRow({ id: pictureId(2), status: "queued", created_at: at(2) }),
    pictureRow({ id: pictureId(3), status: "failed", created_at: at(3) }),
    pictureRow({ id: pictureId(4), status: "hidden", created_at: at(4) }),
    pictureRow({ id: pictureId(5), catalog_group_id: GROUP_FILTERS, part_number: "22222-B2002", part_name: "Air filter", created_at: at(5) }),
    pictureRow({ id: pictureId(6), source_saved_page_id: PAGE_ONE, created_at: at(6) }),
  );
  const routes = register(db, on());
  const list = (query: Record<string, string>) =>
    call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "platform_support", query });
  try {
    const numbers = async (query: Record<string, string>) =>
      ((await list(query)).body.items as Array<Record<string, unknown>>).map((row) => row.partNumber);

    assertEquals((await numbers({ status: "made" })).length, 3); // 1, 5 and 6 are ready
    assertEquals((await numbers({ status: "being_made" })).length, 1);
    assertEquals((await numbers({ status: "waiting" })).length, 0);
    assertEquals((await numbers({ status: "failed" })).length, 1);
    assertEquals((await numbers({ status: "hidden" })).length, 1);
    assertEquals((await numbers({ catalogGroupId: GROUP_FILTERS })), ["22222-B2002"]);
    assertEquals((await numbers({ savedPageId: PAGE_ONE })).length, 1);
    assertEquals((await numbers({ search: "air" })), ["22222-B2002"]);
    assertEquals((await numbers({ search: "11111" })).length, 5);
    assertEquals((await list({ status: "nonsense" })).status, 400);

    // Point 2: the shape of every picture.
    const one = ((await list({ search: "air" })).body.items as Array<Record<string, unknown>>)[0];
    assertEquals(Object.keys(one).sort(), [
      "catalogGroup",
      "hasDiagram",
      "id",
      "madeAt",
      "manufacturer",
      "partName",
      "partNumber",
      "status",
      "templateVersion",
      "url",
      "urlDetail",
      "version",
      "waitingReason",
    ]);
    assertEquals(one.catalogGroup, { id: GROUP_FILTERS, name: "Filters" });
    assertEquals(one.hasDiagram, false);
    const url = one.url as { src: string; srcSet: string } | null;
    assert(url && url.src.includes("/cdn-cgi/image/") && url.src.includes("width=480"), JSON.stringify(url));
    const detail = one.urlDetail as { src: string } | null;
    assert(detail && detail.src.includes("width=1200"), JSON.stringify(detail));
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 8: waitingReason + banners

Deno.test("§3.5 each waitingReason, its counts and its banner", async () => {
  const future = "2099-01-01T00:00:00.000Z";
  const cases: Array<{
    name: string;
    settings: PartPicturesSettings;
    madeToday: number;
    reason: string | null;
    view: string;
    banner: string | null;
  }> = [
    {
      name: "AI part pictures off",
      settings: on({ ai_part_pictures: false }),
      madeToday: 0,
      reason: "off",
      view: "waiting",
      banner: "ai_off",
    },
    {
      name: "the key was refused",
      settings: on({ part_pictures_paused_until: future, part_pictures_pause_reason: "key" }),
      madeToday: 0,
      reason: "key_refused",
      view: "waiting",
      banner: "key_refused",
    },
    {
      name: "paused after repeated failures",
      settings: on({ part_pictures_paused_until: future, part_pictures_pause_reason: "outage" }),
      madeToday: 0,
      reason: "paused",
      view: "waiting",
      banner: "paused",
    },
    {
      name: "today's max is already made",
      settings: on({ daily_max: 5 }),
      madeToday: 5,
      reason: "budget",
      view: "waiting",
      banner: null,
    },
    {
      name: "nothing blocks it",
      settings: on(),
      madeToday: 0,
      reason: null,
      view: "being_made",
      banner: null,
    },
  ];

  for (const testCase of cases) {
    const db = new FakeDb();
    db.madeToday = testCase.madeToday;
    db.pictures.push(pictureRow({ status: "queued" }));
    const routes = register(db, testCase.settings);
    try {
      const res = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "platform_support" });
      assertEquals(res.status, 200, testCase.name);
      const item = (res.body.items as Array<Record<string, unknown>>)[0];
      assertEquals(item.waitingReason, testCase.reason, testCase.name);
      assertEquals(item.status, testCase.view, testCase.name);
      const counts = res.body.counts as Record<string, number>;
      assertEquals(counts.waiting, testCase.view === "waiting" ? 1 : 0, testCase.name);
      assertEquals(counts.beingMade, testCase.view === "being_made" ? 1 : 0, testCase.name);
      const banners = (res.body.banners as Array<Record<string, unknown>>).map((b) => b.kind);
      if (testCase.banner) {
        assert(banners.includes(testCase.banner), `${testCase.name}: ${JSON.stringify(banners)}`);
      }
      // The waiting filter follows the same rule.
      const waiting = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, {
        role: "platform_support",
        query: { status: "waiting" },
      });
      assertEquals((waiting.body.items as unknown[]).length, testCase.view === "waiting" ? 1 : 0, testCase.name);
    } finally {
      clearHooks();
    }
  }
});

Deno.test("§4 S3 the 80% Gemini banner and the two spend lines", async () => {
  const db = new FakeDb();
  db.monthSpend = 0.12;
  db.pictures.push(pictureRow());
  const routes = register(db, on(), { usedUsd: 64, budgetUsd: 80 });
  try {
    const res = await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "platform_support" });
    assertEquals(res.body.partPictureSpendUsd, 0.12);
    assertEquals(res.body.pictureSpend, { usedUsd: 64, budgetUsd: 80 });
    assertEquals(res.body.madeToday, { count: 0, dailyMax: 50 });
    assertEquals(res.body.aiPicturesOn, true);
    assertEquals(res.body.pause, null);
    assertEquals((res.body.banners as Array<Record<string, unknown>>).map((b) => b.kind), ["budget_80"]);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 9: templates

Deno.test("§3.5 templates: read staff, save owner only, +1 to version, an unchanged save is refused", async () => {
  const db = new FakeDb();
  const routes = register(db, on());
  try {
    const list = await call(routes, "GET", PART_PICTURE_TEMPLATE_PREFIX, { role: "platform_analyst" });
    assertEquals(list.status, 200);
    const items = list.body.items as Array<Record<string, unknown>>;
    assertEquals(items.length, 2);
    const brakes = items.find((row) => row.catalogGroupId === GROUP_BRAKES)!;
    assertEquals(brakes.name, "Brakes");
    assertEquals(brakes.version, 3);
    assertEquals(brakes.enabled, true);
    assertEquals(items.find((row) => row.catalogGroupId === GROUP_FILTERS)!.enabled, false);

    const same = await call(routes, "PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, {
      role: "platform_owner",
      param: { catalogGroupId: GROUP_BRAKES },
      body: { materials: "Machined cast-iron rotors." },
    });
    assertEquals(same.status, 409);
    assertEquals(db.templates[0].version, 3, "an unchanged save never bumps the version");

    const saved = await call(routes, "PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, {
      role: "platform_owner",
      param: { catalogGroupId: GROUP_BRAKES },
      body: { materials: "Machined cast-iron rotors, zinc-plated pins." },
    });
    assertEquals(saved.status, 200);
    const template = saved.body.template as Record<string, unknown>;
    assertEquals(template.version, 4);
    assertEquals(template.materials, "Machined cast-iron rotors, zinc-plated pins.");
    assertEquals(template.updatedBy, "11111111-1111-4111-8111-111111111111");

    const switched = await call(routes, "PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, {
      role: "platform_owner",
      param: { catalogGroupId: GROUP_FILTERS },
      body: { enabled: true },
    });
    assertEquals(switched.status, 200);
    assertEquals((switched.body.template as Record<string, unknown>).enabled, true);

    assertEquals((await call(routes, "PUT", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, {
      role: "platform_owner",
      param: { catalogGroupId: "10000000-0000-4000-8000-0000000000ff" },
      body: { materials: "x" },
    })).status, 404);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 10: settings

Deno.test("§3.5 settings: read staff, write owner, the switch and the limits", async () => {
  const db = new FakeDb();
  const saved: Array<Record<string, unknown>> = [];
  const routes = register(db, on({ daily_max: 50 }));
  setPartPictureAdminSettingsForTests({
    load: async () => on({ daily_max: 50 }),
    save: async (patch) => {
      saved.push(patch as Record<string, unknown>);
    },
  });
  try {
    const read = await call(routes, "GET", `${PART_PICTURE_ADMIN_PREFIX}/settings`, { role: "platform_analyst" });
    assertEquals(read.status, 200);
    const settings = read.body.settings as Record<string, unknown>;
    assertEquals(settings.aiPartPictures, true);
    assertEquals(settings.dailyMax, 50);
    assertEquals(settings.maxAttempts, 3);
    assertEquals(settings.retentionDays, 30);

    const off = await call(routes, "PUT", `${PART_PICTURE_ADMIN_PREFIX}/settings`, {
      role: "platform_owner",
      body: { aiPartPictures: false, dailyMax: 20 },
    });
    assertEquals(off.status, 200);
    assertEquals(saved.length, 1);
    assertEquals(saved[0], { ai_part_pictures: false, daily_max: 20 });

    assertEquals((await call(routes, "PUT", `${PART_PICTURE_ADMIN_PREFIX}/settings`, {
      role: "platform_owner",
      body: { dailyMax: -1 },
    })).status, 400);
    assertEquals((await call(routes, "PUT", `${PART_PICTURE_ADMIN_PREFIX}/settings`, {
      role: "platform_owner",
      body: {},
    })).status, 400);
  } finally {
    clearHooks();
  }
});

// ---------------------------------------------------------------- 11: the Dominion leak scan

Deno.test("PP-17: no part-picture answer carries a fleet name, plate, driver, vehicle or 'used by'", async () => {
  assertEquals(dominionPartPictureJsonLeak('{"organizationId":"x"}'), "organizationid");
  assertEquals(dominionPartPictureJsonLeak('{"plate":"PP1234"}'), "plate");
  assertEquals(dominionPartPictureJsonLeak('{"note":"used by three fleets"}'), "used by");
  assertEquals(dominionPartPictureJsonLeak('{"ok":true}'), null);
  // "template" is not "plate": a word boundary is required.
  assertEquals(dominionPartPictureJsonLeak('{"templateVersion":3}'), null);

  const db = new FakeDb();
  db.pictures.push(pictureRow());
  db.liveDiagrams.add(pictureId(1));
  const routes = register(db, on());
  try {
    const answers = [
      await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/hide`, {
        role: "platform_support",
        param: { id: pictureId(1) },
      }),
      await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/show`, {
        role: "platform_support",
        param: { id: pictureId(1) },
      }),
      await call(routes, "POST", `${PART_PICTURE_ADMIN_PREFIX}/:id/remake`, {
        role: "platform_support",
        param: { id: pictureId(1) },
      }),
      await call(routes, "GET", PART_PICTURE_ADMIN_PREFIX, { role: "platform_support" }),
      await call(routes, "GET", `${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, {
        role: "platform_support",
        param: { catalogGroupId: GROUP_BRAKES },
      }),
      await call(routes, "GET", `${PART_PICTURE_ADMIN_PREFIX}/settings`, { role: "platform_support" }),
    ];
    for (const answer of answers) {
      assertEquals(answer.status, 200, JSON.stringify(answer.body));
      assertEquals(dominionPartPictureJsonLeak(JSON.stringify(answer.body)), null);
    }
  } finally {
    clearHooks();
  }
});

Deno.test("§4 S2 by-numbers: each number gets its group's picture or null; fleet users never get in", async () => {
  const db = new FakeDb();
  db.pictures.push(pictureRow());
  db.master.set("11111A1001", "30000000-0000-4000-8000-000000000001");
  const routes = register(db, on());
  try {
    const res = await call(routes, "GET", `${PART_PICTURE_ADMIN_PREFIX}/by-numbers`, {
      role: "platform_support",
      query: { numbers: "11111-A1001, 22222-B2002" },
    });
    assertEquals(res.status, 200);
    const items = res.body.items as Array<{ number: string; picture: { id: string; status: string } | null }>;
    assertEquals(items.map((i) => i.number), ["11111-A1001", "22222-B2002"]);
    assertEquals(items[0].picture?.id, pictureId(1));
    assertEquals(items[0].picture?.status, "made");
    assertEquals(items[1].picture, null);
    assertEquals(res.body.aiPicturesOn, true);
    const empty = await call(routes, "GET", `${PART_PICTURE_ADMIN_PREFIX}/by-numbers`, { role: "platform_support", query: {} });
    assertEquals(empty.body.items, []);
    const fleet = await call(routes, "GET", `${PART_PICTURE_ADMIN_PREFIX}/by-numbers`, { role: "fleet_owner", query: { numbers: "11111-A1001" } });
    assertEquals(fleet.status, 403);
  } finally {
    clearHooks();
  }
});
