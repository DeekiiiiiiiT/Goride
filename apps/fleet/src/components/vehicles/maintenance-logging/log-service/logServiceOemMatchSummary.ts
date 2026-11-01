import type { MaintenanceLogLine } from "../../../../types/maintenance";

export type LogServiceOemMatchSummary = {
  cleared: boolean;
  missingVerifiedCount: number;
  replaceLineCount: number;
};

/** Replace lines need a linked part with confirmed fit (from compatible-parts catalog). */
export function logServiceOemMatchSummary(
  lines: MaintenanceLogLine[] | undefined | null,
): LogServiceOemMatchSummary {
  const active = (lines ?? []).filter((l) => !l.recommended && !l.declined);
  const replaceLines = active.filter((l) => l.action === "replace");
  let missingVerifiedCount = 0;
  for (const line of replaceLines) {
    const ok = Boolean(line.partId) && line.partConfirmedFit === true;
    if (!ok) missingVerifiedCount += 1;
  }
  return {
    replaceLineCount: replaceLines.length,
    missingVerifiedCount,
    cleared: replaceLines.length === 0 || missingVerifiedCount === 0,
  };
}
