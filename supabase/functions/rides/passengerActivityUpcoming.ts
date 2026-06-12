import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { allowsPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import type { PassengerActivityHistoryDeps } from "./passengerActivityHistory.ts";
import { loadScheduledPipelineItems } from "./scheduledRides/activityPipeline.ts";
import { isScheduledRidesEnabled } from "./scheduledRides/flags.ts";

export type ActivityPipelineKind = "schedule" | "courier" | "event";

export type ActivityPipelineItem = {
  kind: ActivityPipelineKind;
  id: string;
  title: string;
  subtitle: string | null;
  scheduled_at: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  status: string;
  detail_lines: string[];
};

/** Future scheduled / courier / event bookings. */
export async function buildActivityPipelineItems(
  deps: PassengerActivityHistoryDeps,
  userId: string,
): Promise<ActivityPipelineItem[]> {
  const items: ActivityPipelineItem[] = [];
  if (isScheduledRidesEnabled()) {
    const scheduled = await loadScheduledPipelineItems(deps.svc, deps.pubSvc, userId);
    items.push(...scheduled);
  }
  return items;
}

export function registerPassengerActivityUpcomingRoutes(
  app: Hono,
  deps: PassengerActivityHistoryDeps,
) {
  app.get("/v1/activity/upcoming", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const items = await buildActivityPipelineItems(deps, auth.user.id);
    return c.json({ items });
  });
}
