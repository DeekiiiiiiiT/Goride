/**
 * Claims HTTP surface — extracted from monolith inline /claims routes (ADR-0021 F3).
 * Mounted on fleet-claims; monolith may still serve until client cutover.
 */
import { Hono } from "npm:hono@4.3.11";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import * as kv from "./kv_store.tsx";
import { upsertClaim, deleteClaim } from "./claim_service.ts";
import { CLAIMS_HTTP_PREFIX } from "./claims_http_prefix.ts";

/** A claim belongs to one company; never change another company's claim by id. An unstamped (old) claim has no
 *  proven owner, so nobody may change or take it over through this route. */
function mayMutateClaim(claim: unknown, orgId: string | null | undefined): boolean {
  const owner = (claim as { organizationId?: unknown })?.organizationId;
  return !!owner && !!orgId && String(owner) === String(orgId);
}

const app = new Hono();
const BASE = CLAIMS_HTTP_PREFIX;

app.get(`${BASE}/claims`, requireAuth(), async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const orgId = getOrgId(c);
    const res = await queryFleet("claims", {
      org: orgId || undefined,
      eq: driverId ? { driver_id: driverId } : undefined,
      order: { col: "updated_at", ascending: false },
      limit: 5000,
    });
    if (res.error) throw res.error;
    const claims = filterByOrg(res.data as Record<string, unknown>[], c);
    return c.json(claims || []);
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.post(`${BASE}/claims`, requireAuth({ requireOrg: true }), async (c) => {
  try {
    const claimInput = await c.req.json();
    const existing = claimInput?.id ? await kv.get(`claim:${claimInput.id}`) : null;
    if (existing && !mayMutateClaim(existing, getOrgId(c))) return c.json({ error: "Not found" }, 404);
    const claim = await upsertClaim(claimInput, c);
    return c.json({ success: true, data: claim });
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.delete(`${BASE}/claims/:id`, requireAuth({ requireOrg: true }), async (c) => {
  const id = c.req.param("id");
  try {
    const existing = await kv.get(`claim:${id}`);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (!mayMutateClaim(existing, getOrgId(c))) return c.json({ error: "Not found" }, 404);
    await deleteClaim(id);
    return c.json({ success: true });
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default app;
