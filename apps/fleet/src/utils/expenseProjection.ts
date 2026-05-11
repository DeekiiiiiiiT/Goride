import { FixedExpenseConfig, ExpenseFrequency } from '../types/expenses';
import { startOfMonth, endOfMonth, addMonths, isBefore, isAfter, getMonth, getDate, getYear, addWeeks, setMonth, setYear, setDate, startOfYear, endOfYear, addYears } from 'date-fns';

export type ProjectionViewBasis = 'cash_flow' | 'daily_rate' | 'weekly_rate' | 'monthly_average';

export interface MonthlyProjection {
    monthIndex: number; // 0 = Jan, 11 = Dec
    amount: number;
    isProjected: boolean; // True if in the future (relative to today)
}

export interface AnnualExpenseProjection {
    configId: string;
    configName: string;
    category: string;
    monthlyAmounts: number[]; // Array of 12 numbers (Jan-Dec)
    total: number;
}

/**
 * Generates a 12-month projection for a given expense configuration for a specific year.
 */
export const calculateAnnualProjection = (
    config: FixedExpenseConfig, 
    year: number
): AnnualExpenseProjection => {
    const monthlyAmounts = Array(12).fill(0);
    const startDate = new Date(config.startDate);
    const endDate = config.endDate ? new Date(config.endDate) : null;
    
    // Normalize bounds to the target year
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 0, 1));

    let currentDate = startDate;

    // 1. If start date is in future years, return 0s
    if (getYear(startDate) > year) {
        return {
            configId: config.id || 'temp',
            configName: config.name,
            category: config.category,
            monthlyAmounts,
            total: 0
        };
    }

    // 2. Logic based on frequency
    // Note: The switch case matches the lowercase values from ExpenseFrequency type
    // but we should handle both case styles to be safe or ensure strict matching.
    const frequency = config.frequency.toLowerCase();

    switch (frequency) {
        case 'daily': {
            // Iterate every day
            let iterator = startDate;
            
            // Fast forward to this year if needed
            if (getYear(iterator) < year) {
                iterator = startOfYear(new Date(year, 0, 1));
            }

            while (getYear(iterator) <= year) {
                if (endDate && isAfter(iterator, endDate)) break;

                if (getYear(iterator) === year) {
                     // Check if startDate is later in the year
                     if (isBefore(iterator, startDate)) {
                        iterator = setDate(iterator, getDate(iterator) + 1);
                        continue;
                     }

                    const month = getMonth(iterator);
                    monthlyAmounts[month] += config.amount;
                }
                
                iterator = setDate(iterator, getDate(iterator) + 1);
            }
            break;
        }

        case 'monthly': {
            // If started in previous years, effectively starts Jan 1st of this year (or actual start date if in this year)
            // Iterate months
            let iterator = startDate;
            
            // Fast forward to this year if needed
            if (getYear(iterator) < year) {
                // If monthly, it hits every month. So just start at Jan of target year.
                // Exception: "Day of month" logic? Usually monthly expenses are just "in Jan", "in Feb".
                // We'll assume it hits on the same day of month.
                iterator = setYear(iterator, year);
                // If date is 31st and Feb only has 28, date-fns handles this (clamps to end of month)
            }

            // Loop until end of year or end date
            while (getYear(iterator) <= year) {
                if (endDate && isAfter(iterator, endDate)) break;
                
                if (getYear(iterator) === year) {
                    const month = getMonth(iterator);
                    monthlyAmounts[month] += config.amount;
                }
                
                iterator = addMonths(iterator, 1);
            }
            break;
        }

        case 'weekly': {
            // Iterate weeks from start date
            let iterator = startDate;

            // Fast forward optimization (not strictly necessary for small ranges but good practice)
            // Just loop is fine for performance here
            
            while (getYear(iterator) <= year) {
                if (endDate && isAfter(iterator, endDate)) break;

                if (getYear(iterator) === year) {
                     if (getYear(iterator) < year) {
                         iterator = addWeeks(iterator, 1);
                         continue; 
                     }
                    const month = getMonth(iterator);
                    monthlyAmounts[month] += config.amount;
                }

                iterator = addWeeks(iterator, 1);
            }
            break;
        }

        // Handle quarterly/annually if they were added to types, 
        // but currently types/expenses.ts only has daily, weekly, monthly, annually.
        // We will map 'annually' to the Yearly logic.

        case 'annually':
        case 'yearly': {
            let iterator = startDate;
            
            // Fast forward
            while (getYear(iterator) < year) {
                iterator = addYears(iterator, 1);
            }

            while (getYear(iterator) <= year) {
                if (endDate && isAfter(iterator, endDate)) break;

                if (getYear(iterator) === year) {
                    const month = getMonth(iterator);
                    monthlyAmounts[month] += config.amount;
                }

                iterator = addYears(iterator, 1);
            }
            break;
        }

        case 'one-time': {
            if (getYear(startDate) === year) {
                const month = getMonth(startDate);
                monthlyAmounts[month] += config.amount;
            }
            break;
        }
    }

    const total = monthlyAmounts.reduce((acc, curr) => acc + curr, 0);

    return {
        configId: config.id || 'temp',
        configName: config.name,
        category: config.category,
        monthlyAmounts,
        total
    };
};

/**
 * Helper to convert any frequency amount to a daily equivalent.
 */
export const convertAmountToDaily = (amount: number, frequency: string): number => {
    switch (frequency.toLowerCase()) {
        case 'daily': return amount;
        case 'weekly': return amount / 7;
        case 'monthly': return (amount * 12) / 365;
        case 'quarterly': return (amount * 4) / 365;
        case 'yearly': 
        case 'annually': return amount / 365;
        case 'one-time': return amount / 365; // Amortize over 1 year
        default: return 0;
    }
};

/**
 * Calculates amortized values (Daily, Weekly, Monthly Avg) for a given year.
 */
export const calculateAmortizedProjection = (
    config: FixedExpenseConfig,
    year: number,
    basis: ProjectionViewBasis
): AnnualExpenseProjection => {
    // If basis is cash_flow, revert to standard calculation
    if (basis === 'cash_flow') {
        return calculateAnnualProjection(config, year);
    }

    const monthlyAmounts = Array(12).fill(0);
    const startDate = new Date(config.startDate);
    const endDate = config.endDate ? new Date(config.endDate) : null;
    
    // Calculate daily cost
    const dailyCost = convertAmountToDaily(config.amount, config.frequency);
    
    // Determine output multiplier
    let multiplier = 1;
    if (basis === 'weekly_rate') multiplier = 7;
    if (basis === 'monthly_average') multiplier = 365 / 12;

    const baseValue = dailyCost * multiplier;

    for (let i = 0; i < 12; i++) {
        const monthStart = new Date(year, i, 1);
        const monthEnd = endOfMonth(monthStart);

        // Check if expense is active in this month
        // 1. Starts after month ends? -> Inactive
        if (isAfter(startDate, monthEnd)) continue;
        
        // 2. Ends before month starts? -> Inactive
        if (endDate && isBefore(endDate, monthStart)) continue;

        // If active, we assign the amortized rate
        monthlyAmounts[i] = baseValue;
    }

    // For amortized views, the "Total" is typically the Sum of the columns in the visual table.
    // However, "Total Daily Rate" for the year doesn't make intuitive sense as a sum.
    // But to keep the table footer consistent (Sum of Jan + Sum of Feb...), we return the sum.
    const total = monthlyAmounts.reduce((a, b) => a + b, 0);

    return {
        configId: config.id || 'temp',
        configName: config.name,
        category: config.category,
        monthlyAmounts,
        total
    };
};

/**
 * Aggregates multiple projections into totals per category and grand totals.
 */
export const aggregateProjections = (projections: AnnualExpenseProjection[]) => {
    const monthlyTotals = Array(12).fill(0);
    let grandTotal = 0;
    
    // Group by category
    const categoryTotals: Record<string, number[]> = {};

    projections.forEach(proj => {
        grandTotal += proj.total;
        
        if (!categoryTotals[proj.category]) {
            categoryTotals[proj.category] = Array(12).fill(0);
        }

        proj.monthlyAmounts.forEach((amount, monthIndex) => {
            monthlyTotals[monthIndex] += amount;
            categoryTotals[proj.category][monthIndex] += amount;
        });
    });

    return {
        monthlyTotals,
        grandTotal,
        categoryTotals
    };
};
