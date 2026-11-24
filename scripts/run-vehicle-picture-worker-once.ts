/** Local preprod: one worker pass with env from .vehicle-pictures-preprod.env (run from repo root). */
import { createClient } from "npm:@supabase/supabase-js@2";
import { R2Client, r2ConfigFromEnv } from "../supabase/functions/_shared/objectStorage/r2Client.ts";
import { createProductionImagenCaller } from "../supabase/functions/_fleet-server/vehicle_picture_imagen.ts";
import { createVehiclePictureDb } from "../supabase/functions/_fleet-server/vehicle_picture_db.ts";
import { runVehiclePictureWorker } from "../supabase/functions/_fleet-server/vehicle_picture_worker.ts";
import { loadVehiclePicturesSettings } from "../supabase/functions/_fleet-server/vehicle_pictures_settings.ts";
import { serverKey } from "./lib/serverKey.mjs";

const url = Deno.env.get("SUPABASE_URL")?.trim();
const key = serverKey()?.trim();
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
const supabase = createClient(url, key);
const r2 = new R2Client(r2ConfigFromEnv());
const result = await runVehiclePictureWorker({
  now: () => new Date(),
  loadSettings: loadVehiclePicturesSettings,
  db: createVehiclePictureDb(supabase),
  imagen: createProductionImagenCaller(() => Deno.env.get("GEMINI_API_KEY")),
  r2,
  randomJitterSec: () => 0,
});
console.log(JSON.stringify(result));