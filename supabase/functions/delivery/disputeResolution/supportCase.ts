import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FaultAttribution, IssueSource, ResolutionAction } from "./types.ts";

export async function createLinkedSupportCase(
  serviceSb: SupabaseClient,
  opts: {
    subject: string;
    body: string;
    customerId?: string | null;
    orderId: string;
    contactEmail?: string | null;
    createdBy?: string | null;
    priority?: string;
    source: IssueSource;
    sourceId: string;
    faultAttribution?: FaultAttribution;
    resolutionAction?: ResolutionAction;
    autoResolved?: boolean;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await serviceSb
    .from("support_cases")
    .insert({
      subject: opts.subject,
      body: opts.body,
      status: opts.autoResolved ? "resolved" : "open",
      priority: opts.priority ?? "normal",
      customer_id: opts.customerId ?? null,
      order_id: opts.orderId,
      contact_email: opts.contactEmail ?? null,
      created_by: opts.createdBy ?? null,
      source: opts.source,
      source_id: opts.sourceId,
      fault_attribution: opts.faultAttribution ?? "undetermined",
      resolution_action: opts.resolutionAction ?? null,
      auto_resolved: opts.autoResolved ?? false,
      resolution_notes: opts.autoResolved ? "Auto-resolved by dispute engine" : null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to create support case");
  return data as Record<string, unknown>;
}

export async function createOrderDispute(
  serviceSb: SupabaseClient,
  opts: {
    orderId: string;
    raisedBy: string;
    reason: string;
    status: string;
    supportCaseId?: string;
    faultAttribution?: FaultAttribution;
    customerIssueId?: string;
    courierIssueId?: string;
    refundAmount?: number | null;
    resolutionNotes?: string;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await serviceSb
    .from("order_disputes")
    .insert({
      order_id: opts.orderId,
      raised_by: opts.raisedBy,
      reason: opts.reason,
      status: opts.status,
      support_case_id: opts.supportCaseId ?? null,
      fault_attribution: opts.faultAttribution ?? "undetermined",
      customer_issue_id: opts.customerIssueId ?? null,
      courier_issue_id: opts.courierIssueId ?? null,
      refund_amount: opts.refundAmount ?? null,
      resolution_notes: opts.resolutionNotes ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to create order dispute");
  return data as Record<string, unknown>;
}
