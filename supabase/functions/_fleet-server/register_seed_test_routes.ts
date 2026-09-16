/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import * as cache from "./cache.ts";
import { requireAuth } from "./rbac_middleware.ts";

export function registerSeedTestRoutes(app: Hono) {
  // Phase 8.3: Stress Test / Seed Endpoint — gated so fake trips cannot pollute live earnings
  app.post("/make-server-37f42386/test/seed", requireAuth(), async (c) => {
      try {
          if (Deno.env.get("ALLOW_TEST_SEED") !== "true") {
            return c.json({ error: "Seed endpoint disabled. Set ALLOW_TEST_SEED=true to enable." }, 403);
          }
          const { count, driverId, type } = await c.req.json();
          const numTrips = count || 100;
          const targetDriverId = driverId || "test-driver-1";

          console.log(`Seeding ${numTrips} items for driver ${targetDriverId}...`);

          if (type === 'safety') {
              // Seed specific fatigue patterns
              const trips = [];
              const baseDate = new Date();
              for (let i = 0; i < 20; i++) {
                  const date = new Date(baseDate);
                  date.setDate(date.getDate() - Math.floor(i / 3));
                  // Force some 2AM-5AM trips
                  const hour = 2 + (i % 3); 
                  const requestTime = new Date(date);
                  requestTime.setHours(hour, 0, 0);

                  trips.push({
                      id: crypto.randomUUID(),
                      driverId: targetDriverId,
                      amount: 500,
                      date: date.toISOString().split('T')[0],
                      requestTime: requestTime.toISOString(),
                      status: 'Completed',
                      platform: 'Uber',
                      distance: 15,
                      duration: 120, // 2 hours each
                      isManual: false
                  });
              }
              const keys = trips.map(t => `trip:${t.id}`);
              await kv.mset(keys, trips);
              return c.json({ success: true, seeded: 'fatigue_pattern' });
          }

          const trips = [];
          const baseDate = new Date();

          for (let i = 0; i < numTrips; i++) {
              const date = new Date(baseDate);
              date.setDate(date.getDate() - Math.floor(Math.random() * 30)); // Last 30 days

              trips.push({
                  id: crypto.randomUUID(),
                  driverId: targetDriverId,
                  amount: Math.floor(Math.random() * 2000) + 500, // 500 - 2500
                  date: date.toISOString().split('T')[0],
                  requestTime: date.toISOString(),
                  status: 'Completed',
                  platform: Math.random() > 0.5 ? 'Uber' : 'InDrive',
                  distance: Math.floor(Math.random() * 20) + 1,
                  duration: Math.floor(Math.random() * 60) + 10,
                  isManual: false
              });
          }

          // Save in chunks of 100 to avoid KV write limits
          for (let i = 0; i < trips.length; i += 100) {
              const chunk = trips.slice(i, i + 100);
              const keys = chunk.map(t => `trip:${t.id}`);
              await kv.mset(keys, chunk);
          }

          // Invalidate cache
          await cache.invalidateCacheVersion("stats");
          await cache.invalidateCacheVersion("performance");

          return c.json({ success: true, count: numTrips });
      } catch (e: any) {
          return c.json({ error: e.message }, 500);
      }
  });

}
