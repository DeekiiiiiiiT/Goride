import { startOfMonth, endOfMonth, eachDayOfInterval, format, addWeeks, startOfYear, endOfYear, eachWeekOfInterval, getWeek } from "date-fns";

export interface DailyRow {
  date: string;
  dayOfWeek: string;
  target: number;
  cumulative: number;
}

export interface WeeklyRow {
  weekNumber: number;
  dateRange: string;
  target: number;
  cumulative: number;
}

export interface MonthlyRow {
  monthName: string;
  target: number;
  cumulative: number;
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const generateStandardSchedule = (daysCount: number): number[] => {
  // Days count must be between 1 and 7
  const count = Math.max(1, Math.min(7, daysCount));
  
  // Return standard working days starting from Monday (1)
  // 1 Day: [1] (Mon)
  // 5 Days: [1, 2, 3, 4, 5] (Mon-Fri)
  // 7 Days: [0, 1, 2, 3, 4, 5, 6] (Sun-Sat)
  
  if (count === 7) return [0, 1, 2, 3, 4, 5, 6];
  
  // Create array 1 to count
  return Array.from({ length: count }, (_, i) => i + 1);
};

export const generateDailyProjection = (weeklyAmount: number, daysCount: number): DailyRow[] => {
  const workingDays = generateStandardSchedule(daysCount);
  const dailyRate = weeklyAmount / workingDays.length;

  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  
  const days = eachDayOfInterval({ start, end });
  
  let cumulative = 0;
  
  return days.map(day => {
    const dayOfWeek = day.getDay();
    const isWorkingDay = workingDays.includes(dayOfWeek);
    const target = isWorkingDay ? dailyRate : 0;
    cumulative += target;
    return {
      date: format(day, 'MMM dd, yyyy'),
      dayOfWeek: format(day, 'EEEE'),
      target: target,
      cumulative: cumulative
    };
  });
};

export const generateWeeklyProjection = (weeklyAmount: number): WeeklyRow[] => {
  const now = new Date();
  const start = startOfYear(now);
  const end = endOfYear(now);
  
  // Get all weeks in the current year
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  
  let cumulative = 0;
  
  return weeks.map((weekStart, index) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    cumulative += weeklyAmount;
    
    return {
      weekNumber: index + 1,
      dateRange: `${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd')}`,
      target: weeklyAmount,
      cumulative: cumulative
    };
  });
};

export const generateMonthlyProjection = (weeklyAmount: number, daysCount: number): MonthlyRow[] => {
  const workingDays = generateStandardSchedule(daysCount);
  const dailyRate = weeklyAmount / workingDays.length;
  
  const now = new Date();
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  
  const daysInYear = eachDayOfInterval({ start: yearStart, end: yearEnd });
  
  const monthsData = new Map<string, number>();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  // Initialize map
  monthNames.forEach(m => monthsData.set(m, 0));
  
  // Calculate total for each month
  daysInYear.forEach(day => {
    const monthName = format(day, 'MMMM');
    const dayOfWeek = day.getDay();
    if (workingDays.includes(dayOfWeek)) {
       const current = monthsData.get(monthName) || 0;
       monthsData.set(monthName, current + dailyRate);
    }
  });

  let cumulative = 0;
  
  return monthNames.map(month => {
    const target = monthsData.get(month) || 0;
    cumulative += target;
    return {
      monthName: month,
      target: target,
      cumulative: cumulative
    };
  });
};
