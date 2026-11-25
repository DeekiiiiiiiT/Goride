/**
 * Start / finish upload routes for the two app-direct scanned purposes: courier docs and driver docs
 * (the courier app and the hauler app upload those files themselves). Merchant KYC is uploaded
 * straight to its own server route, so it is not offered here.
 *
 *   start → { enabled: false }                     when the scanned-purpose switch is off
 *         → { enabled: true, uploadUrl, ticket }   when it is on (PUT the file to uploadUrl)
 *   finish → { enabled: true, key, address, … }    after PUT; the scan runs here and is fail-closed
 *
 * The switch requires MALWARE_SCAN_API_KEY (see _shared/objectStorage/scannedPurposes.ts), so with
 * today's production secrets every start answers `{ enabled: false }` and the apps keep their old
 * Supabase upload. docs/cloudflare-r2-storage-migration-audit.md §0, slice 7.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  finishUpload,
  startUpload,
  storageDepsFromEnv,
  StorageFlowError,
} from "../_shared/objectStorage/index.ts";
import {
  isScannedPurpose,
  isScannedR2Enabled,
  scannedDocAddress,
} from "../_shared/objectStorage/scannedPurposes.ts";

/** Courier docs and driver docs are uploaded by the app itself; merchant KYC is server-side. */
const APP_UPLOAD_PURPOSES = new Set(["courier-docs", "driver-docs"]);

export type ScannedDocumentDeps = {
  getSupabase: (authHeader: string) => SupabaseClient;
};

export function registerScannedDocumentRoutes(app: Hono, deps: ScannedDocumentDeps) {
  const signedInUser = async (c: {
    req: { header: (name: string) => string | undefined };
  }): Promise<{ id: string } | null> => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return null;
    const { data: { user } } = await deps.getSupabase(authHeader).auth.getUser();
    return user ? { id: user.id } : null;
  };

  app.post("/scanned-documents/start", async (c) => {
    const user = await signedInUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // Switch off (no scan key, or R2 not configured) → the app keeps its old direct upload.
    if (!isScannedR2Enabled()) return c.json({ enabled: false });

    const body = (await c.req.json().catch(() => ({}))) as {
      purpose?: unknown;
      contentType?: unknown;
      size?: unknown;
    };
    const purpose = String(body.purpose || "");
    if (!isScannedPurpose(purpose) || !APP_UPLOAD_PURPOSES.has(purpose)) {
      return c.json({ error: "Unknown upload purpose" }, 400);
    }

    try {
      const started = await startUpload(
        {
          purpose,
          scopeId: user.id,
          userId: user.id,
          contentType: String(body.contentType || ""),
          size: Number(body.size || 0),
        },
        storageDepsFromEnv(),
      );
      return c.json({ enabled: true, ...started });
    } catch (e) {
      if (e instanceof StorageFlowError) return c.json({ enabled: true, error: e.message }, e.status);
      console.error("[scanned-documents] start failed:", e instanceof Error ? e.message : e);
      return c.json({ enabled: true, error: "Upload could not start" }, 500);
    }
  });

  app.post("/scanned-documents/finish", async (c) => {
    const user = await signedInUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isScannedR2Enabled()) {
      return c.json({ error: "Scanned uploads are not switched on", code: "scanned_uploads_off" }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as { ticket?: unknown };
    try {
      const done = await finishUpload({ ticket: String(body.ticket || ""), userId: user.id }, storageDepsFromEnv());
      // The app stores this address, so old readers (which already accept an http address) keep working.
      const address = await scannedDocAddress(done.key);
      return c.json({
        enabled: true,
        key: done.key,
        address,
        size: done.size,
        contentType: done.contentType,
      });
    } catch (e) {
      if (e instanceof StorageFlowError) {
        return c.json({ error: e.message, code: "upload_rejected" }, e.status);
      }
      console.error("[scanned-documents] finish failed:", e instanceof Error ? e.message : e);
      return c.json({ error: "Upload could not be completed" }, 500);
    }
  });
}
