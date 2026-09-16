/**
 * Claims HTTP surface — extracted from monolith inline /claims routes (ADR-0021 F3).
 * Mounted on fleet-claims; monolith may still serve until client cutover.
 */
import { Hono } from "npm:hono@4.3.11";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import { getFleetTimezone } from "./timezone_helper.tsx";
import { upsertClaim, deleteClaim, executeClaimDateBackfill } from "./claim_service.ts";
import { CLAIMS_HTTP_PREFIX } from "./claims_http_prefix.ts";

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

app.post(`${BASE}/claims`, async (c) => {
  try {
    const claimInput = await c.req.json();
    const fleetTz = await getFleetTimezone();
    const claim = await upsertClaim(claimInput, c, { fleetTz });
    return c.json({ success: true, data: claim });
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.delete(`${BASE}/claims/:id`, async (c) => {
  const id = c.req.param("id");
  try {
    await deleteClaim(id, c);
    return c.json({ success: true });
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get(`${BASE}/claims/date-backfill/status`, requireAuth(), async (c) => {
  try {
    const result = await executeClaimDateBackfill({ dryRun: true });
    return c.json({ success: true, ...result });
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.post(`${BASE}/claims/date-backfill`, requireAuth(), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = (body as { dryRun?: boolean })?.dryRun !== false;
    const result = await executeClaimDateBackfill({ dryRun });
    return c.json({ success: true, dryRun, ...result });
  } catch (e: unknown) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default app;
