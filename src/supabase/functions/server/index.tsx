import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);


// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-37f42386/health", (c) => {
  return c.json({ status: "ok" });
});

// Trips endpoints
app.post("/make-server-37f42386/trips", async (c) => {
  try {
    const trips = await c.req.json();
    if (!Array.isArray(trips)) {
      return c.json({ error: "Expected array of trips" }, 400);
    }
    
    // Create keys for each trip
    // Assuming each trip has a unique 'id' field
    const keys = trips.map((t: any) => `trip:${t.id}`);
    
    // Store using mset
    await kv.mset(keys, trips);
    
    return c.json({ success: true, count: trips.length });
  } catch (e: any) {
    console.error("Error saving trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.get("/make-server-37f42386/trips", async (c) => {
  try {
    const trips = await kv.getByPrefix("trip:");
    return c.json(trips);
  } catch (e: any) {
    console.error("Error fetching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips", async (c) => {
  try {
    // 1. Get all trip keys
    const trips = await kv.getByPrefix("trip:");
    const tripKeys = trips.map((t: any) => `trip:${t.id}`);
    
    // 2. Get all batch keys
    const batches = await kv.getByPrefix("batch:");
    const batchKeys = (batches || []).map((b: any) => `batch:${b.id}`);
    
    // 3. Get driver metric keys
    const driverMetrics = await kv.getByPrefix("driver_metric:");
    const driverMetricKeys = (driverMetrics || []).map((m: any) => `driver_metric:${m.id}`);

    // 4. Get vehicle metric keys
    const vehicleMetrics = await kv.getByPrefix("vehicle_metric:");
    const vehicleMetricKeys = (vehicleMetrics || []).map((m: any) => `vehicle_metric:${m.id}`);
    
    // 5. Delete everything
    const allKeys = [...tripKeys, ...batchKeys, ...driverMetricKeys, ...vehicleMetricKeys];
    if (allKeys.length > 0) {
        await kv.mdel(allKeys);
    }
    
    return c.json({ 
        success: true, 
        deletedTrips: tripKeys.length,
        deletedBatches: batchKeys.length,
        deletedDriverMetrics: driverMetricKeys.length,
        deletedVehicleMetrics: vehicleMetricKeys.length
    });
  } catch (e: any) {
    console.error("Error clearing data:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Driver Metrics Endpoints
app.post("/make-server-37f42386/driver-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) {
      return c.json({ error: "Expected array of metrics" }, 400);
    }
    const keys = metrics.map((m: any) => `driver_metric:${m.id}`);
    await kv.mset(keys, metrics);
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/driver-metrics", async (c) => {
    try {
        const metrics = await kv.getByPrefix("driver_metric:");
        return c.json(metrics || []);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Vehicle Metrics Endpoints
app.post("/make-server-37f42386/vehicle-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) {
      return c.json({ error: "Expected array of metrics" }, 400);
    }
    const keys = metrics.map((m: any) => `vehicle_metric:${m.id}`);
    await kv.mset(keys, metrics);
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/vehicle-metrics", async (c) => {
    try {
        const metrics = await kv.getByPrefix("vehicle_metric:");
        return c.json(metrics || []);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Vehicles Endpoints
app.get("/make-server-37f42386/vehicles", async (c) => {
  try {
    const vehicles = await kv.getByPrefix("vehicle:");
    return c.json(vehicles || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/vehicles", async (c) => {
  try {
    const vehicle = await c.req.json();
    if (!vehicle.id) {
        return c.json({ error: "Vehicle ID (License Plate) is required" }, 400);
    }
    // Use plate as ID
    await kv.set(`vehicle:${vehicle.id}`, vehicle);
    return c.json({ success: true, data: vehicle });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Drivers Endpoints
app.get("/make-server-37f42386/drivers", async (c) => {
  try {
    const drivers = await kv.getByPrefix("driver:");
    return c.json(drivers || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/drivers", async (c) => {
  try {
    const driver = await c.req.json();
    if (!driver.id) {
         driver.id = crypto.randomUUID();
    }
    await kv.set(`driver:${driver.id}`, driver);
    return c.json({ success: true, data: driver });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Storage Upload Endpoint
app.post("/make-server-37f42386/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    const bucketName = "make-37f42386-docs";
    
    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, {
            public: false,
            fileSizeLimit: 5242880, // 5MB
        });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `driver-docs/${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (error) throw error;

    const { data: signedData } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year

    return c.json({ url: signedData?.signedUrl });
  } catch (e: any) {
    console.error("Upload error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// AI Document Parsing Endpoint
app.post("/make-server-37f42386/parse-document", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const backFile = body['backFile'];
    const type = body['type'] as string; // 'license' | 'address'

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    // Helper to convert file to base64
    const fileToBase64 = async (f: File) => {
        const arrayBuffer = await f.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const len = bytes.byteLength;
        const chunkSize = 1024;
        for (let i = 0; i < len; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
        }
        return `data:${f.type};base64,${btoa(binary)}`;
    };

    const dataUrl = await fileToBase64(file);
    let backDataUrl = null;
    if (backFile && backFile instanceof File) {
        backDataUrl = await fileToBase64(backFile);
    }

    let prompt = "";
    if (type === 'license') {
      prompt = `
        Extract the following details from this Driver's License (checking both Front and Back images) in JSON format.
        
        For Names:
        - distinct "Surname" or "Last Name" field -> lastName
        - "Christian Names", "Given Names", or "First Name" field often contains First + Middle.
        - Split "Christian Names" into firstName (the first word) and middleName (all subsequent words).
        - If there are multiple middle names, combine them into the middleName field.

        For Phone/Country:
        - nationality (e.g. "JAMAICAN", "USA").
        - countryCode: Infer strictly from the Nationality or Address country.
          - "JAMAICAN" or "JAMAICA" -> "+1" (specifically +1 876 but +1 is the code)
          - "USA" -> "+1"
          - "UK" or "BRITISH" -> "+44"
          - Default to "+1" if unsure but try to match nationality.

        Other Fields:
        - licenseNumber (alphanumeric)
        - expirationDate (YYYY-MM-DD)
        - dateOfBirth (YYYY-MM-DD)
        - address (full string)
        - class (e.g. "Private", "General", "C", "D" - check Back of card)
        - licenseToDrive (e.g. "Motor Cars", "Motorcycles" - check Back of card)
        - controlNumber (alphanumeric - check Back or Front)
      `;
    } else if (type === 'address') {
       prompt = `
        Extract the address from this utility bill or document in JSON format:
        - address (full address string)
       `;
    } else {
      return c.json({ error: "Invalid document type" }, 400);
    }

    const userContent: any[] = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } }
    ];

    if (backDataUrl) {
        userContent.push({ type: "image_url", image_url: { url: backDataUrl } });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that extracts data from documents into valid JSON. Do not include markdown formatting."
        },
        {
          role: "user",
          content: userContent
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const content = response.choices[0].message.content;
    const json = JSON.parse(content || "{}");

    return c.json({ success: true, data: json });

  } catch (e: any) {
    console.error("AI Parse Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Notifications endpoints
app.get("/make-server-37f42386/notifications", async (c) => {
  try {
    const notifications = await kv.getByPrefix("notification:");
    if (Array.isArray(notifications)) {
        // Sort by timestamp desc safely
        notifications.sort((a: any, b: any) => {
            const timeA = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
            return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        });
        return c.json(notifications);
    }
    return c.json([]);
  } catch (e: any) {
    console.error("Error fetching notifications:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/make-server-37f42386/notifications", async (c) => {
  try {
    const notification = await c.req.json();
    if (!notification.id) {
        notification.id = crypto.randomUUID();
    }
    if (!notification.timestamp) {
        notification.timestamp = new Date().toISOString();
    }
    
    await kv.set(`notification:${notification.id}`, notification);
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.patch("/make-server-37f42386/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  try {
    const notification = await kv.get(`notification:${id}`);
    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }
    notification.read = true;
    await kv.set(`notification:${id}`, notification);
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Alert Rules endpoints
app.get("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rules = await kv.getByPrefix("alert_rule:");
    return c.json(rules);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rule = await c.req.json();
    if (!rule.id) {
        rule.id = crypto.randomUUID();
    }
    await kv.set(`alert_rule:${rule.id}`, rule);
    return c.json({ success: true, data: rule });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/alert-rules/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`alert_rule:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Batch Management Endpoints
app.get("/make-server-37f42386/batches", async (c) => {
  try {
    const batches = await kv.getByPrefix("batch:");
    // Sort by uploadDate desc
    if (Array.isArray(batches)) {
        batches.sort((a: any, b: any) => {
            return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
        });
    }
    return c.json(batches || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/batches", async (c) => {
  try {
    const batch = await c.req.json();
    if (!batch.id) {
        batch.id = crypto.randomUUID();
    }
    await kv.set(`batch:${batch.id}`, batch);
    return c.json({ success: true, data: batch });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/batches/:id", async (c) => {
  const batchId = c.req.param("id");
  try {
    // 1. Get all trips to find which ones belong to this batch
    // Note: This is inefficient for large datasets but necessary without secondary indexes
    const allTrips = await kv.getByPrefix("trip:");
    
    // 2. Filter trips belonging to this batch
    const tripsToDelete = (allTrips || []).filter((t: any) => t.batchId === batchId);
    
    // 3. Delete the trips
    if (tripsToDelete.length > 0) {
        const keys = tripsToDelete.map((t: any) => `trip:${t.id}`);
        await kv.mdel(keys);
    }
    
    // 4. Delete the batch record itself
    await kv.del(`batch:${batchId}`);
    
    return c.json({ 
        success: true, 
        deletedTrips: tripsToDelete.length,
        deletedBatch: batchId 
    });
  } catch (e: any) {
    console.error("Delete batch error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Integration Settings Endpoints
app.get("/make-server-37f42386/settings/integrations", async (c) => {
  try {
    const integrations = await kv.getByPrefix("integration:");
    return c.json(integrations || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/settings/integrations", async (c) => {
  try {
    const integration = await c.req.json();
    if (!integration.id) {
        return c.json({ error: "Integration ID is required" }, 400);
    }
    await kv.set(`integration:${integration.id}`, integration);
    return c.json({ success: true, data: integration });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Uber OAuth Endpoints

// 1. Generate Auth URL
app.get("/make-server-37f42386/uber/auth-url", async (c) => {
  try {
    const integration = await kv.get("integration:uber");
    if (!integration || !integration.credentials?.clientId) {
       return c.json({ error: "Uber integration not configured." }, 400);
    }
    
    // Allow frontend to specify redirect URI (must match exactly what is in Uber Dashboard)
    const clientRedirectUri = c.req.query("redirect_uri");
    const defaultRedirectUri = "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/callback";
    
    // If client provides a URI, use it. Otherwise fallback to old default (which we are deprecating)
    const redirectUri = clientRedirectUri || defaultRedirectUri;
    
    const clientId = integration.credentials.clientId;
    
    // Allow frontend to request specific scopes (default to 'profile')
    // The user must enable these in Uber Dashboard -> Scopes
    const clientScope = c.req.query("scope");
    const scope = clientScope || "profile"; 
    
    const authUrl = `https://login.uber.com/oauth/v2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    
    return c.json({ url: authUrl });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 2. Exchange Code (Called by Frontend)
app.post("/make-server-37f42386/uber/exchange", async (c) => {
    try {
        const { code, redirect_uri } = await c.req.json();
        
        if (!code || !redirect_uri) {
            return c.json({ error: "Missing code or redirect_uri" }, 400);
        }

        const integration = await kv.get("integration:uber");
        if (!integration || !integration.credentials) {
            return c.json({ error: "Integration settings missing." }, 400);
        }

        const { clientId, clientSecret } = integration.credentials;

        const body = new URLSearchParams();
        body.append("client_id", clientId);
        body.append("client_secret", clientSecret);
        body.append("grant_type", "authorization_code");
        body.append("redirect_uri", redirect_uri);
        body.append("code", code);

        const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body
        });

        const tokenData = await tokenRes.json();
        
        if (!tokenRes.ok) {
            console.error("Uber Token Exchange Failed:", tokenData);
            return c.json({ error: "Token exchange failed", details: tokenData }, 400);
        }

        // Save Tokens
        const tokenStore = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000),
            scope: tokenData.scope,
            token_type: tokenData.token_type
        };
        
        await kv.set("integration:uber_token", tokenStore);
        
        // Update status
        integration.status = 'connected';
        integration.lastConnected = new Date().toISOString();
        await kv.set("integration:uber", integration);

        return c.json({ success: true });

    } catch (e: any) {
        console.error("Exchange Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// 3. Handle Callback (Deprecated/Legacy for Backend-to-Backend)
app.get("/make-server-37f42386/uber/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  
  if (error) {
    return c.html(`<h1>Login Failed</h1><p>${error}</p>`);
  }
  if (!code) {
    return c.html(`<h1>Error</h1><p>No code provided.</p>`);
  }

  try {
    const integration = await kv.get("integration:uber");
    if (!integration || !integration.credentials) {
       return c.html(`<h1>Error</h1><p>Integration settings missing.</p>`);
    }

    const { clientId, clientSecret } = integration.credentials;
    const redirectUri = "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/callback";

    const body = new URLSearchParams();
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);
    body.append("grant_type", "authorization_code");
    body.append("redirect_uri", redirectUri);
    body.append("code", code);

    const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    const tokenData = await tokenRes.json();
    
    if (!tokenRes.ok) {
        console.error("Uber Token Exchange Failed:", tokenData);
        return c.html(`<h1>Auth Failed</h1><p>${JSON.stringify(tokenData)}</p>`);
    }

    // Save Tokens
    const tokenStore = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope,
        token_type: tokenData.token_type
    };
    
    await kv.set("integration:uber_token", tokenStore);
    
    // Update status
    integration.status = 'connected';
    integration.lastConnected = new Date().toISOString();
    await kv.set("integration:uber", integration);

    return c.html(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: green;">Success!</h1>
        <p>Uber has been connected successfully.</p>
        <p>You can close this window and return to the dashboard.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage("uber-connected", "*");
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </div>
    `);

  } catch (e: any) {
    return c.html(`<h1>System Error</h1><p>${e.message}</p>`);
  }
});

// Uber API Sync Endpoint
app.post("/make-server-37f42386/uber/sync", async (c) => {
  try {
    // 1. Get Tokens
    let tokenStore = await kv.get("integration:uber_token");
    
    if (!tokenStore || !tokenStore.access_token) {
       return c.json({ error: "Uber not connected. Please click 'Connect' first.", code: "AUTH_REQUIRED" }, 401);
    }

    // 2. Check Expiry & Refresh if needed
    if (Date.now() > tokenStore.expires_at) {
        console.log("Token expired, attempting refresh...");
        const integration = await kv.get("integration:uber");
        if (integration?.credentials && tokenStore.refresh_token) {
            const { clientId, clientSecret } = integration.credentials;
            const body = new URLSearchParams();
            body.append("client_id", clientId);
            body.append("client_secret", clientSecret);
            body.append("grant_type", "refresh_token");
            body.append("refresh_token", tokenStore.refresh_token);
            
            const refreshRes = await fetch("https://login.uber.com/oauth/v2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body
            });
            
            if (refreshRes.ok) {
                const newData = await refreshRes.json();
                tokenStore = {
                    access_token: newData.access_token,
                    refresh_token: newData.refresh_token,
                    expires_at: Date.now() + (newData.expires_in * 1000),
                    scope: newData.scope,
                    token_type: newData.token_type
                };
                await kv.set("integration:uber_token", tokenStore);
                console.log("Token refreshed successfully.");
            } else {
                return c.json({ error: "Session expired. Please reconnect.", code: "AUTH_REQUIRED" }, 401);
            }
        } else {
             return c.json({ error: "Session expired. Please reconnect.", code: "AUTH_REQUIRED" }, 401);
        }
    }

    const accessToken = tokenStore.access_token;
    let trips = [];

    // 3. Fetch Data (Rider History API)
    // Note: The 'history' scope provides this data.
    const historyRes = await fetch("https://api.uber.com/v1.2/history?limit=50", {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (historyRes.ok) {
        const data = await historyRes.json();
        if (data.history && Array.isArray(data.history)) {
            trips = data.history.map((t: any) => ({
                trip_id: t.request_id,
                date: new Date(t.start_time * 1000).toISOString(),
                platform: 'Uber',
                driverId: 'Self', 
                pickupLocation: t.start_city?.display_name || 'Unknown',
                dropoffLocation: t.end_city?.display_name || 'Unknown',
                amount: 0, // Price is often hidden in history-lite
                netPayout: 0,
                status: t.status,
                source: 'uber_oauth_api'
            }));
            return c.json({ success: true, trips });
        } else {
            return c.json({ success: true, trips: [], warning: "Connected, but no history found." });
        }
    } else {
        const errText = await historyRes.text();
        console.error("Uber API Error:", errText);
        return c.json({ error: "Failed to fetch history from Uber.", details: errText }, 500);
    }

  } catch (e: any) {
    console.error("Uber Sync Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Budget Management Endpoints
app.get("/make-server-37f42386/budgets", async (c) => {
  try {
    const budgets = await kv.getByPrefix("budget:");
    return c.json(budgets || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/budgets", async (c) => {
  try {
    const budget = await c.req.json();
    if (!budget.id) {
        budget.id = crypto.randomUUID();
    }
    await kv.set(`budget:${budget.id}`, budget);
    return c.json({ success: true, data: budget });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// General Preferences Endpoints
app.get("/make-server-37f42386/settings/preferences", async (c) => {
  try {
    const preferences = await kv.get("preferences:general");
    return c.json(preferences || {});
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/settings/preferences", async (c) => {
  try {
    const preferences = await c.req.json();
    await kv.set("preferences:general", preferences);
    return c.json({ success: true, data: preferences });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

Deno.serve(app.fetch);
