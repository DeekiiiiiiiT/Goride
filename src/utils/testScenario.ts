import { findTollMatches, MatchResult } from "./tollReconciliation";
import { FinancialTransaction, Trip } from "../types/data";

export function runScenarioTest(): string {
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    log("Starting Reconciliation Scenario Test...");

    // Setup Trip
    // Dropoff: 2:45 PM
    // Duration: 30 mins (1800 sec)
    // Implicit Pickup: 2:15 PM
    // Request Time: 2:00 PM
    const baseDate = "2023-10-27";
    const dropoffTime = `${baseDate}T14:45:00`;
    const requestTime = `${baseDate}T14:00:00`;
    
    const trip: Trip = {
        id: "trip_1",
        date: dropoffTime, // Uber exports Dropoff Time as the main date
        requestDate: requestTime,
        duration: 1800, // 30 minutes
        distance: 10,
        fare: 20,
        tollCharges: 5.00, // Uber paid $5
        vehicleId: "v1",
        driverName: "Tester",
        pickupLocation: "A",
        dropoffLocation: "B",
        status: "completed",
        platform: "Uber"
    };

    log(`Trip Setup: Request=${requestTime}, Dropoff=${dropoffTime}, Duration=30m`);
    log(`Expected Pickup: 14:15:00`);
    log(`Expected Approach: 14:00:00 - 14:15:00`);
    log(`Expected Active: 14:15:00 - 14:45:00`);

    // Scenario A: Approach Toll (2:05 PM)
    const tollA: FinancialTransaction = {
        id: "toll_A",
        date: `${baseDate}T14:05:00`,
        amount: -5.00,
        description: "Bridge Toll",
        category: "Tolls",
        isReconciled: false
    };

    // Scenario B: Active Toll (2:20 PM)
    const tollB: FinancialTransaction = {
        id: "toll_B",
        date: `${baseDate}T14:20:00`,
        amount: -5.00, // Matches reimbursement
        description: "Bridge Toll",
        category: "Tolls",
        isReconciled: false
    };

    // Scenario C: Personal Toll (2:50 PM)
    const tollC: FinancialTransaction = {
        id: "toll_C",
        date: `${baseDate}T14:50:00`,
        amount: -5.00,
        description: "Bridge Toll",
        category: "Tolls",
        isReconciled: false
    };

    // Run Matches
    const runTest = (name: string, tx: FinancialTransaction, expectedType: string) => {
        log(`\nTesting ${name} (${tx.date.split('T')[1]}):`);
        const matches = findTollMatches(tx, [trip]);
        
        if (matches.length === 0) {
            if (expectedType === 'PERSONAL_MATCH') {
                 // My findTollMatches logic returns NO match if it's completely outside of everything?
                 // No, Phase 2 added PERSONAL_MATCH type if within search window (Dropoff + 15m).
                 // 2:50 PM is Dropoff(2:45) + 5m. So it SHOULD match as PERSONAL.
                 // Wait, did I implement PERSONAL_MATCH to trigger if it's in the "Search Window" but not Active/Approach?
                 // Let's verify tollReconciliation.ts.
                 log(`❌ No match found. Expected ${expectedType}`);
            } else {
                 log(`❌ No match found. Expected ${expectedType}`);
            }
        } else {
            const best = matches[0];
            const isSuccess = best.matchType === expectedType;
            log(`${isSuccess ? '✅' : '❌'} Result: ${best.matchType} (Confidence: ${best.confidence})`);
            if (!isSuccess) log(`   Expected: ${expectedType}`);
        }
    };

    runTest("Toll A (Approach)", tollA, "DEADHEAD_MATCH");
    runTest("Toll B (Active)", tollB, "PERFECT_MATCH");
    runTest("Toll C (Personal)", tollC, "PERSONAL_MATCH");

    return logs.join('\n');
}
