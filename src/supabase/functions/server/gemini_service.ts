import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const genAI = new GoogleGenerativeAI(API_KEY);

export interface OCRResult {
    odometer: number | null;
    liters: number | null;
    amount: number | null;
    pricePerLiter: number | null;
    date: string | null;
    stationName: string | null;
    confidence_score: number;
    raw_analysis?: string;
}

export async function processFuelReceiptVision(imageBase64: string): Promise<OCRResult> {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
        You are a specialized OCR engine for fleet management. 
        Analyze this fuel receipt image and extract the following data:
        - odometer: Current vehicle odometer reading (usually 5-6 digits).
        - liters: Total fuel volume in liters (sometimes called 'volume' or 'qty').
        - amount: Total cost paid.
        - pricePerLiter: Unit price for fuel.
        - date: Date of purchase (YYYY-MM-DD).
        - stationName: Name of the fuel station.

        Format the response as a clean JSON object. 
        Also include a "confidence_score" (0.0 to 1.0) based on how readable the text is.
        If a value is missing, return null for that field.
        Return ONLY the JSON object.
    `;

    try {
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: imageBase64.split(",")[1] || imageBase64,
                    mimeType: "image/jpeg"
                }
            }
        ]);

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON found in Gemini response");
        }

        const data = JSON.parse(jsonMatch[0]);
        return {
            odometer: data.odometer ? Number(data.odometer) : null,
            liters: data.liters ? Number(data.liters) : null,
            amount: data.amount ? Number(data.amount) : null,
            pricePerLiter: data.pricePerLiter ? Number(data.pricePerLiter) : null,
            date: data.date || null,
            stationName: data.stationName || null,
            confidence: data.confidence_score || 0.5,
            raw_analysis: text
        };
    } catch (e) {
        console.error("Gemini Vision Error:", e);
        throw e;
    }
}

export async function verifyOdometerLogic(currentOdo: number, previousOdo: number, tripsDistance: number) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
        Act as an automated fleet auditor. A driver submitted an odometer reading of ${currentOdo}.
        Context:
        - Previous verified odometer: ${previousOdo}
        - Logged trips distance since then: ${tripsDistance} km
        
        Analyze if this reading is realistic or likely a typo (e.g. digit swap, missing digit).
        If it looks like a typo, suggest the most logical correction.
        Return a JSON object:
        {
            "isValid": boolean,
            "confidence": number (0-1),
            "correction": number | null,
            "message": "string explanation"
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { isValid: true, confidence: 1, message: "No issues detected" };
}
