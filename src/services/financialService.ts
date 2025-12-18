import { FinancialTransaction, TransactionCategory, TransactionType, TransactionStatus, CashFlowRecord } from '../types/data';
import { Trip } from '../types/data';
import { subDays, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

// Helper to generate mock transactions
export const generateMockTransactions = (trips: Trip[]): FinancialTransaction[] => {
  const transactions: FinancialTransaction[] = [];
  
  // 1. Convert Trips to Revenue Transactions
  trips.forEach(trip => {
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
          balanceAfter: 0
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
        isReconciled: true,
        isReconciled: Math.random() > 0.1,
        netAmount: amount,
        balanceAfter: 0
    });
  }

  // 3. Generate Driver Payouts (Mock)
  // Weekly payouts
  for (let i = 0; i < 8; i++) { // Last 8 weeks
      const date = subDays(today, i * 7);
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
          balanceAfter: 0
      });
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
