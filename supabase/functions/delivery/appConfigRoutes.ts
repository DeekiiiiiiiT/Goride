/**
 * GET /app-config — client-visible Rush settings for customer | courier | partner apps.
 * User comes from Authorization (never query userId). Rollout never leaks betaUserIds.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clientVisibleEntries,
  getConfigVersionHash,
  getSetting,
} from "../_shared/rushSettings/index.ts";
import {
  evaluateRollout,
  getResolvedBusyMode,
  type Rollout,
} from "../_shared/rushSettings/enterpriseReaders.ts";

const APPS = new Set(["customer", "courier", "partner"]);

export type AppConfigDeps = {
  getServiceSupabase: () => SupabaseClient;
};

function settingBelongsToApp(key: string, app: string, settingApp: string): boolean {
  if (settingApp === app) return true;
  if (settingApp === "platform") {
    if (key.includes(`.${app}`) || key.endsWith(`.${app}`)) return true;
    if (
      key === "platform.locale" ||
      key === "enterprise.hours.service" ||
      key === "enterprise.hours.holidays" ||
      key === "enterprise.busy_mode" ||
      key === "enterprise.accounts.limits" ||
      key === `enterprise.rollouts.${app}` ||
      (app === "partner" && key === "enterprise.partner.devices") ||
      (app === "courier" && key === "enterprise.courier.compliance")
    ) {
      return true;
    }
  }
  return false;
}

async function resolveAuthUserId(
  authHeader: string | undefined,
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function handleAppConfig(
  c: {
    req: {
      query: (k: string) => string | undefined;
      header: (k: string) => string | undefined;
    };
    json: (b: unknown, s?: number) => Response;
  },
  deps: AppConfigDeps,
): Promise<Response> {
  const app = String(c.req.query("app") || "").trim().toLowerCase();
  if (!APPS.has(app)) {
    return c.json({ error: "app query must be customer|courier|partner" }, 400);
  }
  const marketId = c.req.query("market") || c.req.query("marketId") || null;
  // Ignore query userId/user — rollout identity only from the signed-in token
  const userId = await resolveAuthUserId(c.req.header("Authorization"));
  const sb = deps.getServiceSupabase();
  const version = await getConfigVersionHash(sb);
  const etag = `"${version}-${app}-${marketId ?? "all"}-${userId ?? "anon"}"`;
  const cacheControl = userId
    ? "private, max-age=60"
    : "public, max-age=60";

  const ifNone = c.req.header("If-None-Match");
  if (ifNone && ifNone === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": cacheControl,
      },
    });
  }

  const settings: Record<string, unknown> = {};
  for (const { key, def } of clientVisibleEntries()) {
    if (def.hidden) continue;
    if (!settingBelongsToApp(key, app, def.app)) continue;
    settings[key] = await getSetting(key, { marketId, supabase: sb });
  }

  const busy = await getResolvedBusyMode({ marketId, supabase: sb });
  settings["enterprise.busy_mode"] = busy;

  const rolloutKey = `enterprise.rollouts.${app}`;
  const rolloutRaw = (settings[rolloutKey] ?? {
    mode: "on",
    percent: 100,
    betaUserIds: [],
  }) as Rollout;
  const rolloutEnabled = evaluateRollout(rolloutRaw, userId);

  const announcementKey = `platform.announcement.${app}`;
  const existingAnnouncements = Array.isArray(settings[announcementKey])
    ? [...(settings[announcementKey] as unknown[])]
    : [];
  if (busy.active && busy.bannerMessage) {
    existingAnnouncements.unshift({
      id: "enterprise-busy-mode",
      type: "warning",
      message: busy.bannerMessage,
      dismissible: true,
      startAt: null,
      endAt: busy.autoEndAt,
    });
    settings[announcementKey] = existingAnnouncements;
  }

  const body = {
    version,
    app,
    marketId,
    settings,
    features: {
      busy: {
        active: busy.active,
        extraEtaMinutes: busy.extraEtaMinutes,
        pauseNewRestaurants: busy.pauseNewRestaurants,
        bannerMessage: busy.bannerMessage,
        autoEndAt: busy.autoEndAt,
      },
      // Never expose betaUserIds to clients
      rollout: {
        mode: rolloutRaw.mode,
        percent: rolloutRaw.percent,
        enabled: rolloutEnabled,
      },
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": cacheControl,
    },
  });
}

/** Mount GET /app-config on the delivery Hono app. */
export function registerAppConfigRoutes(app: Hono, deps: AppConfigDeps): void {
  app.get("/app-config", (c) => handleAppConfig(c, deps));
}
