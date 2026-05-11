
import { findTollMatches, MatchResult } from './tollReconciliation';
import { FinancialTransaction, Trip } from '../types/data';

// --- Simple Test Runner ---
function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        throw new Error(message);
    } else {
        console.log(`✅ PASSED: ${message}`);
    }
}

function assertEquals(actual: any, expected: any, message: string) {
    if (actual !== expected) {
        console.error(`❌ FAILED: ${message}. Expected ${expected}, got ${actual}`);
        throw new Error(`${message}. Expected ${expected}, got ${actual}`);
    } else {
        console.log(`✅ PASSED: ${message}`);
    }
}

// --- Test Data Helpers ---
const createTx = (id: string, date: string, time: string, amount: number, vehicleId: string = 'V1'): FinancialTransaction => ({
    id,
    date, // YYYY-MM-DD
    time, // HH:mm:ss
    amount, // Negative for expense usually
    vehicleId,
    description: 'Toll',
    type: 'Expense',
    category: 'Tolls',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    isReconciled: false
} as FinancialTransaction);

const createTrip = (id: string, date: string, time: string, tollAmount: number, vehicleId: string = 'V1'): Trip => ({
    id,
    date: `${date}T${time}Z`, // ISO
    requestTime: `${date}T${time}Z`,
    dropoffTime: `${date}T${time.replace(/:(\d\d):/, (_, m) => `:${parseInt(m)+20}:`)}Z`, // +20 mins roughly
    amount: 50,
    tollCharges: tollAmount,
    vehicleId,
    platform: 'Uber',
    status: 'Completed',
    driverId: 'D1'
} as Trip);

// --- Tests ---

function testPerfectMatch() {
    console.log('\n--- Test: Perfect Match ---');
    const tx = createTx('tx1', '2023-10-10', '10:10:00', -5.00);
    // Trip starts 10:00, ends ~10:20. Tx at 10:10 is inside.
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.00); 
    
    const matches = findTollMatches(tx, [trip]);
    
    assert(matches.length === 1, 'Should find 1 match');
    assertEquals(matches[0].matchType, 'PERFECT_MATCH', 'Should be PERFECT_MATCH');
    assertEquals(matches[0].confidence, 'high', 'Should be high confidence');
}

function testAmountVariance() {
    console.log('\n--- Test: Amount Variance ---');
    const tx = createTx('tx1', '2023-10-10', '10:10:00', -4.50); // Tx is 4.50
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.00); // Trip says 5.00
    
    const matches = findTollMatches(tx, [trip]);
    
    assert(matches.length === 1, 'Should find 1 match');
    assertEquals(matches[0].matchType, 'AMOUNT_VARIANCE', 'Should be AMOUNT_VARIANCE');
    assertEquals(matches[0].confidence, 'high', 'Should be high confidence');
    // Variance = Trip(5.00) - Tx(4.50) = 0.50
    assert(Math.abs(matches[0].varianceAmount! - 0.50) < 0.001, 'Variance should be 0.50');
}

function testDeadheadMatch() {
    console.log('\n--- Test: Deadhead Match ---');
    // Trip starts 10:00. Deadhead window is 09:15 - 10:00.
    // Tx at 09:30 is inside deadhead.
    const tx = createTx('tx1', '2023-10-10', '09:30:00', -5.00);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.00);
    
    const matches = findTollMatches(tx, [trip]);
    
    assert(matches.length === 1, 'Should find 1 match');
    assertEquals(matches[0].matchType, 'DEADHEAD_MATCH', 'Should be DEADHEAD_MATCH');
    assertEquals(matches[0].confidence, 'medium', 'Should be medium confidence');
}

function testAmbiguousDeadhead() {
    console.log('\n--- Test: Ambiguous Deadhead (Low Priority) ---');
    // Trip starts 10:00. Deadhead window is 09:15 - 10:00.
    // Tx at 09:30 is inside deadhead.
    // Amount mismatch: Tx 4.50, Trip 5.00.
    const tx = createTx('tx1', '2023-10-10', '09:30:00', -4.50);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.00);
    
    const matches = findTollMatches(tx, [trip]);
    
    assert(matches.length === 1, 'Should find 1 match');
    assertEquals(matches[0].matchType, 'POSSIBLE_MATCH', 'Should be POSSIBLE_MATCH');
    assertEquals(matches[0].confidence, 'low', 'Should be low confidence');
}

function testNoMatchOutsideWindow() {
    console.log('\n--- Test: No Match (Outside Window) ---');
    // Trip starts 10:00. Deadhead start 09:15. End ~10:20 + 15m = 10:35.
    // Tx at 09:00 is too early.
    const tx = createTx('tx1', '2023-10-10', '09:00:00', -5.00);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.00);
    
    const matches = findTollMatches(tx, [trip]);
    
    assertEquals(matches.length, 0, 'Should find 0 matches');
}

function testPrioritySorting() {
    console.log('\n--- Test: Priority Sorting ---');
    // Tx at 10:10 (Strict window for Trip A)
    // Tx at 10:10 (Deadhead window for Trip B - Starts at 10:45)
    
    const tx = createTx('tx1', '2023-10-10', '10:10:00', -5.00);
    
    // Trip A: 10:00 - 10:20. Tx is inside strict window.
    const tripA = createTrip('tripA', '2023-10-10', '10:00:00', 5.00);
    
    // Trip B: 10:45 - 11:05. Deadhead: 10:00 - 10:45. Tx is inside deadhead.
    const tripB = createTrip('tripB', '2023-10-10', '10:45:00', 5.00);
    
    const matches = findTollMatches(tx, [tripA, tripB]);
    
    assert(matches.length === 2, 'Should find 2 matches');
    
    // Should prioritize Perfect Match (Trip A) over Deadhead Match (Trip B)
    assertEquals(matches[0].trip.id, 'tripA', 'First match should be Trip A (Perfect)');
    assertEquals(matches[0].matchType, 'PERFECT_MATCH', 'Trip A should be PERFECT_MATCH');
    
    assertEquals(matches[1].trip.id, 'tripB', 'Second match should be Trip B (Deadhead)');
    assertEquals(matches[1].matchType, 'DEADHEAD_MATCH', 'Trip B should be DEADHEAD_MATCH');
}

// Run All
try {
    testPerfectMatch();
    testAmountVariance();
    testDeadheadMatch();
    testAmbiguousDeadhead();
    testNoMatchOutsideWindow();
    testPrioritySorting();
    console.log('\n✅ ALL TESTS PASSED');
} catch (e) {
    console.error('\n❌ SOME TESTS FAILED');
}
