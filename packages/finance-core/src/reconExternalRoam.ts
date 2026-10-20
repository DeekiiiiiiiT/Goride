/**
 * Roam-issued fuel statement SLA copy (recon P6).
 * Prior-week statement expected by the Wednesday after that Mon–Sun week ends.
 */

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + days);
  return local.toISOString().slice(0, 10);
}

/** Wednesday (fleet calendar) after the Mon–Sun week anchored at weekKey (Monday). */
export function roamFuelStatementDeadlineYmd(weekKey: string): string {
  const anchor = String(weekKey || '').slice(0, 10);
  return addDaysYmd(anchor, 9);
}

function formatDeadlineLabel(deadlineYmd: string): string {
  const [y, m, d] = deadlineYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const day = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const rest = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${rest}`;
}

export type RoamFuelExternalCopy = {
  deadlineYmd: string;
  deadlineLabel: string;
  isOverdue: boolean;
  statusLine: string;
};

export function roamFuelExternalCopy(
  weekKey: string,
  now: Date = new Date(),
): RoamFuelExternalCopy {
  const deadlineYmd = roamFuelStatementDeadlineYmd(weekKey);
  const todayYmd = now.toISOString().slice(0, 10);
  const isOverdue = todayYmd > deadlineYmd;
  const deadlineLabel = formatDeadlineLabel(deadlineYmd);
  const statusLine = isOverdue
    ? `Waiting on Roam · overdue (expected by Wednesday ${deadlineLabel})`
    : 'Waiting on Roam · expected by Wednesday';
  return { deadlineYmd, deadlineLabel, isOverdue, statusLine };
}
