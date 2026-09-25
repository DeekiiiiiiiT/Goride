/**
 * @vitest-environment jsdom
 *
 * fleet_viewer / fleet_accountant can see Dashboard but must not see Log cash.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LogCashTrigger } from './LogCashQuickAction';
import { hasPermission } from '../../utils/permissions';

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (p: string) => false,
    canAny: () => false,
    canAll: () => false,
    canView: () => true,
    role: 'fleet_viewer',
    organizationId: 'org',
    jwtRole: 'fleet_viewer',
    isAtLeast: () => false,
    permissions: [],
  }),
}));

describe('log cash permission', () => {
  it('fleet_viewer and fleet_accountant lack settlements.collect', () => {
    expect(hasPermission('fleet_viewer', 'settlements.collect')).toBe(false);
    expect(hasPermission('fleet_accountant', 'settlements.collect')).toBe(false);
    expect(hasPermission('fleet_owner', 'settlements.collect')).toBe(true);
    expect(hasPermission('fleet_manager', 'settlements.collect')).toBe(true);
  });

  it('trigger hidden when caller passes visible=false (Dashboard can() gate)', () => {
    render(<LogCashTrigger variant="desktop" visible={false} onClick={() => {}} />);
    expect(screen.queryByText(/log cash/i)).toBeNull();
  });
});
