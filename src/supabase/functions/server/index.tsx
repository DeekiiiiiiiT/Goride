import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import * as kv from "./kv_store.tsx";
import { Buffer } from "node:buffer";
import PDFParser from "npm:pdf2json";
import { PDFDocument } from "npm:pdf-lib";
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@3.11.174";

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
    // Direct delete using Supabase client to avoid pagination limits and round-trips
    // This fixes the issue where only the first 1000 records were being deleted
    const prefixes = ["trip:", "batch:", "driver_metric:", "vehicle_metric:"];
    const counts: Record<string, number> = {};

    for (const prefix of prefixes) {
        const { count, error } = await supabase
            .from("kv_store_37f42386")
            .delete({ count: 'exact' })
            .like("key", `${prefix}%`);
            
        if (error) {
            console.error(`Error deleting prefix ${prefix}:`, error);
            throw error;
        }
        counts[prefix] = count || 0;
    }
    
    return c.json({ 
        success: true, 
        deletedTrips: counts["trip:"] || 0,
        deletedBatches: counts["batch:"] || 0,
        deletedDriverMetrics: counts["driver_metric:"] || 0,
        deletedVehicleMetrics: counts["vehicle_metric:"] || 0
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

        // ACTION 2: The "Exorcism" (Auto-Cleanup)
        const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
        const ghostIndex = metrics ? metrics.findIndex((m: any) => (m.driverId === BANNED_UUID || m.id === BANNED_UUID)) : -1;

        if (ghostIndex !== -1) {
            console.log(`[Exorcism] Deleting Ghost Driver Metric: ${BANNED_UUID}`);
            await kv.del(`driver_metric:${BANNED_UUID}`);
            metrics.splice(ghostIndex, 1);
        }

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

app.delete("/make-server-37f42386/vehicles/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`vehicle:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Drivers Endpoints
app.get("/make-server-37f42386/drivers", async (c) => {
  try {
    const drivers = await kv.getByPrefix("driver:");

    // ACTION 2: The "Exorcism" (Auto-Cleanup)
    // Automatically detect and delete the Fleet Owner if they are mistakenly stored as a driver.
    const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
    const ghostIndex = drivers ? drivers.findIndex((d: any) => d.id === BANNED_UUID) : -1;

    if (ghostIndex !== -1) {
        console.log(`[Exorcism] Deleting Ghost Driver: ${BANNED_UUID}`);
        await kv.del(`driver:${BANNED_UUID}`);
        // Remove from response so the UI updates immediately
        drivers.splice(ghostIndex, 1);
    }

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

// Transactions Endpoints
app.get("/make-server-37f42386/transactions", async (c) => {
  try {
    const transactions = await kv.getByPrefix("transaction:");
    if (Array.isArray(transactions)) {
        // Sort by date desc
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

app.post("/make-server-37f42386/transactions", async (c) => {
  try {
    const transaction = await c.req.json();
    if (!transaction.id) {
        transaction.id = crypto.randomUUID();
    }
    if (!transaction.timestamp) {
        transaction.timestamp = new Date().toISOString();
    }
    await kv.set(`transaction:${transaction.id}`, transaction);
    return c.json({ success: true, data: transaction });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Maintenance Logs Endpoints
app.get("/make-server-37f42386/maintenance-logs/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Get all logs for this vehicle. We assume keys are formatted as maintenance_log:{vehicleId}:{logId}
    const logs = await kv.getByPrefix(`maintenance_log:${vehicleId}:`);
    
    // Sort by date desc
    logs.sort((a: any, b: any) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        return timeB - timeA;
    });
    
    return c.json(logs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/maintenance-logs", async (c) => {
  try {
    const log = await c.req.json();
    if (!log.id) {
        log.id = crypto.randomUUID();
    }
    if (!log.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    
    // Key structure: maintenance_log:{vehicleId}:{logId}
    await kv.set(`maintenance_log:${log.vehicleId}:${log.id}`, log);
    return c.json({ success: true, data: log });
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

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
         return c.json({ error: "Only image files (JPEG, PNG, WEBP, GIF) and PDFs are supported." }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

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
    } else if (type === 'fitness_certificate') {
       prompt = `
        Extract the following details from this Certificate of Fitness in JSON format.
        Look for specific Jamaican vehicle document fields:

        - make (Vehicle Make)
        - model (Vehicle Model)
        - year (Year of Manufacture)
        - color (Colour)
        - bodyType (Body Type)
        - engineNumber (Motor or Engine No.)
        - ccRating (CC Rating)
        - issueDate (Issue Date, format: YYYY-MM-DD)
        - expirationDate (Expiry Date, format: YYYY-MM-DD)
       `;
    } else if (type === 'vehicle_registration') {
       prompt = `
        Extract the following details from this Motor Vehicle Registration Certificate in JSON format.
        Look for specific Jamaican vehicle document fields:
        
        - laNumber (L.A. Number / Licence Authority No.)
        - plate (Reg. Plate No.)
        - mvid (MVID / Motor Vehicle ID)
        - vin (VIN / Vehicle Chassis No.)
        - controlNumber (Control Number)
        - issueDate (Date Issued, format: YYYY-MM-DD)
        - expirationDate (Expiry date, format: YYYY-MM-DD)
       `;
    } else if (type === 'valuation_report') {
       prompt = `
        Extract the following details from this Motor Vehicle Valuation Report in JSON format.
        
        - valuationDate (Date of Valuation, format: YYYY-MM-DD)
        - marketValue (Market Value amount, remove currency symbols, e.g. "2,100,000")
        - forcedSaleValue (Forced Sale Value amount, remove currency symbols)
        - chassisNumber (Chassis No.)
        - engineNumber (Engine No.)
        - color (Colour)
        - odometer (Odometer Reading)
        - modelYear (Year of Manufacture)
       `;
    } else if (type === 'insurance_policy') {
       prompt = `
        Extract the following details from this Motor Vehicle Insurance Certificate / Policy in JSON format.
        
        - idv (Insured Declared Value or Sum Insured, remove currency symbols)
        - policyPremium (Policy Premium, remove currency symbols)
        - excessDeductible (Excess or Deductible amount)
        - depreciationRate (Depreciation Rate percentage)
        - policyExpiryDate (Policy Expiry Date, format: YYYY-MM-DD)
        - authorizedDrivers (Authorized Drivers - list or description)
        - limitationsUse (Limitations as to Use)
        - policyNumber (Certificate or Policy Number)
       `;
    } else {
      return c.json({ error: "Invalid document type" }, 400);
    }

    const userContent: any[] = [
        { type: "text", text: prompt }
    ];

    if (file.type === 'application/pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            let buffer = Buffer.from(arrayBuffer);
            
            // Helper to parse buffer with pdf2json
            const parsePdfBuffer = (b: Buffer) => new Promise<string>((resolve, reject) => {
                const parser = new PDFParser(null, 1);
                parser.on("pdfParser_dataError", (errData: any) => reject(new Error(errData.parserError)));
                parser.on("pdfParser_dataReady", () => {
                   resolve(parser.getRawTextContent());
                });
                parser.parseBuffer(b);
            });

            let pdfText = "";
            try {
                pdfText = await parsePdfBuffer(buffer);
            } catch (e: any) {
                 console.log("Initial PDF parse failed. Attempting repair/fallback...", e.message);
                 try {
                    // Try pdf-lib repair
                    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                    const savedBytes = await pdfDoc.save();
                    buffer = Buffer.from(savedBytes);
                    pdfText = await parsePdfBuffer(buffer);
                 } catch (repairError: any) {
                    console.error("PDF Repair failed:", repairError);
                    
                    // Try PDF.js fallback
                    console.log("Attempting fallback to PDF.js...");
                    try {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
                        const loadingTask = pdfjsLib.getDocument({ 
                            data: new Uint8Array(arrayBuffer),
                            useSystemFonts: true,
                            disableFontFace: true
                        });
                        const pdf = await loadingTask.promise;
                        let fullText = "";
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const content = await page.getTextContent();
                            const strings = content.items.map((item: any) => item.str);
                            fullText += strings.join(" ") + "\n";
                        }
                        pdfText = fullText;
                    } catch (pdfJsError) {
                         console.error("PDF.js fallback failed:", pdfJsError);
                         
                         if (repairError.message && repairError.message.toLowerCase().includes("encrypted")) {
                            throw new Error("PDF is encrypted or password protected. Please upload an unlocked PDF or an image.");
                         }
                         throw repairError;
                    }
                 }
            }

            if (!pdfText || pdfText.trim().length < 10) {
                 return c.json({ error: "Could not extract text from this PDF. It appears to be a scanned image (no text layer found). Please upload a JPEG/PNG image of the document so the AI can read it." }, 400);
            }
            userContent.push({ type: "text", text: `Document Content:\n${pdfText}` });
        } catch (e: any) {
            console.error("PDF Parse Error:", e);
            return c.json({ error: `Failed to read PDF file: ${e.message}. Please try uploading an image.` }, 400);
        }
    } else {
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
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });

        if (backFile && backFile instanceof File) {
            const backDataUrl = await fileToBase64(backFile);
            userContent.push({ type: "image_url", image_url: { url: backDataUrl } });
        }
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

app.post("/make-server-37f42386/generate-vehicle-image", async (c) => {
  try {
    const { make, model, year, color, bodyType, licensePlate } = await c.req.json();
    
    // Switch to Gemini API Key as requested
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
        return c.json({ error: "Gemini API Key not configured" }, 503);
    }

    // Using Google's Imagen 3/4 models via Generative Language API
    // We prioritize the new Imagen 4.0 Ultra models found in your account, then fall back to standard 4.0, then Flash.
    const modelCandidates = [
        "imagen-4.0-ultra-generate-001",
        "imagen-4.0-generate-001",
        "gemini-2.0-flash-exp-image-generation"
    ];

    const prompt = `A hyper-realistic, professional automotive studio photo of a ${year} ${color} ${make} ${model} ${bodyType}. The vehicle is parked on a pristine, high-gloss white showroom floor with distinct reflections beneath the car. The background is a clean, seamless white studio environment. Use a front 3/4 view angle, zoomed in to fill the frame. 8k resolution, soft studio lighting, sharp focus. The vehicle should have no front license plate.`;

    let imageB64 = null;
    let lastError = null;

    // Try candidates in order
    for (const modelName of modelCandidates) {
        try {
            console.log(`Attempting image generation with model: ${modelName}`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    instances: [
                        { prompt: prompt }
                    ],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: "4:3"
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                imageB64 = data.predictions?.[0]?.bytesBase64Encoded;
                if (imageB64) break; // Success!
            } else {
                const errText = await response.text();
                console.warn(`Model ${modelName} failed with status ${response.status}: ${errText}`);
                lastError = `${response.status} - ${errText}`;
            }
        } catch (e) {
            console.error(`Error calling model ${modelName}:`, e);
            lastError = e.toString();
        }
    }

    if (!imageB64) {
         console.warn("All Gemini Image models failed. Reason:", lastError);

         console.log("Attempting Fallback to OpenAI DALL-E 3...");
         
         // FALLBACK: Try OpenAI DALL-E 3
         try {
             const openaiKey = Deno.env.get("OPENAI_API_KEY");
             if (openaiKey) {
                const openai = new OpenAI({ apiKey: openaiKey });
                const dalleResponse = await openai.images.generate({
                  model: "dall-e-3",
                  prompt: prompt,
                  n: 1,
                  size: "1024x1024",
                  quality: "standard",
                  response_format: "b64_json"
                });
                imageB64 = dalleResponse.data[0].b64_json;
                console.log("Fallback to DALL-E 3 Successful");
             } else {
                 console.error("No OpenAI Key for fallback.");
             }
         } catch (openaiError) {
             console.error("OpenAI Fallback Failed:", openaiError);
         }

         if (!imageB64) {
            return c.json({ 
                error: `All Image Generation attempts (Google & OpenAI) failed. Google Error: ${lastError}` 
            }, 500);
         }
    }
    
    // Convert Base64 to Buffer for Upload
    const buffer = Buffer.from(imageB64, 'base64');
    
    // Use the global supabase client
    const bucketName = `make-37f42386-vehicles`;
    
    // Ensure bucket exists (idempotent)
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, { public: false });
    }

    const fileName = `${licensePlate || crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, buffer, { 
            contentType: 'image/png', 
            upsert: true 
        });

    if (uploadError) throw uploadError;

    // Generate Signed URL (valid for 1 year)
    const { data: signedUrlData, error: signError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 31536000); 

    if (signError) throw signError;

    return c.json({ url: signedUrlData.signedUrl });

  } catch (e: any) {
    console.error("Image Generation Error:", e);
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

// AI CSV Mapping Endpoint
app.post("/make-server-37f42386/ai/map-csv", async (c) => {
  try {
    const { headers, sample, targetFields } = await c.req.json();
    
    if (!headers || !sample) {
      return c.json({ error: "Headers and sample data required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
      You are an expert data analyst. 
      I have a CSV file with the following headers: ${JSON.stringify(headers)}.
      Here is a sample of the first 3 rows: ${JSON.stringify(sample.slice(0, 3))}.
      
      Please map the CSV headers to the following target system fields:
      ${JSON.stringify(targetFields)}

      Rules:
      1. Analyze the sample data to understand the content of each column (e.g. identify dates, currency, IDs).
      2. Return a JSON object where keys are the CSV Header Name and values are the Target Field Key.
      3. Only include mappings you are confident about.
      4. If a column doesn't match any target field, omit it.
      5. For "driverName", if it's split into "First Name" and "Last Name", map BOTH to "driverName".
      6. For "date", map columns that look like dates or timestamps.
      
      Example Output:
      {
        "Ride Date": "date",
        "Total Fare": "amount",
        "Driver First Name": "driverName", 
        "Driver Last Name": "driverName"
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a JSON mapping assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const mapping = JSON.parse(content || "{}");

    return c.json({ success: true, mapping });
  } catch (e: any) {
    console.error("AI Mapping Error:", e);
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

app.post("/make-server-37f42386/analyze-fleet", async (c) => {
  try {
    const { payload } = await c.req.json();
    if (!payload) return c.json({ error: "No payload provided" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

    const genAI = new GoogleGenerativeAI(apiKey);
    // Model selection moved to execution block for fallback support

    const prompt = `
      You are an expert Fleet Management Data Analyst AI.
      I have uploaded multiple CSV files representing my fleet's activity (Trips, Payments, Driver Performance, Vehicle Stats).
      
      Your goal is to cross-reference these files and output a SINGLE JSON object that populates my database.
      
      ### RULES & LOGIC
      
      1. **Driver Identification**:
         - Group data by Driver Name or UUID. 
         - A driver might appear in multiple files (e.g., "Trip Logs" and "Payment Logs"). Merge them.
      
      2. **Financial Logic (CRITICAL)**:
         - **Cash Collected**: This is money the driver holds physically. Sum the "Cash Collected" column from Payment files.
         - **Phantom Trip Detection**: If a trip has Status="Cancelled" BUT Cash Collected > 0, this is a FRAUD INDICATOR. Add to 'insights.phantomTrips'.
         - **Net Outstanding**: Cash Collected minus any "Cash Deposit" entries found.
      
      3. **Vehicle Logic**:
         - Group earnings by "Vehicle Plate" or "License Plate".
         - If a vehicle appears in "Fuel Logs", subtract that cost from its earnings to estimate ROI.
      
      4. **Performance Targets**:
         - High Performance: Acceptance > 85%, Cancellation < 5%.
         - Critical Warning: Cancellation > 10% or Acceptance < 60%.
      
      ### OUTPUT SCHEMA (Strict JSON)
      
      {
        "metadata": {
          "periodStart": "ISO Date (earliest found)",
          "periodEnd": "ISO Date (latest found)",
          "filesProcessed": Number
        },
        "drivers": [
          {
            "driverId": "String (UUID or Name Hash)",
            "driverName": "String",
            "periodStart": "ISO Date",
            "periodEnd": "ISO Date",
            "totalEarnings": Number,
            "cashCollected": Number,
            "netEarnings": Number,
            "acceptanceRate": Number (0.0-1.0),
            "cancellationRate": Number (0.0-1.0),
            "completionRate": Number (0.0-1.0),
            "onlineHours": Number,
            "tripsCompleted": Number,
            "ratingLast500": Number,
            "score": Number (0-100),
            "tier": "String (Bronze/Silver/Gold/Platinum)",
            "recommendation": "String (Advice for manager)"
          }
        ],
        "vehicles": [
          {
            "plateNumber": "String",
            "totalEarnings": Number,
            "onlineHours": Number,
            "totalTrips": Number,
            "utilizationRate": Number (0-100),
            "roiScore": Number (0-100),
            "maintenanceStatus": "String (Good/Due Soon/Critical)"
          }
        ],
        "financials": {
          "totalEarnings": Number,
          "netFare": Number,
          "totalCashExposure": Number,
          "fleetProfitMargin": Number
        },
        "insights": {
          "alerts": ["String"],
          "trends": ["String"],
          "recommendations": ["String"],
          "phantomTrips": [ { "tripId": "String", "driver": "String", "amount": Number } ]
        }
      }

      ### DATA INPUT
      ${payload}
    `;

    // Robust fallback strategy for model selection
    // Added 'gemini-1.5-flash-latest' and 'gemini-1.5-pro-latest' and explicit fallback to OpenAI
    const modelCandidates = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];
    let result = null;
    let lastError = null;

    for (const modelName of modelCandidates) {
        try {
            console.log(`Attempting analysis with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            result = await model.generateContent(prompt);
            if (result) break; 
        } catch (e: any) {
            console.warn(`Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    let text = "";
    if (!result) {
        console.warn("All Gemini models failed. Attempting fallback to OpenAI GPT-4o...");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (openaiKey) {
            try {
                const openai = new OpenAI({ apiKey: openaiKey });
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: "You are an expert Fleet Management Data Analyst AI." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                });
                text = completion.choices[0].message.content || "{}";
                console.log("OpenAI Fallback Successful");
            } catch (openaiError: any) {
                 console.error("OpenAI Fallback Failed:", openaiError);
                 throw new Error(`Both Gemini and OpenAI failed. Gemini Error: ${lastError?.message}`);
            }
        } else {
             throw new Error(`All Gemini models failed and OPENAI_API_KEY is missing. Last Gemini Error: ${lastError?.message}`);
        }
    } else {
        const response = await result.response;
        text = response.text();
    }
    
    // Enhanced JSON Extraction and Cleaning
    let jsonStr = text.trim();
    
    // 1. Try to extract from Markdown code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    } else {
        // 2. Fallback: Find the first '{' and last '}'
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            jsonStr = text.substring(firstOpen, lastClose + 1);
        }
    }
    
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch(parseError) {
        console.warn("Initial JSON parse failed. Attempting to repair common errors...");
        try {
            // 3. Simple Repair: Remove trailing commas in arrays/objects
            // Note: This is a basic regex and won't catch everything, but fixes the most common AI error
            const fixedJson = jsonStr.replace(/,\s*([\]}])/g, '$1');
            data = JSON.parse(fixedJson);
            console.log("JSON successfully repaired.");
        } catch (repairError) {
             console.error("JSON Parse Error:", parseError);
             console.log("Raw Text:", text);
             
             // 4. Ultimate Fallback: Return raw text wrapped in a simple structure so the user sees something
             // This prevents the "500 Internal Server Error" crash and allows the frontend to show the raw analysis
             console.warn("Returning raw text as fallback due to parse failure.");
             return c.json({ 
                 success: true, 
                 warning: "AI output was not valid JSON. Showing raw analysis.",
                 data: {
                     metadata: { filesProcessed: 1 },
                     drivers: [],
                     vehicles: [],
                     financials: { totalEarnings: 0, netFare: 0, totalCashExposure: 0, fleetProfitMargin: 0 },
                     insights: { 
                         alerts: ["Analysis generated but format was invalid."], 
                         recommendations: [text], // Put the raw text here so the user can read it
                         phantomTrips: [] 
                     }
                 }
             });
        }
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("Analysis Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Fleet Sync Endpoint (Mega-JSON Persistence)
app.post("/make-server-37f42386/fleet/sync", async (c) => {
  try {
    const { drivers, vehicles, financials, trips, metadata, insights } = await c.req.json();
    
    const operations = [];

    // 1. Driver Metrics
    if (Array.isArray(drivers) && drivers.length > 0) {
        const driverKeys = drivers.map((d: any) => `driver_metric:${d.driverId}`);
        operations.push(kv.mset(driverKeys, drivers));
    }

    // 2. Vehicle Metrics
    if (Array.isArray(vehicles) && vehicles.length > 0) {
        // Use plateNumber as ID if vehicleId is missing or generated
        const vehicleKeys = vehicles.map((v: any) => `vehicle_metric:${v.plateNumber || v.vehicleId}`);
        operations.push(kv.mset(vehicleKeys, vehicles));
    }

    // 3. Trips
    if (Array.isArray(trips) && trips.length > 0) {
        const tripKeys = trips.map((t: any) => `trip:${t.id}`);
        operations.push(kv.mset(tripKeys, trips));
    }

    // 4. Financials (Singleton)
    if (financials) {
        operations.push(kv.set("organization_metrics:current", financials));
    }

    // 5. Metadata & Insights
    if (metadata) {
        operations.push(kv.set("import_metadata:current", metadata));
    }
    if (insights) {
        operations.push(kv.set("import_insights:current", insights));
    }

    await Promise.all(operations);

    return c.json({ 
        success: true, 
        stats: {
            drivers: drivers?.length || 0,
            vehicles: vehicles?.length || 0,
            trips: trips?.length || 0
        }
    });

  } catch (e: any) {
      console.error("Fleet Sync Error:", e);
      return c.json({ error: e.message }, 500);
  }
});

// Financials Endpoint
app.get("/make-server-37f42386/financials", async (c) => {
    try {
        const data = await kv.get("organization_metrics:current");
        return c.json(data || {});
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/financials", async (c) => {
    try {
        const data = await c.req.json();
        await kv.set("organization_metrics:current", data);
        return c.json({ success: true, data });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Parse Invoice Endpoint
app.post("/make-server-37f42386/parse-invoice", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Robust model selection
        const modelCandidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const prompt = `Analyze this vehicle service invoice or receipt. Extract the following information in strict JSON format:
        - date (YYYY-MM-DD)
        - type (Choose the best fit: 'oil', 'tires', 'brake', 'inspection', 'repair', 'maintenance' (for multi-service visits), or 'other')
        - cost (number, total numeric amount. Ignore currency symbols like JMD or $)
        - odometer (number, if present)
        - notes (Create a clean, detailed summary. List every service performed and part replaced. Include customer complaints if visible (e.g. 'Customer reported soft brakes'). Format as a readable string.)
        
        If a field is missing, use null. Return ONLY the JSON object, no markdown code blocks.`;

        let result = null;
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                console.log(`Attempting invoice analysis with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
             throw new Error(`All Gemini models failed. Last Error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse invoice data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Error parsing invoice:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Parse Inspection Endpoint
app.post("/make-server-37f42386/parse-inspection", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Robust model selection
        const modelCandidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const checklistItems = [
            "Replace Engine Oil & Filter",
            "Replace Air Filter",
            "Replace Cabin Filter",
            "Replace Spark Plugs",
            "Replace Brake Pads (Front)",
            "Replace Brake Pads (Rear)",
            "Resurface/Replace Rotors",
            "Flush Brake Fluid",
            "Flush Coolant",
            "Transmission Service",
            "Wheel Alignment",
            "Rotate/Balance Tires",
            "Replace Tires",
            "Replace Wipers",
            "Replace Battery",
            "Suspension Repair",
            "Steering System Repair",
            "Exhaust System Repair",
            "AC Service",
            "Matching/Calibration",
            "Throttle Body Cleaning"
        ];

        const prompt = `Analyze this vehicle inspection report (or mechanic's checklist). Extract the following information in strict JSON format:
        - issues: array of strings. Identify all items marked as 'Failed', 'Needs Attention', 'Repair Needed', 'Bad', 'Replace', or general negative findings. 
          IMPORTANT: Try to map each issue to one of the following exact categories if it matches closely:
          ${JSON.stringify(checklistItems)}
          If an issue does not match any of these, use a concise, descriptive string (e.g. "Leaking Radiator").
        - notes: string. A comprehensive summary of the inspection findings. Include specific measurements (e.g. "Front Brake Pads: 3mm", "Tire Tread: 4/32") if visible. Include mechanic recommendations.
        
        Return ONLY the JSON object, no markdown code blocks.`;

        let result = null;
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                console.log(`Attempting inspection analysis with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
             throw new Error(`All Gemini models failed. Last Error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse inspection data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Error parsing inspection:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Odometer History Endpoints
app.get("/make-server-37f42386/odometer-history/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const history = await kv.getByPrefix(`odometer_reading:${vehicleId}:`);
    
    // Sort by date desc
    history.sort((a: any, b: any) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    return c.json(history);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/odometer-history", async (c) => {
  try {
    const reading = await c.req.json();
    if (!reading.id) reading.id = crypto.randomUUID();
    if (!reading.vehicleId) return c.json({ error: "Vehicle ID required" }, 400);
    if (!reading.createdAt) reading.createdAt = new Date().toISOString();
    
    // Key format: odometer_reading:{vehicleId}:{readingId}
    await kv.set(`odometer_reading:${reading.vehicleId}:${reading.id}`, reading);
    
    return c.json({ success: true, data: reading });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/odometer-history/:id", async (c) => {
    const id = c.req.param("id");
    const vehicleId = c.req.query("vehicleId");
    
    if (!vehicleId) return c.json({ error: "vehicleId query param required" }, 400);
    
    try {
        await kv.del(`odometer_reading:${vehicleId}:${id}`);
        return c.json({ success: true });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

Deno.serve(app.fetch);
