import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import * as kv from "./kv_store.tsx";
import { generatePerformanceReport } from "./performance-metrics.tsx";
import { Buffer } from "node:buffer";

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
    
    // Validation and processing
    const processedTrips = trips.map((trip: any) => {
        if (trip.isManual) {
            // Validation for manual trips
            if (!trip.driverId) throw new Error(`Manual trip ${trip.id || 'unknown'} must have a driverId`);
            if (typeof trip.amount !== 'number') throw new Error(`Manual trip ${trip.id || 'unknown'} must have a numeric amount`);
            
            // Enforce consistency for manual entries
            return {
                ...trip,
                batchId: 'manual_entry',
                status: trip.status || 'Completed',
                // Ensure critical financial fields are present
                netPayout: trip.netPayout ?? trip.amount,
                fareBreakdown: trip.fareBreakdown || {
                    baseFare: trip.amount,
                    tips: 0,
                    waitTime: 0,
                    surge: 0,
                    airportFees: 0,
                    timeAtStop: 0,
                    taxes: 0
                }
            };
        }
        return trip;
    });
    
    // Create keys for each trip
    // Assuming each trip has a unique 'id' field
    const keys = processedTrips.map((t: any) => `trip:${t.id}`);
    
    // Store using mset
    await kv.mset(keys, processedTrips);
    
    return c.json({ success: true, count: processedTrips.length });
  } catch (e: any) {
    console.error("Error saving trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.get("/make-server-37f42386/trips", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : null;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    let trips = await kv.getByPrefix("trip:");
    
    // Sort by date descending (Newest first)
    if (trips && Array.isArray(trips)) {
        trips.sort((a: any, b: any) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return timeB - timeA;
        });
        
        if (limit !== null) {
            trips = trips.slice(offset, offset + limit);
        }
    }
    
    return c.json(trips || []);
  } catch (e: any) {
    console.error("Error fetching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips", async (c) => {
  try {
    // Direct delete using Supabase client to avoid pagination limits and round-trips
    // This fixes the issue where only the first 1000 records were being deleted
    const prefixes = ["trip:", "batch:", "driver_metric:", "vehicle_metric:", "transaction:"];
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
        deletedVehicleMetrics: counts["vehicle_metric:"] || 0,
        deletedTransactions: counts["transaction:"] || 0
    });
  } catch (e: any) {
    console.error("Error clearing data:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`trip:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    console.error(`Error deleting trip ${id}:`, e);
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
    const body = await c.req.json();
    // Extract password to prevent saving it to KV, and use it for Auth creation
    const { password, ...driver } = body;
    
    let authUserId = null;

    // If password provided, create Supabase Auth User
    if (password && driver.email) {
         const { data, error } = await supabase.auth.admin.createUser({
            email: driver.email,
            password: password,
            user_metadata: { 
                name: driver.name || '',
                role: 'driver' 
            },
            email_confirm: true
         });

         if (error) {
             console.error("Auth Create Error:", error);
             return c.json({ error: `Failed to create user account: ${error.message}` }, 400);
         }
         authUserId = data.user.id;
    }

    // Use Auth ID if created, otherwise fallback to provided ID or random
    const finalId = authUserId || driver.id || crypto.randomUUID();
    
    const newDriver = {
        ...driver,
        id: finalId,
        driverId: driver.driverId || finalId, // Allow distinct legacy ID
    };

    await kv.set(`driver:${finalId}`, newDriver);
    return c.json({ success: true, data: newDriver });
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

app.delete("/make-server-37f42386/transactions/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`transaction:${id}`);
    return c.json({ success: true });
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
            
            // Dynamic Imports for PDF libraries to prevent server startup crashes
            const { default: PDFParser } = await import("npm:pdf2json");
            const { PDFDocument } = await import("npm:pdf-lib");
            const pdfjsLib = await import("https://esm.sh/pdfjs-dist@3.11.174");
            
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

// Fuel Cards Endpoints
app.get("/make-server-37f42386/fuel-cards", async (c) => {
  try {
    const cards = await kv.getByPrefix("fuel_card:");
    return c.json(cards || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-cards", async (c) => {
  try {
    const card = await c.req.json();
    if (!card.id) {
        card.id = crypto.randomUUID();
    }
    await kv.set(`fuel_card:${card.id}`, card);
    return c.json({ success: true, data: card });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-cards/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_card:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Fuel Entries (Logs) Endpoints
app.get("/make-server-37f42386/fuel-entries", async (c) => {
  try {
    const entries = await kv.getByPrefix("fuel_entry:");
    // Sort by date desc
    if (entries && Array.isArray(entries)) {
        entries.sort((a: any, b: any) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return timeB - timeA;
        });
    }
    return c.json(entries || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-entries", async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) {
        entry.id = crypto.randomUUID();
    }
    await kv.set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-entries/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_entry:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Mileage Adjustments Endpoints
app.get("/make-server-37f42386/mileage-adjustments", async (c) => {
  try {
    const adjustments = await kv.getByPrefix("fuel_adjustment:");
     // Sort by week desc
    if (adjustments && Array.isArray(adjustments)) {
        adjustments.sort((a: any, b: any) => {
            return (b.week || "").localeCompare(a.week || "");
        });
    }
    return c.json(adjustments || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/mileage-adjustments", async (c) => {
  try {
    const adj = await c.req.json();
    if (!adj.id) {
        adj.id = crypto.randomUUID();
    }
    await kv.set(`fuel_adjustment:${adj.id}`, adj);
    return c.json({ success: true, data: adj });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/mileage-adjustments/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_adjustment:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
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

// Toll Tag Endpoints
app.get("/make-server-37f42386/toll-tags", async (c) => {
  try {
    const tags = await kv.getByPrefix("toll_tag:");
    return c.json(tags || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/toll-tags", async (c) => {
  try {
    const tag = await c.req.json();
    if (!tag.id) {
        tag.id = crypto.randomUUID();
    }
    if (!tag.createdAt) {
        tag.createdAt = new Date().toISOString();
    }
    
    // Key structure: toll_tag:{id}
    await kv.set(`toll_tag:${tag.id}`, tag);
    return c.json({ success: true, data: tag });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/toll-tags/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_tag:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
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
        // Chunk deletion to avoid size limits
        const chunkSize = 100;
        for (let i = 0; i < keys.length; i += chunkSize) {
            const chunk = keys.slice(i, i + chunkSize);
            if (chunk.length > 0) await kv.mdel(chunk);
        }
    }

    // 4. Delete transactions belonging to this batch
    const allTransactions = await kv.getByPrefix("transaction:");
    const transactionsToDelete = (allTransactions || []).filter((t: any) => t.batchId === batchId);
    
    if (transactionsToDelete.length > 0) {
        const txKeys = transactionsToDelete.map((t: any) => `transaction:${t.id}`);
        // Chunk deletion
        const chunkSize = 100;
        for (let i = 0; i < txKeys.length; i += chunkSize) {
             const chunk = txKeys.slice(i, i + chunkSize);
             if (chunk.length > 0) await kv.mdel(chunk);
        }
    }
    
    // 5. Ghost Data Cleanup
    // Since DriverMetrics and VehicleMetrics do not always have batchId, they can become "ghosts" 
    // if all source data is deleted. We check if the database is effectively empty of source data.
    const remainingTrips = await kv.getByPrefix("trip:");
    // We can also check transactions, but trips are the primary source for metrics usually.
    const remainingTransactions = await kv.getByPrefix("transaction:");
    
    // Filter out the ones we just deleted (in case of race conditions or if getByPrefix is slightly stale, though usually it's consistent)
    // Actually, getByPrefix might return the ones we just deleted if consistency is eventual? 
    // But we awaited mdel, so it should be fine. 
    // Just in case, let's filter just to be super safe.
    const activeTrips = (remainingTrips || []).filter((t: any) => t.batchId !== batchId);
    const activeTransactions = (remainingTransactions || []).filter((t: any) => t.batchId !== batchId);

    if (activeTrips.length === 0 && activeTransactions.length === 0) {
        console.log("No source data remaining. Cleaning up ghost metrics...");
        const metricPrefixes = ["driver_metric:", "vehicle_metric:", "organization_metric:"];
        
        for (const prefix of metricPrefixes) {
             const items = await kv.getByPrefix(prefix);
             if (items && items.length > 0) {
                 const keys = items.map((item: any) => {
                     // Handle both ID structures just in case
                     return `${prefix}${item.id}`; 
                 });
                 
                 // Chunk deletion
                 const chunkSize = 100;
                 for (let i = 0; i < keys.length; i += chunkSize) {
                    const chunk = keys.slice(i, i + chunkSize);
                    if (chunk.length > 0) await kv.mdel(chunk);
                 }
             }
        }
    }

    // 6. Delete the batch record itself
    await kv.del(`batch:${batchId}`);
    
    return c.json({ 
        success: true, 
        deletedTrips: tripsToDelete.length,
        deletedTransactions: transactionsToDelete.length,
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

// Fixed Expenses Endpoints
app.get("/make-server-37f42386/fixed-expenses/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Key pattern: fixed_expense:{vehicleId}:{expenseId}
    const expenses = await kv.getByPrefix(`fixed_expense:${vehicleId}:`);
    return c.json(expenses || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fixed-expenses", async (c) => {
  try {
    const expense = await c.req.json();
    if (!expense.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    if (!expense.id) {
        expense.id = crypto.randomUUID();
    }
    if (!expense.createdAt) {
        expense.createdAt = new Date().toISOString();
    }
    expense.updatedAt = new Date().toISOString();

    const key = `fixed_expense:${expense.vehicleId}:${expense.id}`;
    await kv.set(key, expense);
    return c.json({ success: true, data: expense });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fixed-expenses/:vehicleId/:id", async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    const key = `fixed_expense:${vehicleId}:${id}`;
    await kv.del(key);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// AI Fleet Analysis Endpoint
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

// AI Toll CSV Parsing
app.post("/make-server-37f42386/ai/parse-toll-csv", async (c) => {
  try {
    const { csvContent } = await c.req.json();
    if (!csvContent) {
        return c.json({ error: "No CSV content provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
      You are an expert data parser.
      Parse the following toll transaction data into a JSON array.
      
      The input is likely a CSV, TSV, or copy-pasted table.
      
      Output JSON Schema:
      {
        "transactions": [
            {
            "date": "ISO Date String",
            "tagId": "Tag ID or Serial Number (String) or empty",
            "location": "Plaza Name (String)",
            "laneId": "Lane ID (String) or empty",
            "amount": Number (Negative for deduction, Positive for Top-up),
            "type": "Usage" | "Top-up" | "Refund"
            }
        ]
      }
      
      Rules:
      1. Detect the date format intelligently. Current year is 2025 unless specified.
      2. If amount is like "JMD -275.00", parse as -275.00.
      3. If amount is negative, type is "Usage". If positive, type is usually "Top-up" (unless it's a refund).
      4. Ignore header rows or irrelevant lines.
      5. Extract the Tag ID or Serial Number if present in the first few columns.
      6. Return ONLY the valid JSON object with the "transactions" key.
      
      Input Data:
      ${csvContent.substring(0, 15000)}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a JSON parsing assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content || "{}");
    
    return c.json({ success: true, data: result.transactions || [] });
  } catch (e: any) {
    console.error("AI Toll Parse Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// AI Toll Image Parsing
app.post("/make-server-37f42386/ai/parse-toll-image", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 1024;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
    }
    const base64Image = `data:${file.type};base64,${btoa(binary)}`;

    const prompt = `
      You are an expert data parser.
      Analyze the provided image of a toll transaction history or top-up history.
      Extract the transaction data into a JSON array.

      Output JSON Schema:
      {
        "transactions": [
            {
            "date": "ISO Date String",
            "tagId": "Tag ID or Serial Number (String) or empty",
            "location": "Plaza Name (String) or empty if not visible",
            "laneId": "Lane ID (String) or empty",
            "amount": Number (Negative for deduction, Positive for Top-up),
            "type": "Usage" | "Top-up" | "Refund",
            "status": "Success" | "Failure" | "Pending",
            "discount": Number (0 if none),
            "paymentAfterDiscount": Number (equal to amount if none)
            }
        ]
      }

      Rules:
      1. Detect the date format intelligently. Current year is 2025 unless specified.
      2. Identify "Payment" or "Top Up Amount" columns.
      3. If the row indicates "Failure" or "Failed", ignore it or mark status as Failure.
      4. If "Top Up Amount" is present (e.g. "JMD 2,000.00"), it is a positive amount (Top-up).
      5. If "Usage" or toll charges are shown, they are negative amounts.
      6. Extract Tag ID (e.g. "212100286450") if visible in the header or rows.
      7. Return ONLY the valid JSON object with the "transactions" key.
      8. If multiple amounts are shown (e.g. "Payment After Discount" and "Topup Amount"), use the "Topup Amount" for the main 'amount' field.
      9. Extract "Discount / Bonus" if present.
      10. Extract "Payment After Discount / Bonus" if present.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a JSON parsing assistant."
        },
        {
          role: "user",
          content: [
             { type: "text", text: prompt },
             { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content || "{}");
    
    return c.json({ success: true, data: result.transactions || [] });

  } catch (e: any) {
    console.error("AI Toll Image Parse Error:", e);
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

// Claims Endpoints
app.get("/make-server-37f42386/claims", async (c) => {
  try {
    const claims = await kv.getByPrefix("claim:");
    const driverId = c.req.query("driverId");
    
    if (driverId && Array.isArray(claims)) {
        const filtered = claims.filter((claim: any) => claim.driverId === driverId);
        return c.json(filtered);
    }
    
    return c.json(claims || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/claims", async (c) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) {
        claim.id = crypto.randomUUID();
    }
    if (!claim.createdAt) {
        claim.createdAt = new Date().toISOString();
    }
    claim.updatedAt = new Date().toISOString();
    
    await kv.set(`claim:${claim.id}`, claim);
    return c.json({ success: true, data: claim });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Admin: List Users
app.get("/make-server-37f42386/users", async (c) => {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) throw error;
    
    // Transform to TeamMember format
    const members = users.map((u: any) => ({
        id: u.id,
        name: u.user_metadata?.name || 'Unknown',
        email: u.email || '',
        role: u.user_metadata?.role || 'driver',
        status: 'active', 
        lastActive: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never',
        avatarUrl: u.user_metadata?.avatarUrl
    }));
    
    return c.json(members);
  } catch (e: any) {
    console.error("List Users Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Invite User
app.post("/make-server-37f42386/invite-user", async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      user_metadata: { 
        name: name || '',
        role: role || 'driver'
      },
      email_confirm: true
    });
    
    if (error) throw error;
    
    // Also create a driver profile if role is driver
    if ((role === 'driver' || !role) && data.user) {
        const driverId = data.user.id;
        const driverProfile = {
            id: driverId,
            driverId: driverId, // legacy field compat
            driverName: name || email.split('@')[0],
            email: email,
            status: 'active',
            createdAt: new Date().toISOString(),
            // Initialize empty metrics/defaults
            acceptanceRate: 0,
            cancellationRate: 0,
            completionRate: 0,
            ratingLast500: 5.0,
            totalEarnings: 0
        };
        await kv.set(`driver:${driverId}`, driverProfile);
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("Invite User Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Delete User (Driver)
app.post("/make-server-37f42386/delete-user", async (c) => {
  try {
    const { userId } = await c.req.json();
    
    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }
    
    // 1. Delete from Auth (Attempt)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
        console.warn(`Auth delete failed for ${userId} (ignoring):`, error.message);
    }
    
    // 2. Delete from KV Store
    await kv.del(`driver:${userId}`);
    
    return c.json({ success: true });
  } catch (e: any) {
    console.error("Delete User Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Fuel Dispute Endpoints
app.get("/make-server-37f42386/fuel-disputes", async (c) => {
  try {
    const disputes = await kv.getByPrefix("fuel_dispute:");
    return c.json(disputes || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-disputes", async (c) => {
  try {
    const dispute = await c.req.json();
    if (!dispute.id) {
        dispute.id = crypto.randomUUID();
    }
    if (!dispute.createdAt) {
        dispute.createdAt = new Date().toISOString();
    }
    await kv.set(`fuel_dispute:${dispute.id}`, dispute);
    return c.json({ success: true, data: dispute });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-disputes/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_dispute:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Equipment Endpoints
app.get("/make-server-37f42386/equipment/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Get all equipment items for this vehicle. We assume keys are formatted as equipment:{vehicleId}:{itemId}
    const items = await kv.getByPrefix(`equipment:${vehicleId}:`);
    return c.json(items || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/equipment", async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) {
        item.id = crypto.randomUUID();
    }
    if (!item.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    if (!item.updatedAt) {
        item.updatedAt = new Date().toISOString();
    }
    
    // Key structure: equipment:{vehicleId}:{itemId}
    await kv.set(`equipment:${item.vehicleId}:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/equipment/:vehicleId/:id", async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    await kv.del(`equipment:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Map Match Endpoint (OSRM Proxy)
app.post("/make-server-37f42386/map-match", async (c) => {
  try {
    const { points } = await c.req.json();
    if (!Array.isArray(points) || points.length === 0) {
      return c.json({ error: "Points array is required" }, 400);
    }

    // Filter valid points
    const validPoints = points.filter((p: any) => p && !isNaN(p.lat) && !isNaN(p.lon));
    if (validPoints.length < 2) {
      return c.json({ error: "At least 2 valid points required" }, 400);
    }

    // Chunking Logic (80 points per chunk to be safe within 100 limit and URL length)
    const CHUNK_SIZE = 80;
    const chunks = [];
    
    // Create chunks with 1 point overlap
    for (let i = 0; i < validPoints.length - 1; i += (CHUNK_SIZE - 1)) {
        const chunk = validPoints.slice(i, Math.min(i + CHUNK_SIZE, validPoints.length));
        chunks.push(chunk);
    }
    
    // Edge case: if we have points but loop didn't run (e.g. < 80 points), we need at least one chunk. 
    // But slice logic above covers it: i=0. i < len-1. 
    // If len=2, CHUNK=80. slice(0, 80). i becomes 79. Loop ends. Correct.
    
    const responses = await Promise.all(chunks.map(async (chunk) => {
        // Format: lon,lat;lon,lat
        const coords = chunk.map((p: any) => `${p.lon},${p.lat}`).join(';');
        const timestamps = chunk.map((p: any) => Math.floor(p.timestamp / 1000)).join(';');
        
        // Using public OSRM server. 
        const url = `https://router.project-osrm.org/match/v1/driving/${coords}?timestamps=${timestamps}&overview=full&geometries=geojson&steps=false&annotations=true`;
        
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`OSRM Match failed: ${res.statusText}`);
        }
        return res.json();
    }));

    // Result Stitching
    let totalDistance = 0;
    let totalDuration = 0;
    const stitchedCoordinates: any[] = [];
    let confidence = 0;
    
    responses.forEach((res, index) => {
        if (res.code !== 'Ok' || !res.matchings || res.matchings.length === 0) return;
        
        const match = res.matchings[0]; // Take best match
        
        totalDistance += match.distance;
        totalDuration += match.duration;
        confidence += match.confidence;

        // Geometry Stitching
        if (match.geometry && match.geometry.coordinates) {
             const coords = match.geometry.coordinates;
             // If this is not the first chunk, remove the first coordinate to avoid duplicate vertex at join
             if (index > 0 && stitchedCoordinates.length > 0) {
                 stitchedCoordinates.push(...coords.slice(1));
             } else {
                 stitchedCoordinates.push(...coords);
             }
        }
    });

    // Normalize confidence
    if (responses.length > 0) {
        confidence = confidence / responses.length;
    }

    return c.json({
        success: true,
        data: {
            snappedRoute: stitchedCoordinates.map((c: any) => ({ lat: c[1], lon: c[0] })), // GeoJSON is [lon, lat]
            totalDistance, // Meters
            totalDuration, // Seconds
            confidence
        }
    });

  } catch (e: any) {
    console.error("Map Matching Error:", e);
    return c.json({ success: false, error: e.message });
  }
});

// Performance Report Endpoint
app.get("/make-server-37f42386/performance-report", async (c) => {
    try {
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");
        
        if (!startDate || !endDate) {
            return c.json({ error: "startDate and endDate are required" }, 400);
        }

        // Fetch Data
        const trips = await kv.getByPrefix("trip:");
        const drivers = await kv.getByPrefix("driver:");
        
        // Use Defaults or Query Params for Quota
        // In future phase, fetch from kv_store
        const dailyRideTarget = parseInt(c.req.query("dailyRideTarget") || "10");
        const dailyEarningsTarget = parseInt(c.req.query("dailyEarningsTarget") || "0");

        const report = generatePerformanceReport(
            Array.isArray(trips) ? trips : [], 
            Array.isArray(drivers) ? drivers : [], 
            startDate, 
            endDate,
            { dailyRideTarget, dailyEarningsTarget }
        );
        
        return c.json(report);
    } catch (e: any) {
        console.error("Performance Report Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Scan Receipt Endpoint (Gemini)
app.post("/make-server-37f42386/scan-receipt", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const prompt = `Analyze this receipt. Extract the following details in JSON format:
        - merchant (string, name of the store/service. For tolls, use the Highway name e.g. Highway 2000)
        - date (YYYY-MM-DD, format correctly)
        - amount (number, total amount. Remove currency symbols.)
        - type (string, one of: 'Fuel', 'Service', 'Toll', 'Other'. Infer from context. If it mentions tolls, highway, plaza, etc. use 'Toll'.)
        - notes (string, brief description of items)
        
        If it is a Toll receipt, specifically extract these additional fields if present:
        - plaza (string, e.g. Portmore East, Angels)
        - lane (string, e.g. K15)
        - vehicleClass (string, e.g. 1)
        - receiptNumber (string, the Ticket No or No)
        - collector (string, e.g. 613893)

        Return ONLY the JSON object, no markdown.`;

        let result;
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

        const modelCandidates = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash-exp", "gemini-1.5-pro"];
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([prompt, imagePart]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
            throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse receipt data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Receipt Scan Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

Deno.serve(app.fetch);
