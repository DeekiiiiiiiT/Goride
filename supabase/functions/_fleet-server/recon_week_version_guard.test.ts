import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import type { Context, Next } from "npm:hono@4.3.11";
import { reconWeekVersionGuardWith, parseWeekHeader, type WeekGuardDeps, type WeekReconClient } from "./recon_week_version_guard.ts";
import type { RbacUser } from "./rbac_middleware.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const RUN_A = "11111111-1111-4111-8111-111111111111";
const HEADER = `${RUN_A}@3`;

function user(orgId: string): RbacUser {
  return {
    userId: "user-1",
    email: "u@roam.test",
    rawRole: "fleet_owner",
    resolvedRole: "fleet_owner",
    organizationId: orgId,
  };
}

type FakeRun = { id: string; organization_id: string; version: number; state: string; service_line?: string; week_key?: string };

function fakeRecon(
  run: FakeRun | null,
  claimCalls: { length: number },
  claimStatus = "ok",
  currentEnough = false,
) {
  return {
    from() {
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({
            eq: (_c2: string, orgId: string) => ({
              maybeSingle: async () => {
                if (!run || run.id !== id || run.organization_id !== orgId) {
                  return { data: null, error: null };
                }
                return { data: run, error: null };
              },
            }),
          }),
        }),
      };
    },
    rpc(name: string) {
      if (name === "claim_week_change") claimCalls.length += 1;
      if (name === "week_version_current_enough") return Promise.resolve({ data: currentEnough, error: null });
      return Promise.resolve({ data: { status: claimStatus }, error: null });
    },
  } as unknown as WeekReconClient;
}

function mountApp(deps: WeekGuardDeps) {
  const app = new Hono();
  app.use("*", reconWeekVersionGuardWith(deps));
  app.post("/change", (c) => c.json({ ok: true }, 200));
  return app;
}

Deno.test("S3: no sign-in → 401 and no week run read", async () => {
  let readCount = 0;
  const claimCalls = { length: 0 };
  const deps: WeekGuardDeps = {
    requireAuthStrict: async (_c, _next) => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    reconClient: () => {
      readCount += 1;
      return fakeRecon(null, claimCalls);
    },
  };
  const res = await mountApp(deps).request("/change", {
    method: "POST",
    headers: { "x-recon-week": HEADER },
  });
  assertEquals(res.status, 401);
  assertEquals(readCount, 0);
  assertEquals(claimCalls.length, 0);
});

Deno.test("S3: another fleet run → WEEK_NOT_READY and no claim", async () => {
  const claimCalls = { length: 0 };
  const deps: WeekGuardDeps = {
    requireAuthStrict: async (c: Context, next: () => Promise<void | Response>) => {
      c.set("rbacUser", user(ORG_A));
      return await next();
    },
    reconClient: () => fakeRecon({ id: RUN_A, organization_id: ORG_B, version: 3, state: "collecting" }, claimCalls),
  };
  const res = await mountApp(deps).request("/change", {
    method: "POST",
    headers: { "x-recon-week": HEADER },
  });
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "WEEK_NOT_READY");
  assertEquals(claimCalls.length, 0);
});

Deno.test("S3: own fleet run at version → route runs and claim is called", async () => {
  const claimCalls = { length: 0 };
  const deps: WeekGuardDeps = {
    requireAuthStrict: async (c: Context, next: () => Promise<void | Response>) => {
      c.set("rbacUser", user(ORG_A));
      return await next();
    },
    reconClient: () => fakeRecon({ id: RUN_A, organization_id: ORG_A, version: 3, state: "collecting" }, claimCalls),
    refreshWeek: async () => {},
  };
  const res = await mountApp(deps).request("/change", {
    method: "POST",
    headers: { "x-recon-week": HEADER },
  });
  assertEquals(res.status, 200);
  assertEquals(claimCalls.length, 1);
});

const RUN_ROW: FakeRun = {
  id: RUN_A,
  organization_id: ORG_A,
  version: 3,
  state: "collecting",
  service_line: "rideshare",
  week_key: "2026-09-21",
};

function signedIn(): WeekGuardDeps["requireAuthStrict"] {
  return async (c: Context, next: () => Promise<void | Response>) => {
    c.set("rbacUser", user(ORG_A));
    return await next();
  };
}

Deno.test("WRA-43: a saved change queues the week's recalculation", async () => {
  const queued: string[] = [];
  const deps: WeekGuardDeps = {
    requireAuthStrict: signedIn(),
    reconClient: () => fakeRecon(RUN_ROW, { length: 0 }),
    refreshWeek: async (org, week, heldLine) => {
      queued.push(`${org}|${week}|${heldLine}`);
    },
  };
  const res = await mountApp(deps).request("/change", { method: "POST", headers: { "x-recon-week": HEADER } });
  assertEquals(res.status, 200);
  assertEquals(queued, [`${ORG_A}|2026-09-21|rideshare`]);
});

Deno.test("WRA-43: a replay or a refused change queues nothing", async () => {
  const queued: string[] = [];
  const refreshWeek = async (org: string, week: string) => {
    queued.push(`${org}|${week}`);
  };
  const replay = await mountApp({
    requireAuthStrict: signedIn(),
    reconClient: () => fakeRecon(RUN_ROW, { length: 0 }, "replay"),
    refreshWeek,
  }).request("/change", { method: "POST", headers: { "x-recon-week": HEADER } });
  assertEquals(replay.status, 200);

  const app = new Hono();
  app.use("*", reconWeekVersionGuardWith({ requireAuthStrict: signedIn(), reconClient: () => fakeRecon(RUN_ROW, { length: 0 }), refreshWeek }));
  app.post("/change", (c) => c.json({ error: "NOPE" }, 400));
  const refused = await app.request("/change", { method: "POST", headers: { "x-recon-week": HEADER } });
  assertEquals(refused.status, 400);
  assertEquals(queued, []);
});

Deno.test("WRA-43: a failed queue never fails the saved change", async () => {
  const res = await mountApp({
    requireAuthStrict: signedIn(),
    reconClient: () => fakeRecon(RUN_ROW, { length: 0 }),
    refreshWeek: async () => {
      throw new Error("queue down");
    },
  }).request("/change", { method: "POST", headers: { "x-recon-week": HEADER } });
  assertEquals(res.status, 200);
});

Deno.test("parseWeekHeader unchanged", () => {
  assertEquals(parseWeekHeader(`${RUN_A}@3`), { runId: RUN_A, version: 3 });
});

Deno.test("week moved only by the calculator → change goes through", async () => {
  const claimCalls = { length: 0 };
  const deps: WeekGuardDeps = {
    requireAuthStrict: signedIn(),
    reconClient: () => fakeRecon({ ...RUN_ROW, version: 5 }, claimCalls, "ok", true),
    refreshWeek: async () => {},
  };
  const res = await mountApp(deps).request("/change", { method: "POST", headers: { "x-recon-week": HEADER } });
  assertEquals(res.status, 200);
  assertEquals(claimCalls.length, 1);
});

Deno.test("week moved by a person → WEEK_CHANGED and no claim", async () => {
  const claimCalls = { length: 0 };
  const deps: WeekGuardDeps = {
    requireAuthStrict: signedIn(),
    reconClient: () => fakeRecon({ ...RUN_ROW, version: 5 }, claimCalls, "ok", false),
    refreshWeek: async () => {},
  };
  const res = await mountApp(deps).request("/change", { method: "POST", headers: { "x-recon-week": HEADER } });
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, "WEEK_CHANGED");
  assertEquals(claimCalls.length, 0);
});
