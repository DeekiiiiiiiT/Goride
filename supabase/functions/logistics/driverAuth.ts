/**
 * Lightweight driver JWT auth for logistics offer endpoints.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles } from "../_shared/authEdge.ts";
import { serviceKey, publicApiKey } from "../_shared/serviceKey.ts";

export type LogisticsDriverUser = {
  id: string;
  email: string;
};

export async function requireLogisticsDriver(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): Promise<LogisticsDriverUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    publicApiKey()?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey(),
  );

  const { data: profile } = await svc
    .from("driver_profiles")
    .select("user_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    const roles = getJwtRoles(user);
    if (!roles.includes("driver") && !roles.includes("fleet_driver")) {
      return c.json({ error: "Forbidden: not an active driver" }, 403);
    }
  }

  return { id: user.id, email: user.email ?? "" };
}
