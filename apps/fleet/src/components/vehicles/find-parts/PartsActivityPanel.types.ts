type ActivityList = { items: Array<Record<string, unknown>>; total: number };

export type PartsActivity = {
  requests: ActivityList;
  quotes: ActivityList;
  repeatAlerts: ActivityList;
  warrantyClaims: ActivityList;
  cores: ActivityList;
  meta?: {
    medianAddMinutes?: number | null;
    batchMatchRate?: number | null;
    resolvedCount30d?: number;
    queueDepth?: number;
  };
};
