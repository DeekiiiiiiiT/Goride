import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { orchestrateSystemOrderRefund } from "../admin/orderRefund.ts";
import { applyMerchantFaultDebit } from "./merchantDebit.ts";
import { notifyDisputeResolution } from "./notifications.ts";
import { createLinkedSupportCase, createOrderDispute } from "./supportCase.ts";
import type { FaultAttribution, ProcessDisputeResult, ResolutionAction } from "./types.ts";
import { isForgottenOrderCandidate, shouldEvaluateForgottenRule } from "./forgottenOrderRule.ts";

function autoRefundCapJmd(): number {
  const raw = Deno.env.get("DASH_AUTO_DISPUTE_MAX_REFUND_JMD");
  if (raw) return Number(raw) || 0;
  return 4000;
}

function isAutoDisputeEnabled(): boolean {
  return Deno.env.get("RUSH_AUTO_DISPUTE_RESOLUTION") !== "false";
}

async function hasRuleRun(serviceSb: SupabaseClient, orderId: string, ruleId: string): Promise<boolean> {
  const { data } = await serviceSb
    .from("dispute_resolution_actions")
    .select("id")
    .eq("order_id", orderId)
    .eq("rule_id", ruleId)
    .maybeSingle();
  return Boolean(data?.id);
}

async function logRuleAction(
  serviceSb: SupabaseClient,
  orderId: string,
  ruleId: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await serviceSb.from("dispute_resolution_actions").upsert({
    order_id: orderId,
    rule_id: ruleId,
    action,
    details: details ?? null,
  }, { onConflict: "order_id,rule_id" });
}

async function getMaxCourierWaitMinutes(serviceSb: SupabaseClient, orderId: string): Promise<number> {
  const { data: waitEvents } = await serviceSb
    .from("courier_wait_events")
    .select("wait_minutes")
    .eq("order_id", orderId);

  let maxWait = 0;
  for (const row of waitEvents ?? []) {
    maxWait = Math.max(maxWait, Number(row.wait_minutes || 0));
  }

  const { data: issues } = await serviceSb
    .from("courier_delivery_issues")
    .select("notes")
    .eq("order_id", orderId)
    .eq("issue_type", "long_wait");

  for (const row of issues ?? []) {
    const notes = String(row.notes || "");
    const match = notes.match(/wait:(\d+)min/i);
    if (match) maxWait = Math.max(maxWait, Number(match[1]));
    if (notes.includes("15+")) maxWait = Math.max(maxWait, 15);
  }

  return maxWait;
}

const ISSUE_LABELS: Record<string, string> = {
  missing: "Missing items",
  wrong: "Wrong items",
  quality: "Food quality",
  payment: "Payment issue",
  safety: "Safety issue",
  account: "Account issue",
  late_order: "Order taking too long",
  never_arrived: "Order never arrived",
  other: "Order issue",
};

export type ProcessDisputeInput = {
  serviceSb: SupabaseClient;
  orderId: string;
  issueType: string;
  notes: string;
  source: "customer_issue" | "courier_issue";
  sourceId: string;
  customerId?: string | null;
  customerUserId?: string | null;
  contactEmail?: string | null;
  createdBy?: string | null;
  photoPath?: string | null;
};

/** Evaluate dispute rules and optionally auto-resolve. */
export async function processDispute(input: ProcessDisputeInput): Promise<ProcessDisputeResult> {
  const { serviceSb, orderId, issueType, notes, source, sourceId } = input;

  const { data: order } = await serviceSb
    .from("orders")
    .select("id, status, order_number, merchant_id, customer_id, total, payment_status, courier_id, ready_at")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    return { status: "MANUAL_REVIEW", message: "Order not found for dispute evaluation." };
  }

  const orderRef = String(order.order_number || order.id);
  const subject = `${ISSUE_LABELS[issueType] ?? "Order issue"} — ${orderRef}`;
  const body = input.photoPath ? `${notes}\n\nPhoto: ${input.photoPath}` : notes;

  // R1: Forgotten / never fulfilled order with courier wait evidence
  if (isAutoDisputeEnabled() && isForgottenOrderCandidate(issueType, String(order.status))) {
    const waitMinutes = await getMaxCourierWaitMinutes(serviceSb, orderId);
    const ruleId = "R1_forgotten_order";

    if (shouldEvaluateForgottenRule(issueType, String(order.status), waitMinutes) && !await hasRuleRun(serviceSb, orderId, ruleId)) {
      const refundAmount = Number(order.total || 0);
      const cap = autoRefundCapJmd();
      if (refundAmount > 0 && refundAmount <= cap && String(order.payment_status) === "paid") {
        const refundResult = await orchestrateSystemOrderRefund({
          orderId,
          amount: refundAmount,
          reason: `Auto: forgotten order — courier waited ${waitMinutes}min`,
          initiatedBy: "system",
          actorId: input.createdBy,
        });

        if (refundResult.ok) {
          const fault: FaultAttribution = "merchant_fault";
          const resolutionAction: ResolutionAction = "full_refund";

          const supportCase = await createLinkedSupportCase(serviceSb, {
            subject,
            body,
            customerId: input.customerId ?? order.customer_id,
            orderId,
            contactEmail: input.contactEmail,
            createdBy: input.createdBy,
            priority: "urgent",
            source: source === "customer_issue" ? "customer_issue" : "courier_issue",
            sourceId,
            faultAttribution: fault,
            resolutionAction,
            autoResolved: true,
          });

          const dispute = await createOrderDispute(serviceSb, {
            orderId,
            raisedBy: source === "customer_issue" ? "customer" : "courier",
            reason: notes,
            status: "refunded",
            supportCaseId: String(supportCase.id),
            faultAttribution: fault,
            customerIssueId: source === "customer_issue" ? sourceId : undefined,
            courierIssueId: source === "courier_issue" ? sourceId : undefined,
            refundAmount,
            resolutionNotes: "Auto-resolved: merchant fault forgotten order",
          });

          if (order.merchant_id) {
            await applyMerchantFaultDebit(serviceSb, {
              merchantId: String(order.merchant_id),
              orderId,
              amount: refundAmount,
              reason: `Chargeback: forgotten order ${orderRef}`,
              createdBy: input.createdBy,
            });
          }

          await serviceSb
            .from(source === "customer_issue" ? "customer_order_issues" : "courier_delivery_issues")
            .update({
              support_case_id: supportCase.id,
              dispute_id: dispute.id,
              status: "resolved",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", sourceId);

          await logRuleAction(serviceSb, orderId, ruleId, "full_refund", {
            waitMinutes,
            refundAmount,
            caseId: supportCase.id,
            disputeId: dispute.id,
          });

          await notifyDisputeResolution(serviceSb, {
            orderId,
            customerUserId: input.customerUserId,
            event: "refund_issued",
            message: `Refund of ${refundAmount.toFixed(2)} JMD issued`,
            refundAmount,
          });

          return {
            status: "AUTO_RESOLVED",
            message: "Refund issued. Restaurant delay confirmed.",
            fault,
            resolutionAction,
            refundAmount,
            caseId: String(supportCase.id),
            disputeId: String(dispute.id),
            autoResolved: true,
          };
        }
      }
    }
  }

  // R6: Partial auto-refund for missing items with photo (post-delivery)
  if (
    isAutoDisputeEnabled() &&
    issueType === "missing" &&
    ["delivered", "completed"].includes(String(order.status)) &&
    input.photoPath &&
    String(order.payment_status) === "paid"
  ) {
    const ruleId = "R6_missing_items_partial";
    if (!await hasRuleRun(serviceSb, orderId, ruleId)) {
      const orderTotal = Number(order.total || 0);
      const partialCap = Math.min(orderTotal * 0.5, autoRefundCapJmd());
      if (partialCap > 0) {
        const refundResult = await orchestrateSystemOrderRefund({
          orderId,
          amount: partialCap,
          reason: "Auto: partial refund missing items (photo provided)",
          initiatedBy: "system",
          actorId: input.createdBy,
        });
        if (refundResult.ok) {
          const supportCase = await createLinkedSupportCase(serviceSb, {
            subject,
            body,
            customerId: input.customerId ?? order.customer_id,
            orderId,
            contactEmail: input.contactEmail,
            createdBy: input.createdBy,
            priority: "high",
            source: source === "customer_issue" ? "customer_issue" : "courier_issue",
            sourceId,
            faultAttribution: "merchant_fault",
            resolutionAction: "partial_refund",
            autoResolved: true,
          });
          const dispute = await createOrderDispute(serviceSb, {
            orderId,
            raisedBy: "customer",
            reason: notes,
            status: "refunded",
            supportCaseId: String(supportCase.id),
            faultAttribution: "merchant_fault",
            customerIssueId: source === "customer_issue" ? sourceId : undefined,
            refundAmount: partialCap,
            resolutionNotes: "Auto partial refund — missing items with photo",
          });
          if (order.merchant_id) {
            await applyMerchantFaultDebit(serviceSb, {
              merchantId: String(order.merchant_id),
              orderId,
              amount: partialCap,
              reason: `Partial chargeback: missing items ${orderRef}`,
              createdBy: input.createdBy,
            });
          }
          await serviceSb
            .from("customer_order_issues")
            .update({
              support_case_id: supportCase.id,
              dispute_id: dispute.id,
              status: "resolved",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", sourceId);
          await logRuleAction(serviceSb, orderId, ruleId, "partial_refund", { partialCap });
          await notifyDisputeResolution(serviceSb, {
            orderId,
            customerUserId: input.customerUserId,
            event: "refund_issued",
            message: `Partial refund ${partialCap.toFixed(2)} JMD`,
            refundAmount: partialCap,
          });
          return {
            status: "AUTO_RESOLVED",
            message: `We credited ${partialCap.toFixed(2)} JMD for missing items.`,
            fault: "merchant_fault",
            resolutionAction: "partial_refund",
            refundAmount: partialCap,
            caseId: String(supportCase.id),
            disputeId: String(dispute.id),
            autoResolved: true,
          };
        }
      }
    }
  }

  // R2: Never arrived post-delivery window — urgent manual
  if (issueType === "never_arrived" && !["delivered", "completed"].includes(String(order.status))) {
    const supportCase = await createLinkedSupportCase(serviceSb, {
      subject,
      body,
      customerId: input.customerId ?? order.customer_id,
      orderId,
      contactEmail: input.contactEmail,
      createdBy: input.createdBy,
      priority: "urgent",
      source: source === "customer_issue" ? "customer_issue" : "courier_issue",
      sourceId,
      faultAttribution: "undetermined",
      resolutionAction: "manual_review",
    });

    const dispute = await createOrderDispute(serviceSb, {
      orderId,
      raisedBy: source === "customer_issue" ? "customer" : "courier",
      reason: notes,
      status: "investigating",
      supportCaseId: String(supportCase.id),
      customerIssueId: source === "customer_issue" ? sourceId : undefined,
      courierIssueId: source === "courier_issue" ? sourceId : undefined,
    });

    await serviceSb
      .from(source === "customer_issue" ? "customer_order_issues" : "courier_delivery_issues")
      .update({ support_case_id: supportCase.id, dispute_id: dispute.id })
      .eq("id", sourceId);

    await notifyDisputeResolution(serviceSb, {
      orderId,
      customerUserId: input.customerUserId,
      event: "case_created",
      message: `Case ${String(supportCase.id).slice(0, 8)} — urgent review`,
    });

    return {
      status: "MANUAL_REVIEW",
      message: "We're reviewing your report. Reference saved.",
      caseId: String(supportCase.id),
      disputeId: String(dispute.id),
    };
  }

  // Default: create case + dispute for manual review
  const priority =
    issueType === "quality" || issueType === "missing" || issueType === "safety" ? "high" : "normal";

  const supportCase = await createLinkedSupportCase(serviceSb, {
    subject,
    body,
    customerId: input.customerId ?? order.customer_id,
    orderId,
    contactEmail: input.contactEmail,
    createdBy: input.createdBy,
    priority,
    source: source === "customer_issue" ? "customer_issue" : "courier_issue",
    sourceId,
    faultAttribution: "undetermined",
    resolutionAction: "manual_review",
  });

  const dispute = await createOrderDispute(serviceSb, {
    orderId,
    raisedBy: source === "customer_issue" ? "customer" : "courier",
    reason: notes,
    status: "open",
    supportCaseId: String(supportCase.id),
    customerIssueId: source === "customer_issue" ? sourceId : undefined,
    courierIssueId: source === "courier_issue" ? sourceId : undefined,
  });

  await serviceSb
    .from(source === "customer_issue" ? "customer_order_issues" : "courier_delivery_issues")
    .update({ support_case_id: supportCase.id, dispute_id: dispute.id })
    .eq("id", sourceId);

  await notifyDisputeResolution(serviceSb, {
    orderId,
    customerUserId: input.customerUserId,
    event: "case_created",
    message: `Case ${String(supportCase.id).slice(0, 8)} created`,
  });

  return {
    status: "MANUAL_REVIEW",
    message: "We're looking into this. Your reference is saved.",
    caseId: String(supportCase.id),
    disputeId: String(dispute.id),
  };
}

/** R5: Log courier unassign redispatch (no refund). */
export async function logCourierUnassignRedispatch(
  serviceSb: SupabaseClient,
  orderId: string,
  courierUserId: string,
): Promise<void> {
  const ruleId = "R5_courier_unassign";
  if (await hasRuleRun(serviceSb, orderId, ruleId)) return;

  await logRuleAction(serviceSb, orderId, ruleId, "redispatch", { courierUserId });

  await notifyDisputeResolution(serviceSb, {
    orderId,
    event: "redispatch",
    message: "Finding a new courier for your order",
  });
}
