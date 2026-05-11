# Function 4: AI Services

**Instructions:**
1. Go to your **Supabase Dashboard**.
2. Click **Edge Functions**.
3. Click **Deploy a new function** (Green Button) -> **Via Editor**.
4. Name it: `ai-services`
5. In the editor, delete the default code and **paste the code below**.
6. **Save** and **Deploy**.

**Code to Copy:**

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

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
    app.get(`/ai-services${path}`, handler);
};
const postRoute = (path: string, handler: any) => {
    app.post(path, handler);
    app.post(`/ai-services${path}`, handler);
};

route("/health", (c: any) => c.json({ status: "ok" }));

// --- DOCUMENT PARSING (Gemini OCR) ---
const parseDocument = async (c: any) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const type = body['type'] as string; // 'license' | 'address' | 'vehicle_registration'
    
    if (!file || !(file instanceof File)) {
        return c.json({ error: "File upload required" }, 400);
    }

    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    
    // Gemini Setup
    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
        You are a document parsing assistant. Extract information from the provided ${type} image.
        Return a valid JSON object. Do not include markdown formatting.
        
        For 'license':
        - firstName, lastName, licenseNumber, expirationDate, dob, state, address.

        For 'vehicle_registration':
        - ownerName, plateNumber, vin, make, model, year, expirationDate.

        For 'address':
        - fullAddress, street, city, state, zip.
        
        If fields are unclear, make a best guess or use null.
    `;

    const imagePart = {
        inlineData: {
            data: base64,
            mimeType: file.type
        }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(cleanText);

    return c.json({ success: true, data: parsedResult });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/parse-document", parseDocument);

// --- TOLL PARSING ---
const parseTollCsv = async (c: any) => {
    try {
        const { csvContent } = await c.req.json();
        
        const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            You are a data processing assistant. Parse the provided CSV content of toll transactions.
            Return a JSON object with a 'transactions' array containing objects with:
            - date (ISO string)
            - time
            - location (entry/exit)
            - amount (number)
            - tagId (if available)
            - licensePlate (if available)
            
            Ignore header rows or irrelevant lines.
            Output JSON only.
        `;

        const result = await model.generateContent([prompt, csvContent.substring(0, 30000)]); // Gemini handles large context well
        const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(cleanText);

        return c.json({ success: true, transactions: parsedResult.transactions || [] });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/parse-toll-csv", parseTollCsv);

const parseTollImage = async (c: any) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "File upload required" }, 400);
        }

        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        
        const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            You are an OCR assistant. Parse this image of a toll invoice or statement.
            Return a JSON object with a 'transactions' array. Each transaction should have:
            - date (ISO string)
            - amount (number)
            - location (string description)
            - licensePlate (string, optional)
            - agency (string, e.g. "E-ZPass")
            
            Output JSON only.
        `;

        const imagePart = {
            inlineData: {
                data: base64,
                mimeType: file.type
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(cleanText);

        return c.json({ success: true, transactions: parsedResult.transactions || [] });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/parse-toll-image", parseTollImage);

// --- MAP MATCHING ---
const mapMatch = async (c: any) => {
    try {
        const { points } = await c.req.json();
        
        // Simple distance calc helper (Haversine)
        const calcDist = (p1: any, p2: any) => {
             const R = 6371e3; // metres
             const φ1 = p1.lat * Math.PI/180;
             const φ2 = p2.lat * Math.PI/180;
             const Δφ = (p2.lat-p1.lat) * Math.PI/180;
             const Δλ = (p2.lon-p1.lon) * Math.PI/180;
             const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                       Math.cos(φ1) * Math.cos(φ2) *
                       Math.sin(Δλ/2) * Math.sin(Δλ/2);
             const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
             return R * c;
        };

        let totalDistance = 0;
        for(let i=0; i < (points?.length || 0) - 1; i++) {
            totalDistance += calcDist(points[i], points[i+1]);
        }

        return c.json({
            success: true,
            data: {
                snappedRoute: points?.map((p: any) => ({ lat: p.lat, lon: p.lon })) || [],
                totalDistance: Math.round(totalDistance), // meters
                totalDuration: Math.round(totalDistance / 15), // rough estimate (15m/s avg)
                confidence: 0.8
            }
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/map-match", mapMatch);

// --- PERFORMANCE REPORT (AI Analysis) ---
const getPerformanceReport = async (c: any) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        
        const client = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const supabase = client();
        
        const { data: trips } = await supabase.from("kv_store_37f42386").select("value").like("key", "trip:%");
        
        // Gemini Analysis
        const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Analyze this fleet data summary and provide a brief performance insight.
            Total trips: ${trips?.length || 0}
            Date Range: ${startDate} to ${endDate}
            
            Return a short paragraph (max 2 sentences) describing efficiency.
        `;

        const result = await model.generateContent(prompt);
        const insight = result.response.text();

        return c.json({
            summary: "Report Generated",
            metrics: {
                totalTrips: trips?.length || 0,
                totalRevenue: 0 
            },
            aiInsights: insight
        });

    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
route("/performance-report", getPerformanceReport);

// --- CHAT & GENERIC AI ---
const chatWithKnowledge = async (c: any) => {
  try {
    const { query } = await c.req.json();
    
    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a helpful assistant for the Fleet Management Dashboard. Answer this user query: ${query}`;
    
    const result = await model.generateContent(prompt);
    
    return c.json({
      answer: result.response.text(),
      sources: []
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/chat-with-knowledge", chatWithKnowledge);

Deno.serve(app.fetch);
```
