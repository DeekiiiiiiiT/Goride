/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import { getFleetTimezone } from "./timezone_helper.tsx";

export function registerPublicHealthRoutes(app: Hono) {
  // Health check endpoint
  app.get("/make-server-37f42386/health", (c) => {
    return c.json({ status: "ok" });
  });

  // Public fleet-timezone endpoint (no auth required)
  // Used by frontend for display formatting and CSV import timezone handling
  app.get("/make-server-37f42386/fleet-timezone", async (c) => {
    try {
      const timezone = await getFleetTimezone();
      return c.json({ timezone });
    } catch (e: any) {
      console.log(`fleet-timezone GET error: ${e.message}`);
      return c.json({ timezone: "America/Jamaica" });
    }
  });

}
