import { describe, expect, it } from 'vitest';
import { parseDeliveryHandoff } from './deliveryHandoff';

describe('parseDeliveryHandoff', () => {
  it('defaults empty instructions to door with no notes', () => {
    expect(parseDeliveryHandoff('')).toEqual({ mode: 'door', notes: '' });
    expect(parseDeliveryHandoff(null)).toEqual({ mode: 'door', notes: '' });
  });

  it('parses handoff to customer', () => {
    expect(parseDeliveryHandoff('Hand it to me')).toEqual({ mode: 'hand', notes: '' });
    expect(parseDeliveryHandoff('Hand it to me. Call when you arrive.')).toEqual({
      mode: 'hand',
      notes: 'Call when you arrive.',
    });
  });

  it('keeps door notes as-is and does not invent a gate code', () => {
    expect(parseDeliveryHandoff("Leave at door, don't knock")).toEqual({
      mode: 'door',
      notes: "Leave at door, don't knock",
    });
    expect(parseDeliveryHandoff('Gate code 12. Leave at door.')).toEqual({
      mode: 'door',
      notes: 'Gate code 12. Leave at door.',
    });
  });
});
