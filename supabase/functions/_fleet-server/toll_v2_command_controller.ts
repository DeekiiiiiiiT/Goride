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

const app = new Hono();

app.use("*", requireAuth({ strict: true }));

function userScopedClient(c: Context) {
  const authHeader = c.req.header("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
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

    return c.json(data);
  },
);

export default app;
