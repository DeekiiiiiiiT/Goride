/**
 * Start / finish upload routes for the files the apps upload themselves (courier app, hauler app).
 *
 *   purpose            gate                                        scanned?  stored address
 *   courier-docs       the scanned-purpose switch (+scan key)        yes      signed link
 *   driver-docs        the scanned-purpose switch (+scan key)        yes      signed link
 *   courier-photos     the shared R2 switch (on in prod)             no       signed link
 *   courier-profile    the shared switch + R2_PUBLIC_BASE_URL        no       media address
 *   driver-photos      the shared switch + R2_PUBLIC_BASE_URL        no       media address
 *
 *   start → { enabled: false }                     when that purpose's gate is off
 *         → { enabled: true, uploadUrl, ticket }   when it is on (PUT the file to uploadUrl)
 *   finish → { enabled: true, key, address, … }    after PUT; a scanned purpose scans here
 *
 * `courier-profile` and `driver-photos` are public on purpose: their addresses are saved once and
 * shown indefinitely (passengers, staff), so they must be permanent media addresses and never a
 * signed link that expires.
 *
 * The scanned purposes require MALWARE_SCAN_API_KEY (see _shared/objectStorage/scannedPurposes.ts),
 * so with today's production secrets their starts answer `{ enabled: false }` and those apps keep
 * their old Supabase upload. Photos are never scanned, so a delivery proof never waits on the
 * scanner. docs/cloudflare-r2-storage-migration-audit.md §0, slices 7 and 8.
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FILE_LINK_SECONDS,
  finishUpload,
  isR2PublicAssetsEnabled,
  startUpload,
  storageDepsFromEnv,
  StorageFlowError,
} from "../_shared/objectStorage/index.ts";
import { isR2PrivateLinksEnabled } from "../_shared/objectStorage/fileLink.ts";
import {
  isScannedR2Enabled,
  scannedDocAddress,
} from "../_shared/objectStorage/scannedPurposes.ts";

type PurposeGate = "scanned" | "shared-private" | "public";

/** Only these purposes can be uploaded by an app; everything else is a server-side route. */
const APP_UPLOAD_PURPOSES: Record<string, PurposeGate> = {
  "courier-docs": "scanned",
  "driver-docs": "scanned",
  "courier-photos": "shared-private",
  "courier-profile": "public",
  "driver-photos": "public",
};

function purposeEnabled(purpose: string): boolean {
  const gate = APP_UPLOAD_PURPOSES[purpose];
  if (gate === "scanned") return isScannedR2Enabled();
  if (gate === "public") return isR2PublicAssetsEnabled();
  return isR2PrivateLinksEnabled();
}

/** Public purposes answer a permanent media address; private ones answer a signed link. */
function isPublicPurpose(purpose: string): boolean {
  return APP_UPLOAD_PURPOSES[purpose] === "public";
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
      // Public purposes (profile photos) get the permanent media address — never a link that
      // expires, because the row keeps it for good. Private ones get a signed address, which the
      // old readers already accept as an http value.
      const address = isPublicPurpose(done.purpose) && done.publicUrl
        ? done.publicUrl
        : await scannedDocAddress(done.key);
      return c.json({
        enabled: true,
        key: done.key,
        address,
        publicUrl: done.publicUrl,
        expiresInSeconds: isPublicPurpose(done.purpose) ? null : FILE_LINK_SECONDS,
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
