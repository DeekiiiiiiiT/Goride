import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

export interface PeriodWeekOption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

/** Monday-start weeks, same as Statement Summary / Uber-style reporting weeks. */
export function generatePeriodWeekOptions(weekCount = 12): PeriodWeekOption[] {
  const today = new Date();
  const periods: PeriodWeekOption[] = [];

  for (let i = 0; i < weekCount; i++) {
    const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(today, i), { weekStartsOn: 1 });

    periods.push({
      id: `week-${i}`,
      label: `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`,
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
    });
  }

  return periods;
}

export function findPeriodWeekOptionByRange(
  options: PeriodWeekOption[],
  startDate?: string,
  endDate?: string,
): PeriodWeekOption | undefined {
  if (!startDate || !endDate) return undefined;
  return options.find((p) => p.startDate === startDate && p.endDate === endDate);
}
