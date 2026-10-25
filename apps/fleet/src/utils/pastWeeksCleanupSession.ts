const ACK = 'goride.pastWeeksCleanupAck';
const RETURN = 'goride.pastWeeksReturnStep';

export function pastWeeksAckKey(driverId: string): string {
  return `${ACK}:${driverId || 'org'}`;
}

export function isPastWeeksAcked(driverId: string): boolean {
  try {
    return localStorage.getItem(pastWeeksAckKey(driverId)) === '1';
  } catch {
    return false;
  }
}

export function ackPastWeeks(driverId: string): void {
  try {
    localStorage.setItem(pastWeeksAckKey(driverId), '1');
  } catch {
    /* private mode */
  }
}

export function setPastWeeksReturn(step: number): void {
  try {
    sessionStorage.setItem(RETURN, String(step));
  } catch {
    /* private mode */
  }
}

export function peekPastWeeksReturn(): number | null {
  try {
    const raw = sessionStorage.getItem(RETURN);
    const step = Number(raw);
    return step >= 1 && step <= 4 ? step : null;
  } catch {
    return null;
  }
}

export function takePastWeeksReturn(): number | null {
  const step = peekPastWeeksReturn();
  if (step == null) return null;
  try {
    sessionStorage.removeItem(RETURN);
  } catch {
    /* private mode */
  }
  return step;
}
