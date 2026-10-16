/**
 * Dash admin — Rush settings list / change / pending approve|reject / history / undo.
 * High-risk: queues for a second approver — except platform_owner / superadmin (apply now).
 * Writes validate kind/min/max and enforce editRoles.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import {
  REGISTRY,
  REGISTRY_KEYS,
  assertWritableValue,
  getRegistryEntry,
  type EdgeSettingDef,
} from "../../_shared/rushSettings/index.ts";
import { getDb } from "./merchantAdminShared.ts";

const PLATFORM_SCOPE_ID = "00000000-0000-0000-0000-000000000000";

function adminFromCtx(c: { get: (k: string) => unknown }): ProductAdminUser {
  return c.get("adminUser") as ProductAdminUser;
}

function rushConfig() {
  return getDb().schema("rush_config");
}

function normalizeScopeId(scope: string, scopeId: string | null | undefined): string | null {
  if (scope === "platform") return null;
  return scopeId ?? null;
}

function storageScopeId(scope: string, scopeId: string | null | undefined): string {
  if (scope === "platform") return PLATFORM_SCOPE_ID;
  if (!scopeId) throw new Error("market scope_id required");
  return scopeId;
}

function adminRoles(admin: ProductAdminUser): string[] {
  const roles = admin.roles?.length ? admin.roles : [admin.role];
  return roles.filter(Boolean);
}

/** Highest admins apply high-risk settings immediately (no second-person queue). */
function canBypassHighRiskApproval(admin: ProductAdminUser): boolean {
  return adminRoles(admin).some((r) => r === "platform_owner" || r === "superadmin");
}

/** Server-side editRoles gate — no blanket settings:write override. */
function requireEditRole(
  admin: ProductAdminUser,
  def: EdgeSettingDef,
): Response | null {
  const roles = adminRoles(admin);
  const allowed = def.editRoles ?? [];
  if (allowed.some((r) => roles.includes(r))) return null;
  return new Response(
    JSON.stringify({
      error: "edit_role_forbidden",
      message: "Your role cannot edit this setting",
      editRoles: allowed,
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

function validationError(def: EdgeSettingDef, value: unknown): Response | null {
  const reason = assertWritableValue(def, value);
  if (!reason) return null;
  return new Response(
    JSON.stringify({ error: "invalid_value", reason }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

export function registerSettingsAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  /** GET /admin/settings — values + registry metadata */
  admin.get("/settings", async (c) => {
    const marketId = c.req.query("marketId") || c.req.query("market") || null;
    const db = rushConfig();

    const { data: platformRows, error: pErr } = await db
      .from("setting_values")
      .select("key, scope, scope_id, value, version, updated_by, updated_at")
      .eq("scope", "platform");
    if (pErr) return c.json({ error: pErr.message }, 500);

    let marketRows: typeof platformRows = [];
    if (marketId) {
      const { data, error } = await db
        .from("setting_values")
        .select("key, scope, scope_id, value, version, updated_by, updated_at")
        .eq("scope", "market")
        .eq("scope_id", marketId);
      if (error) return c.json({ error: error.message }, 500);
      marketRows = data ?? [];
    }

    const byKey = new Map<string, Record<string, unknown>>();
    for (const row of platformRows ?? []) {
      byKey.set(String(row.key), { ...row, source: "platform" });
    }
    for (const row of marketRows ?? []) {
      byKey.set(String(row.key), { ...row, source: "market" });
    }

    const { data: pending } = await db
      .from("pending_changes")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);

    const settings = REGISTRY_KEYS.filter((key) => !REGISTRY[key].hidden).map((key) => {
      const def = REGISTRY[key];
      const stored = byKey.get(key);
      return {
        key,
        app: def.app,
        section: def.section,
        kind: def.kind,
        default: def.default,
        scopes: def.scopes,
        clientVisible: def.clientVisible,
        risk: def.risk,
        editRoles: def.editRoles,
        envOverride: def.envOverride ?? null,
        onReadError: def.onReadError,
        value: stored?.value ?? def.default,
        version: stored?.version ?? 0,
        scope: stored?.scope ?? "platform",
        scope_id: stored?.scope_id ?? null,
        updated_by: stored?.updated_by ?? null,
        updated_at: stored?.updated_at ?? null,
        source: stored ? stored.source : "default",
        envActive: def.envOverride
          ? Boolean(Deno.env.get(def.envOverride))
          : false,
      };
    });

    return c.json({ settings, pending: pending ?? [] });
  });

  /** POST /admin/settings/change — apply now or create pending for high risk */
  admin.post("/settings/change", async (c) => {
    const adminUser = adminFromCtx(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const key = String(body.key || "").trim();
    const def = getRegistryEntry(key);
    if (!def) return c.json({ error: "unknown_key" }, 400);
    if (def.hidden) return c.json({ error: "hidden_setting" }, 404);
    if (def.risk === "locked") {
      return c.json({ error: "locked_setting", message: "SQL-only; not editable via admin" }, 403);
    }
    const roleDenied = requireEditRole(adminUser, def);
    if (roleDenied) return roleDenied;

    const scope = String(body.scope || "platform");
    if (scope !== "platform" && scope !== "market") {
      return c.json({ error: "invalid_scope" }, 400);
    }
    if (!def.scopes.includes(scope as "platform" | "market")) {
      return c.json({ error: "scope_not_allowed" }, 400);
    }

    const scopeId = body.scope_id != null ? String(body.scope_id) : null;
    const reason = String(body.reason || "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    if (body.value === undefined) return c.json({ error: "value_required" }, 400);

    const invalid = validationError(def, body.value);
    if (invalid) return invalid;

    const expectedVersion = body.expected_version != null
      ? Number(body.expected_version)
      : 0;
    const effectiveAt = body.effective_at != null ? String(body.effective_at) : null;
    const riskHigh = def.risk === "high";
    const ownerBypass = canBypassHighRiskApproval(adminUser);

    // High risk queues for everyone except platform_owner / superadmin
    if (riskHigh && !ownerBypass) {
      const { data, error } = await rushConfig()
        .from("pending_changes")
        .insert({
          key,
          scope,
          scope_id: normalizeScopeId(scope, scopeId),
          new_value: body.value,
          reason,
          requested_by: adminUser.id,
          expected_version: expectedVersion,
          risk_high: true,
          effective_at: effectiveAt,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ status: "pending", pending: data }, 202);
    }

    // Scheduled future change → pending even if normal risk
    if (effectiveAt && new Date(effectiveAt).getTime() > Date.now() + 5_000) {
      const { data, error } = await rushConfig()
        .from("pending_changes")
        .insert({
          key,
          scope,
          scope_id: normalizeScopeId(scope, scopeId),
          new_value: body.value,
          reason,
          requested_by: adminUser.id,
          expected_version: expectedVersion,
          risk_high: false,
          effective_at: effectiveAt,
          status: "approved",
          decided_by: adminUser.id,
          decided_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ status: "scheduled", pending: data }, 202);
    }

    const result = await rushConfig().rpc("apply_change", {
      p_key: key,
      p_scope: scope,
      p_scope_id: scope === "market" ? scopeId : PLATFORM_SCOPE_ID,
      p_new_value: body.value,
      p_reason: reason,
      p_changed_by: adminUser.id,
      p_expected_version: expectedVersion,
      p_approved_by: null,
      p_risk_high: false,
      p_effective_at: effectiveAt,
    });

    if (result.error) {
      const msg = result.error.message || "apply_failed";
      const status = msg.includes("stale_version")
        ? 409
        : msg.includes("approver") || msg.includes("self_approval")
        ? 403
        : 400;
      return c.json({ error: msg }, status);
    }
    return c.json({ status: "applied", result: result.data });
  });

  /** POST /admin/settings/pending/:id/approve */
  admin.post("/settings/pending/:id/approve", async (c) => {
    const adminUser = adminFromCtx(c);
    const id = c.req.param("id");

    const { data: row, error: loadErr } = await rushConfig()
      .from("pending_changes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "pending") {
      return c.json({ error: "not_pending", status: row.status }, 409);
    }
    const ownerBypass = canBypassHighRiskApproval(adminUser);
    if (row.requested_by === adminUser.id && !ownerBypass) {
      return c.json({ error: "self_approval_forbidden" }, 403);
    }

    const def = getRegistryEntry(String(row.key));
    if (!def) return c.json({ error: "unknown_key" }, 400);
    if (def.risk === "locked" || def.hidden) {
      return c.json({ error: "locked_setting" }, 403);
    }
    const roleDenied = requireEditRole(adminUser, def);
    if (roleDenied) return roleDenied;
    const invalid = validationError(def, row.new_value);
    if (invalid) return invalid;

    const effectiveAt = row.effective_at as string | null;
    const due = !effectiveAt || new Date(effectiveAt).getTime() <= Date.now();
    // Owner self-approve: apply without dual-control flag (DB forbids same actor when risk_high).
    const selfOwnerApprove = row.requested_by === adminUser.id && ownerBypass;

    if (due) {
      const apply = await rushConfig().rpc("apply_change", {
        p_key: row.key,
        p_scope: row.scope,
        p_scope_id: row.scope === "market" ? row.scope_id : PLATFORM_SCOPE_ID,
        p_new_value: row.new_value,
        p_reason: selfOwnerApprove
          ? `${row.reason} (platform_owner self-approve)`
          : row.reason,
        p_changed_by: row.requested_by,
        p_expected_version: row.expected_version ?? 0,
        p_approved_by: selfOwnerApprove ? null : adminUser.id,
        p_risk_high: selfOwnerApprove ? false : Boolean(row.risk_high),
        p_effective_at: effectiveAt,
      });
      if (apply.error) {
        return c.json({ error: apply.error.message }, 400);
      }
      await rushConfig()
        .from("pending_changes")
        .update({
          status: "applied",
          decided_by: adminUser.id,
          decided_at: new Date().toISOString(),
        })
        .eq("id", id);
      return c.json({ status: "applied", result: apply.data });
    }

    const { data, error } = await rushConfig()
      .from("pending_changes")
      .update({
        status: "approved",
        decided_by: adminUser.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ status: "approved", pending: data });
  });

  /** POST /admin/settings/pending/:id/reject */
  admin.post("/settings/pending/:id/reject", async (c) => {
    const adminUser = adminFromCtx(c);
    const id = c.req.param("id");

    const { data: row, error: loadErr } = await rushConfig()
      .from("pending_changes")
      .select("id, status, key")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "pending" && row.status !== "approved") {
      return c.json({ error: "not_rejectable", status: row.status }, 409);
    }

    const def = getRegistryEntry(String(row.key));
    if (def) {
      const roleDenied = requireEditRole(adminUser, def);
      if (roleDenied) return roleDenied;
    }

    const { data, error } = await rushConfig()
      .from("pending_changes")
      .update({
        status: "rejected",
        decided_by: adminUser.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ status: "rejected", pending: data });
  });

  /** GET /admin/settings/history */
  admin.get("/settings/history", async (c) => {
    const key = c.req.query("key");
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    let q = rushConfig()
      .from("setting_changes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (key) q = q.eq("key", key);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ history: data ?? [] });
  });

  /** POST /admin/settings/undo — re-apply previous value from a history row */
  admin.post("/settings/undo", async (c) => {
    const adminUser = adminFromCtx(c);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const changeId = body.change_id != null ? Number(body.change_id) : NaN;
    if (!Number.isFinite(changeId)) {
      return c.json({ error: "change_id_required" }, 400);
    }
    const reason = String(body.reason || "Undo").trim();

    const { data: hist, error: hErr } = await rushConfig()
      .from("setting_changes")
      .select("*")
      .eq("id", changeId)
      .maybeSingle();
    if (hErr) return c.json({ error: hErr.message }, 500);
    if (!hist) return c.json({ error: "not_found" }, 404);
    if (hist.old_value === null || hist.old_value === undefined) {
      return c.json({ error: "nothing_to_undo" }, 400);
    }

    const def = getRegistryEntry(String(hist.key));
    if (!def) return c.json({ error: "unknown_key" }, 400);
    if (def.risk === "locked" || def.hidden) {
      return c.json({ error: "locked_setting" }, 403);
    }
    const roleDenied = requireEditRole(adminUser, def);
    if (roleDenied) return roleDenied;
    const invalid = validationError(def, hist.old_value);
    if (invalid) return invalid;

    const riskHigh = def.risk === "high" && !canBypassHighRiskApproval(adminUser);
    const scope = String(hist.scope);
    const scopeId = hist.scope_id as string | null;

    const sid = storageScopeId(scope, scopeId);
    const { data: current } = await rushConfig()
      .from("setting_values")
      .select("version")
      .eq("key", hist.key)
      .eq("scope", scope)
      .eq("scope_id", sid)
      .maybeSingle();

    if (riskHigh) {
      const { data, error } = await rushConfig()
        .from("pending_changes")
        .insert({
          key: hist.key,
          scope,
          scope_id: normalizeScopeId(scope, scopeId),
          new_value: hist.old_value,
          reason,
          requested_by: adminUser.id,
          expected_version: current?.version ?? 0,
          risk_high: true,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ status: "pending", pending: data }, 202);
    }

    const result = await rushConfig().rpc("apply_change", {
      p_key: hist.key,
      p_scope: scope,
      p_scope_id: sid,
      p_new_value: hist.old_value,
      p_reason: reason,
      p_changed_by: adminUser.id,
      p_expected_version: current?.version ?? 0,
      p_approved_by: null,
      p_risk_high: false,
      p_effective_at: null,
    });
    if (result.error) {
      return c.json({ error: result.error.message }, 400);
    }
    return c.json({ status: "applied", result: result.data });
  });

  /** GET /admin/settings/integrations — health ping or registry defaults (masked). */
  admin.get("/settings/integrations", async (c) => {
    const { getSetting } = await import("../../_shared/rushSettings/getSetting.ts");
    type IntegrationStatus = {
      payments: "connected" | "failing" | "unknown";
      sms: "connected" | "failing" | "unknown";
      maps: "connected" | "failing" | "unknown";
      push: "connected" | "failing" | "unknown";
      lastSuccessAt: string | null;
      maskedKeyHint: string;
    };

    const base = await getSetting<IntegrationStatus>("enterprise.integrations.status");
    const status: IntegrationStatus = {
      payments: base?.payments ?? "unknown",
      sms: base?.sms ?? "unknown",
      maps: base?.maps ?? "unknown",
      push: base?.push ?? "unknown",
      lastSuccessAt: base?.lastSuccessAt ?? null,
      maskedKeyHint: base?.maskedKeyHint ?? "",
    };

    const hasWipay = Boolean(Deno.env.get("WIPAY_API_KEY") || Deno.env.get("WIPAY_ACCOUNT_NUMBER"));
    const hasSms = Boolean(
      Deno.env.get("DIGICEL_SMS_API_KEY") || Deno.env.get("FLOW_SMS_API_KEY"),
    );
    const hasMaps = Boolean(
      Deno.env.get("GOOGLE_MAPS_API_KEY") || Deno.env.get("MAPBOX_ACCESS_TOKEN"),
    );
    if (status.payments === "unknown" && hasWipay) status.payments = "connected";
    if (status.sms === "unknown" && hasSms) status.sms = "connected";
    if (status.maps === "unknown" && hasMaps) status.maps = "connected";

    const mask = (raw: string | undefined) => {
      if (!raw) return "";
      if (raw.length <= 6) return "***";
      return `${raw.slice(0, 3)}…${raw.slice(-2)}`;
    };
    status.maskedKeyHint = [
      hasWipay ? `pay:${mask(Deno.env.get("WIPAY_API_KEY"))}` : null,
      hasSms ? `sms:${mask(Deno.env.get("DIGICEL_SMS_API_KEY") || Deno.env.get("FLOW_SMS_API_KEY"))}` : null,
    ].filter(Boolean).join(" ");

    return c.json({ integrations: status });
  });

  /** POST /admin/settings/export — all setting_values + latest history id. */
  admin.post("/settings/export", async (c) => {
    const adminUser = adminFromCtx(c);
    const roles = adminRoles(adminUser);
    if (!roles.some((r) => ["platform_owner", "superadmin", "dash_admin"].includes(r))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { getSetting } = await import("../../_shared/rushSettings/getSetting.ts");
    type ExportFlags = { exportEnabled: boolean; importEnabled: boolean };
    const flags = await getSetting<ExportFlags>("enterprise.settings.export_import");
    void flags;

    const { data: values, error } = await rushConfig()
      .from("setting_values")
      .select("key, scope, scope_id, value, version, updated_by, updated_at");
    if (error) return c.json({ error: error.message }, 500);

    const { data: latestHist } = await rushConfig()
      .from("setting_changes")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return c.json({
      exportedAt: new Date().toISOString(),
      historyId: latestHist?.id ?? null,
      values: values ?? [],
      exportEnabled: flags?.exportEnabled ?? false,
    });
  });

  /**
   * POST /admin/settings/import — platform_owner only (staging promote).
   * Body: { values: [...], dryRun?: boolean }
   * High-risk keys → pending; locked keys rejected.
   */
  admin.post("/settings/import", async (c) => {
    const adminUser = adminFromCtx(c);
    const roles = adminRoles(adminUser);
    const isOwner = roles.includes("platform_owner") || roles.includes("superadmin");
    if (!isOwner) {
      return c.json({ error: "platform_owner_required" }, 403);
    }

    const { getSetting } = await import("../../_shared/rushSettings/getSetting.ts");
    type ExportFlags = { exportEnabled: boolean; importEnabled: boolean };
    const flags = await getSetting<ExportFlags>("enterprise.settings.export_import");

    const body = await c.req.json().catch(() => ({})) as {
      values?: Array<{ key: string; scope?: string; scope_id?: string | null; value: unknown }>;
      dryRun?: boolean;
    };
    const incoming = Array.isArray(body.values) ? body.values : [];
    const dryRun = body.dryRun !== false;

    const { data: current, error } = await rushConfig()
      .from("setting_values")
      .select("key, scope, scope_id, value, version");
    if (error) return c.json({ error: error.message }, 500);

    const curMap = new Map(
      (current ?? []).map((r) => [
        `${r.key}|${r.scope}|${r.scope_id ?? PLATFORM_SCOPE_ID}`,
        r,
      ]),
    );

    const diffs: Array<{
      key: string;
      scope: string;
      scope_id: string | null;
      from: unknown;
      to: unknown;
      action: "add" | "change" | "unchanged" | "skipped_locked" | "pending_high_risk";
      skipReason?: string;
    }> = [];

    for (const row of incoming) {
      const key = String(row.key || "").trim();
      const def = getRegistryEntry(key);
      if (!key || !def) continue;
      const scope = String(row.scope || "platform");
      const scopeId = scope === "platform" ? null : (row.scope_id ?? null);
      const mapKey = `${key}|${scope}|${scopeId ?? PLATFORM_SCOPE_ID}`;
      const existing = curMap.get(mapKey);
      const same = existing &&
        JSON.stringify(existing.value) === JSON.stringify(row.value);

      if (def.risk === "locked" || def.hidden) {
        diffs.push({
          key,
          scope,
          scope_id: scopeId,
          from: existing?.value ?? null,
          to: row.value,
          action: "skipped_locked",
          skipReason: def.hidden ? "hidden" : "locked_sql_only",
        });
        continue;
      }

      const invalid = assertWritableValue(def, row.value);
      if (invalid) {
        diffs.push({
          key,
          scope,
          scope_id: scopeId,
          from: existing?.value ?? null,
          to: row.value,
          action: "skipped_locked",
          skipReason: invalid,
        });
        continue;
      }

      diffs.push({
        key,
        scope,
        scope_id: scopeId,
        from: existing?.value ?? null,
        to: row.value,
        action: !existing ? "add" : same ? "unchanged" : "change",
      });
    }

    if (dryRun || flags?.importEnabled === false) {
      return c.json({
        dryRun: true,
        importEnabled: flags?.importEnabled ?? false,
        diffCount: diffs.filter((d) => d.action !== "unchanged").length,
        diffs,
      });
    }

    let applied = 0;
    let pending = 0;
    let skipped = 0;
    for (const d of diffs) {
      if (d.action === "unchanged") continue;
      if (d.action === "skipped_locked") {
        skipped += 1;
        continue;
      }
      const def = getRegistryEntry(d.key)!;
      const roleDenied = requireEditRole(adminUser, def);
      if (roleDenied) {
        skipped += 1;
        continue;
      }

      const sid = storageScopeId(d.scope, d.scope_id);
      const expectedVersion = curMap.get(
        `${d.key}|${d.scope}|${d.scope_id ?? PLATFORM_SCOPE_ID}`,
      )?.version ?? 0;

      if (def.risk === "high" && !canBypassHighRiskApproval(adminUser)) {
        const { error: pErr } = await rushConfig()
          .from("pending_changes")
          .insert({
            key: d.key,
            scope: d.scope,
            scope_id: normalizeScopeId(d.scope, d.scope_id),
            new_value: d.to,
            reason: "settings import",
            requested_by: adminUser.id,
            expected_version: expectedVersion,
            risk_high: true,
            status: "pending",
          });
        if (!pErr) {
          pending += 1;
          d.action = "pending_high_risk";
        } else {
          skipped += 1;
        }
        continue;
      }

      const result = await rushConfig().rpc("apply_change", {
        p_key: d.key,
        p_scope: d.scope,
        p_scope_id: sid,
        p_new_value: d.to,
        p_reason: "settings import",
        p_changed_by: adminUser.id,
        p_expected_version: expectedVersion,
        p_approved_by: null,
        p_risk_high: false,
        p_effective_at: null,
      });
      if (!result.error) applied += 1;
      else skipped += 1;
    }

    return c.json({ dryRun: false, applied, pending, skipped, diffs });
  });

  app.route("/admin", admin);
}
