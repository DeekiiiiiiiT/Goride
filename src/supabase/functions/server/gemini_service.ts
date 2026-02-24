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

export async function verifyOdometerLogic(currentOdo: number, previousOdo: number, tripsDistance: number, previousDate?: string, currentDate?: string) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Compute elapsed time context if dates are available
    let timeContext = "";
    if (previousDate && currentDate) {
        const prev = new Date(previousDate);
        const curr = new Date(currentDate);
        const elapsedMs = curr.getTime() - prev.getTime();
        const elapsedHours = Math.max(0, elapsedMs / (1000 * 60 * 60));
        const elapsedDays = Math.floor(elapsedHours / 24);
        const remainingHours = Math.round(elapsedHours % 24);
        const elapsedStr = elapsedDays > 0 
            ? `${elapsedDays} day${elapsedDays !== 1 ? 's' : ''}, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`
            : `${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
        const odometerGap = currentOdo - previousOdo;
        const kmPerDay = elapsedDays > 0 ? (odometerGap / (elapsedHours / 24)).toFixed(1) : "N/A";
        timeContext = `
        - Time elapsed between readings: ${elapsedStr}
        - Previous reading date: ${previousDate}
        - Current reading date: ${currentDate}
        - Implied driving rate: ${kmPerDay} km/day (typical Jamaican fleet vehicle: 50-200 km/day)`;
    }

    const prompt = `
        Act as an automated fleet auditor for a Jamaican vehicle fleet. A driver submitted an odometer reading of ${currentOdo}.
        Context:
        - Previous verified odometer: ${previousOdo}
        - Odometer gap: ${currentOdo - previousOdo} km
        - Logged trips distance since then: ${tripsDistance} km${timeContext}
        
        Analyze if this reading is realistic or likely a typo (e.g. digit swap, missing digit).
        Consider:
        1. Whether the odometer gap is physically possible given the time elapsed (a vehicle cannot drive 500+ km in 1 hour).
        2. Whether the gap is reasonable compared to logged trip distance (some unlogged personal driving is normal, but large discrepancies are suspicious).
        3. Whether the implied km/day rate is realistic for a fleet vehicle in Jamaica.
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