/**
 * Toll v2 command API — POST /toll/v2/commands/:intent (user JWT + RPC).
 */
import { Hono, type Context } from "npm:hono@4.3.11";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import {
  mapTollCommandError,
  tollsV2OffResponse,
} from "./toll_v2_command_errors.ts";
import { getOrgId } from "./org_scope.ts";
import { publicApiKey } from "../_shared/serviceKey.ts";

const app = new Hono();

app.use("*", requireAuth({ strict: true }));

function userScopedClient(c: Context) {
  const authHeader = c.req.header("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    publicApiKey()?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

app.post(
  "/toll/v2/commands/:intent",
  requirePermission("toll.manage"),
  async (c) => {
    const intent = String(c.req.param("intent") ?? "").trim();
    if (!intent) {
      return c.json(
        { code: "BAD_REQUEST", current_state: {} },
        400,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const supabase = userScopedClient(c);

    const { data: enabled, error: enabledErr } = await supabase.rpc(
      "toll_v2_enabled",
    );
    if (enabledErr) {
      const mapped = mapTollCommandError(enabledErr);
      return c.json(mapped.body, mapped.status as 400 | 401 | 403 | 409 | 500 | 501);
    }
    if (!enabled) {
      const off = tollsV2OffResponse();
      return c.json(off.body, off.status);
    }

    const { data, error } = await supabase.rpc("toll_v2_command", {
      p_intent: intent,
      p_body: body,
    });
    if (error) {
      const mapped = mapTollCommandError(error);
      return c.json(mapped.body, mapped.status as 400 | 401 | 403 | 409 | 500 | 501);
    }

    const replay = data && typeof data === "object" && (data as Record<string, unknown>).replay === true;
    if (
      (intent === "seal_week" || intent === "reopen_week") &&
      !replay
    ) {
      const organizationId = getOrgId(c);
      const weekKey = typeof body.week_key === "string" ? body.week_key : String(body.week_key ?? "");
      if (organizationId && weekKey) {
        const driverReason = intent === "seal_week" ? "wra67_toll_seal" : "wra68_toll_reopen";
        try {
          const { enqueueDriverWeekUnitsForWeek } = await import("./recon_enqueue_driver_weeks.ts");
          const queued = await enqueueDriverWeekUnitsForWeek(organizationId, weekKey, driverReason);
          if (queued.errors.length > 0) {
            console.warn("[toll-v2-command] driver_week enqueue partial errors", {
              intent,
              organizationId,
              weekKey,
              errors: queued.errors.slice(0, 8),
            });
          }
        } catch (enqErr) {
          console.warn("[toll-v2-command] driver_week enqueue failed", {
            intent,
            organizationId,
            weekKey,
            error: enqErr instanceof Error ? enqErr.message : String(enqErr),
          });
        }
        try {
          const { queueWeekDeskRefresh } = await import("./recon_desk_queue.ts");
          await queueWeekDeskRefresh(organizationId, [weekKey], { heldLine: "rideshare" });
        } catch (deskErr) {
          console.warn("[toll-v2-command] desk refresh enqueue failed", {
            intent,
            organizationId,
            weekKey,
            error: deskErr instanceof Error ? deskErr.message : String(deskErr),
          });
        }
      }
    }

    return c.json(data);
  },
);

export default app;
