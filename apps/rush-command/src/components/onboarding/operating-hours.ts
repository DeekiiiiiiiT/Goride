export interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_HOURS: DayHours = { open: '09:00', close: '21:00', isClosed: false };

export function createDefaultHours(): DayHours[] {
  return DAYS.map(() => ({ ...DEFAULT_HOURS }));
}
