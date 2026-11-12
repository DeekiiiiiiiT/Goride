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

function fakeRecon(run: { id: string; organization_id: string; version: number; state: string } | null, claimCalls: { length: number }) {
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
      return Promise.resolve({ data: { status: "ok" }, error: null });
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
  };
  const res = await mountApp(deps).request("/change", {
    method: "POST",
    headers: { "x-recon-week": HEADER },
  });
  assertEquals(res.status, 200);
  assertEquals(claimCalls.length, 1);
});

Deno.test("parseWeekHeader unchanged", () => {
  assertEquals(parseWeekHeader(`${RUN_A}@3`), { runId: RUN_A, version: 3 });
});
