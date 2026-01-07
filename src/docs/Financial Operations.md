# Function 2: Financial Operations

**Instructions:**
1. Go to your **Supabase Dashboard**.
2. Click **Edge Functions**.
3. Click **Deploy a new function** (Green Button) -> **Via Editor**.
4. Name it: `financial-operations`
5. In the editor, delete the default code and **paste the code below**.
6. **Save** and **Deploy**.

**Code to Copy:**

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";

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

// Route Helper
const route = (path: string, handler: any) => {
    app.get(path, handler);
    app.get(`/financial-operations${path}`, handler);
};
const postRoute = (path: string, handler: any) => {
    app.post(path, handler);
    app.post(`/financial-operations${path}`, handler);
};
const deleteRoute = (path: string, handler: any) => {
    app.delete(path, handler);
    app.delete(`/financial-operations${path}`, handler);
};

route("/health", (c: any) => c.json({ status: "ok" }));

// --- TRANSACTIONS ---
const getTransactions = async (c: any) => {
  try {
    const transactions = await getByPrefix("transaction:");
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
};
route("/transactions", getTransactions);

const postTransaction = async (c: any) => {
  try {
    const transaction = await c.req.json();
    if (!transaction.id) transaction.id = crypto.randomUUID();
    if (!transaction.timestamp) transaction.timestamp = new Date().toISOString();
    await set(`transaction:${transaction.id}`, transaction);
    return c.json({ success: true, data: transaction });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/transactions", postTransaction);

const deleteTransaction = async (c: any) => {
  const id = c.req.param("id");
  try {
    await del(`transaction:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/transactions/:id", deleteTransaction);

// --- SCAN RECEIPT (OCR with OpenAI) ---
const scanReceipt = async (c: any) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];
        
        if (!file || !(file instanceof File)) {
            return c.json({ error: "File upload required" }, 400);
        }

        // Convert file to base64
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const dataUrl = `data:${file.type};base64,${base64}`;

        const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an OCR assistant. Parse the receipt image and return a valid JSON object with these fields:
                    - merchant (string): Name of the merchant
                    - date (string): Date in ISO 8601 format (YYYY-MM-DD), or null if not found
                    - total (number): Total amount
                    - items (array): List of items with 'description' and 'amount'
                    
                    If specific fields are missing, make a best guess or return null.`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Parse this receipt." },
                        { type: "image_url", image_url: { url: dataUrl } }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content || "{}");
        
        // Ensure defaults if AI fails
        const finalData = {
            merchant: result.merchant || "Unknown Merchant",
            date: result.date || new Date().toISOString(),
            total: result.total || 0,
            items: result.items || []
        };

        return c.json({ success: true, data: finalData });

    } catch (e: any) {
        console.error("OCR Error:", e);
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/scan-receipt", scanReceipt);

// --- EXPENSES ---
const approveExpense = async (c: any) => {
  try {
    const { id, notes } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);
    const tx = await get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);
    tx.status = 'Approved';
    tx.isReconciled = true;
    tx.metadata = { ...tx.metadata, approvedAt: new Date().toISOString(), notes: notes || tx.metadata?.notes };
    await set(`transaction:${id}`, tx);
    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/expenses/approve", approveExpense);

const rejectExpense = async (c: any) => {
  try {
    const { id, reason } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);
    const tx = await get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);
    tx.status = 'Rejected';
    tx.metadata = { ...tx.metadata, rejectedAt: new Date().toISOString(), rejectionReason: reason };
    await set(`transaction:${id}`, tx);
    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/expenses/reject", rejectExpense);

// --- BUDGETS ---
const getBudgets = async (c: any) => {
  try {
    const budgets = await getByPrefix("budget:");
    return c.json(budgets || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/budgets", getBudgets);

const postBudget = async (c: any) => {
  try {
    const budget = await c.req.json();
    if (!budget.id) budget.id = crypto.randomUUID();
    await set(`budget:${budget.id}`, budget);
    return c.json({ success: true, data: budget });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/budgets", postBudget);

// --- FIXED EXPENSES ---
const getFixedExpenses = async (c: any) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const expenses = await getByPrefix(`fixed_expense:${vehicleId}:`);
    return c.json(expenses || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/fixed-expenses/:vehicleId", getFixedExpenses);

const postFixedExpense = async (c: any) => {
  try {
    const expense = await c.req.json();
    if (!expense.vehicleId) return c.json({ error: "Vehicle ID is required" }, 400);
    if (!expense.id) expense.id = crypto.randomUUID();
    if (!expense.createdAt) expense.createdAt = new Date().toISOString();
    expense.updatedAt = new Date().toISOString();
    await set(`fixed_expense:${expense.vehicleId}:${expense.id}`, expense);
    return c.json({ success: true, data: expense });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/fixed-expenses", postFixedExpense);

const deleteFixedExpense = async (c: any) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    await del(`fixed_expense:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/fixed-expenses/:vehicleId/:id", deleteFixedExpense);

// --- FINANCIALS ---
const getFinancials = async (c: any) => {
    try {
        const data = await get("organization_metrics:current");
        return c.json(data || {});
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
};
route("/financials", getFinancials);

const postFinancials = async (c: any) => {
    try {
        const data = await c.req.json();
        await set("organization_metrics:current", data);
        return c.json({ success: true, data });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/financials", postFinancials);

// --- CLAIMS ---
const getClaims = async (c: any) => {
  try {
    const claims = await getByPrefix("claim:");
    return c.json(claims || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/claims", getClaims);

const postClaim = async (c: any) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) claim.id = crypto.randomUUID();
    await set(`claim:${claim.id}`, claim);
    return c.json({ success: true, data: claim });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/claims", postClaim);

const deleteClaim = async (c: any) => {
  const id = c.req.param("id");
  try { await del(`claim:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/claims/:id", deleteClaim);

Deno.serve(app.fetch);
```
