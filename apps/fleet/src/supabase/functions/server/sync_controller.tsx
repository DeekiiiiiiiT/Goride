import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const syncApp = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// State Locking Mechanism: Prevent concurrent audits
syncApp.post("/make-server-37f42386/sync/lock", async (c) => {
    try {
        const { resourceId, resourceType, userId, userName } = await c.req.json();
        const lockKey = `lock:${resourceType}:${resourceId}`;
        
        // Check if existing lock
        const existingLock = await kv.get(lockKey);
        
        if (existingLock) {
            // Lock exists. Check if expired (locks last 5 minutes)
            const now = Date.now();
            const lockTime = new Date(existingLock.timestamp).getTime();
            if (now - lockTime < 5 * 60 * 1000 && existingLock.userId !== userId) {
                return c.json({ 
                    success: false, 
                    message: "Resource is currently locked", 
                    lockedBy: existingLock.userName 
                }, 409);
            }
        }
        
        // Create/Refresh lock
        const lockData = {
            resourceId,
            resourceType,
            userId,
            userName,
            timestamp: new Date().toISOString()
        };
        
        await kv.set(lockKey, lockData);
        return c.json({ success: true, lock: lockData });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

syncApp.delete("/make-server-37f42386/sync/lock", async (c) => {
    try {
        const { resourceId, resourceType, userId } = await c.req.json();
        const lockKey = `lock:${resourceType}:${resourceId}`;
        
        const existingLock = await kv.get(lockKey);
        if (existingLock && existingLock.userId === userId) {
            await kv.del(lockKey);
            return c.json({ success: true });
        }
        
        return c.json({ success: false, message: "Lock not found or owned by another user" });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Enterprise User Preferences Persistence
syncApp.get("/make-server-37f42386/sync/preferences", async (c) => {
    try {
        const userId = c.req.query("userId");
        if (!userId) return c.json({ error: "UserId required" }, 400);
        
        const prefs = await kv.get(`prefs:${userId}`);
        return c.json(prefs || { theme: 'light', sidebarCollapsed: false, dashboardFilters: {} });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

syncApp.post("/make-server-37f42386/sync/preferences", async (c) => {
    try {
        const { userId, preferences } = await c.req.json();
        await kv.set(`prefs:${userId}`, preferences);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Sync Status Dashboard (Forensic Audit Trail)
syncApp.get("/make-server-37f42386/sync/audit-trail", async (c) => {
    try {
        // Fetch all active locks to show who is doing what
        const { data: lockData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "lock:%");
            
        const activeLocks = (lockData || []).map(d => d.value);
        
        // Simulated sync health metrics
        return c.json({
            activeSessions: activeLocks.length,
            locks: activeLocks,
            lastGlobalSync: new Date().toISOString(),
            integrityStatus: 'Operational',
            latencyMs: Math.floor(Math.random() * 50) + 10
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default syncApp;
