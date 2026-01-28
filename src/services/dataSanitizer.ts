import { 
  FleetAnalysisResult, 
  DriverMetrics, 
  VehicleMetrics, 
  OrganizationMetrics,
  Trip,
  AuditRecord,
  AuditReport,
  AuditIssue,
  AuditStatus,
  ImportAuditState 
} from '../types/data';

export class DataSanitizer {

  /**
   * Main entry point: Takes raw AI output and converts it into a Smart Audit State
   */
  static audit(raw: FleetAnalysisResult, trips?: Trip[]): ImportAuditState {
    const drivers = raw.drivers.map(d => this.auditDriver(d));
    const vehicles = raw.vehicles.map(v => this.auditVehicle(v));
    // Wrap the single financial object
    const financials = this.auditFinancials(raw.financials);
    
    // Audit Trips if provided
    const auditedTrips = trips ? trips.map(t => this.auditTrip(t)) : [];

    const report = this.generateReport(drivers, vehicles, financials, auditedTrips);

    return {
      raw,
      sanitized: {
        drivers,
        vehicles,
        financials,
        trips: auditedTrips
      },
      report
    };
  }
  
  // --- Trip Validation (New in Phase 3) ---
  public static auditTrip(trip: Trip): AuditRecord<Trip> {
      const issues: AuditIssue[] = [];
      let status: AuditStatus = 'healthy';
      
      // 1. Phantom Trip Check: Earnings but no distance/duration
      // Allow for tips or adjustments which might not have distance, but "UberX" service type should usually have distance.
      if (trip.amount > 0 && (trip.distance === 0 || trip.distance === undefined) && trip.status === 'Completed') {
          // Check if it's just a tip, bonus, or adjustment
          const isFare = !trip.notes?.toLowerCase().match(/tip|bonus|adjustment|gratuity|misc|other|cancel/);
          if (isFare) {
              issues.push({ id: crypto.randomUUID(), field: 'distance', message: 'Financial Adjustment (Zero Distance Record)', severity: 'warning' });
              if (status !== 'critical') status = 'warning';
          }
      }
      
      // 2. Future Date Check
      if (new Date(trip.date) > new Date()) {
           issues.push({ id: crypto.randomUUID(), field: 'date', message: 'Future Date Detected', severity: 'critical' });
           status = 'critical';
      }
      
      // 3. High Fare Anomaly - REMOVED per user request
      /* 
      if (trip.amount > 500) {
           issues.push({ id: crypto.randomUUID(), field: 'amount', message: 'High Value Transaction (>$500)', severity: 'warning' });
           if (status !== 'critical') status = 'warning';
      }
      */

      return {
          data: trip,
          originalData: { ...trip },
          status,
          issues,
          isFlagged: status !== 'healthy'
      };
  }

  // --- Driver Validation ---
  public static auditDriver(driver: DriverMetrics): AuditRecord<DriverMetrics> {
    const issues: AuditIssue[] = [];
    let status: AuditStatus = 'healthy';

    // Critical Checks
    if (!driver.driverName || driver.driverName === 'Unknown') {
      issues.push({ id: crypto.randomUUID(), field: 'driverName', message: 'Missing Driver Name', severity: 'critical' });
      status = 'critical';
    }
    if (!driver.driverId) {
       issues.push({ id: crypto.randomUUID(), field: 'driverId', message: 'Missing Driver ID', severity: 'critical' });
       status = 'critical';
    }

    // Warnings
    if (driver.totalEarnings === undefined || driver.totalEarnings < 0) {
      issues.push({ id: crypto.randomUUID(), field: 'totalEarnings', message: 'Negative Balance (Debt/Deduction)', severity: 'warning' });
      if (status !== 'critical') status = 'warning';
    }
    if (driver.ratingLast500 && driver.ratingLast500 < 4.5) {
      issues.push({ id: crypto.randomUUID(), field: 'rating', message: 'Low Driver Rating detected', severity: 'warning' });
      if (status !== 'critical') status = 'warning';
    }

    return {
      data: driver,
      originalData: { ...driver },
      status,
      issues,
      isFlagged: status !== 'healthy'
    };
  }

  // --- Vehicle Validation ---
  public static auditVehicle(vehicle: VehicleMetrics): AuditRecord<VehicleMetrics> {
    const issues: AuditIssue[] = [];
    let status: AuditStatus = 'healthy';

    if (!vehicle.plateNumber) {
      issues.push({ id: crypto.randomUUID(), field: 'plateNumber', message: 'Missing License Plate', severity: 'critical' });
      status = 'critical';
    }

    if (vehicle.totalEarnings > 5000 && vehicle.onlineHours < 10) {
       issues.push({ id: crypto.randomUUID(), field: 'totalEarnings', message: 'Suspiciously high earnings for low hours', severity: 'warning' });
       if (status !== 'critical') status = 'warning';
    }

    return {
      data: vehicle,
      originalData: { ...vehicle },
      status,
      issues,
      isFlagged: status !== 'healthy'
    };
  }

  // --- Financial Validation ---
  private static auditFinancials(fin: OrganizationMetrics): AuditRecord<OrganizationMetrics> {
     const issues: AuditIssue[] = [];
     let status: AuditStatus = 'healthy';

     if (fin.totalEarnings < 0) {
       issues.push({ id: crypto.randomUUID(), field: 'totalEarnings', message: 'Total Earnings cannot be negative', severity: 'critical' });
       status = 'critical';
     }
     
     if (fin.netFare > fin.totalEarnings) {
        issues.push({ id: crypto.randomUUID(), field: 'netFare', message: 'Net Fare > Total Earnings (Logical Error)', severity: 'critical' });
        status = 'critical';
     }

     return {
        data: fin,
        originalData: { ...fin },
        status,
        issues,
        isFlagged: status !== 'healthy'
     };
  }

  // --- Report Generation ---
  private static generateReport(
    drivers: AuditRecord<DriverMetrics>[], 
    vehicles: AuditRecord<VehicleMetrics>[],
    financials: AuditRecord<OrganizationMetrics>,
    trips: AuditRecord<Trip>[] = []
  ): AuditReport {
    
    const allRecords = [...drivers, ...vehicles, financials, ...trips];
    const totalRecords = allRecords.length;
    
    const healthyCount = allRecords.filter(r => r.status === 'healthy').length;
    const warningCount = allRecords.filter(r => r.status === 'warning').length;
    const criticalCount = allRecords.filter(r => r.status === 'critical').length;

    const allIssues = allRecords.flatMap(r => r.issues);

    // Calculate Health Score (Simple Algorithm)
    // Start at 100. Deduct 10 for critical, 2 for warning.
    let score = 100;
    score -= (criticalCount * 10);
    score -= (warningCount * 2);
    score = Math.max(0, Math.min(100, score));

    let status: AuditStatus = 'healthy';
    if (warningCount > 0) status = 'warning';
    if (criticalCount > 0) status = 'critical';

    // Summary Text
    let summary = "Data looks clean and ready for import.";
    if (status === 'critical') summary = `Found ${criticalCount} critical errors that prevent import.`;
    else if (status === 'warning') summary = `Ready for import. ${warningCount} items flagged for review (adjustments, high value, etc).`;

    return {
      score,
      status,
      summary,
      totalRecords,
      healthyCount,
      warningCount,
      criticalCount,
      issues: allIssues,
      impact: {
        revenueChange: 0, // Placeholder for Phase 6
        activeDriversChange: 0,
        newAnomalies: warningCount + criticalCount
      }
    };
  }
}