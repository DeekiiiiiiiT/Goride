export type TollV2ImportReportRow = {
  row?: number;
  ref?: string;
  status?: string;
  reason?: string;
  amount_minor?: number;
  driver_id?: string;
  vehicle_id?: string;
  platform_trip_id?: string;
  [key: string]: unknown;
};

export type TollV2ImportReport = {
  decisionId: string;
  at?: string;
  kind?: string;
  fileName?: string;
  rows?: number;
  counts?: Record<string, number>;
  report?: TollV2ImportReportRow[];
  truncated?: boolean;
  by?: { by?: string; at?: string };
};

export type TollV2ImportReportsPayload = TollV2ImportReport[];
