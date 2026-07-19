/**
 * Authenticated merchant storefront image uploads → merchant-assets (service_role).
 * Client writes to this bucket are blocked by storage RLS (Wave 0).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import {
  detectFileMagicBytes,
  extForMime,
  IMAGE_MIMES,
} from "../_shared/fileMagic.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "merchant-assets";

function getAnonAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

function getServiceStorage() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function registerMerchantAssetsRoutes(app: Hono) {
  app.post("/merchant-assets/upload", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { data: { user }, error: userErr } = await getAnonAuthClient(authHeader).auth.getUser();
    if (userErr || !user) return c.json({ error: "Unauthorized" }, 401);

    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: "Image must be 5MB or smaller" }, 413);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const detected = detectFileMagicBytes(buffer);
    if (!detected || !IMAGE_MIMES.has(detected)) {
      return c.json({ error: "File content does not match an allowed image type" }, 400);
    }

    const folderRaw = typeof form.folder === "string" ? form.folder.trim() : "images";
    const folder = folderRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "images";
    const path = `${user.id}/${folder}/${crypto.randomUUID()}.${extForMime(detected)}`;

    const storage = getServiceStorage();
    const { error: uploadError } = await storage.storage.from(BUCKET).upload(path, buffer, {
      contentType: detected,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      return c.json({ error: uploadError.message }, 500);
    }

    const { data: { publicUrl } } = storage.storage.from(BUCKET).getPublicUrl(path);
    return c.json({ path, publicUrl }, 201);
  });
}
