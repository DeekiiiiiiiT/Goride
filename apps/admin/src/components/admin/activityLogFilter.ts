export type AuditEntryLike = {
  actorName?: string;
  action?: string;
  targetId?: string;
  targetEmail?: string;
  details?: string;
  timestamp?: string;
};

export function filterAuditLogEntries(
  entries: AuditEntryLike[],
  opts: {
    conflictId?: string | null;
    topicFilter?: string | null;
    actionFilter?: string;
    whoFilter?: string;
    dateFilter?: string;
    isToday?: (iso: string) => boolean;
    isWithinDays?: (iso: string, days: number) => boolean;
  },
): AuditEntryLike[] {
  let list = [...entries];
  const conflictId = opts.conflictId?.trim();
  if (conflictId) {
    const needle = conflictId.toLowerCase();
    list = list.filter(
      (e) =>
        e.targetId?.toLowerCase() === needle
        || e.details?.toLowerCase().includes(needle)
        || e.action?.toLowerCase().includes(needle),
    );
  }
  const topic = opts.topicFilter;
  if (topic === "platform_revision") {
    list = list.filter(
      (e) =>
        e.action?.toLowerCase().includes("platform")
        || e.details?.toLowerCase().includes("platform_revision")
        || e.details?.toLowerCase().includes("platform"),
    );
  }
  if (topic === "conflict") {
    list = list.filter(
      (e) =>
        e.action?.toLowerCase().includes("conflict")
        || e.action?.toLowerCase().includes("auto_match")
        || e.details?.toLowerCase().includes("conflict")
        || e.details?.toLowerCase().includes("auto_match")
        || e.details?.toLowerCase().includes("part_match"),
    );
  }
  if (topic === "parts") {
    list = list.filter((e) => {
      const action = e.action?.toLowerCase() ?? "";
      const details = e.details?.toLowerCase() ?? "";
      return (
        action.includes("part_")
        || action.includes("catalog")
        || action.includes("self_serve")
        || action.includes("import_batch")
        || details.includes("part_master")
        || details.includes("part_listing")
        || details.includes("self_serve")
        || details.includes("catalog")
        || details.includes("part import")
      );
    });
  }
  if (opts.actionFilter && opts.actionFilter !== "all") {
    list = list.filter((e) => e.action === opts.actionFilter);
  }
  if (opts.whoFilter && opts.whoFilter !== "all") {
    list = list.filter((e) => e.actorName === opts.whoFilter);
  }
  if (opts.dateFilter === "today" && opts.isToday) {
    list = list.filter((e) => e.timestamp && opts.isToday!(e.timestamp));
  } else if (opts.dateFilter === "7d" && opts.isWithinDays) {
    list = list.filter((e) => e.timestamp && opts.isWithinDays!(e.timestamp, 7));
  } else if (opts.dateFilter === "30d" && opts.isWithinDays) {
    list = list.filter((e) => e.timestamp && opts.isWithinDays!(e.timestamp, 30));
  }
  return list;
}
