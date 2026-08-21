import { describe, expect, it } from 'vitest';
import {
  isOrderChatEnabled,
  isOrderChatPreAssignment,
  ORDER_CHAT_GRACE_MINUTES,
} from '@roam/types/orderChat';

describe('order chat windows', () => {
  it('blocks customer_courier before assignment', () => {
    expect(
      isOrderChatPreAssignment('customer_courier', { status: 'preparing', courierId: null }),
    ).toBe(true);
    expect(isOrderChatEnabled('customer_courier', { status: 'preparing' })).toBe(false);
  });

  it('opens customer_courier when assigned', () => {
    expect(
      isOrderChatEnabled('customer_courier', {
        status: 'assigned',
        courierId: 'c1',
      }),
    ).toBe(true);
  });

  it('applies delivered grace for customer_courier', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    const recent = new Date(now.getTime() - 10 * 60_000).toISOString();
    const old = new Date(
      now.getTime() - (ORDER_CHAT_GRACE_MINUTES.customer_courier + 5) * 60_000,
    ).toISOString();
    expect(
      isOrderChatEnabled(
        'customer_courier',
        { status: 'delivered', deliveredAt: recent },
        now,
      ),
    ).toBe(true);
    expect(
      isOrderChatEnabled(
        'customer_courier',
        { status: 'delivered', deliveredAt: old },
        now,
      ),
    ).toBe(false);
  });

  it('opens customer_merchant from accepted', () => {
    expect(isOrderChatEnabled('customer_merchant', { status: 'accepted' })).toBe(true);
  });

  it('closes merchant_courier after pickup grace', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    const old = new Date(
      now.getTime() - (ORDER_CHAT_GRACE_MINUTES.merchant_courier + 5) * 60_000,
    ).toISOString();
    expect(
      isOrderChatEnabled(
        'merchant_courier',
        { status: 'picked_up', pickedUpAt: old, courierId: 'c1' },
        now,
      ),
    ).toBe(false);
  });

  it('closes all pairs on cancelled', () => {
    expect(isOrderChatEnabled('customer_merchant', { status: 'cancelled' })).toBe(false);
    expect(isOrderChatEnabled('customer_courier', { status: 'cancelled' })).toBe(false);
  });
});
