/**
 * Roam Haul — Edge function for haul product admin.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { registerHaulAdminRoutes } from "./admin.ts";

const app = new Hono().basePath("/haul");

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "apikey",
      "x-client-info",
      "x-request-id",
    ],
  }),
);

app.get("/health", (c) => c.json({ ok: true, svc: "haul" }));

registerHaulAdminRoutes(app);

Deno.serve(app.fetch);
