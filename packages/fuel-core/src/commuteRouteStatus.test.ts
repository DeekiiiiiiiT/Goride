import { describe, expect, it } from 'vitest';
import { COMMUTE_ROUTING_UNAVAILABLE_NOTE, commuteRouteStatus } from './commuteRouteStatus.ts';
import { buildEvidenceLadder } from './evidenceLadder.ts';
import { straightLineRoadKm } from './roadFactor.ts';

describe('commute route status', () => {
  it('labels a failed commute none when a home exists', () => {
    const status = commuteRouteStatus({ homeMissing: false, routingOk: false, legs: 2, routedLegs: 0 });
    expect(status.confidence).toBe('none');
    expect(status.note).toBe(COMMUTE_ROUTING_UNAVAILABLE_NOTE);
    const ladder = buildEvidenceLadder({
      spanKm: 100,
      trips: [],
      commuteKm: 0,
      homeMissing: false,
      commuteConfidence: status.confidence,
      commuteNote: status.note,
    });
    const commute = ladder.sources.find((source) => source.category === 'commute');
    expect(commute?.confidence).toBe('none');
    expect(commute?.note).toBe(COMMUTE_ROUTING_UNAVAILABLE_NOTE);
  });

  it('labels a partial commute estimated and a full commute measured', () => {
    expect(commuteRouteStatus({ homeMissing: false, routingOk: true, legs: 2, routedLegs: 1 }).confidence).toBe('estimated');
    expect(commuteRouteStatus({ homeMissing: false, routingOk: true, legs: 2, routedLegs: 2 }).confidence).toBe('measured');
    expect(commuteRouteStatus({ homeMissing: true, routingOk: false, legs: 2, routedLegs: 0 })).toEqual({ confidence: 'none' });
  });

  it('keeps a straight-line gap estimated at 1.3 times the line', () => {
    expect(straightLineRoadKm(10)).toBe(13);
    expect(straightLineRoadKm(0)).toBe(0);
  });
});
