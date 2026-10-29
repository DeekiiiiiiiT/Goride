import { describe, expect, it } from 'vitest';
import { confidenceLabel, confidenceTone, pumpCaption, readPumpQuote } from './pumpPrice';

describe('published pump prices', () => {
  it('reads a plain number and an engine card', () => {
    expect(readPumpQuote({ e10_87: 229.2 }, 'e10_87').price).toBe(229.2);
    const withCard = readPumpQuote({
      e10_87: 229.2,
      e10_87_card: { confidence: 'high', reports: 3, outdated: false },
    }, 'e10_87');
    expect(withCard.price).toBe(229.2);
    expect(withCard.confidence).toBe('high');
    const card = readPumpQuote({
      e10_87: { price: 229.2, confidence: 'medium', reports: 1, outdated: true },
    }, 'e10_87');
    expect(card.price).toBe(229.2);
    expect(card.confidence).toBe('medium');
    expect(pumpCaption(card)).toBe('medium · 1 report · May be outdated');
  });

  it('does not invent a price', () => {
    expect(readPumpQuote(undefined, 'e10_87').price).toBeNull();
    expect(readPumpQuote({ e10_87: { confidence: 'low' } }, 'e10_87').price).toBeNull();
  });

  it('maps confidence tone and stitch labels from live quote fields', () => {
    const high = readPumpQuote({
      e10_87: { price: 229.2, confidence: 'high', reports: 3 },
    }, 'e10_87');
    expect(confidenceTone(high)).toBe('high');
    expect(confidenceLabel(high)).toBe('Confirmed by 3 drivers');

    const fleet = readPumpQuote({
      e10_87: { price: 231.5, fleet_count: 1, plug_count: 0, reports: 1 },
    }, 'e10_87');
    expect(confidenceTone(fleet)).toBe('medium');
    expect(confidenceLabel(fleet)).toBe('From a fleet driver');

    const outdated = readPumpQuote({
      e10_87: { price: 226.4, outdated: true, reports: 1 },
    }, 'e10_87');
    expect(confidenceTone(outdated)).toBe('outdated');
    expect(confidenceLabel(outdated)).toBe('May be outdated');
  });
});
