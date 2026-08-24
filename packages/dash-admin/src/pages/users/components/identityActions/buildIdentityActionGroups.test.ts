import { describe, expect, it } from 'vitest';
import { buildIdentityActionGroups } from './buildIdentityActionGroups';
import type { IdentityActionBuckets, IdentityActionItem } from './types';

function item(id: string): IdentityActionItem {
  return { id, label: id, run: () => undefined };
}

function buckets(partial: Partial<IdentityActionBuckets>): IdentityActionBuckets {
  return {
    customer: [],
    courier: [],
    merchant: [],
    global: [],
    ...partial,
  };
}

describe('buildIdentityActionGroups', () => {
  it('returns no_detail when detail is missing', () => {
    const result = buildIdentityActionGroups({
      scope: 'all',
      buckets: buckets({}),
      hasDetail: false,
      hasAnyManagePermission: true,
    });
    expect(result).toEqual({ groups: [], emptyReason: 'no_detail' });
  });

  it('returns no_permission when empty and admin lacks manage perms', () => {
    const result = buildIdentityActionGroups({
      scope: 'all',
      buckets: buckets({}),
      hasDetail: true,
      hasAnyManagePermission: false,
    });
    expect(result.emptyReason).toBe('no_permission');
    expect(result.groups).toHaveLength(0);
  });

  it('returns no_manageable_personas when empty but admin can manage', () => {
    const result = buildIdentityActionGroups({
      scope: 'customer',
      buckets: buckets({}),
      hasDetail: true,
      hasAnyManagePermission: true,
    });
    expect(result.emptyReason).toBe('no_manageable_personas');
  });

  it('orders primary persona first, collapses others, global last', () => {
    const result = buildIdentityActionGroups({
      scope: 'customer',
      buckets: buckets({
        customer: [item('c1')],
        courier: [item('k1')],
        merchant: [item('m1')],
        global: [item('g1')],
      }),
      hasDetail: true,
      hasAnyManagePermission: true,
    });
    expect(result.emptyReason).toBe('ok');
    expect(result.groups.map((g) => g.id)).toEqual(['customer', 'courier', 'merchant', 'global']);
    expect(result.groups[0].collapsedByDefault).toBe(false);
    expect(result.groups[1].collapsedByDefault).toBe(true);
    expect(result.groups[2].collapsedByDefault).toBe(true);
    expect(result.groups[3].kind).toBe('global');
    expect(result.groups[3].collapsedByDefault).toBe(false);
  });

  it('expands all personas when scope is all', () => {
    const result = buildIdentityActionGroups({
      scope: 'all',
      buckets: buckets({
        customer: [item('c1')],
        courier: [item('k1')],
        global: [item('g1')],
      }),
      hasDetail: true,
      hasAnyManagePermission: true,
    });
    expect(result.groups.filter((g) => g.kind === 'persona').every((g) => !g.collapsedByDefault)).toBe(true);
    expect(result.groups.at(-1)?.id).toBe('global');
  });

  it('puts merchant first for merchant_owner scope', () => {
    const result = buildIdentityActionGroups({
      scope: 'merchant_owner',
      buckets: buckets({
        customer: [item('c1')],
        merchant: [item('m1')],
        global: [item('g1')],
      }),
      hasDetail: true,
      hasAnyManagePermission: true,
    });
    expect(result.groups[0].id).toBe('merchant');
    expect(result.groups[0].collapsedByDefault).toBe(false);
    expect(result.groups[1].id).toBe('customer');
    expect(result.groups[1].collapsedByDefault).toBe(true);
  });
});
