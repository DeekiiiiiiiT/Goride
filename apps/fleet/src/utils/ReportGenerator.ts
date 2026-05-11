import { Trip, DriverMetrics, VehicleMetrics } from '../types/data';
import { FuelEntry } from '../types/fuel';
import { format, startOfWeek, endOfWeek, subDays, isWithinInterval } from 'date-fns';

export interface ReportSummary {
  title: string;
  generatedAt: string;
  period: string;
  stats: {
    label: string;
    value: string | number;
    trend?: number;
  }[];
  details: any[];
}

export const ReportGenerator = {
  generateFinancialSummary(trips: Trip[]): ReportSummary {
    const totalRevenue = trips.reduce((sum, t) => sum + (t.amount || 0), 0);
    const completedTrips = trips.filter(t => t.status === 'Completed').length;
    const avgTicket = completedTrips > 0 ? totalRevenue / completedTrips : 0;
    
    return {
      title: "Financial Summary Report",
      generatedAt: new Date().toISOString(),
      period: "Custom Range",
      stats: [
        { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, trend: 12 },
        { label: "Completed Trips", value: completedTrips },
        { label: "Avg. Fare", value: `$${avgTicket.toFixed(2)}` }
      ],
      details: trips.slice(0, 10) // Sample of data
    };
  },

  generateDriverAudit(metrics: DriverMetrics[]): ReportSummary {
    const avgScore = metrics.reduce((sum, m) => sum + (m.score || 0), 0) / (metrics.length || 1);
    const topPerformer = metrics.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    
    return {
      title: "Driver Performance Audit",
      generatedAt: new Date().toISOString(),
      period: "Monthly Audit",
      stats: [
        { label: "Fleet Avg Score", value: `${avgScore.toFixed(1)}/100` },
        { label: "Active Drivers", value: metrics.length },
        { label: "Top Driver", value: topPerformer?.driverName || 'N/A' }
      ],
      details: metrics
    };
  },

  generateMaintenanceLog(vehicles: VehicleMetrics[]): ReportSummary {
    const criticalCount = vehicles.filter(v => v.maintenanceStatus === 'Critical').length;
    const dueSoonCount = vehicles.filter(v => v.maintenanceStatus === 'Due Soon').length;
    
    return {
      title: "Vehicle Maintenance Forecast",
      generatedAt: new Date().toISOString(),
      period: "Upcoming 30 Days",
      stats: [
        { label: "Critical Vehicles", value: criticalCount },
        { label: "Service Due Soon", value: dueSoonCount },
        { label: "Total Fleet", value: vehicles.length }
      ],
      details: vehicles
    };
  },

  generateFuelReport(entries: FuelEntry[]): ReportSummary {
    const totalSpend = entries.reduce((sum, e) => sum + e.amount, 0);
    const totalGallons = entries.reduce((sum, e) => sum + e.gallons, 0);
    const avgPrice = totalGallons > 0 ? totalSpend / totalGallons : 0;
    
    return {
      title: "Fuel Consumption Analysis",
      generatedAt: new Date().toISOString(),
      period: "Last 30 Days",
      stats: [
        { label: "Total Fuel Cost", value: `$${totalSpend.toLocaleString()}` },
        { label: "Gallons Pumped", value: totalGallons.toFixed(1) },
        { label: "Avg Price/Gal", value: `$${avgPrice.toFixed(2)}` }
      ],
      details: entries.slice(0, 10)
    };
  },

  generateTaxExport(trips: Trip[]): ReportSummary {
    const totalRevenue = trips.reduce((sum, t) => sum + (t.amount || 0), 0);
    // Regional Tax: GCT (General Consumption Tax) - Example 15%
    const gctRate = 0.15;
    const gctAmount = totalRevenue * gctRate;
    
    // Income Tax Estimate (after 25% standard expense deduction)
    const taxableIncome = totalRevenue * 0.75;
    const incomeTaxRate = 0.25;
    const incomeTaxEstimate = taxableIncome * incomeTaxRate;

    return {
      title: "Tax Preparation Export",
      generatedAt: new Date().toISOString(),
      period: "Quarterly Review",
      stats: [
        { label: "Gross Revenue", value: `$${totalRevenue.toLocaleString()}` },
        { label: "GCT (15%)", value: `$${gctAmount.toLocaleString()}` },
        { label: "Income Tax Est.", value: `$${incomeTaxEstimate.toLocaleString()}` }
      ],
      details: [
        { category: 'Gross Revenue', amount: totalRevenue },
        { category: 'Estimated Expenses (25%)', amount: totalRevenue * 0.25 },
        { category: 'Taxable Income', amount: taxableIncome },
        { category: 'Income Tax', amount: incomeTaxEstimate },
        { category: 'GCT Liabilities', amount: gctAmount }
      ]
    };
  }
};