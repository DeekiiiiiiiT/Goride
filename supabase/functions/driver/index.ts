/**
 * Roam Driver — Edge function for driver operations and admin.
 *
 * Provides APIs for:
 * - Driver presence tracking
 * - Offer management (view, respond)
 * - Admin operations (monitoring, compliance)
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { registerDriverAdminRoutes } from "./admin.ts";

const app = new Hono().basePath("/driver");

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "apikey",
      "x-client-info",
      "x-request-id",
    ],
  }),
);

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "driver", ts: new Date().toISOString(), ...payload }));
}

// Health check
app.get("/health", (c) => c.json({ ok: true, svc: "driver" }));

// Register admin routes
registerDriverAdminRoutes(app, { svc });

// Export for Deno
Deno.serve(app.fetch);
