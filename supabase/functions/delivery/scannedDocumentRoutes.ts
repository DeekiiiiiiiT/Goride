/**
 * Start / finish upload routes for the files the apps upload themselves (courier app, hauler app).
 *
 *   purpose            gate                                    scanned?
 *   courier-docs       the scanned-purpose switch (+key)        yes
 *   driver-docs        the scanned-purpose switch (+key)        yes
 *   courier-photos     the shared R2 switch (already on in prod) no
 *   driver-photos      the shared R2 switch (already on in prod) no
 *
 *   start → { enabled: false }                     when that purpose's gate is off
 *         → { enabled: true, uploadUrl, ticket }   when it is on (PUT the file to uploadUrl)
 *   finish → { enabled: true, key, address, … }    after PUT; a scanned purpose scans here
 *
 * The scanned purposes require MALWARE_SCAN_API_KEY (see _shared/objectStorage/scannedPurposes.ts),
 * so with today's production secrets their starts answer `{ enabled: false }` and those apps keep
 * their old Supabase upload. Photos are never scanned, so a delivery proof never waits on the
 * scanner. docs/cloudflare-r2-storage-migration-audit.md §0, slices 7 and 8.
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  finishUpload,
  startUpload,
  storageDepsFromEnv,
  StorageFlowError,
} from "../_shared/objectStorage/index.ts";
import { isR2PrivateLinksEnabled } from "../_shared/objectStorage/fileLink.ts";
import {
  isScannedR2Enabled,
  scannedDocAddress,
} from "../_shared/objectStorage/scannedPurposes.ts";

type PurposeGate = "scanned" | "shared";

/** Only these purposes can be uploaded by an app; everything else is a server-side route. */
const APP_UPLOAD_PURPOSES: Record<string, PurposeGate> = {
  "courier-docs": "scanned",
  "driver-docs": "scanned",
  "courier-photos": "shared",
  "driver-photos": "shared",
};

function purposeEnabled(purpose: string): boolean {
  return APP_UPLOAD_PURPOSES[purpose] === "scanned" ? isScannedR2Enabled() : isR2PrivateLinksEnabled();
}

export type ScannedDocumentDeps = {
  getSupabase: (authHeader: string) => SupabaseClient;
};

export function registerScannedDocumentRoutes(app: Hono, deps: ScannedDocumentDeps) {
  const signedInUser = async (c: Context): Promise<{ id: string } | null> => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return null;
    const { data: { user } } = await deps.getSupabase(authHeader).auth.getUser();
    return user ? { id: user.id } : null;
  };

  const startHandler = async (c: Context) => {
    const user = await signedInUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as {
      purpose?: unknown;
      contentType?: unknown;
      size?: unknown;
    };
    const purpose = String(body.purpose || "");
    if (!Object.hasOwn(APP_UPLOAD_PURPOSES, purpose)) {
      return c.json({ error: "Unknown upload purpose" }, 400);
    }
    // Switch off for this purpose → the app keeps its old direct upload.
    if (!purposeEnabled(purpose)) return c.json({ enabled: false });

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
      console.error("[app-uploads] start failed:", e instanceof Error ? e.message : e);
      return c.json({ enabled: true, error: "Upload could not start" }, 500);
    }
  };

  const finishHandler = async (c: Context) => {
    const user = await signedInUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // The scanned purposes fail closed inside finishUpload when the scan key is gone, so the
    // shared switch is the right gate here.
    if (!isR2PrivateLinksEnabled()) {
      return c.json({ error: "App uploads are not switched on", code: "app_uploads_off" }, 409);
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
      console.error("[app-uploads] finish failed:", e instanceof Error ? e.message : e);
      return c.json({ error: "Upload could not be completed" }, 500);
    }
  };

  // `/app-uploads` is the current name; `/scanned-documents` stays so a released app keeps working.
  for (const prefix of ["/app-uploads", "/scanned-documents"]) {
    app.post(`${prefix}/start`, startHandler);
    app.post(`${prefix}/finish`, finishHandler);
  }
}
