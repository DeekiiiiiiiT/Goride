/**
 * Expense Hub routes — additive domain for Business Finance.
 * Preserves legacy /fixed-expenses; Hub bulk rules project FixedExpenseConfig rows.
 */
import type { Context } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrg, stampOrg, getOrgId } from "./org_scope.ts";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import { appendCanonicalFixedExpenseIfEligible } from "./canonical_from_ops.ts";
import {
  appendCanonicalLedgerEvents,
  deleteCanonicalLedgerBySource,
  deleteCanonicalLedgerBySourceFromDate,
} from "./ledger_canonical.ts";
import {
  buildAccrualJournal,
  buildPaymentJournal,
  buildVoidJournal,
  canApproveDocument,
  canTransition,
  hubCategoryToCanonicalEventType,
  allocateEvenly,
} from "../../../utils/expenseHubJournal.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { FixedExpenseConfig } from "../../../types/expenses.ts";
import type {
  ExpenseDocument,
  ExpensePayment,
  ExpenseRuleAssignment,
  ExpenseRuleGroup,
  ExpenseVendor,
  ExpenseAuditEvent,
  ExpenseBulkPreview,
} from "../../../types/expenseHub.ts";
import { buildFixedExpenseOccurrences } from "../../../utils/fixedExpenseOccurrences.ts";
import {
  buildExpenseSpendBreakdown,
  type CoverageRuleInput,
  type PointSpendEvent,
} from "../../../utils/expenseCoverageRunRate.ts";

const PREFIX = "/make-server-37f42386/expense-hub";

function nowIso() {
  return new Date().toISOString();
}

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function actorId(c: Context): string {
  const u = c.get("rbacUser") as { userId?: string } | undefined;
  return u?.userId || "unknown";
}

async function requireHubWrites(c: Context): Promise<Response | null> {
  const orgId = getOrgId(c);
  const enabled = await isFeatureEnabled(FEATURE_FLAGS.EXPENSE_HUB_V1, orgId);
  if (!enabled) {
    return c.json(
      {
        error: "Expense Hub writes are disabled for this organization",
        flag: FEATURE_FLAGS.EXPENSE_HUB_V1,
      },
      403,
    );
  }
  return null;
}

async function writeAudit(
  c: Context,
  partial: Omit<ExpenseAuditEvent, "id" | "at" | "organizationId"> & { organizationId?: string },
) {
  const event: ExpenseAuditEvent = {
    id: crypto.randomUUID(),
    at: nowIso(),
    ...partial,
  };
  await kv.set(`expense_audit:${event.id}`, stampOrg(event, c));
  return event;
}

function annualize(amount: number, frequency: string, validityYears?: number): number {
  if (validityYears && validityYears > 0) {
    return amount / validityYears;
  }
  const f = frequency.toLowerCase();
  if (f === "daily") return amount * 365;
  if (f === "weekly") return amount * 52;
  if (f === "monthly") return amount * 12;
  if (f === "quarterly") return amount * 4;
  return amount;
}

async function projectFixedExpenseFromAssignment(
  c: Context,
  group: ExpenseRuleGroup,
  assignment: ExpenseRuleAssignment,
) {
  const amount = assignment.amountOverride ?? group.amount;
  const startDate = assignment.startDateOverride || group.startDate;
  const startTime = assignment.startTimeOverride || group.startTime;
  const endDate = assignment.endDateOverride || group.endDate;
  const endTime = assignment.endTimeOverride || group.endTime;
  const config: FixedExpenseConfig = {
    id: assignment.fixedExpenseConfigId,
    vehicleId: assignment.vehicleId,
    name: group.name,
    category: group.category,
    amount,
    currency: group.currency || "JMD",
    frequency: group.frequency,
    startDate,
    startTime,
    endDate,
    endTime,
    timeZone: group.timeZone,
    vendor: group.vendorName,
    description: group.description,
    autoRenew: group.autoRenew,
    isActive: assignment.isActive && group.status === "active",
    ruleGroupId: group.id,
    assignmentId: assignment.id,
    managedByExpenseHub: true,
    createdAt: assignment.createdAt,
    updatedAt: nowIso(),
  };
  const key = `fixed_expense:${config.vehicleId}:${config.id}`;
  await kv.set(key, stampOrg(config, c));
  await deleteCanonicalLedgerBySource("financial_event", [String(config.id)]);
  const horizon = new Date();
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 5);
  await appendCanonicalFixedExpenseIfEligible(config, startDate, horizon.toISOString().slice(0, 10), c);
  return config;
}

async function appendHubDocumentLedger(c: Context, doc: ExpenseDocument) {
  const eventType = hubCategoryToCanonicalEventType(String(doc.category));
  const orgId = getOrgId(c);
  const events =
    doc.allocations.length > 0
      ? doc.allocations.map((a) => ({
          idempotencyKey: `expense_doc:${doc.id}|${a.vehicleId}|accrual|v${doc.version}`,
          date: doc.incurredDate,
          driverId: "fleet",
          eventType,
          direction: "outflow",
          netAmount: a.amount,
          grossAmount: a.amount,
          currency: (doc.currency || "JMD").toUpperCase(),
          sourceType: "financial_event",
          sourceId: doc.id,
          vehicleId: a.vehicleId,
          category: String(doc.category),
          description: doc.description,
          metadata: {
            expenseHub: true,
            documentId: doc.id,
            recognitionBasis: "incurred_date",
            journalKind: "accrual",
          },
          ...(orgId ? { organizationId: orgId } : {}),
        }))
      : [
          {
            idempotencyKey: `expense_doc:${doc.id}|accrual|v${doc.version}`,
            date: doc.incurredDate,
            driverId: "fleet",
            eventType,
            direction: "outflow",
            netAmount: doc.netAmount,
            grossAmount: doc.grossAmount,
            currency: (doc.currency || "JMD").toUpperCase(),
            sourceType: "financial_event",
            sourceId: doc.id,
            category: String(doc.category),
            description: doc.description,
            metadata: {
              expenseHub: true,
              documentId: doc.id,
              recognitionBasis: "incurred_date",
              journalKind: "accrual",
            },
            ...(orgId ? { organizationId: orgId } : {}),
          },
        ];
  return appendCanonicalLedgerEvents(events, c);
}

export function registerExpenseHubRoutes(app: {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
}) {
  app.get(`${PREFIX}/flag`, requireAuth(), async (c: Context) => {
    const orgId = getOrgId(c);
    const enabled = await isFeatureEnabled(FEATURE_FLAGS.EXPENSE_HUB_V1, orgId);
    return c.json({ flag: FEATURE_FLAGS.EXPENSE_HUB_V1, enabled, organizationId: orgId });
  });

  app.get(`${PREFIX}/summary`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const start = String(c.req.query("startYmd") || "").slice(0, 10);
    const end = String(c.req.query("endYmd") || "").slice(0, 10);
    const docs = filterByOrg(await kv.getByPrefix("expense_doc:"), c) as ExpenseDocument[];
    const rules = filterByOrg(await kv.getByPrefix("expense_rule_group:"), c) as ExpenseRuleGroup[];
    const payments = filterByOrg(await kv.getByPrefix("expense_payment:"), c) as ExpensePayment[];
    const inPeriod = (d: string) => (!start || d >= start) && (!end || d <= end);
    const posted = docs.filter(
      (d) => ["posted", "partially_paid", "paid"].includes(d.status) && inPeriod(d.incurredDate),
    );
    const paidSum = payments
      .filter((p) => inPeriod(p.paymentDate))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    return c.json({
      periodStartYmd: start,
      periodEndYmd: end,
      postedExpenseTotal: posted.reduce((s, d) => s + Number(d.netAmount || 0), 0),
      pendingApprovalCount: docs.filter((d) => d.status === "submitted").length,
      overdueUnpaidCount: docs.filter(
        (d) =>
          ["posted", "partially_paid", "approved"].includes(d.status) &&
          d.dueDate &&
          d.dueDate < ymd(),
      ).length,
      activeRuleCount: rules.filter((r) => r.status === "active").length,
      paidThisPeriod: paidSum,
      operationalFuel: 0,
      operationalTolls: 0,
    });
  });

  /**
   * Overview spend chart — as-paid (due/incurred in range) vs spread (coverage overlap).
   * View-layer only; does not change ledger recognition.
   */
  app.get(
    `${PREFIX}/spend-breakdown`,
    requireAuth(),
    requirePermission("expenses.view"),
    async (c: Context) => {
      const start = String(c.req.query("startYmd") || "").slice(0, 10);
      const end = String(c.req.query("endYmd") || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
        return c.json({ error: "startYmd and endYmd (YYYY-MM-DD) are required" }, 400);
      }

      const groups = filterByOrg(
        await kv.getByPrefix("expense_rule_group:"),
        c,
      ) as ExpenseRuleGroup[];
      const assignments = filterByOrg(
        await kv.getByPrefix("expense_rule_assignment:"),
        c,
      ) as ExpenseRuleAssignment[];

      const coverageRules: CoverageRuleInput[] = [];
      for (const group of groups) {
        if (group.status !== "active") continue;
        const active = assignments.filter((a) => a.ruleGroupId === group.id && a.isActive);
        for (const a of active) {
          coverageRules.push({
            id: a.id,
            category: String(group.category),
            amount: Number(a.amountOverride ?? group.amount) || 0,
            frequency: String(group.frequency || "monthly"),
            startDate: a.startDateOverride || group.startDate,
            endDate: a.endDateOverride || group.endDate,
            isActive: true,
          });
        }
      }

      // Also include legacy vehicle fixed expenses not managed by Hub (same coverage math).
      const configs = filterByOrg(await kv.getByPrefix("fixed_expense:"), c) as FixedExpenseConfig[];
      const hubAssignmentIds = new Set(
        assignments.map((a) => a.fixedExpenseConfigId).filter(Boolean),
      );
      for (const cfg of configs) {
        if (cfg.isActive === false) continue;
        if (cfg.id && hubAssignmentIds.has(cfg.id)) continue; // already from Hub assignment
        if (cfg.managedByExpenseHub && cfg.assignmentId) continue;
        coverageRules.push({
          id: String(cfg.id || `${cfg.vehicleId}:${cfg.name}`),
          category: String(cfg.category),
          amount: Number(cfg.amount) || 0,
          frequency: String(cfg.frequency || "monthly"),
          startDate: cfg.startDate,
          endDate: cfg.endDate,
          isActive: cfg.isActive !== false,
        });
      }

      const pointEvents: PointSpendEvent[] = [];

      // As-paid fixed occurrences on due dates inside the window
      for (const cfg of configs) {
        if (cfg.isActive === false) continue;
        const occ = buildFixedExpenseOccurrences(cfg, start, end);
        for (const o of occ) {
          pointEvents.push({
            dateYmd: o.occurrenceYmd,
            category: o.category,
            amount: o.amount,
            kind: "fixed_expense",
          });
        }
      }

      // Operational + one-off ledger (fuel / toll / maintenance / operating_expense).
      // Prefer ledger SSOT over re-reading Hub docs (avoids double-count after post).
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const eventTypes = [
          "fuel_expense",
          "fuel_charge_offset",
          "toll_charge",
          "toll_refund",
          "toll_charge_offset",
          "maintenance",
          "operating_expense",
        ];
        const typeOr = eventTypes.map((t) => `value->>eventType.eq.${t}`).join(",");
        let offset = 0;
        const pageSize = 500;
        for (let page = 0; page < 40; page++) {
          const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("key, value")
            .like("key", "ledger_event:%")
            .or(typeOr)
            .gte("value->>date", start)
            .lte("value->>date", end)
            .order("value->>date", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          const rows = filterByOrg(
            (data || []).map((d: { key: string; value: Record<string, unknown> }) => ({
              key: d.key,
              ...(d.value || {}),
            })),
            c,
          ) as Array<Record<string, unknown>>;
          for (const e of rows) {
            const t = String(e.eventType || "");
            const dateYmd = String(e.date || "").slice(0, 10);
            const amt = Number(e.netAmount ?? e.grossAmount ?? e.amount ?? 0);
            if (!dateYmd || !Number.isFinite(amt) || amt === 0) continue;
            let kind: PointSpendEvent["kind"] = "other";
            let category = "Other";
            let signed = amt;
            if (t === "fuel_expense") {
              kind = "fuel";
              category = "Fuel";
            } else if (t === "fuel_charge_offset") {
              kind = "fuel";
              category = "Fuel";
              if (String(e.direction || "") === "inflow") signed = -amt;
            } else if (t === "toll_charge") {
              kind = "toll";
              category = "Toll";
            } else if (t === "toll_refund") {
              kind = "toll";
              category = "Toll";
              signed = -amt;
            } else if (t === "toll_charge_offset") {
              kind = "toll";
              category = "Toll";
              if (String(e.direction || "") === "inflow") signed = -amt;
            } else if (t === "maintenance") {
              kind = "maintenance";
              category = "Maintenance";
            } else if (t === "operating_expense") {
              kind = "operating";
              category = String(e.category || "Other");
            }
            pointEvents.push({ dateYmd, category, amount: signed, kind });
          }
          if (!data || data.length < pageSize) break;
          offset += pageSize;
        }
      } catch (err) {
        console.error("[expense-hub/spend-breakdown] ledger query failed", err);
        // Coverage + fixed occurrences still return; operational series may be incomplete.
      }

      const breakdown = buildExpenseSpendBreakdown(start, end, coverageRules, pointEvents);
      return c.json(breakdown);
    },
  );

  app.get(`${PREFIX}/documents`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const status = c.req.query("status");
    const vehicleId = c.req.query("vehicleId");
    const q = String(c.req.query("q") || "").toLowerCase();
    let docs = filterByOrg(await kv.getByPrefix("expense_doc:"), c) as ExpenseDocument[];
    if (status) docs = docs.filter((d) => d.status === status);
    if (vehicleId) docs = docs.filter((d) => d.allocations?.some((a) => a.vehicleId === vehicleId));
    if (q) {
      docs = docs.filter(
        (d) =>
          d.description?.toLowerCase().includes(q) ||
          d.vendorName?.toLowerCase().includes(q) ||
          String(d.category).toLowerCase().includes(q),
      );
    }
    docs.sort((a, b) => String(b.incurredDate).localeCompare(String(a.incurredDate)));
    const limit = Math.min(Number(c.req.query("limit") || 100), 500);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);
    return c.json({ items: docs.slice(offset, offset + limit), total: docs.length });
  });

  app.get(`${PREFIX}/documents/:id`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const id = c.req.param("id");
    const doc = await kv.get(`expense_doc:${id}`);
    if (!doc) return c.json({ error: "Not found" }, 404);
    const scoped = filterByOrg([doc], c);
    if (!scoped.length) return c.json({ error: "Not found" }, 404);
    const payments = filterByOrg(await kv.getByPrefix(`expense_payment:`), c).filter(
      (p: ExpensePayment) => p.documentId === id,
    );
    const journals = filterByOrg(await kv.getByPrefix(`expense_journal:`), c).filter(
      (j: { documentId?: string }) => j.documentId === id,
    );
    const audits = filterByOrg(await kv.getByPrefix("expense_audit:"), c)
      .filter((a: ExpenseAuditEvent) => a.entityId === id)
      .sort((a: ExpenseAuditEvent, b: ExpenseAuditEvent) => b.at.localeCompare(a.at));
    return c.json({ document: scoped[0], payments, journals, audits });
  });

  app.post(`${PREFIX}/documents`, requireAuth(), requirePermission("expenses.create"), async (c: Context) => {
    const blocked = await requireHubWrites(c);
    if (blocked) return blocked;
    const body = await c.req.json();
    const netAmount = Number(body.netAmount ?? body.amount ?? 0);
    if (!Number.isFinite(netAmount) || netAmount <= 0) {
      return c.json({ error: "Amount must be positive" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.incurredDate || ""))) {
      return c.json({ error: "incurredDate must be YYYY-MM-DD" }, 400);
    }
    const id = body.id || crypto.randomUUID();
    const vehicleIds: string[] = Array.isArray(body.vehicleIds)
      ? body.vehicleIds
      : body.vehicleId
        ? [body.vehicleId]
        : [];
    const allocations =
      Array.isArray(body.allocations) && body.allocations.length
        ? body.allocations
        : allocateEvenly(netAmount, vehicleIds);
    const submit = Boolean(body.submit);
    const paidNow = Boolean(body.paidNow);
    const doc: ExpenseDocument = {
      id,
      status: submit || paidNow ? "submitted" : "draft",
      category: body.category || "Other",
      description: String(body.description || body.category || "Expense").trim(),
      vendorId: body.vendorId,
      vendorName: body.vendorName,
      incurredDate: body.incurredDate,
      dueDate: body.dueDate,
      currency: body.currency || "JMD",
      grossAmount: Number(body.grossAmount ?? netAmount),
      taxAmount: Number(body.taxAmount || 0),
      netAmount,
      allocations,
      paymentMethod: body.paymentMethod,
      paidNow,
      evidenceUrls: body.evidenceUrls || [],
      notes: body.notes,
      assetId: body.assetId,
      accountCode: body.accountCode,
      version: 1,
      createdBy: actorId(c),
      submittedBy: submit || paidNow ? actorId(c) : undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      submittedAt: submit || paidNow ? nowIso() : undefined,
    };
    await kv.set(`expense_doc:${id}`, stampOrg(doc, c));
    await writeAudit(c, {
      entityType: "document",
      entityId: id,
      action: "create",
      actorId: actorId(c),
      after: doc as unknown as Record<string, unknown>,
    });

    // Optional one-shot paid-now path
    if (paidNow) {
      return await approveAndPayDocument(c, doc, {
        amount: netAmount,
        paymentDate: body.paymentDate || doc.incurredDate,
        paymentMethod: body.paymentMethod || "cash",
        reference: body.reference,
      });
    }
    return c.json({ success: true, data: doc });
  });

  async function approveAndPayDocument(
    c: Context,
    doc: ExpenseDocument,
    paymentInput: { amount: number; paymentDate: string; paymentMethod: string; reference?: string },
  ) {
    const approved = await transitionDocument(c, doc, "approved", {});
    const posted = await transitionDocument(c, approved, "posted", {});
    const payment: ExpensePayment = {
      id: crypto.randomUUID(),
      documentId: posted.id,
      amount: paymentInput.amount,
      currency: posted.currency,
      paymentDate: paymentInput.paymentDate,
      paymentMethod: paymentInput.paymentMethod,
      reference: paymentInput.reference,
      createdBy: actorId(c),
      createdAt: nowIso(),
    };
    await kv.set(`expense_payment:${payment.id}`, stampOrg(payment, c));
    const journal = buildPaymentJournal(payment, getOrgId(c) || "");
    await kv.set(`expense_journal:${journal.id}`, stampOrg(journal as unknown as Record<string, unknown>, c));
    const paidStatus = payment.amount + 1e-9 >= posted.netAmount ? "paid" : "partially_paid";
    const paidDoc = { ...posted, status: paidStatus as ExpenseDocument["status"], updatedAt: nowIso() };
    await kv.set(`expense_doc:${paidDoc.id}`, stampOrg(paidDoc as unknown as Record<string, unknown>, c));
    return c.json({ success: true, data: paidDoc, payment, journal });
  }

  async function transitionDocument(
    c: Context,
    doc: ExpenseDocument,
    to: ExpenseDocument["status"],
    opts: { reason?: string; allowSelfApprove?: boolean },
  ): Promise<ExpenseDocument> {
    if (!canTransition(doc.status, to) && !(doc.status === "submitted" && to === "posted")) {
      // allow submitted → approved → posted chain helpers
      if (!(doc.status === "approved" && to === "posted") && !(doc.status === "submitted" && to === "approved")) {
        throw new Error(`Invalid transition ${doc.status} → ${to}`);
      }
    }
    if (to === "approved") {
      const ok = canApproveDocument({
        createdBy: doc.createdBy,
        submittedBy: doc.submittedBy,
        actorId: actorId(c),
        allowSelfApprove: Boolean(opts.allowSelfApprove) || actorId(c) === getOrgId(c),
      });
      if (!ok) throw new Error("Separation of duties: creator cannot approve this expense");
    }
    const next: ExpenseDocument = {
      ...doc,
      status: to,
      updatedAt: nowIso(),
      approvedBy: to === "approved" ? actorId(c) : doc.approvedBy,
      approvedAt: to === "approved" ? nowIso() : doc.approvedAt,
      postedAt: to === "posted" ? nowIso() : doc.postedAt,
      rejectionReason: to === "rejected" ? opts.reason : doc.rejectionReason,
      voidReason: to === "voided" ? opts.reason : doc.voidReason,
      voidedAt: to === "voided" ? nowIso() : doc.voidedAt,
    };
    if (to === "approved" || to === "posted") {
      const journal = buildAccrualJournal(
        { ...next, status: "approved" },
        getOrgId(c) || "",
      );
      await kv.set(
        `expense_journal:${journal.id}`,
        stampOrg(journal as unknown as Record<string, unknown>, c),
      );
      await appendHubDocumentLedger(c, next);
      next.status = "posted";
      next.postedAt = nowIso();
    }
    if (to === "voided") {
      const journal = buildVoidJournal(doc, getOrgId(c) || "", ymd());
      await kv.set(
        `expense_journal:${journal.id}`,
        stampOrg(journal as unknown as Record<string, unknown>, c),
      );
      await deleteCanonicalLedgerBySource("financial_event", [doc.id]);
    }
    await kv.set(`expense_doc:${next.id}`, stampOrg(next as unknown as Record<string, unknown>, c));
    await writeAudit(c, {
      entityType: "document",
      entityId: next.id,
      action: `transition:${to}`,
      actorId: actorId(c),
      reason: opts.reason,
      before: doc as unknown as Record<string, unknown>,
      after: next as unknown as Record<string, unknown>,
    });
    return next;
  }

  app.post(
    `${PREFIX}/documents/:id/submit`,
    requireAuth(),
    requirePermission("expenses.create"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const id = c.req.param("id");
      const raw = await kv.get(`expense_doc:${id}`);
      if (!raw) return c.json({ error: "Not found" }, 404);
      const doc = filterByOrg([raw], c)[0] as ExpenseDocument;
      if (!doc) return c.json({ error: "Not found" }, 404);
      if (!canTransition(doc.status, "submitted")) {
        return c.json({ error: `Cannot submit from ${doc.status}` }, 400);
      }
      const next = {
        ...doc,
        status: "submitted" as const,
        submittedBy: actorId(c),
        submittedAt: nowIso(),
        updatedAt: nowIso(),
      };
      await kv.set(`expense_doc:${id}`, stampOrg(next, c));
      await writeAudit(c, {
        entityType: "document",
        entityId: id,
        action: "submit",
        actorId: actorId(c),
      });
      return c.json({ success: true, data: next });
    },
  );

  app.post(
    `${PREFIX}/documents/:id/approve`,
    requireAuth(),
    requirePermission("expenses.approve"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const id = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const raw = await kv.get(`expense_doc:${id}`);
      if (!raw) return c.json({ error: "Not found" }, 404);
      const doc = filterByOrg([raw], c)[0] as ExpenseDocument;
      try {
        const next = await transitionDocument(c, doc, "approved", {
          allowSelfApprove: Boolean(body.allowSelfApprove),
        });
        return c.json({ success: true, data: next });
      } catch (e: any) {
        return c.json({ error: e.message }, 400);
      }
    },
  );

  app.post(
    `${PREFIX}/documents/:id/reject`,
    requireAuth(),
    requirePermission("expenses.approve"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const id = c.req.param("id");
      const body = await c.req.json();
      if (!String(body.reason || "").trim()) return c.json({ error: "Reason required" }, 400);
      const raw = await kv.get(`expense_doc:${id}`);
      if (!raw) return c.json({ error: "Not found" }, 404);
      const doc = filterByOrg([raw], c)[0] as ExpenseDocument;
      try {
        const next = await transitionDocument(c, doc, "rejected", { reason: body.reason });
        return c.json({ success: true, data: next });
      } catch (e: any) {
        return c.json({ error: e.message }, 400);
      }
    },
  );

  app.post(
    `${PREFIX}/documents/:id/payments`,
    requireAuth(),
    requirePermission("expenses.pay"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const id = c.req.param("id");
      const body = await c.req.json();
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return c.json({ error: "Invalid amount" }, 400);
      const raw = await kv.get(`expense_doc:${id}`);
      if (!raw) return c.json({ error: "Not found" }, 404);
      const doc = filterByOrg([raw], c)[0] as ExpenseDocument;
      if (!["posted", "partially_paid", "approved"].includes(doc.status)) {
        return c.json({ error: `Cannot pay document in status ${doc.status}` }, 400);
      }
      const payment: ExpensePayment = {
        id: crypto.randomUUID(),
        documentId: id,
        amount,
        currency: doc.currency || "JMD",
        paymentDate: body.paymentDate || ymd(),
        paymentMethod: body.paymentMethod || "bank",
        reference: body.reference,
        notes: body.notes,
        createdBy: actorId(c),
        createdAt: nowIso(),
      };
      await kv.set(`expense_payment:${payment.id}`, stampOrg(payment, c));
      const journal = buildPaymentJournal(payment, getOrgId(c) || "");
      await kv.set(
        `expense_journal:${journal.id}`,
        stampOrg(journal as unknown as Record<string, unknown>, c),
      );
      const prior = (filterByOrg(await kv.getByPrefix("expense_payment:"), c) as ExpensePayment[])
        .filter((p) => p.documentId === id)
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const status = prior + 1e-9 >= doc.netAmount ? "paid" : "partially_paid";
      const next = { ...doc, status, updatedAt: nowIso() };
      await kv.set(`expense_doc:${id}`, stampOrg(next as unknown as Record<string, unknown>, c));
      await writeAudit(c, {
        entityType: "payment",
        entityId: payment.id,
        action: "record_payment",
        actorId: actorId(c),
        after: payment as unknown as Record<string, unknown>,
      });
      return c.json({ success: true, data: next, payment, journal });
    },
  );

  app.post(
    `${PREFIX}/documents/:id/void`,
    requireAuth(),
    requirePermission("expenses.approve"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const body = await c.req.json();
      if (!String(body.reason || "").trim()) return c.json({ error: "Reason required" }, 400);
      const raw = await kv.get(`expense_doc:${c.req.param("id")}`);
      if (!raw) return c.json({ error: "Not found" }, 404);
      const doc = filterByOrg([raw], c)[0] as ExpenseDocument;
      try {
        const next = await transitionDocument(c, doc, "voided", { reason: body.reason });
        return c.json({ success: true, data: next });
      } catch (e: any) {
        return c.json({ error: e.message }, 400);
      }
    },
  );

  // ── Rules ──────────────────────────────────────────────────────────────
  app.get(`${PREFIX}/rules`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const rules = filterByOrg(await kv.getByPrefix("expense_rule_group:"), c) as ExpenseRuleGroup[];
    const assignments = filterByOrg(
      await kv.getByPrefix("expense_rule_assignment:"),
      c,
    ) as ExpenseRuleAssignment[];
    const enriched = rules.map((r) => ({
      ...r,
      assignmentCount: assignments.filter((a) => a.ruleGroupId === r.id && a.isActive).length,
    }));
    return c.json({ items: enriched });
  });

  app.get(`${PREFIX}/rules/:id`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const id = c.req.param("id");
    const raw = await kv.get(`expense_rule_group:${id}`);
    if (!raw) return c.json({ error: "Not found" }, 404);
    const group = filterByOrg([raw], c)[0] as ExpenseRuleGroup;
    if (!group) return c.json({ error: "Not found" }, 404);
    const assignments = (
      filterByOrg(await kv.getByPrefix("expense_rule_assignment:"), c) as ExpenseRuleAssignment[]
    ).filter((a) => a.ruleGroupId === id);
    return c.json({ group, assignments });
  });

  app.post(
    `${PREFIX}/rules/preview`,
    requireAuth(),
    requirePermission("expenses.manage_rules"),
    async (c: Context) => {
      const body = await c.req.json();
      const vehicleIds: string[] = Array.isArray(body.vehicleIds) ? body.vehicleIds : [];
      const amount = Number(body.amount || 0);
      const frequency = String(body.frequency || "monthly");
      const overrides = Array.isArray(body.overrides) ? body.overrides : [];
      const preview: ExpenseBulkPreview = {
        includedVehicleIds: vehicleIds,
        excludedVehicleIds: body.excludedVehicleIds || [],
        projectedAnnualTotal: vehicleIds.reduce((s: number, vid: string) => {
          const o = overrides.find(
            (x: { vehicleId: string; amount?: number; validityYears?: number }) =>
              x.vehicleId === vid,
          );
          const amt = Number(o?.amount ?? amount);
          const years = o?.validityYears != null ? Number(o.validityYears) : undefined;
          return s + annualize(amt, frequency, years);
        }, 0),
        estimatedOccurrenceCount: vehicleIds.reduce((s: number, vid: string) => {
          const o = overrides.find(
            (x: { vehicleId: string; validityYears?: number }) => x.vehicleId === vid,
          );
          const years = Math.max(1, Number(o?.validityYears) || 1);
          if (frequency === "monthly") return s + 12;
          if (frequency === "weekly") return s + 52;
          // Multi-year fitness: one occurrence per validity cycle in a year horizon ≈ 1/years
          return s + 1 / years;
        }, 0),
        overrides,
      };
      return c.json(preview);
    },
  );

  app.post(
    `${PREFIX}/rules`,
    requireAuth(),
    requirePermission("expenses.manage_rules"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const body = await c.req.json();
      const vehicleIds: string[] = Array.isArray(body.vehicleIds) ? body.vehicleIds : [];
      if (!vehicleIds.length) return c.json({ error: "Select at least one vehicle" }, 400);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return c.json({ error: "Invalid amount" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate || ""))) {
        return c.json({ error: "startDate required" }, 400);
      }
      const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (!timePattern.test(String(body.startTime || ""))) {
        return c.json({ error: "Valid startTime required" }, 400);
      }
      if (!timePattern.test(String(body.endTime || ""))) {
        return c.json({ error: "Valid endTime required" }, 400);
      }
      if (
        body.endDate &&
        (String(body.endDate) < String(body.startDate) ||
          (String(body.endDate) === String(body.startDate) &&
            String(body.endTime) <= String(body.startTime)))
      ) {
        return c.json({ error: "Coverage end must follow coverage start" }, 400);
      }
      const groupId = body.id || crypto.randomUUID();
      const group: ExpenseRuleGroup = {
        id: groupId,
        name: String(body.name || "").trim() || "Recurring expense",
        category: body.category || "Other",
        permitType: body.permitType,
        vendorId: body.vendorId,
        vendorName: body.vendorName,
        amount,
        currency: body.currency || "JMD",
        frequency: body.frequency || "monthly",
        startDate: body.startDate,
        startTime: body.startTime,
        endDate: body.endDate,
        endTime: body.endTime,
        timeZone: String(body.timeZone || "UTC"),
        autoRenew: body.autoRenew !== false,
        description: body.description,
        status: "active",
        assetId: body.assetId,
        accountCode: body.accountCode,
        requiresApproval: Boolean(body.requiresApproval),
        version: 1,
        createdBy: actorId(c),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await kv.set(`expense_rule_group:${groupId}`, stampOrg(group, c));
      type RuleOverride = {
        vehicleId: string;
        amount?: number;
        validityYears?: 1 | 3 | 5;
        startDateOverride?: string;
        startTimeOverride?: string;
        endDateOverride?: string;
        endTimeOverride?: string;
      };
      const overrides: RuleOverride[] = Array.isArray(body.overrides) ? body.overrides : [];
      const assignments: ExpenseRuleAssignment[] = [];
      for (const vehicleId of vehicleIds) {
        const assignmentId = crypto.randomUUID();
        const o = overrides.find((x) => x.vehicleId === vehicleId);
        const assignment: ExpenseRuleAssignment = {
          id: assignmentId,
          ruleGroupId: groupId,
          vehicleId,
          fixedExpenseConfigId: assignmentId,
          amountOverride: o?.amount,
          validityYears: o?.validityYears,
          startDateOverride: o?.startDateOverride,
          startTimeOverride: o?.startTimeOverride,
          endDateOverride: o?.endDateOverride,
          endTimeOverride: o?.endTimeOverride,
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        await kv.set(`expense_rule_assignment:${assignmentId}`, stampOrg(assignment, c));
        await projectFixedExpenseFromAssignment(c, group, assignment);
        assignments.push(assignment);
      }
      await writeAudit(c, {
        entityType: "rule_group",
        entityId: groupId,
        action: "create_bulk",
        actorId: actorId(c),
        after: { group, assignmentCount: assignments.length } as unknown as Record<string, unknown>,
      });
      return c.json({ success: true, group, assignments });
    },
  );

  app.post(
    `${PREFIX}/rules/:id/bulk`,
    requireAuth(),
    requirePermission("expenses.manage_rules"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const id = c.req.param("id");
      const body = await c.req.json();
      const raw = await kv.get(`expense_rule_group:${id}`);
      if (!raw) return c.json({ error: "Not found" }, 404);
      const group = filterByOrg([raw], c)[0] as ExpenseRuleGroup;
      const action = String(body.action || "");
      let next = { ...group, updatedAt: nowIso(), version: group.version + 1 };
      if (action === "pause") next.status = "paused";
      else if (action === "resume") next.status = "active";
      else if (action === "end") {
        next.status = "ended";
        next.endDate = body.endDate || ymd();
      } else if (action === "update") {
        if (body.name != null) next.name = String(body.name).trim() || next.name;
        if (body.category) next.category = body.category;
        if (body.vendorId !== undefined) next.vendorId = body.vendorId || undefined;
        if (body.vendorName !== undefined) next.vendorName = body.vendorName || undefined;
        if (body.amount != null && Number.isFinite(Number(body.amount))) {
          next.amount = Number(body.amount);
        }
        if (body.frequency) next.frequency = body.frequency;
        if (body.description !== undefined) next.description = body.description || undefined;
        if (body.autoRenew !== undefined) next.autoRenew = Boolean(body.autoRenew);
        if (body.startDate) next.startDate = body.startDate;
        if (body.startTime) next.startTime = body.startTime;
        if (body.endDate !== undefined) next.endDate = body.endDate || undefined;
        if (body.endTime) next.endTime = body.endTime;
      } else {
        return c.json({ error: "Unknown bulk action" }, 400);
      }
      await kv.set(`expense_rule_group:${id}`, stampOrg(next, c));
      const assignments = (
        filterByOrg(await kv.getByPrefix("expense_rule_assignment:"), c) as ExpenseRuleAssignment[]
      ).filter((a) => a.ruleGroupId === id);
      for (const a of assignments) {
        const updatedA = {
          ...a,
          isActive: next.status === "active",
          endDateOverride: action === "end" ? next.endDate : a.endDateOverride,
          updatedAt: nowIso(),
        };
        await kv.set(`expense_rule_assignment:${a.id}`, stampOrg(updatedA, c));
        if (next.status === "ended" || next.status === "paused") {
          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          await deleteCanonicalLedgerBySourceFromDate(
            "financial_event",
            [a.fixedExpenseConfigId],
            tomorrow.toISOString().slice(0, 10),
          );
          const key = `fixed_expense:${a.vehicleId}:${a.fixedExpenseConfigId}`;
          const existing = await kv.get(key);
          if (existing) {
            await kv.set(key, stampOrg({ ...existing, isActive: false, updatedAt: nowIso() }, c));
          }
        } else {
          await projectFixedExpenseFromAssignment(c, next, updatedA);
        }
      }
      await writeAudit(c, {
        entityType: "rule_group",
        entityId: id,
        action: `bulk:${action}`,
        actorId: actorId(c),
        after: next as unknown as Record<string, unknown>,
      });
      return c.json({ success: true, group: next, affected: assignments.length });
    },
  );

  // ── Categories ─────────────────────────────────────────────────────────
  app.get(`${PREFIX}/categories`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const custom = filterByOrg(await kv.getByPrefix("expense_category:"), c) as Array<{
      id: string;
      value: string;
      label: string;
      notes?: string;
      isActive?: boolean;
      createdAt: string;
      updatedAt: string;
      organizationId?: string;
    }>;
    const builtIn = [
      { value: "Insurance", label: "Insurance" },
      { value: "Security", label: "Security (Tracker/GPS)" },
      { value: "Lease", label: "Vehicle Lease/Financing" },
      { value: "Maintenance", label: "Maintenance Contract" },
      { value: "Software", label: "Software Subscription" },
      { value: "Permits", label: "Permits & Licenses" },
      { value: "Equipment", label: "Equipment Rental" },
      { value: "Parking", label: "Parking" },
      { value: "Other", label: "Other" },
    ].map((c) => ({
      id: `system:${c.value}`,
      value: c.value,
      label: c.label,
      isSystem: true,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    }));
    const customActive = custom
      .filter((c) => c.isActive !== false)
      .map((c) => ({ ...c, isSystem: false }));
    const seen = new Set(builtIn.map((c) => c.value.toLowerCase()));
    const merged = [
      ...builtIn,
      ...customActive.filter((c) => !seen.has(String(c.value || "").toLowerCase())),
    ];
    return c.json({ items: merged });
  });

  app.post(
    `${PREFIX}/categories`,
    requireAuth(),
    requirePermission("expenses.manage_vendors"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const body = await c.req.json();
      const label = String(body.label || body.name || "").trim();
      if (!label) return c.json({ error: "Category name is required" }, 400);

      const slugParts = label.split(/[^a-zA-Z0-9]+/).filter(Boolean);
      const autoValue = slugParts
        .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join("");
      const value = String(body.value || autoValue || "Custom").trim();
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
        return c.json({ error: "Category code must start with a letter (letters/numbers/_ only)" }, 400);
      }

      const builtIn = new Set([
        "insurance",
        "security",
        "lease",
        "maintenance",
        "software",
        "permits",
        "equipment",
        "parking",
        "other",
      ]);
      if (builtIn.has(value.toLowerCase())) {
        return c.json({ error: "That category already exists in the standard list" }, 409);
      }

      const existing = filterByOrg(await kv.getByPrefix("expense_category:"), c) as Array<{
        value: string;
        isActive?: boolean;
      }>;
      if (
        existing.some(
          (c) => c.isActive !== false && String(c.value || "").toLowerCase() === value.toLowerCase(),
        )
      ) {
        return c.json({ error: "A category with that code already exists" }, 409);
      }

      const category = {
        id: body.id || crypto.randomUUID(),
        value,
        label,
        notes: body.notes ? String(body.notes).trim() : undefined,
        isSystem: false,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await kv.set(`expense_category:${category.id}`, stampOrg(category, c));
      return c.json({ success: true, data: category });
    },
  );

  app.put(
    `${PREFIX}/categories/:id`,
    requireAuth(),
    requirePermission("expenses.manage_vendors"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const id = c.req.param("id");
      if (!id || id.startsWith("system:")) {
        return c.json({ error: "Standard categories cannot be edited" }, 400);
      }
      const raw = await kv.get(`expense_category:${id}`);
      if (!raw) return c.json({ error: "Category not found" }, 404);
      const existing = filterByOrg([raw], c)[0] as {
        id: string;
        value: string;
        label: string;
        notes?: string;
        isSystem?: boolean;
        isActive?: boolean;
        createdAt: string;
        updatedAt: string;
        organizationId?: string;
      } | undefined;
      if (!existing) return c.json({ error: "Category not found" }, 404);

      const body = await c.req.json();
      const label = body.label != null ? String(body.label).trim() : existing.label;
      if (!label) return c.json({ error: "Category name is required" }, 400);

      // Code is immutable after create — keeps historical expenses/rules stable.
      const next = {
        ...existing,
        label,
        notes: body.notes !== undefined
          ? (String(body.notes).trim() || undefined)
          : existing.notes,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive !== false,
        isSystem: false,
        updatedAt: nowIso(),
      };
      await kv.set(`expense_category:${id}`, stampOrg(next, c));
      return c.json({ success: true, data: next });
    },
  );

  // ── Vendors ────────────────────────────────────────────────────────────
  app.get(`${PREFIX}/vendors`, requireAuth(), requirePermission("expenses.view"), async (c: Context) => {
    const items = filterByOrg(await kv.getByPrefix("expense_vendor:"), c) as ExpenseVendor[];
    return c.json({ items: items.filter((v) => v.isActive !== false) });
  });

  app.post(
    `${PREFIX}/vendors`,
    requireAuth(),
    requirePermission("expenses.manage_vendors"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const body = await c.req.json();
      const vendor: ExpenseVendor = {
        id: body.id || crypto.randomUUID(),
        name: String(body.name || "").trim(),
        categoryDefault: body.categoryDefault,
        notes: body.notes,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      if (!vendor.name) return c.json({ error: "Name required" }, 400);
      await kv.set(`expense_vendor:${vendor.id}`, stampOrg(vendor, c));
      return c.json({ success: true, data: vendor });
    },
  );

  /** Bulk create — paste list of names; skips blanks and case-insensitive dupes. */
  app.post(
    `${PREFIX}/vendors/bulk`,
    requireAuth(),
    requirePermission("expenses.manage_vendors"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const body = await c.req.json();
      const categoryDefault =
        body.categoryDefault === undefined || body.categoryDefault === null || body.categoryDefault === "none"
          ? undefined
          : String(body.categoryDefault);
      const notes =
        body.notes === undefined || body.notes === null || String(body.notes).trim() === ""
          ? undefined
          : String(body.notes).trim();

      const rawNames: string[] = Array.isArray(body.names)
        ? body.names.map((n: unknown) => String(n || "").trim())
        : String(body.text || "")
            .split(/\r?\n/)
            .map((n: string) => n.trim());

      const names = rawNames.filter(Boolean);
      if (names.length === 0) return c.json({ error: "At least one vendor name is required" }, 400);
      if (names.length > 100) return c.json({ error: "Maximum 100 vendors per bulk add" }, 400);

      const existing = filterByOrg(await kv.getByPrefix("expense_vendor:"), c) as ExpenseVendor[];
      const seen = new Set(
        existing
          .filter((v) => v.isActive !== false)
          .map((v) => v.name.trim().toLowerCase()),
      );

      const created: ExpenseVendor[] = [];
      const skipped: string[] = [];
      const ts = nowIso();

      for (const name of names) {
        const key = name.toLowerCase();
        if (seen.has(key)) {
          skipped.push(name);
          continue;
        }
        seen.add(key);
        const vendor: ExpenseVendor = {
          id: crypto.randomUUID(),
          name,
          categoryDefault,
          notes,
          isActive: true,
          createdAt: ts,
          updatedAt: ts,
        };
        await kv.set(`expense_vendor:${vendor.id}`, stampOrg(vendor, c));
        created.push(vendor);
      }

      return c.json({
        success: true,
        created,
        skipped,
        summary: { created: created.length, skipped: skipped.length },
      });
    },
  );

  // ── Migration ──────────────────────────────────────────────────────────
  app.post(
    `${PREFIX}/migrate/dry-run`,
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      const configs = filterByOrg(await kv.getByPrefix("fixed_expense:"), c) as FixedExpenseConfig[];
      const already = configs.filter((x) => x.ruleGroupId || x.managedByExpenseHub);
      const pending = configs.filter((x) => !x.ruleGroupId && !x.managedByExpenseHub);
      const byName = new Map<string, FixedExpenseConfig[]>();
      for (const cfg of pending) {
        const key = `${cfg.name}|${cfg.category}|${cfg.frequency}|${cfg.amount}|${cfg.vendor || ""}`;
        const list = byName.get(key) || [];
        list.push(cfg);
        byName.set(key, list);
      }
      return c.json({
        dryRun: true,
        totalConfigs: configs.length,
        alreadyMigrated: already.length,
        pendingConfigs: pending.length,
        proposedRuleGroups: byName.size,
        sampleGroups: Array.from(byName.entries()).slice(0, 20).map(([k, rows]) => ({
          key: k,
          vehicleCount: rows.length,
          annualProjection: rows.reduce(
            (s, r) => s + annualize(Number(r.amount || 0), String(r.frequency)),
            0,
          ),
        })),
      });
    },
  );

  app.post(
    `${PREFIX}/migrate/apply`,
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      const blocked = await requireHubWrites(c);
      if (blocked) return blocked;
      const body = await c.req.json().catch(() => ({}));
      if (!body.confirm) return c.json({ error: "Pass confirm:true after dry-run review" }, 400);
      const configs = filterByOrg(await kv.getByPrefix("fixed_expense:"), c) as FixedExpenseConfig[];
      const pending = configs.filter((x) => !x.ruleGroupId && !x.managedByExpenseHub && x.id);
      const byName = new Map<string, FixedExpenseConfig[]>();
      for (const cfg of pending) {
        const key = `${cfg.name}|${cfg.category}|${cfg.frequency}|${cfg.amount}|${cfg.vendor || ""}`;
        const list = byName.get(key) || [];
        list.push(cfg);
        byName.set(key, list);
      }
      let groupsCreated = 0;
      let assignmentsCreated = 0;
      for (const [, rows] of byName) {
        const seed = rows[0];
        const groupId = crypto.randomUUID();
        const group: ExpenseRuleGroup = {
          id: groupId,
          name: seed.name,
          category: seed.category as ExpenseRuleGroup["category"],
          vendorName: seed.vendor,
          amount: Number(seed.amount),
          currency: seed.currency || "JMD",
          frequency: (String(seed.frequency).toLowerCase().replace("yearly", "annually").replace("one-time", "one_time") ||
            "monthly") as ExpenseRuleGroup["frequency"],
          startDate: seed.startDate,
          endDate: seed.endDate,
          autoRenew: seed.autoRenew,
          description: seed.description || seed.notes,
          status: seed.isActive === false ? "paused" : "active",
          version: 1,
          createdBy: actorId(c),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        await kv.set(`expense_rule_group:${groupId}`, stampOrg(group, c));
        groupsCreated += 1;
        for (const cfg of rows) {
          const assignmentId = String(cfg.id);
          const assignment: ExpenseRuleAssignment = {
            id: assignmentId,
            ruleGroupId: groupId,
            vehicleId: cfg.vehicleId,
            fixedExpenseConfigId: assignmentId,
            isActive: cfg.isActive !== false,
            createdAt: cfg.createdAt || nowIso(),
            updatedAt: nowIso(),
          };
          await kv.set(`expense_rule_assignment:${assignmentId}`, stampOrg(assignment, c));
          const patched = {
            ...cfg,
            ruleGroupId: groupId,
            assignmentId,
            managedByExpenseHub: true,
            updatedAt: nowIso(),
          };
          await kv.set(`fixed_expense:${cfg.vehicleId}:${cfg.id}`, stampOrg(patched, c));
          assignmentsCreated += 1;
        }
      }
      // Legacy paid transactions → adapter documents (no re-post)
      const txs = filterByOrg(await kv.getByPrefix("transaction:"), c) as Record<string, unknown>[];
      let legacyDocs = 0;
      for (const tx of txs) {
        const id = String(tx.id || "");
        if (!id) continue;
        const existing = await kv.get(`expense_doc:legacy_${id}`);
        if (existing) continue;
        const status = String(tx.status || "").toLowerCase();
        if (status && status !== "posted" && status !== "approved" && status !== "paid") continue;
        const amount = Math.abs(Number(tx.amount || 0));
        if (!(amount > 0)) continue;
        const category = String(tx.category || "");
        if (/fuel|toll|wallet|trip/i.test(category)) continue;
        const doc: ExpenseDocument = {
          id: `legacy_${id}`,
          status: "paid",
          category,
          description: String(tx.description || category || "Legacy paid expense"),
          incurredDate: String(tx.date || tx.createdAt || "").slice(0, 10) || ymd(),
          currency: String(tx.currency || "JMD"),
          grossAmount: amount,
          taxAmount: 0,
          netAmount: amount,
          allocations: tx.vehicleId
            ? [{ vehicleId: String(tx.vehicleId), amount }]
            : [],
          legacyTransactionId: id,
          version: 1,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          notes: "Legacy paid expense (adapter; not re-posted)",
        };
        await kv.set(`expense_doc:${doc.id}`, stampOrg(doc, c));
        legacyDocs += 1;
      }
      await writeAudit(c, {
        entityType: "rule_group",
        entityId: "migration",
        action: "migrate_apply",
        actorId: actorId(c),
        after: { groupsCreated, assignmentsCreated, legacyDocs },
      });
      return c.json({ success: true, groupsCreated, assignmentsCreated, legacyDocs });
    },
  );

  app.post(
    `${PREFIX}/migrate/shadow-compare`,
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      const configs = filterByOrg(await kv.getByPrefix("fixed_expense:"), c) as FixedExpenseConfig[];
      const rules = filterByOrg(await kv.getByPrefix("expense_rule_group:"), c) as ExpenseRuleGroup[];
      const assignments = filterByOrg(
        await kv.getByPrefix("expense_rule_assignment:"),
        c,
      ) as ExpenseRuleAssignment[];
      const legacyAnnual = configs.reduce(
        (s, r) => s + annualize(Number(r.amount || 0), String(r.frequency || "monthly")),
        0,
      );
      const hubAnnual = assignments
        .filter((a) => a.isActive)
        .reduce((s, a) => {
          const g = rules.find((r) => r.id === a.ruleGroupId);
          if (!g) return s;
          return s + annualize(a.amountOverride ?? g.amount, g.frequency);
        }, 0);
      return c.json({
        legacyRuleCount: configs.length,
        hubRuleGroupCount: rules.length,
        hubAssignmentCount: assignments.length,
        legacyAnnualProjection: Math.round(legacyAnnual * 100) / 100,
        hubAnnualProjection: Math.round(hubAnnual * 100) / 100,
        annualDelta: Math.round((hubAnnual - legacyAnnual) * 100) / 100,
        match: Math.abs(hubAnnual - legacyAnnual) < 0.02 || assignments.length === 0,
      });
    },
  );

}
