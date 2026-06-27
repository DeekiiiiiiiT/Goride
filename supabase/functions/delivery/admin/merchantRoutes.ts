/**
 * Dash admin — merchant verification, lifecycle, dashboard stats.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { extendAdminMerchantDetail } from "../merchant_application_routes.ts";
import {
  generateRecoveryLink,
  recoveryRedirectForProduct,
} from "../../_shared/authRecoveryRedirects.ts";
import {
  canForceApproveMerchant,
  requireDashDelete,
  requireDashWrite,
} from "./dashPermissions.ts";
import { mountDashTeamRoutes } from "./dashTeamRoutes.ts";
import { mountOnboardingConfigAdminRoutes } from "./onboardingConfigRoutes.ts";
import {
  ALLOWED_TRANSITIONS,
  canSuspendMerchant,
  canTransitionOperational,
  getAuthAdmin,
  getDb,
  isChecklistComplete,
  isValidStatus,
  logMerchantAudit,
  renderStatusEmail,
  sendNotificationEmail,
  writeKvAudit,
  type OperationalStatus,
  type VerificationStatus,
} from "./merchantAdminShared.ts";
import {
  computeSetupChecklist,
  isApplicationSetupComplete,
  missingSetupLabels,
  setupStageLabel,
  type SetupChecklist,
} from "./merchantSetupProgress.ts";
import { incompleteSetupStageLabel } from "../partnerOnboarding.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLA_HOURS = 48;

function adminFromCtx(c: { get: (k: string) => unknown }): ProductAdminUser {
  return c.get("adminUser") as ProductAdminUser;
}

async function fetchOwnerEmail(ownerId: string): Promise<string> {
  if (!ownerId) return "";
  try {
    const { data } = await getAuthAdmin().auth.admin.getUserById(ownerId);
    return data?.user?.email || "";
  } catch {
    return "";
  }
}

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

async function checklistMapForMerchants(
  merchants: Record<string, unknown>[],
): Promise<Map<string, SetupChecklist>> {
  const ids = merchants.map((m) => m.id as string).filter(Boolean);
  const result = new Map<string, SetupChecklist>();
  if (!ids.length) return result;

  const sb = getDb();
  const pdb = getPaymentsDb();

  const [{ data: documents }, { data: hours }, { data: items }, { data: banks }] = await Promise.all([
    sb.from("merchant_documents").select("merchant_id, doc_type").in("merchant_id", ids),
    sb.from("merchant_hours").select("merchant_id").in("merchant_id", ids),
    sb.from("menu_items").select("merchant_id").in("merchant_id", ids),
    pdb.from("merchant_bank_accounts").select("merchant_id").in("merchant_id", ids).eq("is_default", true),
  ]);

  const docsByMerchant = new Map<string, string[]>();
  for (const row of documents ?? []) {
    const mid = (row as Record<string, unknown>).merchant_id as string;
    const docType = (row as Record<string, unknown>).doc_type as string;
    if (!docsByMerchant.has(mid)) docsByMerchant.set(mid, []);
    docsByMerchant.get(mid)!.push(docType);
  }

  const hoursCount = new Map<string, number>();
  for (const row of hours ?? []) {
    const mid = (row as Record<string, unknown>).merchant_id as string;
    hoursCount.set(mid, (hoursCount.get(mid) ?? 0) + 1);
  }

  const menuCount = new Map<string, number>();
  for (const row of items ?? []) {
    const mid = (row as Record<string, unknown>).merchant_id as string;
    menuCount.set(mid, (menuCount.get(mid) ?? 0) + 1);
  }

  const bankSet = new Set(
    (banks ?? []).map((row) => (row as Record<string, unknown>).merchant_id as string),
  );

  for (const merchant of merchants) {
    const id = merchant.id as string;
    result.set(
      id,
      computeSetupChecklist({
        merchant,
        documentTypes: docsByMerchant.get(id) ?? [],
        hoursCount: hoursCount.get(id) ?? 0,
        menuItemCount: menuCount.get(id) ?? 0,
        hasBank: bankSet.has(id),
      }),
    );
  }

  return result;
}

async function notifyMerchant(
  sb: ReturnType<typeof getDb>,
  merchantId: string,
  title: string,
  body: string,
  type = "admin_action",
) {
  await sb.from("merchant_notifications").insert({
    merchant_id: merchantId,
    type,
    title,
    body,
  });
}

export function registerMerchantAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/dashboard/stats", async (c) => {
    const sb = getDb();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const slaCutoff = new Date(now.getTime() - SLA_HOURS * 60 * 60 * 1000).toISOString();

    const [
      { data: merchants },
      { data: ordersToday },
      { data: liveOrders },
      { data: slaPending },
    ] = await Promise.all([
      sb.from("merchants").select("verification_status, operational_status, onboarding_status"),
      sb.from("orders").select("id, total").gte("placed_at", todayStart),
      sb.from("orders").select("id").in("status", [
        "placed", "accepted", "preparing", "ready", "picked_up", "in_transit",
      ]),
      sb.from("merchants").select("id")
        .eq("onboarding_status", "submitted")
        .in("verification_status", ["pending", "in_review", "docs_requested"])
        .lt("submitted_at", slaCutoff),
    ]);

    const verificationCounts: Record<string, number> = {
      pending: 0, in_review: 0, docs_requested: 0, approved: 0, rejected: 0,
    };
    const operationalCounts: Record<string, number> = {
      active: 0, suspended: 0, deactivated: 0,
    };
    for (const m of merchants ?? []) {
      const row = m as Record<string, unknown>;
      if (row.onboarding_status === "draft") continue;
      const vs = row.verification_status as string;
      const os = row.operational_status as string;
      if (vs && vs in verificationCounts) verificationCounts[vs]++;
      if (os && os in operationalCounts) operationalCounts[os]++;
    }

    const todayGmv = (ordersToday ?? []).reduce(
      (sum, o) => sum + Number((o as Record<string, unknown>).total ?? 0),
      0,
    );

    return c.json({
      merchants: {
        total: (merchants ?? []).filter((m) => (m as Record<string, unknown>).onboarding_status !== "draft").length,
        verification: verificationCounts,
        operational: operationalCounts,
      },
      orders: {
        todayCount: (ordersToday ?? []).length,
        todayGmv,
        liveCount: (liveOrders ?? []).length,
      },
      sla: {
        staleVerifications: (slaPending ?? []).length,
      },
    });
  });

  admin.get("/merchants/stats", async (c) => {
    const sb = getDb();
    const { data, error } = await sb.from("merchants").select("verification_status, operational_status, onboarding_status");
    if (error) return c.json({ error: error.message }, 500);
    const counts: Record<string, number> = {
      pending: 0, in_review: 0, docs_requested: 0, approved: 0, rejected: 0,
    };
    const operational: Record<string, number> = { active: 0, suspended: 0, deactivated: 0 };
    for (const row of data || []) {
      const r = row as Record<string, unknown>;
      if (r.onboarding_status === "draft") continue;
      const s = r.verification_status as string;
      const o = r.operational_status as string;
      if (s && s in counts) counts[s]++;
      if (o && o in operational) operational[o]++;
    }
    return c.json({ counts, operational, total: (data || []).filter((r) => (r as Record<string, unknown>).onboarding_status !== "draft").length });
  });

  admin.get("/merchants/queue", async (c) => {
    const sb = getDb();
    const assignee = c.req.query("assigned_to");
    let query = sb
      .from("merchants")
      .select("*")
      .eq("onboarding_status", "submitted")
      .in("verification_status", ["pending", "in_review", "docs_requested"])
      .order("submitted_at", { ascending: true });
    if (assignee === "unassigned") {
      query = query.is("admin_assigned_to", null);
    } else if (assignee) {
      query = query.eq("admin_assigned_to", assignee);
    }
    const { data, error } = await query.limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const now = Date.now();
    const items = (data ?? []).map((m) => {
      const submitted = (m as Record<string, unknown>).submitted_at as string;
      const ageH = submitted ? (now - new Date(submitted).getTime()) / 3600000 : 0;
      return { ...m, sla_breached: ageH > SLA_HOURS };
    });
    return c.json({ merchants: items });
  });

  admin.get("/merchants/incomplete-setup", async (c) => {
    c.header("Cache-Control", "no-store");
    const sb = getDb();
    const q = c.req.query("q")?.trim().toLowerCase() ?? "";
    const limit = Math.min(parseInt(c.req.query("limit") || "100", 10) || 100, 200);
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);

    const { data: merchants, error: merchErr } = await sb
      .from("merchants")
      .select("*")
      .order("last_onboarding_activity_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (merchErr) return c.json({ error: merchErr.message }, 500);

    const checklistById = await checklistMapForMerchants(merchants ?? []);

    type IncompleteRow = {
      kind: "draft" | "merchant";
      userId: string;
      ownerEmail: string;
      merchantId: string | null;
      merchantName: string | null;
      verificationStatus: string | null;
      onboardingStatus: string | null;
      wizardStep: number | null;
      wizardStepKey: string | null;
      setupStage: string;
      checklist: SetupChecklist | null;
      missingSteps: string[];
      lastActivityAt: string | null;
    };

    const rows: IncompleteRow[] = [];
    let draftCount = 0;
    let incompleteMerchantCount = 0;

    for (const m of merchants ?? []) {
      const row = m as Record<string, unknown>;
      const id = row.id as string;
      const ownerId = row.owner_id as string;
      const ownerEmail = (row.email as string) || await fetchOwnerEmail(ownerId);
      const draft = row.onboarding_draft as Record<string, unknown> | undefined;
      const draftEmail = typeof draft?.email === "string" ? draft.email : "";
      const name = String(row.name || draft?.restaurantName || "");
      const haystack = `${name} ${ownerEmail} ${draftEmail} ${row.phone ?? ""}`.toLowerCase();
      if (q && !haystack.includes(q)) continue;

      const onboardingStatus = String(row.onboarding_status || "submitted");

      if (onboardingStatus === "draft") {
        draftCount++;
        rows.push({
          kind: "draft",
          userId: ownerId,
          ownerEmail: ownerEmail || draftEmail,
          merchantId: id,
          merchantName: name || null,
          verificationStatus: null,
          onboardingStatus,
          wizardStep: Number(row.wizard_step) || 1,
          wizardStepKey: (row.wizard_step_key as string) || "restaurant-info",
          setupStage: incompleteSetupStageLabel(row),
          checklist: null,
          missingSteps: ["Complete and submit partner application"],
          lastActivityAt: (row.last_onboarding_activity_at as string)
            || (row.updated_at as string)
            || (row.created_at as string)
            || null,
        });
        continue;
      }

      const checklist = checklistById.get(id)!;
      if (isApplicationSetupComplete(checklist)) continue;

      incompleteMerchantCount++;
      const verificationStatus = String(row.verification_status || "pending");
      rows.push({
        kind: "merchant",
        userId: ownerId,
        ownerEmail,
        merchantId: id,
        merchantName: name || null,
        verificationStatus,
        onboardingStatus,
        wizardStep: Number(row.wizard_step) || null,
        wizardStepKey: (row.wizard_step_key as string) || null,
        setupStage: verificationStatus === "approved"
          ? "Approved — finish setup"
          : setupStageLabel("merchant", checklist),
        checklist,
        missingSteps: missingSetupLabels(checklist),
        lastActivityAt: (row.updated_at as string) || (row.submitted_at as string) || null,
      });
    }

    const combined = rows.sort((a, b) => {
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return tb - ta;
    });

    const total = combined.length;
    const offset = (page - 1) * limit;
    const items = combined.slice(offset, offset + limit);

    return c.json({
      items,
      total,
      page,
      limit,
      counts: {
        drafts: draftCount,
        incomplete_merchants: incompleteMerchantCount,
        total,
      },
    });
  });

  admin.get("/merchants", async (c) => {
    const sb = getDb();
    const { status, search, operational_status: opStatus, vertical_in: verticalIn } = c.req.query();
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 200);
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const offset = (page - 1) * limit;

    let query = sb.from("merchants").select("*", { count: "exact" })
      .neq("onboarding_status", "draft")
      .order("submitted_at", { ascending: false });

    if (status && status !== "all" && isValidStatus(status)) {
      query = query.eq("verification_status", status);
    }
    if (opStatus && opStatus !== "all") {
      query = query.eq("operational_status", opStatus);
    }
    if (verticalIn?.trim()) {
      const verticals = verticalIn.split(",").map((v) => v.trim()).filter(Boolean);
      if (verticals.length === 1) {
        query = query.eq("vertical_type", verticals[0]);
      } else if (verticals.length > 1) {
        query = query.in("vertical_type", verticals);
      }
    }
    if (search?.trim()) {
      const pattern = `%${search.trim()}%`;
      query = query.or(
        `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},address.ilike.${pattern}`,
      );
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);

    const { data: allStatuses } = await sb.from("merchants").select("verification_status, operational_status, onboarding_status");
    const counts: Record<string, number> = {
      pending: 0, in_review: 0, docs_requested: 0, approved: 0, rejected: 0,
    };
    const operational: Record<string, number> = { active: 0, suspended: 0, deactivated: 0 };
    for (const row of allStatuses || []) {
      const r = row as Record<string, unknown>;
      if (r.onboarding_status === "draft") continue;
      const s = r.verification_status as string;
      const o = r.operational_status as string;
      if (s && s in counts) counts[s]++;
      if (o && o in operational) operational[o]++;
    }

    return c.json({
      merchants: data || [],
      total: count ?? 0,
      page,
      limit,
      counts,
      operational,
    });
  });

  admin.get("/merchants/:id", async (c) => {
    const { id } = c.req.param();
    const sb = getDb();
    const { data: merchant, error } = await sb.from("merchants").select("*").eq("id", id).single();
    if (error || !merchant) return c.json({ error: "Merchant not found" }, 404);

    const [{ data: hours }, { data: auditLog }, { data: team }, { data: invites }] = await Promise.all([
      sb.from("merchant_hours").select("*").eq("merchant_id", id).order("day_of_week"),
      sb.from("merchant_audit_log").select("*").eq("merchant_id", id).order("created_at", { ascending: false }),
      sb.from("merchant_team_members").select("*").eq("merchant_id", id),
      sb.from("merchant_team_invites").select("*").eq("merchant_id", id).eq("status", "pending"),
    ]);

    const ownerId = (merchant as Record<string, unknown>).owner_id as string;
    const ownerEmail = await fetchOwnerEmail(ownerId);
    const { documents, bankAccount } = await extendAdminMerchantDetail(id);

    return c.json({
      merchant,
      hours: hours || [],
      auditLog: auditLog || [],
      ownerEmail,
      documents,
      bankAccount,
      team: team || [],
      pendingInvites: invites || [],
    });
  });

  admin.post("/merchants/:id/status", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;

    const admin = adminFromCtx(c);
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const { status: newStatus, notes, internal_notes, force, commission_rate, delivery_radius_km } = body as {
      status?: string;
      notes?: string;
      internal_notes?: string;
      force?: boolean;
      commission_rate?: number;
      delivery_radius_km?: number;
    };

    if (!isValidStatus(newStatus)) {
      return c.json({ error: "Invalid status", allowed: Object.keys(ALLOWED_TRANSITIONS) }, 400);
    }

    const sb = getDb();
    const { data: current, error: fetchErr } = await sb.from("merchants").select("*").eq("id", id).single();
    if (fetchErr || !current) return c.json({ error: "Merchant not found" }, 404);

    const fromStatus = (current as Record<string, unknown>).verification_status as VerificationStatus;
    const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
    if (fromStatus !== newStatus && !allowed.includes(newStatus)) {
      return c.json({ error: `Cannot transition from "${fromStatus}" to "${newStatus}"`, allowed }, 400);
    }

    if (newStatus === "approved") {
      const checklist = (current as Record<string, unknown>).verification_checklist as Record<string, boolean> | null;
      if (!isChecklistComplete(checklist) && !force) {
        return c.json({
          error: "Verification checklist incomplete",
          checklist,
          hint: "Complete all checklist items or use force with platform approval",
        }, 400);
      }
      if (force && !canForceApproveMerchant(admin.roles)) {
        return c.json({ error: "force approve requires dash_admin or platform role" }, 403);
      }
    }

    const update: Record<string, unknown> = { verification_status: newStatus };
    if (newStatus === "approved") {
      update.verified_at = new Date().toISOString();
      update.verified_by = admin.id;
      update.rejection_reason = null;
      update.operational_status = "active";
      if (commission_rate != null) update.commission_rate = commission_rate;
      if (delivery_radius_km != null) update.delivery_radius_km = delivery_radius_km;
    }
    if (newStatus === "rejected") {
      update.rejection_reason = notes || null;
      update.verified_by = admin.id;
    }
    if (newStatus === "docs_requested" || newStatus === "in_review") {
      update.verified_by = admin.id;
    }
    if (typeof internal_notes === "string" && internal_notes.length > 0) {
      update.verification_notes = internal_notes;
    } else if (newStatus === "docs_requested" && notes) {
      update.verification_notes = notes;
    }

    const { data: updated, error: updateErr } = await sb.from("merchants").update(update).eq("id", id).select().single();
    if (updateErr) return c.json({ error: updateErr.message }, 500);

    await logMerchantAudit(sb, {
      merchant_id: id,
      actor_id: admin.id,
      actor_email: admin.email,
      action: "status_changed",
      from_status: fromStatus,
      to_status: newStatus,
      notes: notes || null,
      internal_notes: internal_notes || null,
    });

    if (newStatus !== "in_review") {
      const title = newStatus === "approved" ? "Your restaurant is approved!"
        : newStatus === "rejected" ? "Application not approved"
        : newStatus === "docs_requested" ? "Additional info needed"
        : `Status: ${newStatus}`;
      const bodyText = newStatus === "approved"
        ? "Congratulations! Your restaurant is now live on Roam Dash."
        : newStatus === "rejected" ? (notes || "Please review and resubmit.")
        : newStatus === "docs_requested" ? (notes || "Please update your application.")
        : `Status changed to ${newStatus}.`;
      await notifyMerchant(sb, id, title, bodyText, "verification_status_change");
    }

    const merchantEmail = (updated as Record<string, unknown>).email as string | undefined;
    if (merchantEmail && newStatus !== "in_review") {
      const tpl = renderStatusEmail(newStatus, {
        name: (updated as Record<string, unknown>).name as string,
        rejection_reason: (updated as Record<string, unknown>).rejection_reason as string | null,
        verification_notes: (updated as Record<string, unknown>).verification_notes as string | null,
      });
      await sendNotificationEmail({ to: merchantEmail, ...tpl });
    }

    await writeKvAudit(admin, "roam_dash.merchant_status_changed", id, merchantEmail || "", `${fromStatus} -> ${newStatus}`);
    return c.json({ merchant: updated });
  });

  admin.patch("/merchants/:id/assign", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const admin = adminFromCtx(c);
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const assignedTo = body.assigned_to === null ? null : (body.assigned_to as string | undefined);
    const sb = getDb();
    const { data, error } = await sb.from("merchants")
      .update({ admin_assigned_to: assignedTo ?? admin.id })
      .eq("id", id).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await logMerchantAudit(sb, {
      merchant_id: id,
      actor_id: admin.id,
      actor_email: admin.email,
      action: "assignee_changed",
      notes: assignedTo ?? admin.id,
    });
    return c.json({ merchant: data });
  });

  admin.patch("/merchants/:id/checklist", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const admin = adminFromCtx(c);
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const checklist = body.checklist as Record<string, boolean> | undefined;
    if (!checklist || typeof checklist !== "object") {
      return c.json({ error: "checklist object required" }, 400);
    }
    const sb = getDb();
    const { data, error } = await sb.from("merchants")
      .update({ verification_checklist: checklist })
      .eq("id", id).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await logMerchantAudit(sb, {
      merchant_id: id,
      actor_id: admin.id,
      actor_email: admin.email,
      action: "checklist_updated",
    });
    return c.json({ merchant: data });
  });

  admin.patch("/merchants/documents/:docId", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const admin = adminFromCtx(c);
    const { docId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const status = body.status as string;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return c.json({ error: "Invalid document status" }, 400);
    }
    const sb = getDb();
    const { data, error } = await sb.from("merchant_documents").update({
      status,
      rejection_reason: body.rejection_reason ?? null,
      verified_at: status !== "pending" ? new Date().toISOString() : null,
      verified_by: admin.id,
    }).eq("id", docId).select().single();
    if (error) return c.json({ error: error.message }, 500);
    const merchantId = (data as Record<string, unknown>).merchant_id as string;
    await logMerchantAudit(sb, {
      merchant_id: merchantId,
      actor_id: admin.id,
      actor_email: admin.email,
      action: "document_reviewed",
      notes: `${(data as Record<string, unknown>).doc_type}: ${status}`,
    });
    return c.json({ document: data });
  });

  admin.patch("/merchants/:id/ops", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const admin = adminFromCtx(c);
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.is_accepting_orders != null) updates.is_accepting_orders = Boolean(body.is_accepting_orders);
    if (body.commission_rate != null) updates.commission_rate = Number(body.commission_rate);
    if (body.delivery_radius_km != null) updates.delivery_radius_km = Number(body.delivery_radius_km);
    if (body.admin_internal_notes != null) updates.admin_internal_notes = String(body.admin_internal_notes);
    if (body.capabilities != null && Array.isArray(body.capabilities)) {
      const caps = [...new Set(["roam_delivery", ...body.capabilities.map(String)])];
      updates.capabilities = caps;
      updates.inventory_mode = caps.includes("in_store_operations") ? "enterprise" : "legacy";
    }
    const sb = getDb();
    const { data, error } = await sb.from("merchants").update(updates).eq("id", id).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await logMerchantAudit(sb, {
      merchant_id: id,
      actor_id: admin.id,
      actor_email: admin.email,
      action: "ops_updated",
      notes: JSON.stringify(updates),
    });
    return c.json({ merchant: data });
  });

  async function setOperationalStatus(
    c: { json: (b: unknown, s?: number) => Response },
    id: string,
    admin: ProductAdminUser,
    target: OperationalStatus,
    reason?: string,
  ) {
    const sb = getDb();
    const { data: current, error } = await sb.from("merchants").select("*").eq("id", id).single();
    if (error || !current) return c.json({ error: "Merchant not found" }, 404);

    const verificationStatus = (current as Record<string, unknown>).verification_status as string;
    if (!canSuspendMerchant(verificationStatus) && target !== "active") {
      return c.json({ error: "Only approved merchants can be suspended or deactivated" }, 400);
    }

    const currentOp = ((current as Record<string, unknown>).operational_status as OperationalStatus) || "active";
    if (!canTransitionOperational(currentOp, target)) {
      return c.json({ error: `Cannot transition operational status ${currentOp} -> ${target}` }, 400);
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { operational_status: target };
    if (target === "suspended") {
      update.suspended_at = now;
      update.suspended_reason = reason || null;
      update.suspended_by = admin.id;
    } else if (target === "active") {
      update.suspended_at = null;
      update.suspended_reason = null;
      update.suspended_by = null;
      update.deactivated_at = null;
      update.deactivated_reason = null;
      update.deactivated_by = null;
    } else if (target === "deactivated") {
      update.deactivated_at = now;
      update.deactivated_reason = reason || null;
      update.deactivated_by = admin.id;
    }

    const { data: updated, error: upErr } = await sb.from("merchants").update(update).eq("id", id).select().single();
    if (upErr) return c.json({ error: upErr.message }, 500);

    await logMerchantAudit(sb, {
      merchant_id: id,
      actor_id: admin.id,
      actor_email: admin.email,
      action: `operational_${target}`,
      from_status: currentOp,
      to_status: target,
      notes: reason || null,
    });

    const merchantEmail = (updated as Record<string, unknown>).email as string | undefined;
    if (target === "suspended") {
      await notifyMerchant(sb, id, "Account suspended", reason || "Your store has been suspended.", "operational_status");
    }
    await writeKvAudit(admin, `roam_dash.merchant_${target}`, id, merchantEmail || "", reason || "");
    return c.json({ merchant: updated });
  }

  admin.post("/merchants/:id/suspend", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    if (!reason) return c.json({ error: "reason is required" }, 400);
    return setOperationalStatus(c, c.req.param("id"), adminFromCtx(c), "suspended", reason);
  });

  admin.post("/merchants/:id/unsuspend", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    return setOperationalStatus(c, c.req.param("id"), adminFromCtx(c), "active");
  });

  admin.post("/merchants/:id/deactivate", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    if (!reason) return c.json({ error: "reason is required" }, 400);
    return setOperationalStatus(c, c.req.param("id"), adminFromCtx(c), "deactivated", reason);
  });

  admin.post("/merchants/:id/reactivate", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    return setOperationalStatus(c, c.req.param("id"), adminFromCtx(c), "active");
  });

  admin.delete("/merchants/:id", async (c) => {
    const admin = adminFromCtx(c);
    const denied = requireDashDelete(admin);
    if (denied) return denied;

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    const confirmName = String(body.confirm_name || "").trim();
    if (!reason) return c.json({ error: "reason is required" }, 400);
    if (!confirmName) return c.json({ error: "confirm_name is required" }, 400);

    const sb = getDb();
    const { data: merchant, error: fetchErr } = await sb
      .from("merchants")
      .select("id, name, email, owner_id, verification_status, onboarding_status")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return c.json({ error: fetchErr.message }, 500);
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    const row = merchant as Record<string, unknown>;
    const merchantName = String(row.name || "").trim();
    const expectedConfirm = (merchantName || id).toLowerCase();
    if (confirmName.toLowerCase() !== expectedConfirm) {
      return c.json({ error: "confirm_name must match merchant name" }, 400);
    }

    const payments = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "payments" } },
    );
    await payments.from("merchant_bank_accounts").delete().eq("merchant_id", id);
    await payments.from("merchant_payouts").delete().eq("merchant_id", id);

    const { error: ordersErr } = await sb.from("orders").delete().eq("merchant_id", id);
    if (ordersErr) return c.json({ error: ordersErr.message }, 500);

    const merchantEmail = String(row.email || "");
    await writeKvAudit(
      admin,
      "roam_dash.merchant_deleted",
      id,
      merchantEmail,
      `${reason} | name=${merchantName || "(draft)"}`,
    );

    const { error: deleteErr } = await sb.from("merchants").delete().eq("id", id);
    if (deleteErr) return c.json({ error: deleteErr.message }, 500);

    return c.json({
      ok: true,
      message:
        "Dash partner store removed. Owner Roam login and other app profiles (Driver, Courier, etc.) were not changed.",
    });
  });

  admin.post("/merchants/:id/reset-owner-password", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const { id } = c.req.param();
    const sb = getDb();
    const { data: merchant } = await sb.from("merchants").select("owner_id, email").eq("id", id).single();
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);
    const ownerId = (merchant as Record<string, unknown>).owner_id as string;
    const ownerEmail = await fetchOwnerEmail(ownerId);
    if (!ownerEmail) return c.json({ error: "Owner email not found" }, 404);
    const redirectTo = recoveryRedirectForProduct("dash");
    const { data, error } = await generateRecoveryLink(getAuthAdmin(), ownerEmail, redirectTo);
    if (error) return c.json({ error: String(error) }, 500);
    return c.json({ ok: true, recovery: data });
  });

  admin.get("/merchant-owners", async (c) => {
    const q = c.req.query("q")?.trim();
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const sb = getDb();
    let query = sb.from("merchants").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (q) {
      const pattern = `%${q}%`;
      query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    const owners = await Promise.all((data ?? []).map(async (m) => {
      const ownerId = (m as Record<string, unknown>).owner_id as string;
      return {
        merchant: m,
        ownerEmail: await fetchOwnerEmail(ownerId),
        ownerId,
      };
    }));
    return c.json({ owners, total: count ?? 0, page, limit });
  });

  mountDashTeamRoutes(admin);
  mountOnboardingConfigAdminRoutes(admin);
  app.route("/admin", admin);
}
