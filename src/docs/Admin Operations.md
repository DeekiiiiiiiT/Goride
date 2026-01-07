# Function 5: Admin Operations

**Instructions:**
1. Go to your **Supabase Dashboard**.
2. Click **Edge Functions**.
3. Click **Deploy a new function** (Green Button) -> **Via Editor**.
4. Name it: `admin-operations`
5. In the editor, delete the default code and **paste the code below**.
6. **Save** and **Deploy**.

**Code to Copy:**

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

// --- KV STORE LOGIC (Included Inline) ---
const client = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const set = async (key: string, value: any): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").upsert({ key, value });
  if (error) throw new Error(error.message);
};

const get = async (key: string): Promise<any> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value;
};

const del = async (key: string): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").delete().eq("key", key);
  if (error) throw new Error(error.message);
};

const mset = async (keys: string[], values: any[]): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").upsert(keys.map((k, i) => ({ key: k, value: values[i] })));
  if (error) throw new Error(error.message);
};

const mget = async (keys: string[]): Promise<any[]> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("value").in("key", keys);
  if (error) throw new Error(error.message);
  return data?.map((d) => d.value) ?? [];
};

const mdel = async (keys: string[]): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").delete().in("key", keys);
  if (error) throw new Error(error.message);
};

const getByPrefix = async (prefix: string): Promise<any[]> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("key, value").like("key", prefix + "%");
  if (error) throw new Error(error.message);
  return data?.map((d) => d.value) ?? [];
};

// --- MAIN FUNCTION LOGIC ---
const app = new Hono();
app.use('*', logger(console.log));
app.use("/*", cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
}));

// Route Helper to handle both prefixed and non-prefixed paths
const route = (path: string, handler: any) => {
    app.get(path, handler);
    app.get(`/admin-operations${path}`, handler);
};
const postRoute = (path: string, handler: any) => {
    app.post(path, handler);
    app.post(`/admin-operations${path}`, handler);
};
const putRoute = (path: string, handler: any) => {
    app.put(path, handler);
    app.put(`/admin-operations${path}`, handler);
};
const patchRoute = (path: string, handler: any) => {
    app.patch(path, handler);
    app.patch(`/admin-operations${path}`, handler);
};
const deleteRoute = (path: string, handler: any) => {
    app.delete(path, handler);
    app.delete(`/admin-operations${path}`, handler);
};

route("/health", (c: any) => c.json({ status: "ok" }));

// --- USERS ---
const getUsers = async (c: any) => {
  try {
    const supabase = client();

    // 1. Fetch from KV (App Data)
    const [users, admins, drivers] = await Promise.all([
      getByPrefix("user:"),
      getByPrefix("admin:"),
      getByPrefix("driver:")
    ]);
    
    // 2. Fetch from Supabase Auth (Identity Data)
    // List users (up to 1000 to be safe)
    const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authError) console.error("Auth Error:", authError);

    // 3. Process and Merge
    const userMap = new Map();
    
    // Helper to process KV users
    const processKV = (list: any[], role: string) => {
        (list || []).forEach(u => {
            if (!u.id) return;
            if (!u.role) u.role = role;
            u.source = 'kv';
            userMap.set(u.id, u); 
        });
    };
    
    processKV(users, 'admin');
    processKV(admins, 'admin');
    processKV(drivers, 'driver');

    // Helper: Create a merged list
    const combinedUsers: any[] = [];
    const processedIds = new Set();

    // Add KV users first (prefer their data structure)
    userMap.forEach((u) => {
        combinedUsers.push(u);
        processedIds.add(u.id);
        // Also track email if present to avoid dupes if ID differs (unlikely for Auth but possible)
        if (u.email) processedIds.add(u.email);
    });

    // Add Auth users who are missing from KV
    if (authUsers) {
        authUsers.forEach((au: any) => {
            // Check if already present by ID or Email
            if (processedIds.has(au.id) || (au.email && processedIds.has(au.email))) {
                return;
            }
            
            // New user found in Auth!
            combinedUsers.push({
                id: au.id,
                email: au.email,
                name: au.user_metadata?.name || au.email?.split('@')[0] || 'User',
                role: au.user_metadata?.role || 'admin', // Default to admin for orphan Auth users
                status: 'active', 
                lastActive: au.last_sign_in_at || 'Never',
                source: 'auth'
            });
        });
    }

    // Sort by name
    combinedUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    return c.json(combinedUsers);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/users", getUsers);

const postUser = async (c: any) => {
  try {
    const user = await c.req.json();
    if (!user.id) user.id = crypto.randomUUID();
    
    // Determine prefix based on role
    const prefix = user.role === 'driver' ? 'driver' : 'user';
    
    // If password provided, create Supabase Auth user
    if (user.password && user.email) {
         const supabase = client();
         const { data, error } = await supabase.auth.admin.createUser({
            email: user.email,
            password: user.password,
            user_metadata: { name: user.name || '', role: user.role || 'driver' },
            email_confirm: true
         });
         if (error) console.error("Auth Create Error:", error);
         else if (data.user) user.auth_id = data.user.id;
    }

    await set(`${prefix}:${user.id}`, user);
    return c.json({ success: true, data: user });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/users", postUser);

const updateUserRole = async (c: any) => {
  const id = c.req.param("id");
  try {
    const { role } = await c.req.json();
    
    // 1. Try to find in KV
    let user = await get(`user:${id}`);
    let currentPrefix = 'user';
    
    if (!user) {
        user = await get(`driver:${id}`);
        currentPrefix = 'driver';
    }
    if (!user) {
        user = await get(`admin:${id}`);
        currentPrefix = 'admin';
    }
    
    // 2. If not in KV, try Auth (for auto-migration)
    if (!user) {
        const supabase = client();
        const { data: { user: authUser }, error } = await supabase.auth.admin.getUserById(id);
        
        if (authUser) {
            // Create new KV record for this Auth user
            user = {
                id: authUser.id,
                email: authUser.email,
                name: authUser.user_metadata?.name || authUser.email?.split('@')[0],
                role: role, 
                status: 'active',
                source: 'kv'
            };
            
            const prefix = role === 'driver' ? 'driver' : 'user';
            await set(`${prefix}:${id}`, user);
            
            // Try to sync metadata to Auth as well
            await supabase.auth.admin.updateUserById(id, { user_metadata: { role } });
            
            return c.json({ success: true, data: user });
        }
        
        return c.json({ error: "User not found" }, 404);
    }
    
    // 3. Normal update
    user.role = role;
    
    // Migration logic
    let newPrefix = currentPrefix;
    if (role === 'driver') newPrefix = 'driver';
    else if (role === 'admin') newPrefix = 'user';
    
    if (currentPrefix !== newPrefix) {
        await del(`${currentPrefix}:${id}`);
        await set(`${newPrefix}:${id}`, user);
    } else {
        await set(`${currentPrefix}:${id}`, user);
    }
    
    // Try to sync metadata to Auth as well
    const supabase = client();
    await supabase.auth.admin.updateUserById(id, { user_metadata: { role } });
    
    return c.json({ success: true, data: user });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
putRoute("/users/:id/role", updateUserRole);

// --- SETTINGS & PREFERENCES ---
const getSettings = async (c: any) => {
  try {
    const settings = await get("app_settings");
    return c.json(settings || {});
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/settings", getSettings);

const postSettings = async (c: any) => {
  try {
    const settings = await c.req.json();
    await set("app_settings", settings);
    return c.json({ success: true, data: settings });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/settings", postSettings);

// Preferences
const getPreferences = async (c: any) => {
  try {
    const prefs = await get("preferences"); 
    return c.json(prefs || {});
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/settings/preferences", getPreferences);

const postPreferences = async (c: any) => {
  try {
    const prefs = await c.req.json();
    await set("preferences", prefs);
    return c.json({ success: true, data: prefs });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/settings/preferences", postPreferences);

// Integrations
const getIntegrations = async (c: any) => {
  try {
    const integrations = await get("integrations");
    return c.json(integrations || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/settings/integrations", getIntegrations);

const postIntegrations = async (c: any) => {
  try {
    const integrations = await c.req.json();
    await set("integrations", integrations);
    return c.json({ success: true, data: integrations });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/settings/integrations", postIntegrations);

// --- ALERT RULES ---
const getAlertRules = async (c: any) => {
  try {
    const rules = await getByPrefix("alert_rule:");
    return c.json(rules || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/alert-rules", getAlertRules);

const postAlertRule = async (c: any) => {
  try {
    const rule = await c.req.json();
    if (!rule.id) rule.id = crypto.randomUUID();
    await set(`alert_rule:${rule.id}`, rule);
    return c.json({ success: true, data: rule });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/alert-rules", postAlertRule);

const deleteAlertRule = async (c: any) => {
  const id = c.req.param("id");
  try {
    await del(`alert_rule:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/alert-rules/:id", deleteAlertRule);

// --- NOTIFICATIONS ---
const getNotifications = async (c: any) => {
    try {
        const notifications = await getByPrefix("notification:");
        if (notifications && Array.isArray(notifications)) {
            notifications.sort((a: any, b: any) => new Date(b.date || b.timestamp).getTime() - new Date(a.date || a.timestamp).getTime());
        }
        return c.json(notifications || []);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
route("/notifications", getNotifications);

const postNotification = async (c: any) => {
    try {
        const notification = await c.req.json();
        if (!notification.id) notification.id = crypto.randomUUID();
        if (!notification.date) notification.date = new Date().toISOString();
        if (!notification.timestamp) notification.timestamp = new Date().toISOString();
        
        await set(`notification:${notification.id}`, notification);
        return c.json({ success: true, data: notification });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/notifications", postNotification);

const markNotificationRead = async (c: any) => {
    const id = c.req.param("id");
    try {
        const notification = await get(`notification:${id}`);
        if (!notification) return c.json({ error: "Notification not found" }, 404);
        
        notification.read = true;
        await set(`notification:${id}`, notification);
        return c.json({ success: true, data: notification });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
patchRoute("/notifications/:id/read", markNotificationRead);


// --- AUDIT LOGS ---
const getAuditLogs = async (c: any) => {
  try {
    const logs = await getByPrefix("audit_log:");
    if (logs && Array.isArray(logs)) {
      logs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    return c.json(logs || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/audit-logs", getAuditLogs);

const postAuditLog = async (c: any) => {
  try {
    const log = await c.req.json();
    if (!log.id) log.id = crypto.randomUUID();
    if (!log.timestamp) log.timestamp = new Date().toISOString();
    await set(`audit_log:${log.id}`, log);
    return c.json({ success: true, data: log });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/audit-logs", postAuditLog);

// --- ADMIN RESET BY DATE ---
const postResetByDate = async (c: any) => {
    try {
        const { startDate, endDate, targets, driverId } = await c.req.json();
        return c.json({ 
            success: true, 
            message: "Reset processed (Simulated for KV)",
            deletedCount: 0 
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/reset-by-date", postResetByDate);

Deno.serve(app.fetch);
```
