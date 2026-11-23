import { describe, expect, it } from 'vitest';
import {
  daysLeftText,
  disputeOwedChip,
  disputeStateChip,
  disputeTripPill,
  earlierResultsText,
  firstPartWithWork,
  fromWeekChip,
  part5Paybacks,
  pillStatusLabel,
  resultChip,
  settleDisputeBody,
  splitMatches,
  stillOpenLines,
  sumLineText,
} from './tollV2Parts';
import { deskPartsFixture, disputeRow } from './fixtures/deskPartsFixture';
import { sureSuggestions } from './tollV2DeskLogic';

describe('sum line (AE5)', () => {
  it('reads exactly as the audit says, ending with Waiting on Uber', () => {
    expect(
      sumLineText({
        spendMinor: 541000,
        paidBackMinor: 517000,
        driverMinor: 0,
        fleetMinor: 0,
        waitingOnUberMinor: 24000,
        stillOpenMinor: 0,
      }),
    ).toBe(
      'Spend J$5,410.00 = Paid back J$5,170.00 + Driver pays J$0.00 + Fleet pays J$0.00 + Waiting on Uber J$240.00',
    );
  });

  it('adds Still open only while something is undecided, so it always adds up', () => {
    expect(
      sumLineText({
        spendMinor: 100000,
        paidBackMinor: 50000,
        driverMinor: 0,
        fleetMinor: 0,
        waitingOnUberMinor: 0,
        stillOpenMinor: 50000,
      }),
    ).toMatch(/\+ Waiting on Uber J\$0\.00 \+ Still open J\$500\.00$/);
  });

  it('earlier results line is hidden when all zero', () => {
    expect(earlierResultsText({ refundedMinor: 0, toDriverMinor: 0, toFleetMinor: 0 })).toBeNull();
    expect(earlierResultsText({ refundedMinor: 2000, toDriverMinor: 0, toFleetMinor: 1000 })).toMatch(
      /Uber refunded J\$20\.00 · driver pays J\$0\.00 · fleet pays J\$10\.00/,
    );
  });
});

describe('Still open (AE4)', () => {
  it('one line per part, from the server part on each blocker', () => {
    const lines = stillOpenLines(deskPartsFixture().blockers);
    expect(lines.map((l) => l.text)).toEqual([
      'Part 1: 1 match to confirm',
      'Part 2: 2 tolls to pick a trip for',
      'Part 4: 1 toll with no trip',
      'Part 5: 1 cash receipt to check',
    ]);
    expect(lines[1]!.goLabel).toBe('Go to Pick the right trip');
  });

  it('part 5 names each kind of check; part 3 is refunds to link', () => {
    const lines = stillOpenLines([
      { kind: 'review_pair', part: 5 },
      { kind: 'payback', part: 5 },
      { kind: 'charge', reason: 'short_paid', part: 5 },
      { kind: 'payback', part: 3 },
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'Part 3: 1 Uber refund to link to a dispute',
      'Part 5: 1 possible duplicate · 1 part-paid toll · 1 Uber payback with no toll',
    ]);
  });

  it('nothing open → no lines', () => {
    expect(stillOpenLines([])).toEqual([]);
  });
});

describe('pills', () => {
  const desk = deskPartsFixture();
  it('labels each part from the server pill', () => {
    expect(pillStatusLabel(desk.parts![0], desk.disputes)).toBe('1 to confirm');
    expect(pillStatusLabel(desk.parts![2], desk.disputes)).toBe('3 to send');
    expect(pillStatusLabel(desk.parts![5], desk.disputes)).toBe('Not ready');
    expect(pillStatusLabel({ part: 3, key: 'disputes', count: 0, amountMinor: 0, status: 'waiting' }, desk.disputes)).toBe(
      '1 waiting on Uber',
    );
    expect(pillStatusLabel({ part: 4, key: 'no_trip', count: 0, amountMinor: 0, status: 'clear' })).toBe('Nothing to do');
    expect(pillStatusLabel({ part: 6, key: 'seal', count: 0, amountMinor: 0, status: 'ready' })).toBe('Ready');
  });

  it('opens on the first part with work; a sealed week opens on Seal', () => {
    expect(firstPartWithWork(desk)).toBe(1);
    const clear1 = { ...desk, parts: desk.parts!.map((p) => (p.part === 1 ? { ...p, status: 'clear' } : p)) };
    expect(firstPartWithWork(clear1)).toBe(2);
    expect(firstPartWithWork({ ...desk, sealed: true })).toBe(6);
    expect(firstPartWithWork({ ...desk, parts: desk.parts!.map((p) => ({ ...p, status: p.part === 6 ? 'ready' : 'clear' })) })).toBe(6);
  });
});

describe('dispute rows', () => {
  it('state chip: not sent, red, window closed, sent, late', () => {
    expect(disputeStateChip(disputeRow({ id: 'a' }))).toEqual({ text: 'Waiting on driver to dispute', tone: 'amber' });
    expect(disputeStateChip(disputeRow({ id: 'a', red: true })).tone).toBe('red');
    expect(disputeStateChip(disputeRow({ id: 'a', windowClosed: true })).text).toBe('Window closed — expires tonight');
    expect(disputeStateChip(disputeRow({ id: 'a', state: 'sent' })).text).toBe('Sent, waiting on Uber');
    expect(disputeStateChip(disputeRow({ id: 'a', state: 'sent', late: true })).text).toBe('No refund yet after 1 pay period');
  });

  it('days left, owed chip, trip pill, from-week chip', () => {
    expect(daysLeftText(disputeRow({ id: 'a', daysLeft: 6 }))).toBe('6 of 9 days left');
    expect(daysLeftText(disputeRow({ id: 'a', state: 'sent' }))).toBeNull();
    expect(disputeOwedChip(disputeRow({ id: 'a' }))).toBe('J$20.00 to dispute');
    expect(disputeTripPill(disputeRow({ id: 'a' }))).toBe('Uber trip 6:55 AM–7:40 AM');
    expect(fromWeekChip('2026-11-02')).toBe('From week of 2 Nov');
    expect(fromWeekChip(null)).toBeNull();
  });

  it('result chips', () => {
    const [won, lost] = deskPartsFixture().results!;
    expect(resultChip(won!).text).toBe('Won · Uber paid J$20.00');
    expect(resultChip(lost!).text).toBe('Lost · fleet pays J$20.00');
  });

  it('Refund received sends the dispute, the payback and both versions', () => {
    expect(settleDisputeBody({ id: 'd', version: 3 }, { paybackId: 'p', version: 7 })).toEqual({
      dispute_id: 'd',
      expected_dispute_version: 3,
      payback_id: 'p',
      expected_payback_version: 7,
    });
  });
});

describe('matches and paybacks', () => {
  it('InDrive rows are split out and never in Confirm all sure (AG7)', () => {
    const desk = deskPartsFixture();
    const { payback, rider } = splitMatches(desk.charges);
    expect(rider.map((c) => c.id)).toEqual(['indrive-1']);
    expect(payback.some((c) => c.id === 'indrive-1')).toBe(false);
    expect(sureSuggestions(desk.charges).some((r) => r.charge.id === 'indrive-1')).toBe(false);
  });

  it('a payback waiting on Refund received is not listed in part 5', () => {
    const paybacks = [
      { id: 'p1', version: 1, amountMinor: 2000, openMinor: 2000 },
      { id: 'p2', version: 1, amountMinor: 500, openMinor: 500 },
    ];
    expect(part5Paybacks(paybacks, [{ kind: 'payback', id: 'p1', part: 3 }]).map((p) => p.id)).toEqual(['p2']);
  });
});
