import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { Buffer } from "node:buffer";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

app.use('*', logger(console.log));
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

app.get("/financial-operations/health", (c) => c.json({ status: "ok" }));

app.post("/financial-operations/scan-receipt", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
        return c.json({ error: "File upload required" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `
      You are an OCR assistant for a driver expense portal. 
      Parse the receipt or invoice image. It might be a general receipt, fuel receipt, or toll receipt.
      
      Return a valid JSON object with these EXACT fields:
      - type (string): "Fuel", "Toll", "Maintenance", or "Other"
      - merchant (string): Name of the merchant or agency (e.g. "Highway 2000", "Total Gas")
      - amount (number): Total amount paid (number only)
      - date (string): Date in YYYY-MM-DD format
      - time (string): Time in HH:MM format (24h)
      - receiptNumber (string): Invoice, ticket, or reference number
      - plaza (string): Plaza name (for tolls)
      - lane (string): Lane number (for tolls)
      - vehicleClass (string): Vehicle class (for tolls)
      - collector (string): Collector name/ID
      - notes (string): Brief description
      
      If specific fields are missing, return null. 
      Output only valid JSON. Do not use markdown code blocks.
    `;

    const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType: file.type } }
    ]);

    const text = result.response.text();
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanText);

    return c.json({ success: true, data });

  } catch (e: any) {
    console.error("Scan Receipt Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// --- TRANSACTIONS ---
app.get("/financial-operations/transactions", async (c) => {
  try {
    const transactions = await kv.getByPrefix("transaction:");
    if (Array.isArray(transactions)) {
        transactions.sort((a: any, b: any) => {
            const timeA = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
            return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        });
        return c.json(transactions);
    }
    return c.json([]);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/financial-operations/transactions", async (c) => {
  try {
    const transaction = await c.req.json();
    if (!transaction.id) transaction.id = crypto.randomUUID();
    if (!transaction.timestamp) transaction.timestamp = new Date().toISOString();
    await kv.set(`transaction:${transaction.id}`, transaction);
    return c.json({ success: true, data: transaction });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/financial-operations/transactions/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`transaction:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- EXPENSES ---
app.post("/financial-operations/expenses/approve", async (c) => {
  try {
    const { id, notes } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);
    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);
    tx.status = 'Approved';
    tx.isReconciled = true;
    tx.metadata = { ...tx.metadata, approvedAt: new Date().toISOString(), notes: notes || tx.metadata?.notes };
    await kv.set(`transaction:${id}`, tx);
    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/financial-operations/expenses/reject", async (c) => {
  try {
    const { id, reason } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);
    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);
    tx.status = 'Rejected';
    tx.metadata = { ...tx.metadata, rejectedAt: new Date().toISOString(), rejectionReason: reason };
    await kv.set(`transaction:${id}`, tx);
    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- BUDGETS ---
app.get("/financial-operations/budgets", async (c) => {
  try {
    const budgets = await kv.getByPrefix("budget:");
    return c.json(budgets || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/financial-operations/budgets", async (c) => {
  try {
    const budget = await c.req.json();
    if (!budget.id) budget.id = crypto.randomUUID();
    await kv.set(`budget:${budget.id}`, budget);
    return c.json({ success: true, data: budget });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- FIXED EXPENSES ---
app.get("/financial-operations/fixed-expenses/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const expenses = await kv.getByPrefix(`fixed_expense:${vehicleId}:`);
    return c.json(expenses || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/financial-operations/fixed-expenses", async (c) => {
  try {
    const expense = await c.req.json();
    if (!expense.vehicleId) return c.json({ error: "Vehicle ID is required" }, 400);
    if (!expense.id) expense.id = crypto.randomUUID();
    if (!expense.createdAt) expense.createdAt = new Date().toISOString();
    expense.updatedAt = new Date().toISOString();
    await kv.set(`fixed_expense:${expense.vehicleId}:${expense.id}`, expense);
    return c.json({ success: true, data: expense });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/financial-operations/fixed-expenses/:vehicleId/:id", async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    await kv.del(`fixed_expense:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- FINANCIALS ---
app.get("/financial-operations/financials", async (c) => {
    try {
        const data = await kv.get("organization_metrics:current");
        return c.json(data || {});
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/financial-operations/financials", async (c) => {
    try {
        const data = await c.req.json();
        await kv.set("organization_metrics:current", data);
        return c.json({ success: true, data });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- CLAIMS --- (Added stub based on API doc, matching pattern)
app.get("/financial-operations/claims", async (c) => {
  try {
    const claims = await kv.getByPrefix("claim:");
    return c.json(claims || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/financial-operations/claims", async (c) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) claim.id = crypto.randomUUID();
    await kv.set(`claim:${claim.id}`, claim);
    return c.json({ success: true, data: claim });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete("/financial-operations/claims/:id", async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`claim:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

Deno.serve(async (req) => {
  try {
    return await app.fetch(req);
  } catch (err: any) {
    console.error("Critical Server Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
