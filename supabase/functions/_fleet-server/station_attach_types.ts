export type StationAttachMethod =
  | "manual_bulk_assign"
  | "platform_ops_override"
  | "merchant_name_autoheal"
  | "merchant_name_autoheal_batch";

export type VerifiedStation = {
  id: string;
  name?: string;
  address?: string;
  status?: string;
  stats?: Record<string, unknown>;
};
