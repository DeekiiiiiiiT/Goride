/**
 * Week calculator status for roamfleet.co/admin.
 * Starts itself. This page reports that, and can stop it in an emergency.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "./product_admin_guard.ts";
import {
  LARGER_FLEET_HOLD_NOTE,
  WEEK_CALCULATOR_COST_NOTE,
  largerFleetHold,
  latestNights,
  weekCalculatorStatus,
  type WeekCalculatorNight,
  type WeekCalculatorState,
} from "./recon_worker_switch.ts";
import {
  RECON_WORKER_API,
  googleAccessToken,
  readServiceAccount,
} from "./recon_worker_google.ts";

const PREFIX = "/make-server-37f42386/fleet-admin/recon-worker";
const FLIP_ROLES = new Set(["platform_owner", "fleet_admin", "superadmin"]);

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
};

type SwitchBody = {
  connected: boolean;
  state: WeekCalculatorState;
  message: string;
  canFlip: boolean;
  closeRunning: boolean;
  queueWaiting: number;
  nights: WeekCalculatorNight[];
  holdLargerFleets: boolean;
  holdNote: string;
  costNote: string;
  warning?: string | null;
};

type StatusRow = {
  emergencyOff?: boolean;
  queueWaiting?: number;
  closeRunning?: boolean;
  nightlyInProgress?: boolean;
};

async function waitForOperation(token: string, name: string): Promise<void> {
  const path = name.startsWith("projects/") ? name : name;
  const url = path.startsWith("https://") ? path : `https://run.googleapis.com/v2/${path}`;
  for (let i = 0; i < 20; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error("[recon-worker-switch] operation read failed", res.status);
      throw new Error("Google could not change the week calculator. Try again.");
    }
    const body = await res.json() as { done?: boolean; error?: unknown };
    if (body.done && body.error) {
      console.error("[recon-worker-switch] operation failed");
      throw new Error("Google could not change the week calculator. Try again.");
    }
    if (body.done) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Emergency stop only. Resume does not pin a computer on. */
async function scaleToZero(): Promise<void> {
  const sa = readServiceAccount();
  if (!sa) throw new Error("The switch is not connected yet.");
  const token = await googleAccessToken(sa);
  const res = await fetch(`${RECON_WORKER_API}?updateMask=template.scaling.minInstanceCount`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ template: { scaling: { minInstanceCount: 0 } } }),
  });
  const body = await res.json().catch(() => ({})) as { name?: string; done?: boolean; error?: unknown };
  if (!res.ok || body.error) {
    console.error("[recon-worker-switch] google update failed", res.status);
    throw new Error("Google could not change the week calculator. Try again.");
  }
  if (body.name && body.done !== true) await waitForOperation(token, body.name);
}

async function readNights(supabase: SupabaseClient): Promise<WeekCalculatorNight[]> {
  const { data, error } = await supabase
    .schema("recon")
    .from("worker_alerts")
    .select("kind, created_at, detail")
    .in("kind", ["shadow_ok", "shadow_mismatch"])
    .order("created_at", { ascending: false })
    .limit(21);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ kind: string; created_at: string; detail?: { mismatches?: number } }>).map((row) => ({
    at: row.created_at,
    kind: row.kind,
    mismatches: Number(row.detail?.mismatches || 0),
  }));
}

async function buildStatus(supabase: SupabaseClient, auth: ProductAdminUser): Promise<SwitchBody> {
  const emptyNights: WeekCalculatorNight[] = [];
  const base = {
    canFlip: FLIP_ROLES.has(auth.role),
    closeRunning: false,
    queueWaiting: 0,
    nights: emptyNights,
    holdLargerFleets: true,
    holdNote: LARGER_FLEET_HOLD_NOTE,
    costNote: WEEK_CALCULATOR_COST_NOTE,
  };
  const { data, error } = await supabase.rpc("recon_worker_status");
  if (error || !data) {
    return {
      ...base,
      ...weekCalculatorStatus({
        connected: false,
        emergencyOff: false,
        queueWaiting: 0,
        closeRunning: false,
        nightlyInProgress: false,
        lastFinishKind: null,
      }),
      connected: false,
    };
  }
  const row = data as StatusRow;
  const nights = await readNights(supabase);
  const last = nights[0];
  const lastFinishKind = last?.kind === "shadow_ok" || last?.kind === "shadow_mismatch" ? last.kind : null;
  const status = weekCalculatorStatus({
    connected: true,
    emergencyOff: Boolean(row.emergencyOff),
    queueWaiting: Number(row.queueWaiting || 0),
    closeRunning: Boolean(row.closeRunning),
    nightlyInProgress: Boolean(row.nightlyInProgress),
    lastFinishKind,
  });
  return {
    ...base,
    ...status,
    connected: true,
    closeRunning: Boolean(row.closeRunning),
    queueWaiting: Number(row.queueWaiting || 0),
    nights: latestNights(nights),
    holdLargerFleets: largerFleetHold(nights, new Date().toISOString()),
  };
}

export function registerReconWorkerSwitchRoutes(app: RouteApp, supabase: SupabaseClient) {
  app.get(PREFIX, async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      return c.json(await buildStatus(supabase, auth));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not read the week calculator.";
      return c.json({ error: message }, 500);
    }
  });

  for (const on of [true, false] as const) {
    app.post(`${PREFIX}/${on ? "on" : "off"}`, async (c: Context) => {
      try {
        const auth = await requireProductAdmin(c, "fleet");
        if (auth instanceof Response) return auth;
        if (!FLIP_ROLES.has(auth.role)) {
          return c.json({ error: "Only the fleet owner can stop or resume this." }, 403);
        }
        const stopping = !on;
        const { error } = await supabase.schema("recon").from("worker_control").update({
          emergency_off: stopping,
          updated_at: new Date().toISOString(),
        }).eq("id", 1);
        if (error) throw new Error(error.message);
        const { error: alertError } = await supabase.schema("recon").from("worker_alerts").insert({
          kind: stopping ? "emergency_off" : "emergency_resume",
          detail: { by: auth.email, userId: auth.id },
        });
        if (alertError) console.error("[recon-worker-switch] alert insert failed");
        let warning: string | null = null;
        if (stopping) {
          try {
            await scaleToZero();
          } catch (e) {
            console.error("[recon-worker-switch] scale to zero failed", e instanceof Error ? e.message : e);
            warning = "Stopped. If a computer was left on from before, it could not be reached, so it may keep running until the next deploy.";
          }
        }
        return c.json({ ...(await buildStatus(supabase, auth)), warning });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not change the week calculator.";
        return c.json({ error: message }, 500);
      }
    });
  }
}
