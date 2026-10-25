/** One odometer prompt for Plug and Fleet. Do not copy this text into a second route. */

export const ODOMETER_VISION_PROMPT = `
You are an AI assistant reading a vehicle dashboard.
Analyze this image to find the odometer reading.
Return a valid JSON object with these fields:
- reading (number | null): The odometer value (e.g. 15043). Do not include decimals unless they are clearly part of the main odometer. Ignore trip meters.
- unit (string): "km" or "mi" if visible, otherwise "km"
- confidence (string): "high", "medium", or "low"

If you cannot clearly see an odometer, set reading to null.
Output only valid JSON.
`.trim();

export function odometerVisionBody(dataUrl: string) {
  return {
    model: 'gpt-4o',
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: ODOMETER_VISION_PROMPT },
          { type: 'image_url' as const, image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' as const },
  };
}

export function parseOdometerVision(text: string): { reading: number | null; confidence?: string; unit?: string } {
  const data = JSON.parse(text || '{}') as { reading?: number | null; confidence?: string; unit?: string };
  const reading = data.reading == null ? null : Number(data.reading);
  return {
    reading: reading != null && Number.isFinite(reading) ? reading : null,
    confidence: data.confidence,
    unit: data.unit,
  };
}

export async function dataUrlFromFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`;
}
