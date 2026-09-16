/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as gemini from "./gemini_service.ts";

export function registerAiVisionRoutes(app: Hono) {
  // Phase 2: AI-Driven OCR & Verification (Refined)
  app.post("/make-server-37f42386/ai/process-fuel-receipt", async (c) => {
      try {
          const { imageBase64 } = await c.req.json();
          if (!imageBase64) return c.json({ error: "No image provided" }, 400);

          const data = await gemini.processFuelReceiptVision(imageBase64);
          return c.json(data);
      } catch (e: any) {
          console.error("AI Receipt Error:", e);
          return c.json({ error: `Failed to process receipt: ${e.message}` }, 500);
      }
  });

  app.post("/make-server-37f42386/ai/verify-odometer", async (c) => {
      try {
          const { currentOdo, previousOdo, tripsDistance, previousDate, currentDate } = await c.req.json();
          const data = await gemini.verifyOdometerLogic(currentOdo, previousOdo, tripsDistance, previousDate, currentDate);
          return c.json(data);
      } catch (e: any) {
          console.error("AI Odo Verification Error:", e);
          return c.json({ error: "Failed to verify odometer" }, 500);
      }
  });

}
