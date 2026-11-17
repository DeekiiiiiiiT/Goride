import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { Buffer } from "node:buffer";
import * as kv from "./kv_store.tsx";
import { generatePerformanceReport } from "./performance-metrics.tsx";
import { trackedProviderCall, ProviderBlockedError } from "./api_usage_logger.ts";
import { ensureBucket } from "./storage_buckets.ts";

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

// Health check
app.get("/ai-services/health", (c) => c.json({ status: "ok" }));

// --- AI ENDPOINTS ---

app.post("/ai-services/parse-document", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const type = body['type'] as string;

    if (!file || !(file instanceof File)) return c.json({ error: "No file provided" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt = `Extract information from this ${type} document into valid JSON. Do not use markdown.`;
    
    if (type === 'license') {
        prompt += `
        For 'license':
        - firstName, lastName, middleName
        - licenseNumber, expirationDate (YYYY-MM-DD), dob (YYYY-MM-DD)
        - state, countryCode, address
        - class, licenseToDrive
        `;
    } else if (type === 'vehicle_registration') {
        prompt += `
        For 'vehicle_registration':
        - ownerName, plateNumber, vin, make, model, year
        - expirationDate (YYYY-MM-DD), issueDate (YYYY-MM-DD)
        - chassisNumber, engineNumber
        `;
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // FIX: Add 20s timeout to Gemini vision call
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 20000);
    
    try {
        const result = await trackedProviderCall({
            provider: "gemini",
            service: "vision",
            route: "/ai-services/parse-document",
            model: "gemini-1.5-flash",
            run: () => model.generateContent([
                prompt,
                { inlineData: { data: base64Data, mimeType: file.type } }
            ]),
            extractUsage: (r: any) => ({
                inputTokens: r?.response?.usageMetadata?.promptTokenCount,
                outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
            }),
        });
        clearTimeout(timeoutId);
        
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text) });
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') throw new Error('Request timed out after 20s');
        throw e;
    }
  } catch (e: any) {
    if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/ai-services/ai/map-csv", async (c) => {
  try {
    const { headers, sample, targetFields } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Map CSV headers ${JSON.stringify(headers)} (Sample: ${JSON.stringify(sample.slice(0,3))}) to target fields: ${JSON.stringify(targetFields)}. Return JSON object { Header: TargetField }. Do not use markdown.`;
    
    const result = await trackedProviderCall({
        provider: "gemini",
        service: "text",
        route: "/ai-services/ai/map-csv",
        model: "gemini-1.5-flash",
        run: () => model.generateContent(prompt),
        extractUsage: (r: any) => ({
            inputTokens: r?.response?.usageMetadata?.promptTokenCount,
            outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
        }),
    });
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    return c.json({ success: true, mapping: JSON.parse(text) });
  } catch (e: any) {
    if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/ai-services/analyze-fleet", async (c) => {
    try {
        const { payload } = await c.req.json();
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);
        const genAI = new GoogleGenerativeAI(apiKey);
        const prompt = `Analyze fleet CSV data and return SINGLE JSON object with keys: metadata, drivers, vehicles, financials, insights. \nDATA: ${payload}`;
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const result = await trackedProviderCall({
            provider: "gemini",
            service: "text",
            route: "/ai-services/analyze-fleet",
            model: "gemini-2.0-flash-exp",
            run: () => model.generateContent(prompt),
            extractUsage: (r: any) => ({
                inputTokens: r?.response?.usageMetadata?.promptTokenCount,
                outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
            }),
        });
        const text = result.response.text();
        // Basic cleanup
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstOpen = jsonStr.indexOf('{');
        const lastClose = jsonStr.lastIndexOf('}');
        const cleanJson = (firstOpen !== -1 && lastClose !== -1) ? jsonStr.substring(firstOpen, lastClose + 1) : jsonStr;
        return c.json({ success: true, data: JSON.parse(cleanJson) });
    } catch(e: any) {
        if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
        return c.json({ error: e.message }, 500);
    }
});

app.post("/ai-services/parse-invoice", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];
        if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400);
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "No API Key" }, 500);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const result = await trackedProviderCall({
            provider: "gemini",
            service: "vision",
            route: "/ai-services/parse-invoice",
            model: "gemini-1.5-flash",
            run: () => model.generateContent([
                `Analyze invoice. Return JSON: date, type (oil/tires/etc), cost, odometer, notes.`,
                { inlineData: { data: base64Data, mimeType: file.type } }
            ]),
            extractUsage: (r: any) => ({
                inputTokens: r?.response?.usageMetadata?.promptTokenCount,
                outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
            }),
        });
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text) });
    } catch(e: any) {
        if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
        return c.json({ error: e.message }, 500);
    }
});

app.post("/ai-services/parse-inspection", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];
        if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400);
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "No API Key" }, 500);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const result = await trackedProviderCall({
            provider: "gemini",
            service: "vision",
            route: "/ai-services/parse-inspection",
            model: "gemini-1.5-flash",
            run: () => model.generateContent([
                `Analyze inspection report. Return JSON: issues (array of strings), notes (summary).`,
                { inlineData: { data: base64Data, mimeType: file.type } }
            ]),
            extractUsage: (r: any) => ({
                inputTokens: r?.response?.usageMetadata?.promptTokenCount,
                outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
            }),
        });
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text) });
    } catch(e: any) {
        if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
        return c.json({ error: e.message }, 500);
    }
});

app.post("/ai-services/ai/parse-toll-csv", async (c) => {
    try {
        const { csvContent } = await c.req.json();
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Parse this toll CSV content into a JSON object with a 'transactions' array (date, tagId, location, laneId, amount, type). Ignore headers. CSV:\n${csvContent.substring(0, 30000)}`;
        
        const result = await trackedProviderCall({
            provider: "gemini",
            service: "text",
            route: "/ai-services/ai/parse-toll-csv",
            model: "gemini-1.5-flash",
            run: () => model.generateContent(prompt),
            extractUsage: (r: any) => ({
                inputTokens: r?.response?.usageMetadata?.promptTokenCount,
                outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
            }),
        });
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text).transactions || [] });
    } catch(e: any) {
        if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
        return c.json({ error: e.message }, 500);
    }
});

app.post("/ai-services/ai/parse-toll-image", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];
        if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400);
        
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        
        const result = await trackedProviderCall({
            provider: "gemini",
            service: "vision",
            route: "/ai-services/ai/parse-toll-image",
            model: "gemini-1.5-flash",
            run: () => model.generateContent([
                "Extract toll transactions from this image into a JSON object with a 'transactions' array.",
                { inlineData: { data: base64Data, mimeType: file.type } }
            ]),
            extractUsage: (r: any) => ({
                inputTokens: r?.response?.usageMetadata?.promptTokenCount,
                outputTokens: r?.response?.usageMetadata?.candidatesTokenCount,
            }),
        });

        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text).transactions || [] });
    } catch(e: any) {
        if (e instanceof ProviderBlockedError) return c.json({ error: e.message, code: e.code }, e.httpStatus);
        return c.json({ error: e.message }, 500);
    }
});

// Helper for Performance Report
app.get("/ai-services/performance-report", async (c) => {
    try {
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");
        if (!startDate || !endDate) return c.json({ error: "Dates required" }, 400);

        const trips = await kv.getByPrefix("trip:");
        const drivers = await kv.getByPrefix("driver:");
        const report = generatePerformanceReport(trips || [], drivers || [], startDate, endDate);
        return c.json(report);
    } catch(e: any) { return c.json({ error: e.message }, 500); }
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
