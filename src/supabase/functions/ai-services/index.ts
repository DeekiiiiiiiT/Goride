import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { Buffer } from "node:buffer";
import * as kv from "./kv_store.tsx";
import { generatePerformanceReport } from "./performance-metrics.tsx";

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
    const backFile = body['backFile'];
    const type = body['type'] as string;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
         return c.json({ error: "Only image files (JPEG, PNG, WEBP, GIF) and PDFs are supported." }, 400);
    }
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "AI Service not configured" }, 503);
    const openai = new OpenAI({ apiKey });

    let prompt = "";
    if (type === 'license') {
      prompt = `Extract Driver's License details (Front/Back) in JSON. Fields: lastName, firstName, middleName, nationality, countryCode (+1 for Jamaica/USA, +44 UK), licenseNumber, expirationDate, dateOfBirth, address, class, licenseToDrive, controlNumber.`;
    } else if (type === 'address') {
       prompt = `Extract address from utility bill in JSON: address (full string).`;
    } else if (type === 'fitness_certificate') {
       prompt = `Extract Certificate of Fitness details in JSON: make, model, year, color, bodyType, engineNumber, ccRating, issueDate, expirationDate.`;
    } else if (type === 'vehicle_registration') {
       prompt = `Extract Motor Vehicle Registration details in JSON: laNumber, plate, mvid, vin, controlNumber, issueDate, expirationDate.`;
    } else if (type === 'valuation_report') {
       prompt = `Extract Valuation Report details in JSON: valuationDate, marketValue, forcedSaleValue, chassisNumber, engineNumber, color, odometer, modelYear.`;
    } else if (type === 'insurance_policy') {
       prompt = `Extract Insurance Policy details in JSON: idv, policyPremium, excessDeductible, depreciationRate, policyExpiryDate, authorizedDrivers, limitationsUse, policyNumber.`;
    } else {
      return c.json({ error: "Invalid document type" }, 400);
    }

    const userContent: any[] = [{ type: "text", text: prompt }];

    if (file.type === 'application/pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            let buffer = Buffer.from(arrayBuffer);
            const { default: PDFParser } = await import("npm:pdf2json");
            const { PDFDocument } = await import("npm:pdf-lib");
            const pdfjsLib = await import("https://esm.sh/pdfjs-dist@3.11.174");
            
            const parsePdfBuffer = (b: Buffer) => new Promise<string>((resolve, reject) => {
                const parser = new PDFParser(null, 1);
                parser.on("pdfParser_dataError", (errData: any) => reject(new Error(errData.parserError)));
                parser.on("pdfParser_dataReady", () => resolve(parser.getRawTextContent()));
                parser.parseBuffer(b);
            });

            let pdfText = "";
            try {
                pdfText = await parsePdfBuffer(buffer);
            } catch (e: any) {
                 try {
                    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                    const savedBytes = await pdfDoc.save();
                    buffer = Buffer.from(savedBytes);
                    pdfText = await parsePdfBuffer(buffer);
                 } catch (repairError: any) {
                    try {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
                        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useSystemFonts: true, disableFontFace: true });
                        const pdf = await loadingTask.promise;
                        let fullText = "";
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const content = await page.getTextContent();
                            fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
                        }
                        pdfText = fullText;
                    } catch (pdfJsError) { throw repairError; }
                 }
            }
            if (!pdfText || pdfText.trim().length < 10) return c.json({ error: "Could not extract text from PDF (scanned?). Use Image." }, 400);
            userContent.push({ type: "text", text: `Document Content:\n${pdfText}` });
        } catch (e: any) {
            return c.json({ error: `Failed to read PDF: ${e.message}` }, 400);
        }
    } else {
        const fileToBase64 = async (f: File) => {
            const arrayBuffer = await f.arrayBuffer();
            return `data:${f.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
        };
        const dataUrl = await fileToBase64(file);
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
        if (backFile && backFile instanceof File) {
            const backDataUrl = await fileToBase64(backFile);
            userContent.push({ type: "image_url", image_url: { url: backDataUrl } });
        }
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant that extracts data from documents into valid JSON." },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });
    return c.json({ success: true, data: JSON.parse(response.choices[0].message.content || "{}") });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/ai-services/generate-vehicle-image", async (c) => {
  try {
    const { make, model, year, color, bodyType, licensePlate } = await c.req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

    const modelCandidates = ["imagen-4.0-ultra-generate-001", "imagen-4.0-generate-001", "gemini-2.0-flash-exp-image-generation"];
    const prompt = `A hyper-realistic, professional automotive studio photo of a ${year} ${color} ${make} ${model} ${bodyType}. Clean white studio background, front 3/4 view, 8k resolution. No front license plate.`;
    
    let imageB64 = null;
    let lastError = null;

    for (const modelName of modelCandidates) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "4:3" } })
            });
            if (response.ok) {
                const data = await response.json();
                imageB64 = data.predictions?.[0]?.bytesBase64Encoded;
                if (imageB64) break;
            } else {
                lastError = await response.text();
            }
        } catch (e) { lastError = e.toString(); }
    }

    if (!imageB64) {
         // Fallback OpenAI
         const openaiKey = Deno.env.get("OPENAI_API_KEY");
         if (openaiKey) {
            try {
                const openai = new OpenAI({ apiKey: openaiKey });
                const dalle = await openai.images.generate({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", response_format: "b64_json" });
                imageB64 = dalle.data[0].b64_json;
            } catch (e) {}
         }
         if (!imageB64) return c.json({ error: `Image Gen failed. Google Error: ${lastError}` }, 500);
    }

    const buffer = Buffer.from(imageB64, 'base64');
    const bucketName = `make-37f42386-vehicles`;
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === bucketName)) await supabase.storage.createBucket(bucketName, { public: false });
    
    const fileName = `${licensePlate || crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, buffer, { contentType: 'image/png', upsert: true });
    if (uploadError) throw uploadError;

    const { data: signedUrlData } = await supabase.storage.from(bucketName).createSignedUrl(fileName, 31536000);
    return c.json({ url: signedUrlData?.signedUrl });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/ai-services/ai/map-csv", async (c) => {
  try {
    const { headers, sample, targetFields } = await c.req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "AI Service not configured" }, 503);
    const openai = new OpenAI({ apiKey });
    const prompt = `Map CSV headers ${JSON.stringify(headers)} (Sample: ${JSON.stringify(sample.slice(0,3))}) to target fields: ${JSON.stringify(targetFields)}. Return JSON object { Header: TargetField }.`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: "JSON mapping assistant." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }, temperature: 0
    });
    return c.json({ success: true, mapping: JSON.parse(response.choices[0].message.content || "{}") });
  } catch (e: any) {
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
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Basic cleanup
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstOpen = jsonStr.indexOf('{');
        const lastClose = jsonStr.lastIndexOf('}');
        const cleanJson = (firstOpen !== -1 && lastClose !== -1) ? jsonStr.substring(firstOpen, lastClose + 1) : jsonStr;
        return c.json({ success: true, data: JSON.parse(cleanJson) });
    } catch(e: any) {
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
        const result = await model.generateContent([
            `Analyze invoice. Return JSON: date, type (oil/tires/etc), cost, odometer, notes.`,
            { inlineData: { data: base64Data, mimeType: file.type } }
        ]);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text) });
    } catch(e: any) { return c.json({ error: e.message }, 500); }
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
        const result = await model.generateContent([
            `Analyze inspection report. Return JSON: issues (array of strings), notes (summary).`,
            { inlineData: { data: base64Data, mimeType: file.type } }
        ]);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return c.json({ success: true, data: JSON.parse(text) });
    } catch(e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/ai-services/ai/parse-toll-csv", async (c) => {
    try {
        const { csvContent } = await c.req.json();
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) return c.json({ error: "No API Key" }, 503);
        const openai = new OpenAI({ apiKey });
        const prompt = `Parse toll CSV to JSON array 'transactions' (date, tagId, location, laneId, amount, type). Date context: ${new Date().toDateString()}. Input: ${csvContent.substring(0, 10000)}`;
        const response = await openai.chat.completions.create({
             model: "gpt-4o", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }
        });
        return c.json({ success: true, data: JSON.parse(response.choices[0].message.content || "{}").transactions || [] });
    } catch(e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/ai-services/ai/parse-toll-image", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];
        if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400);
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) return c.json({ error: "No API Key" }, 503);
        const openai = new OpenAI({ apiKey });
        const arrayBuffer = await file.arrayBuffer();
        const base64Image = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
        const prompt = `Extract toll transactions from image to JSON array 'transactions'.`;
        const response = await openai.chat.completions.create({
             model: "gpt-4o",
             messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: base64Image } }] }],
             response_format: { type: "json_object" }
        });
        return c.json({ success: true, data: JSON.parse(response.choices[0].message.content || "{}").transactions || [] });
    } catch(e: any) { return c.json({ error: e.message }, 500); }
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

Deno.serve(app.fetch);
