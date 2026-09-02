export type FaultAttribution =
  | "merchant_fault"
  | "courier_fault"
  | "platform_fault"
  | "customer_fault"
  | "shared_fault"
  | "undetermined";

export type ResolutionAction =
  | "full_refund"
  | "partial_refund"
  | "remake_order"
  | "courier_unassign"
  | "redispatch"
  | "no_action"
  | "merchant_warning"
  | "manual_review";

export type DisputeResolutionStatus = "AUTO_RESOLVED" | "MANUAL_REVIEW" | "REJECTED";

export type ProcessDisputeResult = {
  status: DisputeResolutionStatus;
  message: string;
  fault?: FaultAttribution;
  resolutionAction?: ResolutionAction;
  refundAmount?: number;
  caseId?: string;
  disputeId?: string;
  autoResolved?: boolean;
};

export type IssueSource = "customer_issue" | "courier_issue" | "chat_sos" | "rating" | "admin";
