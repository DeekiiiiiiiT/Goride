import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { auditLogic } from "./audit_logic.ts";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BASE_PATH = "/make-server-37f42386";

/**
 * Step 4.2: Audit Trail Logging
 * Records changes to sensitive odometer data.
 */
app.post(`${BASE_PATH}/audit/logs`, async (c) => {
    try {
        const { entityId, entityType, action, oldValue, newValue, reason, userId } = await c.req.json();
        
        const logId = crypto.randomUUID();
        const logEntry = {
            id: logId,
            timestamp: new Date().toISOString(),
            entityId,
            entityType, // e.g., 'odometer_reading'
            action,     // e.g., 'update', 'delete'
            oldValue,
            newValue,
            reason,
            userId,
            hash: await auditLogic.generateRecordHash({ entityId, action, oldValue, newValue })
        };

        await kv.set(`audit_log:${logId}`, logEntry);
        return c.json({ success: true, logId });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get(`${BASE_PATH}/audit/logs/:entityId`, async (c) => {
    try {
        const entityId = c.req.param("entityId");
        const logs = await kv.getByPrefix("audit_log:");
        const filtered = logs.filter((l: any) => l.entityId === entityId)
                             .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        return c.json(filtered);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

/**
 * Step 4.3: Cryptographic Record Signing verification
 */
app.post(`${BASE_PATH}/audit/verify-integrity`, async (c) => {
    try {
        const { record, signature } = await c.req.json();
        const isValid = await auditLogic.verifyRecordIntegrity(record, signature);
        return c.json({ isValid });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
