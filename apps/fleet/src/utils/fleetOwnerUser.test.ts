import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { needsFleetOwnerProvision } from './fleetOwnerUser';

function user(appRole: string | undefined, meta: Record<string, unknown> = {}): User {
  return {
    app_metadata: appRole ? { role: appRole } : {},
    user_metadata: meta,
  } as User;
}

describe('needsFleetOwnerProvision', () => {
  it('lets an older fleet owner in without sending them through create-fleet', () => {
    expect(needsFleetOwnerProvision(user('fleet_owner'))).toBe(false);
    expect(needsFleetOwnerProvision(user('admin', { organizationId: 'org-1' }))).toBe(false);
  });

  it('keeps a brand-new account on the setup screen', () => {
    expect(needsFleetOwnerProvision(user(undefined))).toBe(true);
    expect(needsFleetOwnerProvision(null)).toBe(false);
  });
});
