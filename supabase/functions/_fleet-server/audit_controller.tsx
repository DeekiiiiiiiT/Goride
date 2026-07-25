import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { auditLogic } from "./audit_logic.ts";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
// Wave 5: Removed unused createClient/supabase — this controller only uses KV store

const app = new Hono();

const BASE_PATH = "/make-server-37f42386";

/**
 * Step 4.2: Audit Trail Logging
 * Records changes to sensitive odometer data.
 */
app.post(`${BASE_PATH}/audit/logs`, requireAuth({ strict: true }), requirePermission('data.export'), async (c) => {
    try {
        // Wave 1B: userId derived from JWT, NOT from body (never trust body userId)
        const rbacUser = c.get('rbacUser') as RbacUser;
        const { entityId, entityType, action, oldValue, newValue, reason } = await c.req.json();
        
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
            userId: rbacUser.userId, // Derived from JWT, never trust body
            hash: await auditLogic.generateRecordHash({ entityId, action, oldValue, newValue })
        };

        await kv.set(`audit_log:${logId}`, logEntry);
        return c.json({ success: true, logId });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get(`${BASE_PATH}/audit/logs/:entityId`, requireAuth({ strict: true }), requirePermission('data.export'), async (c) => {
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
app.post(`${BASE_PATH}/audit/verify-integrity`, requireAuth({ strict: true }), requirePermission('data.export'), async (c) => {
    try {
        const { record, signature } = await c.req.json();
        const isValid = await auditLogic.verifyRecordIntegrity(record, signature);
        return c.json({ isValid });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
