/**
 * Authenticated merchant storefront image uploads → merchant-assets (service_role).
 * Client writes to this bucket are blocked by storage RLS (Wave 0).
 * With R2 switched on the image goes to roam-public and the answer is its media.roamfleet.co
 * address — see merchant_asset_storage.ts and docs/cloudflare-r2-storage-migration-audit.md §0.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireServiceKey, publicApiKey } from "../_shared/serviceKey.ts";
import {
  detectFileMagicBytes,
  extForMime,
  IMAGE_MIMES,
} from "../_shared/fileMagic.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { resolveMerchantAccess } from "./merchantAuth.ts";
import {
  buildMerchantAssetKey,
  isR2PublicAssetsEnabled,
  merchantAssetAddress,
  merchantAssetFolder,
  MERCHANT_ASSET_BUCKET,
  MERCHANT_ASSET_MAX_BYTES,
  putMerchantAsset,
} from "./merchant_asset_storage.ts";

const MAX_BYTES = MERCHANT_ASSET_MAX_BYTES;

function getAnonAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    publicApiKey(),
    { global: { headers: { Authorization: authHeader } } },
  );
}

function getServiceStorage() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    requireServiceKey(),
  );
}

/** The merchant this uploader acts for (owner or team member); null for platform staff. */
async function merchantIdForUser(user: { id: string; email?: string | null }): Promise<string | null> {
  try {
    const resolved = await resolveMerchantAccess(user.id, user.email ?? null);
    const id = resolved?.merchant?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    // Never block an upload that worked before this slice just because the lookup failed.
    return null;
  }
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
    const folder = merchantAssetFolder(folderRaw);

    // Cloudflare R2 (roam-public/merchant/<merchant>/<folder>/<hash>.<ext>) when switched on.
    // The answer keeps its shape ({ path, publicUrl }), so the apps need no change.
    if (isR2PublicAssetsEnabled()) {
      try {
        const scopeId = (await merchantIdForUser(user)) ?? user.id;
        const key = await buildMerchantAssetKey({ scopeId, folder, contentType: detected, bytes: buffer });
        await putMerchantAsset(key, buffer, detected, (bucket, k, data, type, cache) =>
          r2FromEnv().put(bucket, k, data, type, cache));
        return c.json({ path: key, publicUrl: merchantAssetAddress(key) }, 201);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return c.json({ error: message }, 500);
      }
    }

    const path = `${user.id}/${folder}/${crypto.randomUUID()}.${extForMime(detected)}`;

    const storage = getServiceStorage();
    const { error: uploadError } = await storage.storage.from(MERCHANT_ASSET_BUCKET).upload(path, buffer, {
      contentType: detected,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      return c.json({ error: uploadError.message }, 500);
    }

    const { data: { publicUrl } } = storage.storage.from(MERCHANT_ASSET_BUCKET).getPublicUrl(path);
    return c.json({ path, publicUrl }, 201);
  });
}
