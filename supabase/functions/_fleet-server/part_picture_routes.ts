/**
 * The internal part-picture worker route (§3.3), the equivalent of the car system's
 * /make-server-37f42386/internal/vehicle-pictures/run. Only the cron relay (fleet-picture-cron/parts-run)
 * or a service-role caller may use it: the request carries X-Fleet-Cron-Secret.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronOrServiceRole } from "../_shared/authorizeCronOrServiceRole.ts";
import { R2Client, r2ConfigFromEnv } from "../_shared/objectStorage/index.ts";
import { createPartPictureDb } from "./part_picture_db.ts";
import { createProductionPartPictureCaller } from "./part_picture_imagen.ts";
import { runPartPictureWorker } from "./part_picture_worker.ts";
import { loadPartPicturesSettings, savePartPicturesSettings } from "./part_pictures_settings.ts";

export const PART_PICTURE_RUN_PATH = "/make-server-37f42386/internal/part-pictures/run";

export function registerPartPictureInternalRoutes(
  app: { post: Function },
  supabase: SupabaseClient,
): void {
  let r2: R2Client | null = null;
  try {
    r2 = new R2Client(r2ConfigFromEnv());
  } catch {
    r2 = null;
  }

  app.post(PART_PICTURE_RUN_PATH, async (c: Context) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    try {
      const result = await runPartPictureWorker({
        now: () => new Date(),
        loadSettings: loadPartPicturesSettings,
        saveSettings: savePartPicturesSettings,
        db: createPartPictureDb(supabase),
        imagen: createProductionPartPictureCaller(() => Deno.env.get("GEMINI_API_KEY")),
        r2,
      });
      return c.json(result);
    } catch (err) {
      console.error("part picture worker failed", err);
      return c.json({ error: "The picture worker failed" }, 500);
    }
  });
}
