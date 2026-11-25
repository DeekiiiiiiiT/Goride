/**
 * Fuel log offline-first — S6 run route + S10 driver numbers (docs/fuel-log-offline-first-audit.md).
 *
 * POST /fuel/photo-read/run                         scheduler only (fleet-fuel-cron, every 10 min)
 * POST /fuel/driver-fill/:transactionId/numbers      driver adds total / litres or a new pump photo
 * POST /fuel/fill/:transactionId/numbers             Fleet "Save numbers" in the Review Queue (fuel.edit_entry)
 */
import type { Context, Hono } from "npm:hono@4.3.11";
import OpenAI from "npm:openai";
import * as kv from "./kv_store.tsx";
import * as gemini from "./gemini_service.ts";
import { trackedProviderCall } from "./api_usage_logger.ts";
import { getServiceClient } from "./service_client.ts";
import type { RbacUser } from "./rbac_middleware.ts";
import { requirePermission } from "./rbac_middleware.ts";
import { belongsToOrg } from "./org_scope.ts";
import { authorizeCronOrServiceRole } from "../_shared/authorizeCronOrServiceRole.ts";
import { odometerVisionBody, parseOdometerVision } from "../_shared/odometerVision.ts";
import {
  applyDriverNumbers,
  applyFleetNumbers,
  canDriverAddNumbers,
  canFleetAddNumbers,
  PHOTO_READ_WAITING,
} from "./fuel_offline_fill.ts";
import { bytesToDataUrl, runFuelPhotoReader, type PhotoReaderDeps } from "./fuel_photo_reader.ts";

type Rec = Record<string, unknown>;

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_FETCH_TIMEOUT_MS = 20_000;

async function openPhoto(url: string): Promise<string> {
  if (!/^https:\/\//i.test(url)) throw new Error("photo address is not https");
  const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  if (!type.startsWith("image/")) throw new Error(`photo is ${type}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) throw new Error("photo size");
  return bytesToDataUrl(bytes, type);
}

async function readOdometer(dataUrl: string): Promise<number | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OpenAI key missing");
  const openai = new OpenAI({ apiKey });
  // deno-lint-ignore no-explicit-any
  const response: any = await trackedProviderCall({
    provider: "openai",
    service: "vision",
    route: "fuel_photo_reader/odometer",
    model: "gpt-4o",
    run: () => openai.chat.completions.create(odometerVisionBody(dataUrl), { signal: AbortSignal.timeout(40_000) }),
    // deno-lint-ignore no-explicit-any
    extractUsage: (r: any) => ({
      inputTokens: r?.usage?.prompt_tokens,
      outputTokens: r?.usage?.completion_tokens,
      requestId: r?.id,
    }),
  });
  return parseOdometerVision(response?.choices?.[0]?.message?.content || "{}").reading;
}

async function readPump(dataUrl: string) {
  const r = await gemini.processFuelReceiptVision(dataUrl);
  return { amount: r.amount ?? null, liters: r.liters ?? null, odometer: r.odometer ?? null };
}

function productionDeps(): PhotoReaderDeps {
  const db = getServiceClient();
  return {
    claim: async (limit) => {
      const { data, error } = await db.rpc("fuel_photo_read_claim", { p_limit: limit });
      if (error) throw new Error(`claim failed: ${error.message}`);
      return (data || []) as Array<{ transaction_id: string; organization_id: string | null; attempts: number }>;
    },
    finish: async (id, outcome, lastError, retryAt) => {
      const { error } = await db.rpc("fuel_photo_read_finish", {
        p_transaction_id: id,
        p_outcome: outcome,
        p_last_error: lastError,
        p_retry_at: retryAt,
      });
      if (error) console.warn("[photo-read] finish failed", id, error.message);
    },
    loadFill: async (id) => (await kv.get(`transaction:${id}`)) as Rec | null,
    saveFill: (fill) => kv.set(`transaction:${String(fill.id)}`, fill),
    openPhoto,
    readPump,
    readOdometer,
    now: () => new Date(),
  };
}

/**
 * Put a fill on the reader's queue. DSH CR-07: throws on failure, so the request fails and the
 * phone keeps the fill and sends it again (the re-send puts it on the queue then).
 */
export async function enqueueFuelPhotoRead(transactionId: string, organizationId: string | null | undefined): Promise<void> {
  const { error } = await getServiceClient().rpc("fuel_photo_read_enqueue", {
    p_transaction_id: transactionId,
    p_organization_id: organizationId ?? null,
  });
  if (error) throw new Error(`photo read queue: ${error.message}`);
}

/** Every id the signed-in driver can appear under on a fill. */
async function callerDriverIds(user: RbacUser): Promise<string[]> {
  const ids = new Set<string>([user.userId]);
  try {
    const { data } = await getServiceClient()
      .from("fleet_drivers")
      .select("id")
      .eq("user_id", user.userId)
      .limit(5);
    for (const d of (data || []) as Rec[]) if (d.id) ids.add(String(d.id));
  } catch {
    // Sign-in id alone is still checked.
  }
  return [...ids];
}

// deno-lint-ignore no-explicit-any
export function registerFuelPhotoReaderRoutes(app: Hono<any>, BASE_PATH: string): void {
  app.post(`${BASE_PATH}/fuel/photo-read/run`, async (c: Context) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    try {
      const result = await runFuelPhotoReader(productionDeps());
      return c.json({ success: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[photo-read] run failed", msg);
      return c.json({ error: msg }, 500);
    }
  });

  app.post(`${BASE_PATH}/fuel/driver-fill/:transactionId/numbers`, async (c: Context) => {
    const rbacUser = c.get("rbacUser") as RbacUser | undefined;
    if (!rbacUser) return c.json({ error: "Unauthorized: No user context" }, 401);
    const id = String(c.req.param("transactionId") || "").trim();
    if (!id) return c.json({ error: "Fill id required" }, 400);

    const fill = (await kv.get(`transaction:${id}`)) as Rec | null;
    if (!fill) return c.json({ error: "Not found" }, 404);
    if (!canDriverAddNumbers(fill, await callerDriverIds(rbacUser))) {
      return c.json({ error: "Forbidden", message: "Only the driver can add numbers to their own fill while it waits." }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Rec;
    const next = applyDriverNumbers(fill, {
      total: body.total,
      liters: body.liters,
      pumpPhotoUrl: body.pumpPhotoUrl,
    }, new Date().toISOString());
    if ("error" in next) return c.json({ error: next.error }, 400);

    await kv.set(`transaction:${id}`, next);
    if ((next.metadata as Rec | undefined)?.photoReadStatus === PHOTO_READ_WAITING) {
      await enqueueFuelPhotoRead(id, String(fill.organizationId || "") || null);
    }
    return c.json({ success: true, data: next });
  });

  // Fleet Review Queue "Save numbers". "Save and approve" = this, then the existing approve.
  app.post(`${BASE_PATH}/fuel/fill/:transactionId/numbers`, requirePermission("fuel.edit_entry"), async (c: Context) => {
    const rbacUser = c.get("rbacUser") as RbacUser | undefined;
    const id = String(c.req.param("transactionId") || "").trim();
    if (!id) return c.json({ error: "Fill id required" }, 400);
    const fill = (await kv.get(`transaction:${id}`)) as Rec | null;
    if (!fill || !belongsToOrg(fill, c)) return c.json({ error: "Not found" }, 404);
    if (!canFleetAddNumbers(fill)) {
      return c.json({ error: "This fill isn't waiting for numbers." }, 409);
    }
    const body = await c.req.json().catch(() => ({})) as Rec;
    const next = applyFleetNumbers(fill, { total: body.total, liters: body.liters }, String(rbacUser?.userId || ""), new Date().toISOString());
    if ("error" in next) return c.json({ error: next.error }, 400);
    await kv.set(`transaction:${id}`, next);
    return c.json({ success: true, data: next });
  });
}
