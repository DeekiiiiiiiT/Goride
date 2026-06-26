import { describe, expect, it } from 'vitest';
import {
  getMerchantCapabilities,
  hasCapability,
  isRoamOnly,
} from './merchant-capabilities';
import type { Merchant } from '../hooks/useMerchant';

const baseMerchant = { id: 'm1' } as Merchant;

describe('merchant-capabilities', () => {
  it('defaults to roam only', () => {
    expect(getMerchantCapabilities(baseMerchant)).toEqual(['roam_delivery']);
    expect(isRoamOnly(baseMerchant)).toBe(true);
  });

  it('detects in_store_operations', () => {
    const hybrid = { ...baseMerchant, capabilities: ['roam_delivery', 'in_store_operations'] };
    expect(hasCapability(hybrid, 'in_store_operations')).toBe(true);
    expect(isRoamOnly(hybrid)).toBe(false);
  });
});
