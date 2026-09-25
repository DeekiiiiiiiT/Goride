/**
 * @vitest-environment jsdom
 *
 * S-6 regression: Log cash must never appear on the Delivery Dashboard surface.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogCashTrigger, LogCashQuickActionHost } from './LogCashQuickAction';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const canMock = vi.fn(() => true);

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: canMock,
    canAny: () => false,
    canAll: () => false,
    canView: () => true,
    role: 'fleet_owner',
    organizationId: 'org',
    jwtRole: 'fleet_owner',
    isAtLeast: () => true,
    permissions: [],
  }),
}));

vi.mock('../../hooks/useCashCollection', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useCashCollection')>(
    '../../hooks/useCashCollection',
  );
  return {
    ...actual,
    useCashCollection: () => ({
      pickerOpen: false,
      setPickerOpen: vi.fn(),
      drivers: [],
      periodsFor: () => [],
      collect: vi.fn(),
      findDriver: () => undefined,
      blockReasonForDriver: () => null,
      hasBlockedOutstanding: false,
      rawRows: [],
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('log cash delivery / permission gates', () => {
  beforeEach(() => {
    canMock.mockImplementation((p: string) => p === 'settlements.collect');
  });

  it('LogCashTrigger renders Log cash when visible', () => {
    wrap(<LogCashTrigger variant="desktop" visible onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /log cash/i })).toBeTruthy();
  });

  it('LogCashTrigger renders nothing when visible=false (Delivery / no-perm)', () => {
    wrap(<LogCashTrigger variant="desktop" visible={false} onClick={() => {}} />);
    expect(screen.queryByRole('button', { name: /log cash/i })).toBeNull();
    expect(screen.queryByText(/log cash/i)).toBeNull();
  });

  it('host renders nothing for roles without settlements.collect', () => {
    canMock.mockReturnValue(false);
    const { container } = wrap(
      <LogCashQuickActionHost
        pickerOpen={false}
        onPickerOpenChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mobile trigger exposes Log cash aria-label when visible', () => {
    wrap(<LogCashTrigger variant="mobile" visible onClick={() => {}} />);
    expect(screen.getByLabelText(/log cash from a driver/i)).toBeTruthy();
  });

  it('Dashboard keeps Log cash out of the Delivery headerActions branch', () => {
    const src = fs.readFileSync(path.join(__dirname, 'Dashboard.tsx'), 'utf8');
    const start = src.indexOf('const headerActions = showDelivery ? (');
    expect(start).toBeGreaterThan(-1);
    const elseAt = src.indexOf(') : (', start);
    const deliveryBranch = src.slice(start, elseAt);
    expect(deliveryBranch).toMatch(/WorkforceInvitePanel/);
    expect(deliveryBranch).not.toMatch(/LogCash|Log cash/i);
    expect(src).toMatch(/!showDelivery \? \([\s\S]*LogCashQuickActionHost/);
  });
});
