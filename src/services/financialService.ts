import { FinancialTransaction, TransactionCategory, TransactionType, TransactionStatus, CashFlowRecord } from '../types/data';
import { Trip } from '../types/data';
import { subDays, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

// Helper to generate mock transactions
export const generateMockTransactions = (trips: Trip[]): FinancialTransaction[] => {
  const transactions: FinancialTransaction[] = [];
  
  // Define mock batches to match the user's import scenario
  const mockBatches = [
    { id: 'batch_001', name: 'driver_activity.csv', type: 'Activity' },
    { id: 'batch_002', name: 'driver_quality.csv', type: 'Quality' },
    { id: 'batch_003', name: 'Payment_organisation.csv', type: 'Payment' },
    { id: 'batch_004', name: 'payments_driver.csv', type: 'Payout' },
    { id: 'batch_005', name: 'Payments_Transaction.csv', type: 'Transaction' },
    { id: 'batch_006', name: 'trip_activity.csv', type: 'Trip' },
    { id: 'batch_007', name: 'vehicle_performance.csv', type: 'Performance' }
  ];

  // 1. Convert Trips to Revenue Transactions
  trips.forEach((trip, index) => {
    // Assign ALL trips to trip_activity.csv to match user expectation of ~50 transactions
    const batch = mockBatches[5]; // trip_activity.csv
    
    if (trip.status === 'Completed' && trip.amount) {
      transactions.push({
        id: `txn_trip_${trip.id}`,
        date: trip.date.split('T')[0],
        time: trip.requestTime ? trip.requestTime.split('T')[1].substring(0, 8) : '12:00:00',
        driverId: trip.driverId,
        driverName: trip.driverName,
        vehicleId: trip.vehicleId,
        tripId: trip.id,
        type: 'Revenue',
        category: 'Fare Earnings',
        description: `Trip Fare - ${trip.pickupLocation?.substring(0, 15)}...`,
        amount: trip.amount,
        paymentMethod: Math.random() > 0.3 ? 'Bank Transfer' : 'Cash', // 30% cash
        status: 'Completed',
        isReconciled: Math.random() > 0.2, // 80% reconciled
        netAmount: trip.amount, // Simplified
        balanceAfter: 0, // Calculated later
        batchId: batch.id,
        batchName: batch.name
      });

      // Tips
      if (trip.fareBreakdown?.tips) {
        transactions.push({
          id: `txn_tip_${trip.id}`,
          date: trip.date.split('T')[0],
          time: trip.requestTime ? trip.requestTime.split('T')[1].substring(0, 8) : '12:00:00',
          driverId: trip.driverId,
          driverName: trip.driverName,
          type: 'Revenue',
          category: 'Tips',
          description: `Tip for Trip ${trip.id.substring(0, 8)}`,
          amount: trip.fareBreakdown.tips,
          paymentMethod: 'Digital Wallet',
          status: 'Completed',
          isReconciled: true,
          netAmount: trip.fareBreakdown.tips,
          balanceAfter: 0,
          batchId: batch.id,
          batchName: batch.name
        });
      }
    }
  });

  // 2. Generate Expenses (Mock)
  const expenseCategories: TransactionCategory[] = ['Fuel', 'Maintenance', 'Insurance', 'Tolls', 'Office Expenses', 'Software/Subscription'];
  const today = new Date();
  
  for (let i = 0; i < 50; i++) {
    const date = subDays(today, Math.floor(Math.random() * 60));
    const cat = expenseCategories[Math.floor(Math.random() * expenseCategories.length)];
    let amount = 0;
    
    // Assign expenses to vehicle_performance or Payment_organisation
    const batch = i % 3 === 0 ? mockBatches[6] : mockBatches[2];
    
    switch(cat) {
        case 'Fuel': amount = -50 - Math.random() * 50; break;
        case 'Maintenance': amount = -100 - Math.random() * 300; break;
        case 'Insurance': amount = -200; break;
        case 'Tolls': amount = -5 - Math.random() * 15; break;
        case 'Office Expenses': amount = -20 - Math.random() * 50; break;
        case 'Software/Subscription': amount = -120; break;
        default: amount = -50;
    }

    transactions.push({
        id: `txn_exp_${i}`,
        date: format(date, 'yyyy-MM-dd'),
        time: '09:00:00',
        type: 'Expense',
        category: cat,
        description: `${cat} Payment`,
        amount: Number(amount.toFixed(2)),
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
        isReconciled: Math.random() > 0.1,
        netAmount: amount,
        balanceAfter: 0,
        batchId: batch.id,
        batchName: batch.name
    });
  }

  // 3. Generate Driver Payouts (Mock)
  // Weekly payouts
  for (let i = 0; i < 8; i++) { // Last 8 weeks
      const date = subDays(today, i * 7);
      // Assign to payments_driver.csv
      const batch = mockBatches[3];
      
      transactions.push({
          id: `txn_payout_${i}`,
          date: format(date, 'yyyy-MM-dd'),
          time: '14:00:00',
          type: 'Payout',
          category: 'Driver Payouts',
          description: `Weekly Driver Payout - Batch #${100+i}`,
          amount: -5000 - Math.random() * 2000,
          paymentMethod: 'Bank Transfer',
          status: 'Completed',
          isReconciled: true,
          netAmount: -5000,
          balanceAfter: 0,
          batchId: batch.id,
          batchName: batch.name
      });
  }

  // 4. Generate Payments_Transaction.csv (Batch 4) - Generic payment records
  for (let i = 0; i < 12; i++) {
    const date = subDays(today, Math.floor(Math.random() * 45));
    const batch = mockBatches[4]; // Payments_Transaction.csv
    
    transactions.push({
        id: `txn_pay_${i}`,
        date: format(date, 'yyyy-MM-dd'),
        time: '11:15:00',
        type: 'Expense',
        category: 'Bank Fees',
        description: 'Transaction Processing Fee',
        amount: -2.50,
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
        isReconciled: true,
        netAmount: -2.50,
        balanceAfter: 0,
        batchId: batch.id,
        batchName: batch.name
    });
  }

  // 5. Generate Misc Adjustments for Remaining Files (Activity & Quality)
  // Ensure driver_activity.csv and driver_quality.csv have data
  for (let i = 0; i < 30; i++) {
    const isQuality = i % 2 === 0;
    const batch = isQuality ? mockBatches[1] : mockBatches[0]; // driver_quality.csv or driver_activity.csv
    const date = subDays(today, Math.floor(Math.random() * 30));
    
    // Add some "zero" amount transactions to simulate non-financial logs that user wants to see
    const isLog = Math.random() > 0.6; 
    
    if (isLog) {
         transactions.push({
            id: `txn_log_${i}`,
            date: format(date, 'yyyy-MM-dd'),
            time: '09:00:00',
            type: 'Adjustment', 
            category: isQuality ? 'System Log' : 'Status Change',
            description: isQuality ? 'Driver Rating Updated' : 'Driver Status: Active',
            amount: 0,
            paymentMethod: 'Cash', // Placeholder
            status: 'Completed',
            isReconciled: true,
            netAmount: 0,
            balanceAfter: 0,
            batchId: batch.id,
            batchName: batch.name
        });
        continue;
    }

    if (isQuality) {
        // Quality incentives/penalties
        const isBonus = Math.random() > 0.3;
        const amount = isBonus ? 50 + Math.random() * 50 : -20 - Math.random() * 30;
        
        transactions.push({
            id: `txn_qual_${i}`,
            date: format(date, 'yyyy-MM-dd'),
            time: '10:00:00',
            type: isBonus ? 'Revenue' : 'Expense',
            category: isBonus ? 'Incentive' : 'Fine',
            description: isBonus ? 'Weekly Quality Bonus' : 'Quality Infraction Penalty',
            amount: Number(amount.toFixed(2)),
            paymentMethod: 'Internal Transfer',
            status: 'Completed',
            isReconciled: true,
            netAmount: amount,
            balanceAfter: 0,
            batchId: batch.id,
            batchName: batch.name
        });
    } else {
        // Activity fees/subscriptions
        transactions.push({
            id: `txn_act_${i}`,
            date: format(date, 'yyyy-MM-dd'),
            time: '08:30:00',
            type: 'Expense',
            category: 'Platform Fee',
            description: 'Weekly Platform Access Fee',
            amount: -15.00,
            paymentMethod: 'Account Deduction',
            status: 'Completed',
            isReconciled: true,
            netAmount: -15.00,
            balanceAfter: 0,
            batchId: batch.id,
            batchName: batch.name
        });
    }
  }

  // Sort by date
  transactions.sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime());

  // Calculate Running Balance (Reverse chronological for display, but calculation needs chronological)
  let balance = 25571.82; // Starting balance example from MD
  const sortedChronological = [...transactions].sort((a, b) => new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime());
  
  sortedChronological.forEach(t => {
      balance += t.amount;
      t.balanceAfter = Number(balance.toFixed(2));
  });

  return sortedChronological.reverse(); // Return newest first
};

export const generateRealTransactions = (trips: Trip[]): FinancialTransaction[] => {
  const transactions: FinancialTransaction[] = [];
  
  trips.forEach(trip => {
      // 1. Fare Revenue
      if (trip.amount !== undefined && trip.amount !== 0) {
          // Determine timestamp (fallback to noon)
          let timeStr = '12:00:00';
          if (trip.requestTime) {
             try {
                timeStr = new Date(trip.requestTime).toISOString().split('T')[1].substring(0, 8);
             } catch(e) {}
          } else if (trip.date && trip.date.includes('T')) {
             timeStr = trip.date.split('T')[1].substring(0, 8);
          }

          transactions.push({
              id: `txn_${trip.id}_fare`,
              date: trip.date.split('T')[0],
              time: timeStr,
              driverId: trip.driverId,
              driverName: trip.driverName,
              vehicleId: trip.vehicleId,
              tripId: trip.id,
              type: 'Revenue',
              category: 'Fare Earnings',
              description: `Trip Fare - ${trip.pickupLocation || 'Unknown Location'}`,
              amount: trip.amount,
              paymentMethod: 'Platform',
              status: trip.status === 'Completed' ? 'Completed' : 'Pending',
              isReconciled: true, // Auto-reconciled from platform
              netAmount: trip.netTransaction || trip.amount,
              balanceAfter: 0,
              batchId: trip.batchId,
              batchName: trip.batchName || trip.sourceFileName || 'Imported Trip'
          });
      }
      
      // 2. Tips
      if (trip.fareBreakdown?.tips) {
           transactions.push({
              id: `txn_${trip.id}_tip`,
              date: trip.date.split('T')[0],
              time: '12:00:00', // Approximate
              driverId: trip.driverId,
              driverName: trip.driverName,
              vehicleId: trip.vehicleId,
              tripId: trip.id,
              type: 'Revenue',
              category: 'Tips',
              description: `Tip for Trip`,
              amount: trip.fareBreakdown.tips,
              paymentMethod: 'Platform',
              status: 'Completed',
              isReconciled: true,
              netAmount: trip.fareBreakdown.tips,
              balanceAfter: 0,
              batchId: trip.batchId,
              batchName: trip.batchName || trip.sourceFileName || 'Imported Trip'
          });
      }
      
      // 3. Tolls (Expense)
      if (trip.tollCharges) {
           transactions.push({
              id: `txn_${trip.id}_toll`,
              date: trip.date.split('T')[0],
              time: '12:00:00',
              driverId: trip.driverId,
              driverName: trip.driverName,
              vehicleId: trip.vehicleId,
              tripId: trip.id,
              type: 'Expense',
              category: 'Tolls',
              description: `Toll Charge`,
              amount: -Math.abs(trip.tollCharges),
              paymentMethod: 'Platform',
              status: 'Completed',
              isReconciled: true,
              netAmount: -Math.abs(trip.tollCharges),
              balanceAfter: 0,
              batchId: trip.batchId,
              batchName: trip.batchName || trip.sourceFileName || 'Imported Trip'
          });
      }
  });
  
  return transactions.sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime());
};

export const getCashFlowData = (transactions: FinancialTransaction[]): CashFlowRecord[] => {
    // Group by date
    const map = new Map<string, CashFlowRecord>();
    
    // Reverse again to process chronologically
    const chrono = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let currentBalance = 15000; // Mock opening
    
    chrono.forEach(t => {
        if (!map.has(t.date)) {
            map.set(t.date, {
                date: t.date,
                openingBalance: currentBalance,
                cashIn: 0,
                cashOut: 0,
                closingBalance: currentBalance,
                breakdown: { cashOnHand: 0, bankBalance: 0 }
            });
        }
        
        const rec = map.get(t.date)!;
        if (t.amount > 0) rec.cashIn += t.amount;
        else rec.cashOut += Math.abs(t.amount);
        
        currentBalance += t.amount;
        rec.closingBalance = Number(currentBalance.toFixed(2));
        rec.cashIn = Number(rec.cashIn.toFixed(2));
        rec.cashOut = Number(rec.cashOut.toFixed(2));
        
        // Mock breakdown
        rec.breakdown.cashOnHand = rec.closingBalance * 0.3;
        rec.breakdown.bankBalance = rec.closingBalance * 0.7;
    });
    
    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
